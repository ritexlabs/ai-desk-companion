from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel

from app.core.config import settings
from app.dependencies import gateway_client

router = APIRouter()


class _SendRequest(BaseModel):
    to: str
    message: str

_GRAPH = 'https://graph.facebook.com/v18.0'


# ── Credential verification ───────────────────────────────────────────────────

@router.get('/api/whatsapp/conversations')
async def get_whatsapp_conversations(limit: int = Query(30)) -> dict:
    try:
        result = await gateway_client.call_tool('whatsapp__get_conversations', {'limit': limit})
        return {'conversations': result if isinstance(result, list) else []}
    except PermissionError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)[:200])


@router.post('/api/whatsapp/send')
async def send_whatsapp_message(body: _SendRequest) -> dict:
    try:
        result = await gateway_client.call_tool('whatsapp__send_message', {
            'to': body.to.strip(),
            'message': body.message.strip(),
        })
        return {'status': 'sent', 'detail': str(result)}
    except PermissionError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)[:200])


@router.get('/api/whatsapp/verify')
async def verify_whatsapp() -> dict:
    """Check WhatsApp status using credentials configured in the gateway .env."""
    try:
        result = await gateway_client.call_tool('whatsapp__get_status', {})
        return {'status': 'ok', 'detail': str(result)}
    except PermissionError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)[:120])


@router.get('/api/whatsapp/webhook-info')
async def webhook_info() -> dict:
    """Return diagnostic info about the active webhook configuration."""
    return {
        'token_configured': True,
        'token_source':     'gateway_env',
        'webhook_path':     '/webhook/whatsapp',
        'note':             'Credentials are configured in the MCP Gateway .env file.',
    }


@router.get('/api/whatsapp/env-defaults')
async def whatsapp_env_defaults() -> dict:
    """Indicate that WhatsApp credentials are managed by the MCP Gateway."""
    return {
        'contacts':      '',
        'phoneNumberId': 'configured-in-gateway-env',
        'accessToken':   'configured-in-gateway-env',
        'verifyToken':   'configured-in-gateway-env',
        'managed_by':    'mcp_gateway',
    }


# ── Tunnel proxy (forwards /api/tunnel/* to MCP Gateway at port 8788) ────────

def _gw_headers() -> dict:
    return {'Authorization': f'Bearer {settings.gateway_api_token}'} if settings.gateway_api_token else {}


def _normalize_tunnel_status(data: dict) -> dict:
    running    = bool(data.get('running'))
    mode       = data.get('mode', 'quick')
    domain     = data.get('domain') or ''
    webhook    = data.get('webhookUrl') or ''
    env_domain = data.get('env_domain') or ''
    # Quick-mode: process alive but URL not yet captured from cloudflared stdout
    starting   = running and mode == 'quick' and not domain
    return {
        'active':       running and bool(domain),
        'starting':     starting,
        'url':          domain,
        'callback_url': webhook,
        'env_domain':   env_domain,
        'provider':     'cloudflare',
        'mode':         mode,
    }


@router.get('/api/tunnel/status')
async def tunnel_status_proxy() -> dict:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f'{settings.gateway_url}/api/tunnel/status', headers=_gw_headers())
            r.raise_for_status()
            return _normalize_tunnel_status(r.json())
    except Exception:
        return {'active': False, 'starting': False, 'url': '', 'callback_url': '', 'env_domain': ''}


@router.post('/api/tunnel/start')
async def tunnel_start_proxy() -> dict:
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(f'{settings.gateway_url}/api/tunnel/start', headers=_gw_headers())
            r.raise_for_status()
            data       = r.json()
            webhook    = data.get('url') or ''
            domain     = webhook.replace('https://', '').split('/')[0] if webhook else ''
            env_domain = data.get('env_domain') or ''
            if not data.get('ok'):
                raise HTTPException(status_code=502, detail=data.get('error', 'Tunnel start failed'))
            return {
                'active':       True,
                'url':          domain,
                'callback_url': webhook,
                'env_domain':   env_domain,
            }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)[:200])


@router.post('/api/tunnel/stop')
async def tunnel_stop_proxy() -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(f'{settings.gateway_url}/api/tunnel/stop', headers=_gw_headers())
            return r.json() if r.is_success else {'ok': True}
    except Exception:
        return {'ok': True}


# ── Meta webhook relay ────────────────────────────────────────────────────────
# The Cloudflare tunnel now runs inside the MCP Gateway (port 8788).
# These relay routes exist for backward compatibility — if your Meta webhook
# URL still points at port 8787, traffic is forwarded to the gateway.
# For new setups, point the Meta webhook URL directly at the gateway tunnel.

@router.get('/webhook/whatsapp')
async def relay_verify_webhook(
    mode:      str | None = Query(None, alias='hub.mode'),
    token:     str | None = Query(None, alias='hub.verify_token'),
    challenge: str | None = Query(None, alias='hub.challenge'),
) -> Response:
    """Relay Meta's webhook verification handshake (GET) to the MCP Gateway."""
    params = {}
    if mode:      params['hub.mode']         = mode
    if token:     params['hub.verify_token'] = token
    if challenge: params['hub.challenge']    = challenge
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f'{settings.gateway_url}/webhook/whatsapp',
                params=params,
                headers={'Authorization': f'Bearer {settings.gateway_api_token}'} if settings.gateway_api_token else {},
            )
            return Response(content=r.content, media_type='text/plain', status_code=r.status_code)
    except Exception:
        return Response(status_code=403)


@router.post('/webhook/whatsapp')
async def relay_receive_webhook(request: Request) -> dict:
    """Relay incoming WhatsApp messages (POST) to the MCP Gateway.

    Forwards the original body + X-Hub-Signature-256 header so the gateway
    can validate the Meta signature using its WHATSAPP_APP_SECRET.
    Always returns 200 — returning 4xx/5xx causes Meta to retry aggressively.
    """
    body = await request.body()
    sig  = request.headers.get('x-hub-signature-256', '')
    headers: dict = {'Content-Type': 'application/json'}
    if sig:
        headers['x-hub-signature-256'] = sig
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f'{settings.gateway_url}/webhook/whatsapp',
                content=body,
                headers=headers,
            )
    except Exception:
        pass
    return {'status': 'ok'}
