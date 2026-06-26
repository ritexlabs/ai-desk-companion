from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path
from typing import Optional

import httpx

_log = logging.getLogger(__name__)

# Repo-local cloudflared config (git-ignored, machine-specific).
# tunnel.py lives at apps/orchestrator/app/services/tunnel.py → 4 levels up = repo root.
_REPO_ROOT      = Path(__file__).parents[4]
_CF_CONFIG_FILE = _REPO_ROOT / '.cloudflared' / 'whatsapp-config.yml'


class TunnelService:
    """Manages a single Cloudflare tunnel process.

    Named tunnel: if CLOUDFLARE_DOMAIN is set and .cloudflared/whatsapp-config.yml
                  exists, runs `cloudflared tunnel run whatsapp` giving a stable URL.

    Quick tunnel: if no domain is configured, starts a temporary trycloudflare.com
                  tunnel (no account or config file required).
    """

    def __init__(self) -> None:
        self._url: Optional[str]                               = None
        self._provider: str                                    = 'none'
        self._domain: str                                      = ''
        self._cf_process: Optional[asyncio.subprocess.Process] = None
        self._starting: bool                                   = False
        self._lock: asyncio.Lock                               = asyncio.Lock()

    @property
    def url(self) -> Optional[str]:
        return self._url

    @property
    def provider(self) -> str:
        return self._provider

    @property
    def active(self) -> bool:
        return bool(self._url)

    def callback_url(self) -> Optional[str]:
        return f'{self._url}/webhook/whatsapp' if self._url else None

    def snapshot(self) -> dict:
        return {
            'active':       self.active,
            'starting':     self._starting,
            'provider':     self._provider,
            'url':          self._url,
            'callback_url': self.callback_url(),
            'domain':       self._domain,
        }

    async def start(self, provider: str, port: int = 8787, domain: str = '', **_: str) -> str:
        """Start a Cloudflare tunnel. Serialised by a lock."""
        if self._lock.locked():
            raise RuntimeError('Tunnel start already in progress')
        if provider != 'cloudflare':
            raise ValueError('Only the cloudflare provider is supported')

        async with self._lock:
            self._starting = True
            try:
                await self.stop()
                return await self._ensure_cloudflare(port, domain.strip())
            finally:
                self._starting = False

    async def stop(self) -> None:
        """Kill all cloudflared processes: tracked handle first, then pkill sweep."""
        await _pkill_cf_config()

        if self._cf_process:
            try:
                self._cf_process.kill()
                await asyncio.wait_for(self._cf_process.wait(), timeout=5.0)
            except Exception:
                pass
            self._cf_process = None

        self._url      = None
        self._provider = 'none'
        self._domain   = ''

    async def shutdown(self) -> None:
        await self.stop()

    async def _ensure_cloudflare(self, port: int, domain: str) -> str:
        if domain:
            return await self._ensure_cf_named(port, domain)
        return await self._ensure_cf_quick(port)

    async def _ensure_cf_named(self, port: int, domain: str) -> str:
        host = re.sub(r'^https?://', '', domain).rstrip('/')
        if not host.startswith('whatsapp.'):
            host = f'whatsapp.{host}'
        url = f'https://{host}'

        if await _probe_url(url):
            self._url      = url
            self._provider = 'cloudflare'
            self._domain   = domain
            return url

        if _CF_CONFIG_FILE.exists():
            await _ensure_cf_dns_route(_CF_CONFIG_FILE, host)

        cmd = ['cloudflared']
        if _CF_CONFIG_FILE.exists():
            cmd += ['--config', str(_CF_CONFIG_FILE)]
        cmd += ['tunnel', '--no-autoupdate', 'run', 'whatsapp']

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._cf_process = proc
        self._provider   = 'cloudflare'
        self._domain     = domain

        deadline  = asyncio.get_event_loop().time() + 35.0
        connected = False
        error_msg = ''

        while not connected:
            if asyncio.get_event_loop().time() > deadline:
                break
            try:
                line = await asyncio.wait_for(proc.stderr.readline(), timeout=3.0)
            except asyncio.TimeoutError:
                if proc.returncode is not None:
                    break
                continue
            if not line:
                break
            text = line.decode('utf-8', errors='replace')
            if 'registered' in text.lower() or 'connection established' in text.lower():
                connected = True
            if 'no tunnel' in text.lower() or 'not found' in text.lower() or 'failed' in text.lower():
                error_msg = text.strip()
                break

        if not connected:
            proc.terminate()
            self._cf_process = None
            self._provider   = 'none'
            self._domain     = ''
            raise RuntimeError(
                f'cloudflared named tunnel "whatsapp" did not connect. {error_msg or ""}\n'
                f'Run once to set up:\n'
                f'  cloudflared tunnel create whatsapp\n'
                f'  cloudflared tunnel route dns whatsapp whatsapp.{host.replace("whatsapp.", "")}'
            )

        self._url = url
        return url

    async def _ensure_cf_quick(self, port: int) -> str:
        """Start a temporary trycloudflare.com tunnel (no account required)."""
        proc = await asyncio.create_subprocess_exec(
            'cloudflared', 'tunnel', '--url', f'http://localhost:{port}', '--no-autoupdate',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._cf_process = proc
        self._provider   = 'cloudflare'

        url: Optional[str] = None
        deadline = asyncio.get_event_loop().time() + 45.0

        while url is None:
            if asyncio.get_event_loop().time() > deadline:
                proc.terminate()
                self._cf_process = None
                self._provider   = 'none'
                raise RuntimeError('cloudflared did not report a URL within 45 seconds.')
            try:
                line = await asyncio.wait_for(proc.stderr.readline(), timeout=3.0)
            except asyncio.TimeoutError:
                if proc.returncode is not None:
                    break
                continue
            if not line:
                break
            text = line.decode('utf-8', errors='replace')
            m = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', text)
            if m:
                url = m.group(0)

        if not url:
            proc.terminate()
            self._cf_process = None
            self._provider   = 'none'
            raise RuntimeError(
                'cloudflared exited without providing a URL. '
                'Install it with: brew install cloudflare/cloudflare/cloudflared'
            )

        self._url = url
        return url


async def _pkill_cf_config() -> None:
    if not _CF_CONFIG_FILE.exists():
        return
    try:
        kproc = await asyncio.create_subprocess_exec(
            'pkill', '-KILL', '-f', str(_CF_CONFIG_FILE),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(kproc.wait(), timeout=5.0)
    except Exception:
        pass


async def _ensure_cf_dns_route(config_file: Path, hostname: str) -> None:
    """Run `cloudflared tunnel route dns <uuid> <hostname>` — idempotent."""
    text = config_file.read_text(errors='replace')
    m = re.search(r'^tunnel:\s*([0-9a-f-]{36})', text, re.MULTILINE)
    if not m:
        _log.warning('cloudflared: could not parse tunnel UUID from %s — skipping route dns', config_file)
        return
    uuid = m.group(1)
    try:
        proc = await asyncio.create_subprocess_exec(
            'cloudflared', 'tunnel', 'route', 'dns', uuid, hostname,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=20.0)
        if proc.returncode != 0:
            _log.warning('cloudflared route dns exited %d: %s', proc.returncode,
                         stderr.decode('utf-8', errors='replace').strip()[:200])
        else:
            _log.info('cloudflared: DNS route ensured for %s → tunnel %s', hostname, uuid)
    except Exception as exc:
        _log.warning('cloudflared route dns failed: %s', exc)


async def _probe_url(url: str) -> bool:
    """Return True if url responds to a HEAD within 5 s (any non-5xx status)."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.head(url, follow_redirects=True)
            return r.status_code < 500
    except Exception:
        return False


tunnel_service = TunnelService()
