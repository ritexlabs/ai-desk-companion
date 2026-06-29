"""
Async MCP client backed by the voska/hass-mcp Docker container.

Protocol: JSON-RPC 2.0 over stdin/stdout (MCP spec 2024-11-05).
One long-lived Docker process is shared per (ha_url, token) pair.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

_MCP_VERSION = '2024-11-05'


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
        self._lock       = asyncio.Lock()  # serialises startup / restart
        self._write_lock = asyncio.Lock()  # serialises stdin writes — prevents JSON corruption

    # ── Lifecycle ─────────────────────────────────────────────────────

    async def _start(self) -> None:
        logger.info('hass-mcp: starting Docker container')
        self._proc = await asyncio.create_subprocess_exec(
            'docker', 'run', '-i', '--rm',
            '-e', f'HA_URL={self._ha_url}',
            '-e', f'HA_TOKEN={self._ha_token}',
            'voska/hass-mcp:latest',
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._reader_task = asyncio.create_task(self._read_loop())

        # MCP handshake
        await self._request('initialize', {
            'protocolVersion': _MCP_VERSION,
            'capabilities':    {},
            'clientInfo':      {'name': 'robo-orchestrator', 'version': '1.0.0'},
        })
        await self._notify('notifications/initialized')
        self._ready = True
        logger.info('hass-mcp: ready')

    async def _read_loop(self) -> None:
        """Read stdout lines and resolve in-flight request futures."""
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

    # ── Public API ────────────────────────────────────────────────────

    async def call_tool(self, name: str, arguments: dict | None = None) -> Any:
        """Call a named MCP tool and return the parsed result."""
        await self._ensure_ready()
        result = await self._request('tools/call', {'name': name, 'arguments': arguments or {}})

        if result.get('isError'):
            content = result.get('content', [])
            texts   = [c['text'] for c in content if c.get('type') == 'text']
            raise RuntimeError('\n'.join(texts) or 'tool returned isError')

        # Prefer structuredContent (already-parsed JSON list/dict)
        structured = result.get('structuredContent')
        if structured is not None:
            return structured.get('result', structured)

        # Fall back to parsing text content
        content = result.get('content', [])
        texts   = [c['text'] for c in content if isinstance(c, dict) and c.get('type') == 'text']
        combined = '\n'.join(filter(None, texts))
        try:
            return json.loads(combined)
        except (json.JSONDecodeError, ValueError):
            return combined


# ── Module-level client registry ─────────────────────────────────────────────

_clients: dict[str, HassMCPClient] = {}


def get_hass_client(ha_url: str, ha_token: str) -> HassMCPClient:
    """Return (and cache) a HassMCPClient for the given HA credentials."""
    key = f'{ha_url}|{ha_token[:16]}'
    existing = _clients.get(key)
    dead     = existing is not None and existing._proc is not None and existing._proc.returncode is not None
    if existing is None or dead:
        _clients[key] = HassMCPClient(ha_url, ha_token)
    return _clients[key]


async def close_all() -> None:
    """Shut down every cached MCP client — call this at server shutdown."""
    for client in list(_clients.values()):
        try:
            await client.close()
        except Exception:
            pass
    _clients.clear()
