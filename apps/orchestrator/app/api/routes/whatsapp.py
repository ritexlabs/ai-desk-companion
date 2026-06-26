from __future__ import annotations

import hashlib
import hmac

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response

from app.agents.whatsapp import get_verify_token, push_incoming

router = APIRouter()


def _verify_meta_signature(body: bytes, header: str | None, secret: str) -> bool:
    """Validate Meta's X-Hub-Signature-256 header.

    Returns True when the signature matches or when no app secret is configured
    (allows testing without a secret; set WHATSAPP_APP_SECRET to enforce it).
    """
    if not secret:
        return True   # no secret configured — skip validation
    if not header or not header.startswith('sha256='):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    received = header[len('sha256='):]
    return hmac.compare_digest(expected, received)

_GRAPH = 'https://graph.facebook.com/v18.0'


# ── Credentials verification (proxied through backend) ────────────────────────

@router.get('/api/whatsapp/verify')
async def verify_whatsapp(
    phone_number_id: str = Query(...),
    access_token:    str = Query(...),
) -> dict:
    """Verify Meta Cloud API credentials by fetching the phone number info."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f'{_GRAPH}/{phone_number_id}',
                params={'fields': 'display_phone_number,verified_name,quality_rating'},
                headers={'Authorization': f'Bearer {access_token}'},
            )
            r.raise_for_status()
            return r.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (401, 403):
            raise HTTPException(status_code=401, detail='Invalid or expired access token.')
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f'Meta API error {e.response.status_code}',
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)[:80])


@router.get('/api/whatsapp/webhook-info')
async def webhook_info() -> dict:
    """Return diagnostic info about the active webhook verify token (no token value)."""
    from app.core.config import settings
    runtime  = get_verify_token()
    env_tok  = (settings.whatsapp_webhook_verify_token or '').strip()
    active   = runtime or env_tok
    return {
        'token_configured': bool(active),
        'token_source':     'session' if runtime else ('env' if env_tok else 'none'),
        'token_preview':    (active[:2] + '***' + active[-2:]) if len(active) > 4 else ('***' if active else ''),
        'webhook_path':     '/webhook/whatsapp',
    }


@router.get('/api/whatsapp/env-defaults')
async def whatsapp_env_defaults() -> dict:
    """Return env-sourced defaults so the UI can pre-fill empty fields on first load."""
    from app.core.config import settings
    raw = (settings.whatsapp_contacts or '').strip()
    contacts = raw.replace('\\n', '\n')
    return {
        'contacts':      contacts,
        'phoneNumberId': (settings.whatsapp_phone_number_id or '').strip(),
        'accessToken':   (settings.whatsapp_access_token or '').strip(),
        'verifyToken':   (settings.whatsapp_webhook_verify_token or '').strip(),
    }


# ── Meta webhook endpoints ─────────────────────────────────────────────────────

@router.get('/webhook/whatsapp')
async def verify_webhook(
    mode:      str | None = Query(None, alias='hub.mode'),
    token:     str | None = Query(None, alias='hub.verify_token'),
    challenge: str | None = Query(None, alias='hub.challenge'),
) -> Response:
    """Meta webhook verification handshake (GET)."""
    from app.core.config import settings
    runtime  = get_verify_token()
    env_tok  = (settings.whatsapp_webhook_verify_token or '').strip()
    expected = runtime or env_tok
    if mode == 'subscribe' and expected and token == expected:
        return Response(content=challenge or '', media_type='text/plain')
    return Response(status_code=403)


@router.post('/webhook/whatsapp')
async def receive_webhook(request: Request) -> dict:
    """Receive incoming WhatsApp messages from Meta (POST).

    Always returns 200 for valid requests — returning 4xx/5xx causes Meta
    to retry aggressively and can temporarily disable the webhook endpoint.
    """
    from app.core.config import settings

    body = await request.body()
    sig  = request.headers.get('x-hub-signature-256')
    if not _verify_meta_signature(body, sig, settings.whatsapp_app_secret):
        return Response(status_code=403)

    try:
        import json
        data = json.loads(body)
        for entry in data.get('entry', []):
            for change in entry.get('changes', []):
                value    = change.get('value', {})
                messages = value.get('messages', [])
                contacts = {
                    c['wa_id']: c.get('profile', {}).get('name', c['wa_id'])
                    for c in value.get('contacts', [])
                }
                for msg in messages:
                    if msg.get('type') == 'text':
                        sender_id   = msg.get('from', '')
                        sender_name = contacts.get(sender_id, sender_id)
                        body        = msg.get('text', {}).get('body', '')
                        timestamp   = int(msg.get('timestamp', 0))
                        if sender_id and body:
                            push_incoming(sender_id, sender_name, body, timestamp)
    except Exception:
        pass
    return {'status': 'ok'}
