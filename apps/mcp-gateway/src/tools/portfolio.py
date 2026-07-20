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

_TIMEOUT_INIT = 10.0
_TIMEOUT_CALL = 30.0
_CACHE_TTL    = 300.0
_TOKEN_EP     = 'https://mcp.indmoney.com/token'

_tool_cache: dict[str, tuple[list[dict], float]] = {}
_last_refresh: float = 0.0
_REFRESH_THROTTLE = 30.0


# ── Token helpers ──────────────────────────────────────────────────────────────

def _load_token() -> dict | None:
    raw = settings.indmoney_oauth_token.strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def _save_token(token_data: dict) -> None:
    """Persist refreshed token back to settings and .env file."""
    settings.indmoney_oauth_token = json.dumps(token_data)
    try:
        import re as _re
        from pathlib import Path
        env_file = Path(__file__).parents[2] / '.env'
        if not env_file.exists():
            return
        content = env_file.read_text()
        new_val  = json.dumps(token_data)
        pattern  = _re.compile(r'^INDMONEY_OAUTH_TOKEN=.*', _re.MULTILINE)
        new_line = f"INDMONEY_OAUTH_TOKEN='{new_val}'"
        if pattern.search(content):
            content = pattern.sub(new_line, content)
        else:
            content = content.rstrip('\n') + f'\n{new_line}\n'
        env_file.write_text(content)
    except Exception as exc:
        logger.warning('Could not persist refreshed INDmoney token: %s', exc)


def _refresh_access_token(token_data: dict) -> dict:
    resp = httpx.post(
        _TOKEN_EP,
        data={
            'grant_type':    'refresh_token',
            'refresh_token': token_data['refresh_token'],
            'client_id':     settings.indmoney_client_id,
            'client_secret': settings.indmoney_client_secret,
        },
        timeout=10,
    )
    resp.raise_for_status()
    new_data = resp.json()
    if 'refresh_token' not in new_data and 'refresh_token' in token_data:
        new_data['refresh_token'] = token_data['refresh_token']
    if 'expires_in' in new_data and 'expires_at' not in new_data:
        new_data['expires_at'] = time.time() + int(new_data['expires_in'])
    _save_token(new_data)
    return new_data


def _build_headers() -> dict[str, str]:
    global _last_refresh

    token_data = _load_token()
    if not token_data:
        raise ToolAuthError(
            'INDmoney not connected. Open Settings → Agents → Portfolio and click Connect.'
        )
    access_token = token_data.get('access_token', '')
    if not access_token:
        raise ToolAuthError('INDmoney access_token missing — please reconnect via Settings.')

    expires_at = token_data.get('expires_at')
    # Normalise to seconds — the frontend sends tokenExpiresAt in milliseconds (JS Date.now())
    # while time.time() returns seconds. 1e10 s ≈ year 2286, so anything larger is in ms.
    if expires_at and expires_at > 1e10:
        expires_at = expires_at / 1000

    now = time.time()
    if expires_at and now > expires_at - 60 and token_data.get('refresh_token'):
        if now - _last_refresh >= _REFRESH_THROTTLE:
            _last_refresh = now
            try:
                token_data   = _refresh_access_token(token_data)
                access_token = token_data.get('access_token', access_token)
                logger.info('INDmoney access token auto-refreshed')
            except Exception as exc:
                logger.warning('INDmoney token refresh failed: %s', exc)
                # Token is past expiry and refresh failed — tell the user to reconnect
                if now > (expires_at or 0) + 300:
                    raise ToolAuthError(
                        'INDmoney token expired and refresh failed — '
                        'please reconnect in Settings → Portfolio.'
                    ) from exc

    return {'Authorization': f'Bearer {access_token}'}


# ── MCP calls ─────────────────────────────────────────────────────────────────

def _cache_key() -> str:
    td = _load_token()
    tok = (td or {}).get('access_token', '')
    return tok[:16]


async def _list_mcp_tools(force: bool = False) -> list[dict]:
    key = _cache_key()
    if not force and key in _tool_cache:
        tools, expires = _tool_cache[key]
        if time.monotonic() < expires:
            return tools

    headers = _build_headers()
    async with streamablehttp_client(settings.indmoney_mcp_url, headers=headers) as (r, w, _):
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
    async with streamablehttp_client(settings.indmoney_mcp_url, headers=headers) as (r, w, _):
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


# ── Query routing ──────────────────────────────────────────────────────────────

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


async def _dispatch_query(query: str) -> Any:
    tools    = await _list_mcp_tools()
    tool_map = {t['name'].lower(): t['name'] for t in tools}

    candidates = _DEFAULT_KEYWORDS
    for pattern, kws in _ROUTING:
        if pattern.search(query.lower()):
            candidates = kws
            break

    for kw in candidates:
        matched = next((real for lower, real in tool_map.items() if kw in lower), None)
        if matched:
            return await _call_mcp_tool(matched)

    return f"Couldn't find the right tool. Available: {', '.join(list(tool_map.values())[:6])}."


# ── BaseTool ──────────────────────────────────────────────────────────────────

class PortfolioTool(BaseTool):
    namespace = 'indmoney'

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
                                'The portfolio question, e.g. "show my holdings", '
                                '"what is my total P&L", "list my mutual funds"'
                            ),
                        },
                    },
                    'required': ['query'],
                },
            }
        ]

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        if not settings.is_portfolio_configured():
            raise ToolAuthError(
                'INDmoney OAuth token not configured. '
                'Add INDMONEY_OAUTH_TOKEN (and INDMONEY_CLIENT_ID/SECRET) to the gateway .env file.'
            )
        query = arguments.get('query', '')
        try:
            return await _dispatch_query(query)
        except ToolAuthError:
            raise
        except Exception as exc:
            # Unwrap ExceptionGroup (anyio TaskGroup, Python 3.11+) to surface 401 from INDmoney.
            # streamablehttp_client wraps transport errors in ExceptionGroup via anyio task groups.
            for sub in getattr(exc, 'exceptions', []):
                if isinstance(sub, httpx.HTTPStatusError) and sub.response.status_code == 401:
                    raise ToolAuthError(
                        'INDmoney token expired — please reconnect in Settings → Portfolio.'
                    ) from sub
            logger.warning('INDmoney call_tool failed: %s', exc)
            raise
