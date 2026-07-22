from __future__ import annotations

import hashlib
import re
import secrets
import time
from base64 import urlsafe_b64encode

import httpx
from fastapi import APIRouter
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from src.config.settings import settings


def _parse_holdings_text(text: str) -> list[dict]:
    """Parse the formatted text from portfolio_agent_tool into structured holding dicts.

    The Dhan MCP returns human-readable text like:
        RELIANCE (ALL)
          Qty: 104 (avail 104, T1 0)
          Avg Cost: ₹1,300.37 | Invested: ₹135,238.20
    """
    holdings: list[dict] = []
    current: dict | None = None

    def _flush() -> None:
        if current and current.get('tradingSymbol'):
            # If no LTP came back, use avg cost so frontend shows 0% P&L instead of -100%
            if current['lastTradedPrice'] == 0.0 and current['avgCostPrice'] > 0:
                current['lastTradedPrice'] = current['avgCostPrice']
            holdings.append(current)

    for raw_line in text.splitlines():
        line = raw_line.strip()

        if not line:
            _flush()
            current = None
            continue

        # Skip emoji headers: "📊 Holdings (17 securities)"
        if not line[0].isalpha():
            continue

        # Symbol line: "RELIANCE (ALL)" or "BAJAJHFL (CNC)"
        m = re.match(
            r'^([A-Z][A-Z0-9&@.-]+(?:\s+[A-Z0-9&@.-]+)*)\s*'
            r'\((?:ALL|INT|CNC|MIS|LONG|SHORT|BTST)\)',
            line,
        )
        if m:
            _flush()
            current = {
                'tradingSymbol':        m.group(1).strip(),
                'totalQty':             0,
                'avgCostPrice':         0.0,
                'lastTradedPrice':      0.0,
                'unrealizedPnl':        0.0,
                'unrealizedPnlPercent': 0.0,
            }
            continue

        if current is None:
            continue

        # Qty: 104 (avail 104, T1 0)
        m = re.match(r'Qty:\s*([\d,]+)', line, re.I)
        if m:
            current['totalQty'] = int(m.group(1).replace(',', ''))
            continue

        # Avg Cost: ₹1,300.37 | Invested: ₹135,238.20
        m = re.match(r'Avg\s+Cost:\s*[₹₹]?([\d,]+\.?\d*)', line, re.I)
        if m:
            current['avgCostPrice'] = float(m.group(1).replace(',', ''))
            continue

        # LTP / CMP / Current Price: ₹1,400.00
        m = re.match(r'(?:LTP|CMP|Current\s+Price|Current):\s*[₹₹]?([\d,]+\.?\d*)', line, re.I)
        if m:
            current['lastTradedPrice'] = float(m.group(1).replace(',', ''))
            continue

        # P&L: ₹1,234.56 (1.23%)
        m = re.match(r'P&L:\s*[₹₹]?([+-]?[\d,]+\.?\d*)\s*\(([+-]?[\d.]+)%\)', line, re.I)
        if m:
            current['unrealizedPnl'] = float(m.group(1).replace(',', ''))
            current['unrealizedPnlPercent'] = float(m.group(2))
            continue

    _flush()
    return holdings


async def _enrich_with_ltp(holdings: list[dict]) -> list[dict]:
    """Batch-fetch current NSE prices via yfinance and compute P&L for each holding."""
    import asyncio
    symbols = [h['tradingSymbol'] for h in holdings]

    def _fetch() -> dict[str, float]:
        try:
            import yfinance as yf
            ns_tickers = [s + '.NS' for s in symbols]
            data = yf.download(
                ' '.join(ns_tickers),
                period='2d',
                progress=False,
                auto_adjust=True,
            )
            prices: dict[str, float] = {}
            close = data.get('Close') if hasattr(data, 'get') else data['Close']
            if close is None:
                return prices
            # Multi-ticker → Close is a DataFrame; single-ticker → Series
            if hasattr(close, 'columns'):
                for ns, sym in zip(ns_tickers, symbols):
                    try:
                        col = close[ns].dropna()
                        if not col.empty:
                            prices[sym] = float(col.iloc[-1])
                    except Exception:
                        pass
            else:
                col = close.dropna()
                if not col.empty and symbols:
                    prices[symbols[0]] = float(col.iloc[-1])
            return prices
        except Exception:
            return {}

    loop = asyncio.get_event_loop()
    price_map = await loop.run_in_executor(None, _fetch)

    for h in holdings:
        ltp = price_map.get(h['tradingSymbol'], 0.0)
        if ltp > 0:
            h['lastTradedPrice'] = ltp
            avg = h.get('avgCostPrice', 0.0)
            qty = h.get('totalQty', 0)
            if avg > 0 and qty > 0:
                h['unrealizedPnl']        = round((ltp - avg) * qty, 2)
                h['unrealizedPnlPercent'] = round(((ltp - avg) / avg) * 100, 2)

    return holdings

router = APIRouter(tags=['dhan'])

_DHAN_MCP_BASE = 'https://mcp.dhan.co'
_FLOW_TTL      = 600   # 10 minutes

_pending_flows: dict[str, dict] = {}   # state -> {code_verifier, client_id, token_endpoint, created_at}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pkce_pair() -> tuple[str, str]:
    verifier  = urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b'=').decode()
    challenge = urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b'=').decode()
    return verifier, challenge


def _save_token(token_data: dict) -> None:
    settings.dhan_access_token      = token_data.get('access_token',  '')
    settings.dhan_refresh_token     = token_data.get('refresh_token', '')
    if 'expires_in' in token_data and 'expires_at' not in token_data:
        token_data['expires_at'] = time.time() + int(token_data['expires_in'])
    settings.dhan_token_expires_at  = float(token_data.get('expires_at', 0))
    settings.persist_to_env({
        'dhan_access_token':     settings.dhan_access_token,
        'dhan_refresh_token':    settings.dhan_refresh_token,
        'dhan_token_expires_at': str(settings.dhan_token_expires_at),
    })
    try:
        from src.tools.dhan import _tool_cache
        _tool_cache.clear()
    except Exception:
        pass


def _clear_token() -> None:
    settings.dhan_access_token     = ''
    settings.dhan_refresh_token    = ''
    settings.dhan_token_expires_at = 0.0
    try:
        from src.tools.dhan import _tool_cache
        _tool_cache.clear()
    except Exception:
        pass


async def _discover_oauth_config() -> dict:
    """Fetch OAuth authorization server metadata from Dhan's MCP server."""
    urls = [
        f'{_DHAN_MCP_BASE}/.well-known/oauth-authorization-server',
        f'{_DHAN_MCP_BASE}/mcp/.well-known/oauth-authorization-server',
    ]
    async with httpx.AsyncClient(timeout=10) as client:
        for url in urls:
            try:
                r = await client.get(url, follow_redirects=True)
                if r.is_success:
                    data = r.json()
                    if data.get('authorization_endpoint'):
                        return data
            except Exception:
                continue

        # Fallback: probe /mcp for a 401 and read www-authenticate resource
        try:
            r = await client.get(f'{_DHAN_MCP_BASE}/mcp', follow_redirects=True)
            resource = ''
            auth_hdr = r.headers.get('www-authenticate', '')
            for part in auth_hdr.split(','):
                part = part.strip()
                if part.lower().startswith('resource='):
                    resource = part[9:].strip('"')
                    break
            if resource:
                meta_r = await client.get(
                    f'{resource}/.well-known/oauth-authorization-server',
                    follow_redirects=True,
                )
                if meta_r.is_success:
                    return meta_r.json()
        except Exception:
            pass

    raise RuntimeError(
        'Could not discover Dhan OAuth configuration. '
        'Ensure https://mcp.dhan.co is reachable.'
    )


async def _get_or_register_client(registration_endpoint: str) -> tuple[str, str]:
    """Return (client_id, client_secret). Auto-registers via dynamic client registration."""
    if settings.dhan_oauth_client_id and settings.dhan_oauth_client_secret:
        return settings.dhan_oauth_client_id, settings.dhan_oauth_client_secret

    redirect_uri = f'http://localhost:{settings.gateway_port}/auth/dhan/callback'
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            registration_endpoint,
            json={
                'client_name':                'AI Desk Companion',
                'redirect_uris':              [redirect_uri],
                'grant_types':                ['authorization_code', 'refresh_token'],
                'response_types':             ['code'],
                'token_endpoint_auth_method': 'client_secret_post',
            },
        )
        r.raise_for_status()
        reg = r.json()

    settings.dhan_oauth_client_id     = reg['client_id']
    settings.dhan_oauth_client_secret = reg.get('client_secret', '')
    return settings.dhan_oauth_client_id, settings.dhan_oauth_client_secret


def _success_html() -> str:
    return """<!doctype html>
<html><head><title>Dhan Connected</title>
<style>
  body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;
       background:#0a0e1a;font-family:system-ui,sans-serif;color:#e2e8f0}
  .card{text-align:center;padding:2.5rem;border-radius:1.25rem;
        background:#0f1629;border:1px solid rgba(255,255,255,.08);max-width:360px}
  .check{font-size:3rem;margin-bottom:1rem;color:#22c55e}
  h2{margin:.5rem 0;color:#22c55e;font-size:1.25rem}
  p{color:#94a3b8;font-size:.875rem;margin:.75rem 0 1.5rem}
  .note{font-size:.75rem;color:#475569}
</style></head><body>
<div class="card">
  <div class="check">✓</div>
  <h2>Dhan Connected!</h2>
  <p>Your broker account is linked. You can close this tab and return to the app.</p>
  <div class="note">Session is managed securely by the gateway.</div>
</div>
<script>setTimeout(()=>window.close(),3000)</script>
</body></html>"""


def _error_html(title: str, detail: str) -> str:
    return f"""<!doctype html>
<html><head><title>{title}</title>
<style>
  body{{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;
       background:#0a0e1a;font-family:system-ui,sans-serif;color:#e2e8f0}}
  .card{{text-align:center;padding:2.5rem;border-radius:1.25rem;
        background:#0f1629;border:1px solid rgba(255,255,255,.08);max-width:360px}}
  .x{{font-size:3rem;margin-bottom:1rem;color:#f87171}}
  h2{{margin:.5rem 0;color:#f87171;font-size:1.25rem}}
  p{{color:#94a3b8;font-size:.875rem;margin:.75rem 0}}
  code{{font-size:.75rem;color:#fb7185;background:#1e1b4b;padding:.25rem .5rem;border-radius:.4rem}}
</style></head><body>
<div class="card">
  <div class="x">&#x2715;</div>
  <h2>{title}</h2>
  <p><code>{detail[:200]}</code></p>
  <p style="color:#475569;font-size:.75rem">Close this tab and try again.</p>
</div>
</body></html>"""


# ── OAuth flow ─────────────────────────────────────────────────────────────────

@router.get('/auth/dhan')
async def auth_dhan():
    """Step 1: Discover Dhan OAuth metadata, register client if needed, redirect to Dhan login."""
    try:
        cfg = await _discover_oauth_config()
    except Exception as exc:
        return HTMLResponse(_error_html('Discovery Failed', str(exc)), status_code=502)

    auth_ep  = cfg.get('authorization_endpoint', '')
    token_ep = cfg.get('token_endpoint', '')
    reg_ep   = cfg.get('registration_endpoint', '')

    if not auth_ep:
        return HTMLResponse(
            _error_html('Configuration Error', 'No authorization_endpoint in Dhan OAuth metadata'),
            status_code=502,
        )

    try:
        client_id, _ = await _get_or_register_client(reg_ep)
    except Exception as exc:
        return HTMLResponse(_error_html('Registration Failed', str(exc)), status_code=502)

    state                         = secrets.token_urlsafe(32)
    code_verifier, code_challenge = _pkce_pair()
    redirect_uri                  = f'http://localhost:{settings.gateway_port}/auth/dhan/callback'

    _pending_flows[state] = {
        'code_verifier':  code_verifier,
        'client_id':      client_id,
        'token_endpoint': token_ep,
        'created_at':     time.time(),
    }

    from urllib.parse import urlencode
    params = urlencode({
        'client_id':             client_id,
        'redirect_uri':          redirect_uri,
        'response_type':         'code',
        'state':                 state,
        'code_challenge':        code_challenge,
        'code_challenge_method': 'S256',
    })
    return RedirectResponse(f'{auth_ep}?{params}')


@router.get('/auth/dhan/callback')
async def auth_dhan_callback(code: str = '', state: str = '', error: str = ''):
    """Step 2: Exchange authorization code for tokens and store in gateway settings."""
    if error:
        return HTMLResponse(_error_html('Authorization Denied', error))

    flow = _pending_flows.pop(state, None)
    if not flow:
        return HTMLResponse(
            _error_html('Session Expired', 'Please try connecting again.'),
            status_code=400,
        )
    if time.time() - flow['created_at'] > _FLOW_TTL:
        return HTMLResponse(
            _error_html('Session Expired', 'Authorization window expired — please try again.'),
            status_code=400,
        )

    redirect_uri = f'http://localhost:{settings.gateway_port}/auth/dhan/callback'
    body: dict   = {
        'grant_type':    'authorization_code',
        'code':          code,
        'redirect_uri':  redirect_uri,
        'client_id':     flow['client_id'],
        'code_verifier': flow['code_verifier'],
    }
    if settings.dhan_oauth_client_secret:
        body['client_secret'] = settings.dhan_oauth_client_secret

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(flow['token_endpoint'], data=body)
            r.raise_for_status()
            token_data = r.json()
    except Exception as exc:
        return HTMLResponse(_error_html('Token Exchange Failed', str(exc)), status_code=502)

    _save_token(token_data)
    return HTMLResponse(_success_html())


@router.delete('/auth/dhan/token')
async def disconnect_dhan():
    """Remove stored Dhan OAuth session (revokes local token only)."""
    _clear_token()
    return {'status': 'disconnected'}


# ── Status + data proxy endpoints (auth-exempt — gateway holds the OAuth token) ──

@router.get('/api/dhan/status')
async def dhan_status():
    """Returns Dhan connection status. Auth-exempt."""
    return {
        'connected':     bool(settings.dhan_access_token),
        'trade_enabled': settings.dhan_trade_enabled,
    }


@router.get('/api/dhan/holdings')
async def dhan_holdings():
    """Proxy: fetch holdings from Dhan MCP. Auth-exempt — token held by gateway."""
    if not settings.dhan_access_token:
        return JSONResponse({'ok': False, 'authRequired': True, 'error': 'Dhan not connected'})
    try:
        from src.tools.dhan import _call_mcp_tool
        result = await _call_mcp_tool('portfolio_agent_tool', {'action': 'holdings'})
        # Dhan MCP returns formatted text, not JSON — parse it into structured dicts
        if isinstance(result, str):
            result = _parse_holdings_text(result)
        elif isinstance(result, dict):
            result = result.get('holdings', result.get('data', []))
        # Enrich with live NSE prices so P&L is calculated correctly
        if isinstance(result, list) and result:
            result = await _enrich_with_ltp(result)
        return {'ok': True, 'data': result}
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)[:400]})


@router.get('/api/dhan/tools')
async def dhan_tools():
    """Debug: list all tools exposed by the Dhan MCP server. Auth-exempt."""
    if not settings.dhan_access_token:
        return JSONResponse({'ok': False, 'authRequired': True, 'error': 'Dhan not connected'})
    try:
        from src.tools.dhan import _list_mcp_tools
        tools = await _list_mcp_tools(force=True)
        return {'ok': True, 'tools': [{'name': t['name'], 'description': t.get('description', '')[:120]} for t in tools]}
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)[:400]})


@router.get('/api/dhan/option-chain')
async def dhan_option_chain(symbol: str = 'NIFTY', expiry: str = ''):
    """Proxy: fetch option chain from Dhan MCP. Auth-exempt."""
    if not settings.dhan_access_token:
        return JSONResponse({'ok': False, 'authRequired': True, 'error': 'Dhan not connected'})
    try:
        from src.tools.dhan import _call_mcp_tool, _dispatch_query, _list_mcp_tools
        tools    = await _list_mcp_tools()
        tool_map = {t['name'].lower(): t['name'] for t in tools}

        # Try progressively broader name matches
        _OC_KEYWORDS = ['option_chain', 'optionchain', 'option-chain', 'option', 'chain', 'oc']
        remote = next(
            (real for kw in _OC_KEYWORDS for lower, real in tool_map.items() if kw in lower),
            None,
        )

        if remote:
            args: dict = {'symbol': symbol}
            if expiry:
                args['expiry'] = expiry
            result = await _call_mcp_tool(remote, args)
            return {'ok': True, 'data': result}

        # Fallback: natural-language dispatch
        result = await _dispatch_query(f'option chain for {symbol}')
        return {'ok': True, 'data': result, 'via': 'dispatch'}

    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)[:400]})


@router.get('/api/dhan/orders')
async def dhan_orders():
    """Proxy: fetch today's orders from Dhan MCP. Auth-exempt."""
    if not settings.dhan_access_token:
        return JSONResponse({'ok': False, 'authRequired': True, 'error': 'Dhan not connected'})
    try:
        from src.tools.dhan import _call_mcp_tool
        result = await _call_mcp_tool('orderbook_agent_tool', {'action': 'list'})
        return {'ok': True, 'data': result}
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)[:400]})
