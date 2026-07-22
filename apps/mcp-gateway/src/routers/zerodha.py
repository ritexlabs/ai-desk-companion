from __future__ import annotations

import json
import re

import httpx
from fastapi import APIRouter
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from src.config.settings import settings

router = APIRouter(tags=['zerodha'])

_ZERODHA_MCP_URL = 'https://mcp.kite.trade/mcp'
_INIT_TIMEOUT    = 12
_TOOL_TIMEOUT    = 15


# ── MCP helpers ───────────────────────────────────────────────────────────────

async def _mcp_init() -> str:
    """Open a new Kite MCP session and return its session ID."""
    async with httpx.AsyncClient(timeout=_INIT_TIMEOUT) as c:
        r = await c.post(_ZERODHA_MCP_URL, json={
            'jsonrpc': '2.0', 'method': 'initialize', 'id': 1,
            'params': {
                'protocolVersion': '2025-03-26',
                'capabilities': {},
                'clientInfo': {'name': 'AI Desk Companion', 'version': '1.0'},
            },
        })
        r.raise_for_status()
        session_id = r.headers.get('mcp-session-id', '')
        if not session_id:
            raise RuntimeError('Kite MCP server did not return a session ID')
        await c.post(_ZERODHA_MCP_URL, headers={'mcp-session-id': session_id}, json={
            'jsonrpc': '2.0', 'method': 'notifications/initialized', 'id': None,
        })
    return session_id


async def _mcp_call(session_id: str, tool_name: str, args: dict | None = None) -> dict:
    """Call an MCP tool with the given session and return the result dict."""
    async with httpx.AsyncClient(timeout=_TOOL_TIMEOUT) as c:
        r = await c.post(_ZERODHA_MCP_URL, headers={'mcp-session-id': session_id}, json={
            'jsonrpc': '2.0', 'method': 'tools/call', 'id': 2,
            'params': {'name': tool_name, 'arguments': args or {}},
        })
        r.raise_for_status()
        data = r.json()
        if 'error' in data:
            raise RuntimeError(data['error'].get('message', 'MCP error'))
        return data.get('result', {})


def _extract_login_url(result: dict) -> str:
    content = result.get('content', [])
    text    = content[0].get('text', '') if content else ''
    m = re.search(r'https://mcp\.kite\.trade/authorize\?[^\s\)\"]+', text)
    if m:
        return m.group(0)
    raise RuntimeError('Could not extract Zerodha login URL from MCP response')


# ── HTML helpers ──────────────────────────────────────────────────────────────

def _error_html(title: str, detail: str) -> str:
    return f"""<!doctype html>
<html><head><title>{title}</title>
<style>
  body{{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;
       background:#0a0e1a;font-family:system-ui,sans-serif;color:#e2e8f0}}
  .card{{text-align:center;padding:2.5rem;border-radius:1.25rem;
        background:#0f1629;border:1px solid rgba(255,255,255,.08);max-width:380px}}
  .x{{font-size:3rem;margin-bottom:1rem;color:#f87171}}
  h2{{margin:.5rem 0;color:#f87171;font-size:1.25rem}}
  p{{color:#94a3b8;font-size:.875rem;margin:.75rem 0}}
  code{{font-size:.75rem;color:#fb7185;background:#1e1b4b;padding:.25rem .5rem;border-radius:.4rem;word-break:break-all}}
</style></head><body>
<div class="card">
  <div class="x">&#x2715;</div>
  <h2>{title}</h2>
  <p><code>{detail[:300]}</code></p>
  <p style="color:#475569;font-size:.75rem">Close this tab and try again.</p>
</div>
</body></html>"""


# ── Auth flow ─────────────────────────────────────────────────────────────────

@router.get('/auth/zerodha')
async def auth_zerodha():
    """
    Initialize a Kite MCP session, call the login tool, and redirect the user
    to the Zerodha Kite login page. The session ID is stored immediately so that
    /api/zerodha/status can poll get_profile to detect when login completes.
    """
    try:
        session_id = await _mcp_init()
        result     = await _mcp_call(session_id, 'login', {})
        login_url  = _extract_login_url(result)
    except Exception as exc:
        return HTMLResponse(_error_html('Connection Failed', str(exc)), status_code=502)

    # Store session ID now — status endpoint polls get_profile to confirm auth
    settings.zerodha_access_token = session_id
    settings.persist_to_env({'zerodha_access_token': session_id})
    try:
        from src.tools.zerodha import _tool_cache
        _tool_cache.clear()
    except Exception:
        pass
    return RedirectResponse(login_url)


@router.delete('/auth/zerodha/token')
async def disconnect_zerodha():
    """Clear the stored Kite MCP session."""
    settings.zerodha_access_token     = ''
    settings.zerodha_refresh_token    = ''
    settings.zerodha_token_expires_at = 0.0
    settings.persist_to_env({'zerodha_access_token': '', 'zerodha_refresh_token': ''})
    try:
        from src.tools.zerodha import _tool_cache
        _tool_cache.clear()
    except Exception:
        pass
    return {'status': 'disconnected'}


# ── Status + data proxy endpoints ─────────────────────────────────────────────

@router.get('/api/zerodha/status')
async def zerodha_status():
    """
    Returns whether the Zerodha session is authenticated.
    Calls get_profile on the stored mcp-session-id to check.
    """
    session_id = settings.zerodha_access_token
    if not session_id:
        return {'connected': False, 'trade_enabled': settings.zerodha_trade_enabled}
    try:
        result   = await _mcp_call(session_id, 'get_profile', {})
        content  = result.get('content', [])
        text     = content[0].get('text', '') if content else ''
        _bad     = ('login', 'log in', 'please', 'failed', 'error', 'unauthorized', 'authenticate')
        connected = bool(text) and not any(p in text.lower() for p in _bad)
    except Exception:
        connected = False
    return {
        'connected':      connected,
        'trade_enabled':  settings.zerodha_trade_enabled,
        'session_active': True,
    }


@router.get('/api/zerodha/holdings')
async def zerodha_holdings():
    if not settings.zerodha_access_token:
        return JSONResponse({'ok': False, 'authRequired': True, 'error': 'Zerodha not connected'})
    try:
        from src.tools.zerodha import _dispatch_query
        result = await _dispatch_query('my holdings portfolio')
        return {'ok': True, 'data': result}
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)[:400]})


@router.get('/api/zerodha/positions')
async def zerodha_positions():
    if not settings.zerodha_access_token:
        return JSONResponse({'ok': False, 'authRequired': True, 'error': 'Zerodha not connected'})
    try:
        from src.tools.zerodha import _dispatch_query
        result = await _dispatch_query('my intraday positions today')
        return {'ok': True, 'data': result}
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)[:400]})


@router.get('/api/zerodha/orders')
async def zerodha_orders():
    if not settings.zerodha_access_token:
        return JSONResponse({'ok': False, 'authRequired': True, 'error': 'Zerodha not connected'})
    try:
        from src.tools.zerodha import _dispatch_query
        result = await _dispatch_query('my orders today')
        return {'ok': True, 'data': result}
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)[:400]})


@router.get('/api/zerodha/tools')
async def zerodha_tools():
    if not settings.zerodha_access_token:
        return JSONResponse({'ok': False, 'authRequired': True, 'error': 'Zerodha not connected'})
    try:
        from src.tools.zerodha import _list_mcp_tools
        tools = await _list_mcp_tools(force=True)
        return {'ok': True, 'tools': [{'name': t['name'], 'description': t.get('description', '')[:120]} for t in tools]}
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)[:400]})
