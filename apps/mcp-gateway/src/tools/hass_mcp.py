"""
Async MCP client backed by the voska/hass-mcp Docker container.

Protocol: JSON-RPC 2.0 over stdin/stdout (MCP spec 2024-11-05).
One long-lived Docker process is shared per (ha_url, token) pair.
Moved here from apps/orchestrator so the gateway owns the HA connection.
"""
from __future__ import annotations

import asyncio
import json
import logging
import socket
from typing import Any
from urllib.parse import urlparse, urlunparse

logger = logging.getLogger(__name__)

_MCP_VERSION = '2024-11-05'


def _resolve_for_docker(url: str) -> str:
    """
    Replace mDNS / .local hostnames with their resolved IPv4 address.
    Docker Desktop on macOS/Windows runs in a VM whose DNS resolver does not
    participate in mDNS, so homeassistant.local cannot be looked up inside a
    container.  We resolve on the host first and hand the IP to Docker instead.
    """
    try:
        parsed = urlparse(url)
        host = parsed.hostname or ''
        if host.endswith('.local') or not host:
            results = socket.getaddrinfo(host, None, socket.AF_INET)
            if results:
                ip = results[0][4][0]
                port = parsed.port
                netloc = f'{ip}:{port}' if port else ip
                resolved = urlunparse(parsed._replace(netloc=netloc))
                logger.info('hass-mcp: resolved %s → %s for Docker', url, resolved)
                return resolved
    except OSError as exc:
        logger.warning('hass-mcp: could not resolve %s — %s', url, exc)
    return url


class HassMCPClient:
    """Manages a single voska/hass-mcp Docker process and speaks MCP over stdio."""

    def __init__(self, ha_url: str, ha_token: str) -> None:
        self._ha_url   = ha_url.rstrip('/')
        self._ha_token = ha_token
        self._proc:        asyncio.subprocess.Process | None = None
        self._reader_task: asyncio.Task | None               = None
        self._pending:     dict[int, asyncio.Future]         = {}
        self._next_id = 1
        self._ready   = False
        self._lock       = asyncio.Lock()
        self._write_lock = asyncio.Lock()

    async def _start(self) -> None:
        # Resolve mDNS / .local hostnames to IPs before handing to Docker —
        # Docker Desktop's VM DNS does not forward mDNS, so .local names fail.
        resolved_url = _resolve_for_docker(self._ha_url)
        logger.info('hass-mcp: starting Docker container (HA_URL=%s)', resolved_url)
        self._proc = await asyncio.create_subprocess_exec(
            'docker', 'run', '-i', '--rm',
            '-e', f'HA_URL={resolved_url}',
            '-e', f'HA_TOKEN={self._ha_token}',
            'voska/hass-mcp:latest',
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            limit=16 * 1024 * 1024,  # 16 MB — HA entity dumps with 500 entities can exceed 64 KB default
        )
        self._reader_task = asyncio.create_task(self._read_loop())

        await self._request('initialize', {
            'protocolVersion': _MCP_VERSION,
            'capabilities':    {},
            'clientInfo':      {'name': 'robo-mcp-gateway', 'version': '2.0.0'},
        })
        await self._notify('notifications/initialized')
        self._ready = True
        logger.info('hass-mcp: ready')

    async def _read_loop(self) -> None:
        assert self._proc and self._proc.stdout
        try:
            while True:
                raw = await self._proc.stdout.readline()
                if not raw:
                    break
                text = raw.decode('utf-8', errors='replace').strip()
                if not text:
                    continue
                try:
                    msg = json.loads(text)
                except json.JSONDecodeError:
                    logger.debug('hass-mcp non-JSON: %s', text[:100])
                    continue
                msg_id = msg.get('id')
                if msg_id is not None:
                    fut = self._pending.pop(msg_id, None)
                    if fut and not fut.done():
                        if 'error' in msg:
                            fut.set_exception(RuntimeError(
                                msg['error'].get('message', 'MCP error')
                            ))
                        else:
                            fut.set_result(msg.get('result', {}))
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.warning('hass-mcp read loop: %s', exc)
        finally:
            self._ready = False
            for fut in self._pending.values():
                if not fut.done():
                    fut.set_exception(RuntimeError('hass-mcp connection lost'))
            self._pending.clear()

    async def _write(self, data: dict) -> None:
        async with self._write_lock:
            assert self._proc and self._proc.stdin
            self._proc.stdin.write((json.dumps(data) + '\n').encode())
            await self._proc.stdin.drain()

    async def _notify(self, method: str) -> None:
        await self._write({'jsonrpc': '2.0', 'method': method})

    async def _request(self, method: str, params: dict | None = None) -> dict:
        req_id = self._next_id
        self._next_id += 1
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self._pending[req_id] = fut
        msg: dict = {'jsonrpc': '2.0', 'id': req_id, 'method': method}
        if params is not None:
            msg['params'] = params
        await self._write(msg)
        return await asyncio.wait_for(fut, timeout=30.0)

    async def _ensure_ready(self) -> None:
        async with self._lock:
            alive = self._proc is not None and self._proc.returncode is None
            if not alive or not self._ready:
                # Terminate the old container before spawning a new one to prevent leaks
                if self._proc and self._proc.returncode is None:
                    try:
                        self._proc.terminate()
                        await asyncio.wait_for(self._proc.wait(), timeout=5.0)
                    except Exception:
                        pass
                if self._reader_task and not self._reader_task.done():
                    self._reader_task.cancel()
                await self._start()

    async def close(self) -> None:
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass
        if self._proc and self._proc.returncode is None:
            try:
                self._proc.terminate()
                await asyncio.wait_for(self._proc.wait(), timeout=5.0)
            except Exception:
                pass
        self._ready = False

    async def call_tool(self, name: str, arguments: dict | None = None) -> Any:
        await self._ensure_ready()
        result = await self._request('tools/call', {'name': name, 'arguments': arguments or {}})

        if result.get('isError'):
            content = result.get('content', [])
            texts   = [c['text'] for c in content if c.get('type') == 'text']
            raise RuntimeError('\n'.join(texts) or 'tool returned isError')

        structured = result.get('structuredContent')
        if structured is not None:
            return structured.get('result', structured)

        content = result.get('content', [])
        texts   = [c['text'] for c in content if isinstance(c, dict) and c.get('type') == 'text']
        combined = '\n'.join(filter(None, texts))
        try:
            return json.loads(combined)
        except (json.JSONDecodeError, ValueError):
            return combined


_clients: dict[str, HassMCPClient] = {}


def get_hass_client(ha_url: str, ha_token: str) -> HassMCPClient:
    key      = f'{ha_url}|{ha_token[:16]}'
    existing = _clients.get(key)
    dead     = existing is not None and existing._proc is not None and existing._proc.returncode is not None
    if existing is None or dead:
        _clients[key] = HassMCPClient(ha_url, ha_token)
    return _clients[key]


async def close_all() -> None:
    for client in list(_clients.values()):
        try:
            await client.close()
        except Exception:
            pass
    _clients.clear()
