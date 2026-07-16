from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response

from app.core.config import settings
from app.dependencies import gateway_client

router = APIRouter()

_GRAPH = 'https://graph.facebook.com/v18.0'


# ── Credential verification ───────────────────────────────────────────────────

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
