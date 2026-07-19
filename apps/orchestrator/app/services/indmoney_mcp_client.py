"""
MCP client for INDmoney using the official mcp Python SDK.
Uses Streamable HTTP transport — the same protocol as the working mcp-gateway.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

logger = logging.getLogger(__name__)

_TIMEOUT_INIT = 10.0
_TIMEOUT_CALL = 30.0
_CACHE_TTL    = 300.0   # 5 minutes

# token_prefix → (tools_list, expires_monotonic)
_tool_cache: dict[str, tuple[list[dict], float]] = {}


def _headers(token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {token}'} if token else {}


def _cache_key(endpoint: str, token: str) -> str:
    return f'{endpoint}|{token[:16]}'


async def _list_tools_uncached(endpoint: str, token: str) -> list[dict]:
    async with streamablehttp_client(endpoint, headers=_headers(token)) as (read, write, _):
        async with ClientSession(read, write) as session:
            await asyncio.wait_for(session.initialize(), timeout=_TIMEOUT_INIT)
            result = await asyncio.wait_for(session.list_tools(), timeout=_TIMEOUT_INIT)
            return [
                {
                    'name':        t.name,
                    'description': t.description or '',
                    'inputSchema': t.inputSchema or {},
                }
                for t in result.tools
            ]


async def list_tools(endpoint: str, token: str, force: bool = False) -> list[dict]:
    key = _cache_key(endpoint, token)
    if not force and key in _tool_cache:
        tools, expires = _tool_cache[key]
        if time.monotonic() < expires:
            return tools
    tools = await _list_tools_uncached(endpoint, token)
    _tool_cache[key] = (tools, time.monotonic() + _CACHE_TTL)
    return tools


async def call_tool(endpoint: str, token: str, name: str, arguments: dict | None = None) -> Any:
    """Open a fresh MCP session, initialise, and call the named tool."""
    async with streamablehttp_client(endpoint, headers=_headers(token)) as (read, write, _):
        async with ClientSession(read, write) as session:
            await asyncio.wait_for(session.initialize(), timeout=_TIMEOUT_INIT)
            result = await asyncio.wait_for(
                session.call_tool(name, arguments or {}),
                timeout=_TIMEOUT_CALL,
            )

            from mcp.types import TextContent
            texts = [c.text for c in result.content if isinstance(c, TextContent)]
            combined = '\n'.join(filter(None, texts))

            if combined:
                import json
                try:
                    return json.loads(combined)
                except (json.JSONDecodeError, ValueError):
                    return combined

            return result.content


def clear_cache(endpoint: str, token: str) -> None:
    _tool_cache.pop(_cache_key(endpoint, token), None)
