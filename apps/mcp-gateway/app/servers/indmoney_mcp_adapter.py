from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from app.servers.base import BaseMCPServer

logger = logging.getLogger(__name__)

_ENDPOINT      = 'https://mcp.indmoney.com/mcp'
_TIMEOUT_INIT  = 10.0
_TIMEOUT_CALL  = 30.0
_CACHE_TTL     = 300.0


# ── Minimal in-process tool cache (token_prefix → (tools, expires)) ──────────

_tool_cache: dict[str, tuple[list[dict], float]] = {}


def _headers(token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {token}'} if token else {}


def _cache_key(token: str) -> str:
    return token[:16]


async def _list_mcp_tools(token: str, force: bool = False) -> list[dict]:
    key = _cache_key(token)
    if not force and key in _tool_cache:
        tools, expires = _tool_cache[key]
        if time.monotonic() < expires:
            return tools

    async with streamablehttp_client(_ENDPOINT, headers=_headers(token)) as (r, w, _):
        async with ClientSession(r, w) as session:
            await asyncio.wait_for(session.initialize(), timeout=_TIMEOUT_INIT)
            result = await asyncio.wait_for(session.list_tools(), timeout=_TIMEOUT_INIT)
            tools = [
                {
                    'name':        t.name,
                    'description': t.description or '',
                    'inputSchema': t.inputSchema or {},
                }
                for t in result.tools
            ]

    _tool_cache[key] = (tools, time.monotonic() + _CACHE_TTL)
    return tools


async def _call_mcp_tool(token: str, tool_name: str, arguments: dict | None = None) -> Any:
    async with streamablehttp_client(_ENDPOINT, headers=_headers(token)) as (r, w, _):
        async with ClientSession(r, w) as session:
            await asyncio.wait_for(session.initialize(), timeout=_TIMEOUT_INIT)
            result = await asyncio.wait_for(
                session.call_tool(tool_name, arguments or {}),
                timeout=_TIMEOUT_CALL,
            )
            from mcp.types import TextContent
            texts = [c.text for c in result.content if isinstance(c, TextContent)]
            combined = '\n'.join(filter(None, texts))
            if combined:
                try:
                    return json.loads(combined)
                except (json.JSONDecodeError, ValueError):
                    return combined
            return result.content


# ── INDmoney keyword routing (mirrors PortfolioAgent._dispatch) ───────────────

_ROUTING: list[tuple[re.Pattern, list[str]]] = [
    (re.compile(r'\b(mutual\s*fund|mf|sip|folio)\b'),          ['mutual_fund', 'mf', 'fund', 'folio']),
    (re.compile(r'\b(watchlist|watch|track)\b'),                ['watchlist', 'watch']),
    (re.compile(r'\b(transaction|buy|sell|history|recent)\b'),  ['transaction', 'history', 'order']),
    (re.compile(r'\b(p&?l|profit|loss|gain|return|returns)\b'), ['pnl', 'p_l', 'profit', 'gain', 'return']),
    (re.compile(r'\b(holding|stock|equity|share)\b'),           ['holding', 'stock', 'equity', 'portfolio']),
    (re.compile(r'\b(summary|overview|total|value|net\s*worth|networth)\b'),
     ['summary', 'overview', 'networth', 'portfolio', 'total']),
]
_DEFAULT_KEYWORDS = ['summary', 'overview', 'networth', 'portfolio', 'holding']


async def _dispatch_query(query: str, token: str) -> Any:
    tools = await _list_mcp_tools(token)
    tool_map = {t['name'].lower(): t['name'] for t in tools}

    t = query.lower()
    candidates = _DEFAULT_KEYWORDS
    for pattern, kws in _ROUTING:
        if pattern.search(t):
            candidates = kws
            break

    for kw in candidates:
        matched = next((real for lower, real in tool_map.items() if kw in lower), None)
        if matched:
            return await _call_mcp_tool(token, matched)

    return f"I couldn't find the right tool. Available: {', '.join(list(tool_map.values())[:6])}."


# ── Server adapter ────────────────────────────────────────────────────────────

class INDmoneyServer(BaseMCPServer):
    namespace = 'indmoney'

    async def connect(self) -> None:
        pass  # connections are per-call via streamablehttp_client

    async def disconnect(self) -> None:
        pass

    async def list_tools(self) -> list[dict]:
        return [
            {
                'name': 'query_portfolio',
                'description': (
                    "Access the user's INDmoney investment portfolio. "
                    "Use for ANY question about investments, holdings, P&L, returns, "
                    "mutual funds, watchlist, transactions, or portfolio performance. "
                    "Never answer portfolio questions from training data — always call this tool."
                ),
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'query': {
                            'type': 'string',
                            'description': (
                                'The portfolio question or command, e.g. "show my holdings", '
                                '"what is my total P&L", "list my mutual funds", '
                                '"recent transactions", "what is on my watchlist"'
                            ),
                        },
                    },
                    'required': ['query'],
                },
            }
        ]

    async def call_tool(self, tool_name: str, arguments: dict, credentials: dict) -> Any:
        token = credentials.get('indmoney_token', '').strip()
        if not token:
            raise PermissionError(
                'INDmoney access token not configured. '
                'Click Connect in Settings → Agents → Portfolio to sign in.'
            )
        query = arguments.get('query', '')
        try:
            return await _dispatch_query(query, token)
        except PermissionError:
            raise
        except Exception as exc:
            logger.warning('INDmoney call_tool failed: %s', exc)
            raise
