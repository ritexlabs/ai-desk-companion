from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from src.config.settings import settings
from src.tools.base import BaseTool
from src.utils.errors import ToolAuthError

logger = logging.getLogger(__name__)

_DHAN_MCP_URL  = 'https://mcp.dhan.co/mcp'  # hardcoded — no user-controlled URL (SSRF prevention)
_TIMEOUT_INIT  = 10.0
_TIMEOUT_CALL  = 30.0
_CACHE_TTL     = 300.0

_tool_cache: dict[str, tuple[list[dict], float]] = {}


# ── Auth ──────────────────────────────────────────────────────────────────────

def _build_headers() -> dict[str, str]:
    token = settings.dhan_access_token.strip()
    if not token:
        raise ToolAuthError(
            'Dhan not connected. Click "Connect with Dhan" in Settings → Stock Market → Dhan.'
        )
    return {'Authorization': f'Bearer {token}'}


def _cache_key() -> str:
    return settings.dhan_access_token[:16] if settings.dhan_access_token else ''


# ── MCP helpers ───────────────────────────────────────────────────────────────

async def _list_mcp_tools(force: bool = False) -> list[dict]:
    key = _cache_key()
    if not force and key in _tool_cache:
        tools, expires = _tool_cache[key]
        if time.monotonic() < expires:
            return tools

    headers = _build_headers()
    async with streamablehttp_client(_DHAN_MCP_URL, headers=headers) as (r, w, _):
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


async def _call_mcp_tool(tool_name: str, arguments: dict | None = None) -> Any:
    headers = _build_headers()
    async with streamablehttp_client(_DHAN_MCP_URL, headers=headers) as (r, w, _):
        async with ClientSession(r, w) as session:
            await asyncio.wait_for(session.initialize(), timeout=_TIMEOUT_INIT)
            result = await asyncio.wait_for(
                session.call_tool(tool_name, arguments or {}),
                timeout=_TIMEOUT_CALL,
            )
            from mcp.types import TextContent
            texts    = [c.text for c in result.content if isinstance(c, TextContent)]
            combined = '\n'.join(filter(None, texts))
            if combined:
                try:
                    return json.loads(combined)
                except (json.JSONDecodeError, ValueError):
                    return combined
            return result.content


# ── Query routing ─────────────────────────────────────────────────────────────

_ROUTING: list[tuple[re.Pattern, list[str]]] = [
    (re.compile(r'\b(option[s]?\s*chain|option chain|expiry|strike|put|call|CE|PE)\b', re.I),
     ['option_chain', 'option', 'expiry', 'options']),
    (re.compile(r'\b(position[s]?|intraday|today.s trade|open position)\b', re.I),
     ['position', 'intraday', 'positions']),
    (re.compile(r'\b(order[s]?|order list|placed order|my order)\b', re.I),
     ['order', 'orders', 'order_list']),
    (re.compile(r'\b(fund[s]?|margin|buying power|available cash|limit)\b', re.I),
     ['fund', 'margin', 'limit', 'funds']),
    (re.compile(r'\b(holding[s]?|portfolio|my stock[s]?|invested)\b', re.I),
     ['holding', 'portfolio', 'holdings']),
]
_DEFAULT_KEYWORDS = ['holding', 'portfolio', 'holdings', 'summary']


async def _dispatch_query(query: str) -> Any:
    tools    = await _list_mcp_tools()
    tool_map = {t['name'].lower(): t['name'] for t in tools}

    candidates = _DEFAULT_KEYWORDS
    for pattern, kws in _ROUTING:
        if pattern.search(query):
            candidates = kws
            break

    for kw in candidates:
        matched = next((real for lower, real in tool_map.items() if kw in lower), None)
        if matched:
            return await _call_mcp_tool(matched)

    return f"Couldn't match the right Dhan tool. Available: {', '.join(list(tool_map.values())[:8])}."


# ── BaseTool ──────────────────────────────────────────────────────────────────

class DhanTool(BaseTool):
    namespace = 'dhan'

    async def list_tools(self) -> list[dict]:
        base_tools = [
            {
                'name': 'query_dhan',
                'description': (
                    "Access the user's Dhan broker account. Use for holdings, portfolio P&L, "
                    "positions, orders, fund limits, and any question about the Dhan account. "
                    "Always call this for questions about 'my Dhan portfolio', 'my holdings', "
                    "'my positions', 'available funds', 'order status'."
                ),
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'query': {
                            'type': 'string',
                            'description': (
                                'Portfolio question, e.g. "show my holdings", "what is my P&L", '
                                '"available funds", "today\'s positions", "list my orders"'
                            ),
                        },
                    },
                    'required': ['query'],
                },
            },
            {
                'name': 'get_option_chain',
                'description': (
                    'Fetch the live option chain for a stock or index from Dhan. '
                    'Returns call/put strikes with LTP, OI, volume. '
                    'Use for: "option chain for NIFTY", "BANKNIFTY options", "RELIANCE option chain".'
                ),
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'symbol': {
                            'type': 'string',
                            'description': 'Underlying symbol, e.g. "NIFTY", "BANKNIFTY", "RELIANCE"',
                        },
                        'expiry': {
                            'type': 'string',
                            'description': 'Expiry date in YYYY-MM-DD format (optional — uses nearest expiry if omitted)',
                        },
                    },
                    'required': ['symbol'],
                },
            },
        ]
        if settings.dhan_trade_enabled:
            base_tools.append({
                'name': 'place_order',
                'description': (
                    'Place a buy or sell order on Dhan. '
                    'IMPORTANT: Always confirm with the user before calling this. '
                    'Trade mode is active — orders are real and will be executed immediately.'
                ),
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'symbol':       {'type': 'string', 'description': 'NSE/BSE symbol, e.g. "RELIANCE"'},
                        'quantity':     {'type': 'integer', 'description': 'Number of shares'},
                        'order_type':   {'type': 'string', 'enum': ['BUY', 'SELL'], 'description': 'BUY or SELL'},
                        'price_type':   {'type': 'string', 'enum': ['MARKET', 'LIMIT'], 'description': 'MARKET or LIMIT'},
                        'price':        {'type': 'number', 'description': 'Limit price (required when price_type is LIMIT)'},
                        'product_type': {'type': 'string', 'enum': ['CNC', 'INTRADAY'], 'description': 'CNC (delivery) or INTRADAY'},
                    },
                    'required': ['symbol', 'quantity', 'order_type', 'price_type', 'product_type'],
                },
            })
        return base_tools

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        if not settings.is_dhan_configured():
            raise ToolAuthError(
                'Dhan not connected. Click "Connect with Dhan" in Settings → Stock Market.'
            )

        if tool_name == 'query_dhan':
            query = arguments.get('query', '')
            try:
                return await _dispatch_query(query)
            except ToolAuthError:
                raise
            except Exception as exc:
                for sub in getattr(exc, 'exceptions', []):
                    if isinstance(sub, httpx.HTTPStatusError) and sub.response.status_code == 401:
                        raise ToolAuthError(
                            'Dhan access token expired or invalid — please reconnect in Settings → Stock Market.'
                        ) from sub
                logger.warning('Dhan query_dhan failed: %s', exc)
                raise

        if tool_name == 'get_option_chain':
            tools = await _list_mcp_tools()
            tool_map = {t['name'].lower(): t['name'] for t in tools}
            _OC_KEYWORDS = ['option_chain', 'optionchain', 'option-chain', 'option', 'chain', 'oc']
            remote = next(
                (real for kw in _OC_KEYWORDS for lower, real in tool_map.items() if kw in lower),
                None,
            )
            if not remote:
                available = ', '.join(list(tool_map.values())[:10])
                raise RuntimeError(
                    f'Option chain tool not available on the Dhan MCP server. '
                    f'Available tools: {available}'
                )
            args: dict = {'symbol': arguments.get('symbol', '')}
            if arguments.get('expiry'):
                args['expiry'] = arguments['expiry']
            return await _call_mcp_tool(remote, args)

        if tool_name == 'place_order':
            if not settings.dhan_trade_enabled:
                raise RuntimeError(
                    'Trading is disabled. Enable Trade Mode in Settings → Stock Market → Dhan to place orders.'
                )
            tools = await _list_mcp_tools()
            tool_map = {t['name'].lower(): t['name'] for t in tools}
            remote = next(
                (real for lower, real in tool_map.items() if 'order' in lower and 'place' in lower),
                next((real for lower, real in tool_map.items() if 'place' in lower), None),
            )
            if not remote:
                raise RuntimeError('Place order tool not found on the Dhan MCP server.')
            return await _call_mcp_tool(remote, arguments)

        raise ValueError(f'Unknown Dhan tool: {tool_name}')
