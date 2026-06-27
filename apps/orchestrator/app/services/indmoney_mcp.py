"""
Async HTTP MCP client for the INDmoney broker MCP server.

Protocol: JSON-RPC 2.0 over HTTP POST (MCP Streamable HTTP transport, spec 2024-11-05).
Authentication: Bearer token supplied by the user.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_MCP_VERSION = '2024-11-05'
_TIMEOUT     = 20.0   # seconds


class INDmoneyMCPClient:
    """Single-use HTTP MCP client for one auth token."""

    def __init__(self, endpoint: str, token: str) -> None:
        self._endpoint = endpoint.rstrip('/')
        self._token    = token
        self._next_id  = 1
        self._tools:   list[dict] | None = None   # cached tool list

    # ── Low-level JSON-RPC ────────────────────────────────────────────

    def _headers(self) -> dict:
        h: dict[str, str] = {
            'Content-Type': 'application/json',
            'Accept':       'application/json, text/event-stream',
        }
        if self._token:
            h['Authorization'] = f'Bearer {self._token}'
        return h

    async def _request(self, method: str, params: dict | None = None) -> Any:
        req_id = self._next_id
        self._next_id += 1
        body: dict = {'jsonrpc': '2.0', 'id': req_id, 'method': method}
        if params is not None:
            body['params'] = params

        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(self._endpoint, json=body, headers=self._headers())

        text = resp.text.strip()

        # MCP servers may respond with an SSE-formatted body even for non-streaming calls.
        # Strip SSE envelope if present: "data: {...}\n\n"
        if text.startswith('data:'):
            lines = [ln[len('data:'):].strip() for ln in text.splitlines() if ln.startswith('data:')]
            text  = '\n'.join(filter(None, lines))

        try:
            msg = json.loads(text)
        except (json.JSONDecodeError, ValueError):
            raise RuntimeError(f'INDmoney MCP: unexpected response ({resp.status_code}): {text[:120]}')

        if 'error' in msg:
            err = msg['error']
            raise RuntimeError(err.get('message', 'MCP error'))

        return msg.get('result', {})

    # ── MCP handshake ─────────────────────────────────────────────────

    async def initialize(self) -> None:
        await self._request('initialize', {
            'protocolVersion': _MCP_VERSION,
            'capabilities':    {},
            'clientInfo':      {'name': 'robo-orchestrator', 'version': '1.0.0'},
        })

    # ── Tool discovery ────────────────────────────────────────────────

    async def list_tools(self) -> list[dict]:
        if self._tools is not None:
            return self._tools
        result = await self._request('tools/list')
        tools  = result.get('tools', result) if isinstance(result, dict) else result
        self._tools = tools if isinstance(tools, list) else []
        return self._tools

    # ── Tool call ─────────────────────────────────────────────────────

    async def call_tool(self, name: str, arguments: dict | None = None) -> Any:
        """Call a named MCP tool and return the parsed result content."""
        result = await self._request('tools/call', {'name': name, 'arguments': arguments or {}})

        if isinstance(result, dict) and result.get('isError'):
            content = result.get('content', [])
            texts   = [c['text'] for c in content if isinstance(c, dict) and c.get('type') == 'text']
            raise RuntimeError('\n'.join(texts) or 'tool returned isError')

        # Prefer structuredContent (pre-parsed JSON)
        if isinstance(result, dict):
            structured = result.get('structuredContent')
            if structured is not None:
                return structured.get('result', structured)

            content = result.get('content', [])
            if isinstance(content, list):
                texts = [c['text'] for c in content if isinstance(c, dict) and c.get('type') == 'text']
                combined = '\n'.join(filter(None, texts))
                try:
                    return json.loads(combined)
                except (json.JSONDecodeError, ValueError):
                    return combined

        return result

    # ── Connectivity check ────────────────────────────────────────────

    async def ping(self) -> str:
        """Quick connectivity check — returns a short status string."""
        await self.initialize()
        tools = await self.list_tools()
        return f'Connected — {len(tools)} tool{"s" if len(tools) != 1 else ""} available'


# ── Module-level cache ────────────────────────────────────────────────────────

_clients: dict[str, INDmoneyMCPClient] = {}


def get_indmoney_client(endpoint: str, token: str) -> INDmoneyMCPClient:
    """Return (and cache) a client for the given token."""
    key      = f'{endpoint}|{token[:16]}'
    existing = _clients.get(key)
    if existing is None:
        _clients[key] = INDmoneyMCPClient(endpoint, token)
    return _clients[key]


def clear_client(token: str, endpoint: str = 'https://mcp.indmoney.com/mcp') -> None:
    key = f'{endpoint}|{token[:16]}'
    _clients.pop(key, None)
