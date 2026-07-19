from __future__ import annotations

import hashlib
import json
import re
import secrets
import time
from base64 import urlsafe_b64encode
from pathlib import Path

import httpx
from fastapi import APIRouter
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from src.config.settings import settings

router = APIRouter(tags=['portfolio'])

_AUTH_ENDPOINT     = 'https://mcp.indmoney.com/authorize'
_TOKEN_ENDPOINT    = 'https://mcp.indmoney.com/token'
_REGISTER_ENDPOINT = 'https://mcp.indmoney.com/register'
_SCOPES            = 'portfolio:read market:read'
_FLOW_TTL          = 600   # 10 minutes

_pending_flows: dict[str, dict] = {}   # state -> {code_verifier, client_id, created_at}
_last_refresh_attempt: float = 0.0
_REFRESH_THROTTLE = 30.0  # minimum seconds between refresh attempts


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pkce_pair() -> tuple[str, str]:
    verifier  = urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b'=').decode()
    challenge = urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b'=').decode()
    return verifier, challenge


def _env_path() -> Path:
    return Path(__file__).parents[2] / '.env'


def _update_env(key: str, value: str) -> None:
    path = _env_path()
    if not path.exists():
        return
    content = path.read_text()
    new_line = f'{key}={value}'
    if re.search(rf'^{re.escape(key)}=', content, re.MULTILINE):
        content = re.sub(rf'^{re.escape(key)}=.*', new_line, content, flags=re.MULTILINE)
    else:
        content = content.rstrip('\n') + f'\n{new_line}\n'
    path.write_text(content)


def _save_token(token_data: dict) -> None:
    value = json.dumps(token_data)
    settings.indmoney_oauth_token = value
    _update_env('INDMONEY_OAUTH_TOKEN', value)


def _load_token() -> dict | None:
    raw = settings.indmoney_oauth_token.strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def _clear_token() -> None:
    settings.indmoney_oauth_token = ''
    _update_env('INDMONEY_OAUTH_TOKEN', '')
    # Also reset tool cache
    try:
        from src.tools.portfolio import _tool_cache
        _tool_cache.clear()
    except Exception:
        pass


async def _get_or_register_client() -> tuple[str, str]:
    """Return (client_id, client_secret). Auto-registers on first call."""
    if settings.indmoney_client_id and settings.indmoney_client_secret:
        return settings.indmoney_client_id, settings.indmoney_client_secret

    redirect_uri = f'http://localhost:{settings.gateway_port}/auth/indmoney/callback'
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _REGISTER_ENDPOINT,
            json={
                'client_name':                'AI Desk Companion',
                'redirect_uris':              [redirect_uri],
                'grant_types':                ['authorization_code', 'refresh_token'],
                'response_types':             ['code'],
                'token_endpoint_auth_method': 'client_secret_post',
            },
            timeout=15,
        )
        resp.raise_for_status()
        reg = resp.json()

    client_id     = reg['client_id']
    client_secret = reg.get('client_secret', '')

    settings.indmoney_client_id     = client_id
    settings.indmoney_client_secret = client_secret
    _update_env('INDMONEY_CLIENT_ID',     client_id)
    _update_env('INDMONEY_CLIENT_SECRET', client_secret)

    return client_id, client_secret


def _success_html() -> str:
    return """<!doctype html>
<html><head><title>INDmoney Connected</title>
<style>
  body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;
       background:#0a0e1a;font-family:system-ui,sans-serif;color:#e2e8f0}
  .card{text-align:center;padding:2.5rem;border-radius:1.25rem;
        background:#0f1629;border:1px solid rgba(255,255,255,.08);max-width:360px}
  .check{font-size:3rem;margin-bottom:1rem}
  h2{margin:.5rem 0;color:#34d399;font-size:1.25rem}
  p{color:#94a3b8;font-size:.875rem;margin:.75rem 0 1.5rem}
  .note{font-size:.75rem;color:#475569}
</style></head><body>
<div class="card">
  <div class="check">✓</div>
  <h2>INDmoney Connected!</h2>
  <p>Your portfolio is now linked. You can close this tab and return to the app.</p>
  <div class="note">Tokens are stored securely in the gateway .env file.</div>
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
  .x{{font-size:3rem;margin-bottom:1rem}}
  h2{{margin:.5rem 0;color:#f87171;font-size:1.25rem}}
  p{{color:#94a3b8;font-size:.875rem;margin:.75rem 0}}
  code{{font-size:.75rem;color:#fb7185;background:#1e1b4b;padding:.25rem .5rem;border-radius:.4rem}}
</style></head><body>
<div class="card">
  <div class="x">✕</div>
  <h2>{title}</h2>
  <p><code>{detail}</code></p>
  <p style="color:#475569;font-size:.75rem">Close this tab and try again.</p>
</div>
</body></html>"""


# ── OAuth endpoints ───────────────────────────────────────────────────────────

@router.get('/auth/indmoney')
async def auth_indmoney():
    """Step 1: Redirect browser to INDmoney login. Auto-registers OAuth client if needed."""
    try:
        client_id, _ = await _get_or_register_client()
    except Exception as exc:
        return HTMLResponse(_error_html('Registration Failed', str(exc)[:200]), status_code=500)

    state                       = secrets.token_urlsafe(32)
    code_verifier, code_challenge = _pkce_pair()
    redirect_uri                = f'http://localhost:{settings.gateway_port}/auth/indmoney/callback'

    _pending_flows[state] = {
        'code_verifier': code_verifier,
        'client_id':     client_id,
        'created_at':    time.time(),
    }

    from urllib.parse import urlencode
    params = urlencode({
        'client_id':             client_id,
        'redirect_uri':          redirect_uri,
        'response_type':         'code',
        'state':                 state,
        'scope':                 _SCOPES,
        'code_challenge':        code_challenge,
        'code_challenge_method': 'S256',
    })
    return RedirectResponse(f'{_AUTH_ENDPOINT}?{params}')


@router.get('/auth/indmoney/callback')
async def auth_indmoney_callback(code: str = '', state: str = '', error: str = ''):
    """Step 2: Exchange authorization code for tokens, save to .env."""
    if error:
        return HTMLResponse(_error_html('Authorization Denied', error))

    flow = _pending_flows.pop(state, None)
    if not flow:
        return HTMLResponse(_error_html('Session Expired', 'Please try connecting again.'), status_code=400)
    if time.time() - flow['created_at'] > _FLOW_TTL:
        return HTMLResponse(_error_html('Session Expired', 'Authorization window expired — please try again.'), status_code=400)

    redirect_uri = f'http://localhost:{settings.gateway_port}/auth/indmoney/callback'
    token_body: dict = {
        'grant_type':    'authorization_code',
        'code':          code,
        'redirect_uri':  redirect_uri,
        'client_id':     flow['client_id'],
        'code_verifier': flow['code_verifier'],
    }
    if settings.indmoney_client_secret:
        token_body['client_secret'] = settings.indmoney_client_secret

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(_TOKEN_ENDPOINT, data=token_body, timeout=15)
            resp.raise_for_status()
            token_data = resp.json()
    except Exception as exc:
        return HTMLResponse(_error_html('Token Exchange Failed', str(exc)[:200]), status_code=500)

    if 'expires_in' in token_data and 'expires_at' not in token_data:
        token_data['expires_at'] = time.time() + int(token_data['expires_in'])

    _save_token(token_data)
    return HTMLResponse(_success_html())


@router.delete('/auth/indmoney/token')
async def disconnect_indmoney():
    """Remove stored INDmoney OAuth token."""
    _clear_token()
    return {'status': 'disconnected'}


# ── Status endpoint ───────────────────────────────────────────────────────────

@router.get('/api/portfolio/data')
async def portfolio_data():
    """Fetch portfolio net-worth data using the internally stored OAuth token (no client token needed)."""
    token_data = _load_token()
    if not token_data or not token_data.get('access_token'):
        return JSONResponse({'ok': False, 'authRequired': True, 'error': 'INDmoney not connected. Open Settings → Agents → Portfolio and connect.'})
    try:
        from src.tools.portfolio import _dispatch_query
        result = await _dispatch_query('networth summary overview total portfolio')
        return {'ok': True, 'data': result}
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)[:400]}, status_code=200)


@router.get('/api/portfolio/status')
async def portfolio_status():
    """Returns connection status. Throttles refresh attempts to once per 30 s."""
    global _last_refresh_attempt

    token_data = _load_token()
    if not token_data or not token_data.get('access_token'):
        return {'connected': False, 'info': ''}

    expires_at = token_data.get('expires_at', 0)
    now = time.time()

    if expires_at and now > expires_at:
        # Only attempt refresh if enough time has passed since the last try
        if now - _last_refresh_attempt < _REFRESH_THROTTLE:
            return {'connected': False, 'info': 'Token expired — please reconnect via Settings'}

        refresh_token = token_data.get('refresh_token')
        if refresh_token and settings.indmoney_client_id:
            _last_refresh_attempt = now
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        _TOKEN_ENDPOINT,
                        data={
                            'grant_type':    'refresh_token',
                            'refresh_token': refresh_token,
                            'client_id':     settings.indmoney_client_id,
                            'client_secret': settings.indmoney_client_secret,
                        },
                        timeout=10,
                    )
                    resp.raise_for_status()
                    new_data = resp.json()
                    if 'refresh_token' not in new_data:
                        new_data['refresh_token'] = refresh_token
                    if 'expires_in' in new_data and 'expires_at' not in new_data:
                        new_data['expires_at'] = now + int(new_data['expires_in'])
                    _save_token(new_data)
                    expires_at = new_data.get('expires_at', 0)
            except Exception:
                return {'connected': False, 'info': 'Token expired — please reconnect via Settings'}
        else:
            return {'connected': False, 'info': 'Token expired — please reconnect via Settings'}

    return {
        'connected':  True,
        'info':       'INDmoney',
        'expires_at': expires_at,
    }
