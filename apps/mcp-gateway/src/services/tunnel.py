from __future__ import annotations

"""
Cloudflare tunnel manager for the MCP Gateway.

Three modes (tried in order of priority):
  named    — CLOUDFLARE_TUNNEL_NAME is set → runs a named tunnel with auto-generated YAML config
  hostname — WHATSAPP_WEBHOOK_DOMAIN set but no tunnel name → --hostname flag
  quick    — neither set → --url flag, captures *.trycloudflare.com URL from output

PID is persisted to .cf-tunnel.pid so the process survives gateway restarts and
is still reachable on the next `stop` call.
"""

import os
import re
import subprocess
import threading
import time
from pathlib import Path

_BASE_DIR   = Path(__file__).parent.parent.parent   # apps/mcp-gateway/
_PID_FILE   = _BASE_DIR / '.cf-tunnel.pid'
_CFG_DIR    = _BASE_DIR / '.cloudflared'
_CFG_FILE   = _CFG_DIR  / 'tunnel-whatsapp.yml'
_URL_PATTERN = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com')

_tunnel_proc:     subprocess.Popen | None = None
_quick_tunnel_url: str | None             = None
_lock = threading.Lock()


# ── Startup cleanup ───────────────────────────────────────────────────────────

def _pid_from_file() -> int | None:
    try:
        return int(_PID_FILE.read_text().strip())
    except Exception:
        return None


def _is_alive(pid: int | None) -> bool:
    if pid is None:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


# Clean stale PID file on module import
_stale = _pid_from_file()
if _stale and not _is_alive(_stale):
    _PID_FILE.unlink(missing_ok=True)


# ── Public API ────────────────────────────────────────────────────────────────

def _check_running() -> bool:
    """Check if tunnel is alive — call only while already holding _lock."""
    if _tunnel_proc is not None and _tunnel_proc.poll() is None:
        return True
    return _is_alive(_pid_from_file())


def is_running() -> bool:
    with _lock:
        return _check_running()


def get_url() -> str | None:
    return _quick_tunnel_url


def start(gateway_port: int) -> dict:
    """Start the tunnel. Returns {ok, mode, url, error}."""
    global _tunnel_proc, _quick_tunnel_url

    with _lock:
        if _check_running():
            return {'ok': True, 'mode': _detect_mode(), 'url': _build_webhook_url(), 'already_running': True}

        mode = _detect_mode()
        try:
            proc, capture_url = _launch(mode, gateway_port)
        except FileNotFoundError:
            return {'ok': False, 'error': 'cloudflared not found. Install: brew install cloudflare/cloudflare/cloudflared'}
        except Exception as exc:
            return {'ok': False, 'error': str(exc)}

        _tunnel_proc = proc
        _PID_FILE.write_text(str(proc.pid))

        # Background threads to read output and capture quick-tunnel URL
        def _read(stream):
            global _quick_tunnel_url
            for line in stream:
                m = _URL_PATTERN.search(line)
                if m and _quick_tunnel_url is None:
                    url = m.group(0).removeprefix('https://')
                    _quick_tunnel_url = url
                    # Persist to .env so it survives restarts
                    if capture_url:
                        _update_env('WHATSAPP_WEBHOOK_DOMAIN', url)

        t1 = threading.Thread(target=_read, args=(proc.stdout,), daemon=True)
        t2 = threading.Thread(target=_read, args=(proc.stderr,), daemon=True)
        t1.start()
        t2.start()

        # Watcher — clears state when process exits
        def _watch():
            global _tunnel_proc, _quick_tunnel_url
            proc.wait()
            with _lock:
                _tunnel_proc    = None
                _quick_tunnel_url = None
                _PID_FILE.unlink(missing_ok=True)

        threading.Thread(target=_watch, daemon=True).start()

        # Give cloudflared a moment to start
        time.sleep(0.5)
        return {'ok': True, 'mode': mode, 'url': _build_webhook_url()}


def stop() -> dict:
    global _tunnel_proc, _quick_tunnel_url
    with _lock:
        killed = False
        if _tunnel_proc is not None and _tunnel_proc.poll() is None:
            try:
                _tunnel_proc.terminate()
            except Exception:
                pass
            killed = True
        pid = _pid_from_file()
        if _is_alive(pid):
            try:
                os.kill(pid, 15)   # SIGTERM
            except OSError:
                pass
            killed = True
        _tunnel_proc    = None
        _quick_tunnel_url = None
        _PID_FILE.unlink(missing_ok=True)
    return {'ok': True, 'stopped': killed}


def status(gateway_port: int) -> dict:
    from src.config.settings import settings
    mode   = _detect_mode()
    domain = _quick_tunnel_url or (settings.whatsapp_webhook_domain or '').strip()
    return {
        'running':    is_running(),
        'mode':       mode,
        'domain':     domain or None,
        'quickUrl':   _quick_tunnel_url,
        'webhookUrl': _build_webhook_url(),
        'configFile': str(_CFG_FILE) if _CFG_FILE.exists() else None,
    }


# ── Internal helpers ──────────────────────────────────────────────────────────

def _detect_mode() -> str:
    from src.config.settings import settings
    if (settings.cloudflare_tunnel_name or '').strip():
        return 'named'
    if (settings.whatsapp_webhook_domain or '').strip():
        return 'hostname'
    return 'quick'


def _build_webhook_url() -> str | None:
    from src.config.settings import settings
    domain = _quick_tunnel_url or (settings.whatsapp_webhook_domain or '').strip()
    if domain:
        return f'https://{domain}/webhook/whatsapp'
    return None


def _launch(mode: str, port: int) -> tuple[subprocess.Popen, bool]:
    """Returns (proc, capture_url_from_stdout)."""
    from src.config.settings import settings

    common = dict(
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    if mode == 'named':
        name = settings.cloudflare_tunnel_name.strip()
        _ensure_named_cfg(name, settings.whatsapp_webhook_domain or '', port)
        proc = subprocess.Popen(
            ['cloudflared', 'tunnel', '--config', str(_CFG_FILE), 'run'],
            **common,
        )
        return proc, False

    if mode == 'hostname':
        domain = settings.whatsapp_webhook_domain.strip()
        proc = subprocess.Popen(
            ['cloudflared', 'tunnel', '--hostname', domain, '--url', f'http://localhost:{port}'],
            **common,
        )
        return proc, False

    # quick tunnel
    proc = subprocess.Popen(
        ['cloudflared', 'tunnel', '--url', f'http://localhost:{port}'],
        **common,
    )
    return proc, True


def _ensure_named_cfg(name: str, domain: str, port: int) -> None:
    """Auto-generate the named-tunnel YAML config if it doesn't already exist."""
    if _CFG_FILE.exists():
        return
    _CFG_DIR.mkdir(parents=True, exist_ok=True)
    cred_file = Path.home() / '.cloudflared' / f'{name}.json'
    lines = [f'tunnel: {name}']
    if cred_file.exists():
        lines.append(f'credentials-file: {cred_file}')
    lines += ['', 'ingress:']
    if domain:
        lines += [f'  - hostname: {domain}', f'    service: http://localhost:{port}']
    lines.append('  - service: http_status:404')
    _CFG_FILE.write_text('\n'.join(lines) + '\n')


def _update_env(key: str, value: str) -> None:
    """Persist a key=value into .env without touching other lines."""
    env_file = _BASE_DIR / '.env'
    if not env_file.exists():
        env_file.write_text(f'{key}={value}\n')
        return
    content = env_file.read_text()
    pattern = re.compile(rf'^{re.escape(key)}=.*', re.MULTILINE)
    new_line = f"{key}='{value}'"
    if pattern.search(content):
        content = pattern.sub(new_line, content)
    else:
        content = content.rstrip('\n') + f'\n{new_line}\n'
    env_file.write_text(content)
