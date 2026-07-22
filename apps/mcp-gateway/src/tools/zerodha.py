from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

import httpx

from src.config.settings import settings
from src.tools.base import BaseTool
from src.utils.errors import ToolAuthError

logger = logging.getLogger(__name__)

_ZERODHA_MCP_URL = 'https://mcp.kite.trade/mcp'   # hardcoded — SSRF prevention
_TIMEOUT_INIT    = 12.0
_TIMEOUT_CALL    = 30.0
_CACHE_TTL       = 3600.0   # tool list rarely changes

_tool_cache: dict[str, Any] = {}   # {'tools': [...], 'expires': float}


# ── Session helpers ───────────────────────────────────────────────────────────

def _session_id() -> str:
    sid = settings.zerodha_access_token.strip()
    if not sid:
        raise ToolAuthError(
            'Zerodha not connected. Click "Connect with Zerodha" in Settings → Stock Market → Zerodha.'
        )
    return sid


async def _mcp_tool_call(session_id: str, tool_name: str, arguments: dict | None = None) -> Any:
    """Call a Kite MCP tool using the stored session ID. Returns parsed text or raw content."""
    async with httpx.AsyncClient(timeout=_TIMEOUT_CALL) as c:
        r = await c.post(_ZERODHA_MCP_URL, headers={'mcp-session-id': session_id}, json={
            'jsonrpc': '2.0', 'method': 'tools/call', 'id': 1,
            'params': {'name': tool_name, 'arguments': arguments or {}},
        })
        if r.status_code == 401:
            raise ToolAuthError(
                'Zerodha session expired — please reconnect in Settings → Stock Market → Zerodha.'
            )
        r.raise_for_status()
        data = r.json()
        if 'error' in data:
            raise RuntimeError(data['error'].get('message', 'Kite MCP error'))
        result  = data.get('result', {})
        content = result.get('content', [])
        texts   = [item.get('text', '') for item in content if item.get('type') == 'text']
        combined = '\n'.join(filter(None, texts))
        if combined:
            _auth_phrases = ('please log in', 'log in first', 'login required', 'not authenticated', 'failed to execute')
            if any(p in combined.lower() for p in _auth_phrases):
                raise ToolAuthError(
                    'Zerodha session requires login — please complete the Kite login flow in '
                    'Settings → Stock Market → Zerodha.'
                )
            try:
                return json.loads(combined)
            except (json.JSONDecodeError, ValueError):
                return combined
        return content


# ── Tool list (session-independent) ───────────────────────────────────────────

async def _list_mcp_tools(force: bool = False) -> list[dict]:
    """
    Fetch available Kite MCP tools. Uses a fresh anonymous session because
    tools/list does not require authentication on the Kite MCP server.
    Caches results for CACHE_TTL seconds.
    """
    if not force and _tool_cache.get('tools') and time.monotonic() < _tool_cache.get('expires', 0):
        return _tool_cache['tools']

    async with httpx.AsyncClient(timeout=_TIMEOUT_INIT) as c:
        init_r = await c.post(_ZERODHA_MCP_URL, json={
            'jsonrpc': '2.0', 'method': 'initialize', 'id': 1,
            'params': {
                'protocolVersion': '2025-03-26',
                'capabilities': {},
                'clientInfo': {'name': 'AI Desk Companion', 'version': '1.0'},
            },
        })
        init_r.raise_for_status()
        sid = init_r.headers.get('mcp-session-id', '')
        if not sid:
            raise RuntimeError('Kite MCP server did not return a session ID during tool discovery')

        list_r = await c.post(_ZERODHA_MCP_URL, headers={'mcp-session-id': sid}, json={
            'jsonrpc': '2.0', 'method': 'tools/list', 'id': 2,
        })
        list_r.raise_for_status()
        raw_tools = list_r.json().get('result', {}).get('tools', [])

    tools = [
        {
            'name':        t['name'],
            'description': t.get('description', ''),
            'inputSchema': t.get('inputSchema', {}),
        }
        for t in raw_tools
    ]
    _tool_cache['tools']   = tools
    _tool_cache['expires'] = time.monotonic() + _CACHE_TTL
    return tools


# ── Query routing ─────────────────────────────────────────────────────────────

_ROUTING: list[tuple[re.Pattern, list[str]]] = [
    (re.compile(r'\b(position[s]?|intraday|open position|today.s trade)\b', re.I),
     ['get_positions', 'positions', 'position']),
    (re.compile(r'\b(order[s]?|order list|placed order|my order|order history)\b', re.I),
     ['get_orders', 'orders', 'get_trades', 'trades']),
    (re.compile(r'\b(fund[s]?|margin|buying power|available cash|limit)\b', re.I),
     ['get_margins', 'margins']),
    (re.compile(r'\b(holding[s]?|portfolio|my stock[s]?|invested|long.term)\b', re.I),
     ['get_holdings', 'holdings']),
    (re.compile(r'\b(profile|account|user info|my account)\b', re.I),
     ['get_profile', 'profile']),
    (re.compile(r'\b(mutual fund[s]?|mf|sip)\b', re.I),
     ['get_mf_holdings', 'mf_holdings']),
    (re.compile(r'\b(quote[s]?|ltp|price|last traded|live price)\b', re.I),
     ['get_ltp', 'get_quotes']),
]
_DEFAULT_CANDIDATES = ['get_holdings', 'holdings']


async def _dispatch_query(query: str) -> Any:
    tools    = await _list_mcp_tools()
    tool_map = {t['name']: t['name'] for t in tools}
    sid      = _session_id()

    candidates = _DEFAULT_CANDIDATES
    for pattern, kws in _ROUTING:
        if pattern.search(query):
            candidates = kws
            break

    for name in candidates:
        if name in tool_map:
            return await _mcp_tool_call(sid, name)

    available = ', '.join(list(tool_map.keys())[:10])
    return f"Couldn't match the right Zerodha tool. Available: {available}."


# ── BaseTool ──────────────────────────────────────────────────────────────────

class ZerodhaTool(BaseTool):
    namespace = 'zerodha'

    async def list_tools(self) -> list[dict]:
        base_tools = [
            {
                'name': 'query_zerodha',
                'description': (
                    "Access the user's Zerodha Kite broker account. Use for holdings, portfolio P&L, "
                    "positions, orders, fund limits, margins, and any question about the Zerodha account. "
                    "Always call this for questions about 'my Zerodha portfolio', 'my Kite holdings', "
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
        ]
        if settings.zerodha_trade_enabled:
            base_tools.append({
                'name': 'place_zerodha_order',
                'description': (
                    'Place a buy or sell order on Zerodha Kite. '
                    'IMPORTANT: Always confirm with the user before calling this. '
                    'Trade mode is active — orders are real and will be executed immediately.'
                ),
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'tradingsymbol':    {'type': 'string',  'description': 'NSE symbol, e.g. "RELIANCE"'},
                        'exchange':         {'type': 'string',  'enum': ['NSE', 'BSE']},
                        'quantity':         {'type': 'integer', 'description': 'Number of shares'},
                        'transaction_type': {'type': 'string',  'enum': ['BUY', 'SELL']},
                        'order_type':       {'type': 'string',  'enum': ['MARKET', 'LIMIT', 'SL', 'SL-M']},
                        'price':            {'type': 'number',  'description': 'Limit price (required for LIMIT orders)'},
                        'product':          {'type': 'string',  'enum': ['CNC', 'MIS', 'NRML']},
                    },
                    'required': ['tradingsymbol', 'exchange', 'quantity', 'transaction_type', 'order_type', 'product'],
                },
            })
        return base_tools

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        if not settings.is_zerodha_configured():
            raise ToolAuthError(
                'Zerodha not connected. Click "Connect with Zerodha" in Settings → Stock Market.'
            )
        sid = _session_id()

        if tool_name == 'query_zerodha':
            query = arguments.get('query', '')
            try:
                return await _dispatch_query(query)
            except ToolAuthError:
                raise
            except Exception as exc:
                logger.warning('Zerodha query failed: %s', exc)
                raise

        if tool_name == 'place_zerodha_order':
            if not settings.zerodha_trade_enabled:
                raise RuntimeError(
                    'Trading is disabled. Enable Trade Mode in Settings → Stock Market → Zerodha.'
                )
            tools = await _list_mcp_tools()
            remote = next(
                (t['name'] for t in tools if 'place' in t['name'].lower() and 'order' in t['name'].lower()),
                None,
            )
            if not remote:
                raise RuntimeError('Place order tool not found on the Zerodha Kite MCP server.')
            return await _mcp_tool_call(sid, remote, arguments)

        raise ValueError(f'Unknown Zerodha tool: {tool_name}')
