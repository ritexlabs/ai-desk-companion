from __future__ import annotations

import time

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel

from src.config.settings import settings
from src.services import tunnel as _tunnel
from src.tools.whatsapp import (
    _GRAPH,
    _load,
    _parse_contacts,
    _resolve_contact,
    _save,
    _store_lock,
    get_conversations,
    get_incoming,
    push_incoming,
    update_delivery,
    verify_meta_signature,
)
from src.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix='/api/whatsapp', tags=['whatsapp'])


# ── Status ────────────────────────────────────────────────────────────────────

@router.get('/status')
async def whatsapp_status():
    phone_id = (settings.whatsapp_phone_number_id or '').strip()
    token    = (settings.whatsapp_access_token    or '').strip()
    domain   = (settings.whatsapp_webhook_domain  or '').strip()
    return {
        'configured':       bool(phone_id and token),
        'phoneNumberId':    phone_id or None,
        'hasAccessToken':   bool(token),
        'hasVerifyToken':   bool(settings.whatsapp_webhook_verify_token),
        'webhookDomain':    domain or None,
        'webhookUrl':       f'https://{domain}/webhook/whatsapp' if domain else None,
        'tunnelRunning':    _tunnel.is_running(),
        'tunnelWebhookUrl': _tunnel.status(settings.gateway_port).get('webhookUrl'),
        'messageCount':     len(_load()),
    }


# ── Messages ──────────────────────────────────────────────────────────────────

@router.get('/messages')
async def whatsapp_messages(limit: int = 50):
    conversations = get_conversations()
    return {
        'conversations': conversations,
        'totalMessages': sum(len(c['messages']) for c in conversations),
        'tunnelRunning': _tunnel.is_running(),
        'webhookUrl':    _tunnel.status(settings.gateway_port).get('webhookUrl'),
    }


# ── Reply ─────────────────────────────────────────────────────────────────────

class ReplyBody(BaseModel):
    to:              str
    text:            str
    replyToMessageId: str | None = None


@router.post('/reply')
async def whatsapp_reply(body: ReplyBody):
    phone_id = (settings.whatsapp_phone_number_id or '').strip()
    token    = (settings.whatsapp_access_token    or '').strip()
    if not phone_id or not token:
        raise HTTPException(status_code=503, detail='WhatsApp not configured in gateway .env')

    contacts  = _parse_contacts(settings.whatsapp_contacts or '')
    to_number = _resolve_contact(body.to, contacts) or body.to

    payload: dict = {
        'messaging_product': 'whatsapp',
        'to':                to_number,
        'type':              'text',
        'text':              {'body': body.text},
    }
    if body.replyToMessageId:
        payload['context'] = {'message_id': body.replyToMessageId}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                f'{_GRAPH}/{phone_id}/messages',
                headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                json=payload,
            )
            r.raise_for_status()
            wamid = r.json().get('messages', [{}])[0].get('id', '')
    except httpx.HTTPStatusError as e:
        detail = ''
        try:
            detail = e.response.json().get('error', {}).get('message', '')[:120]
        except Exception:
            pass
        raise HTTPException(status_code=e.response.status_code, detail=detail or str(e))

    # Store outgoing + mark conversation as replied
    now = int(time.time())
    with _store_lock:
        msgs = _load()
        msgs.append({
            'wa_message_id':    wamid,
            'from_phone':       to_number,
            'from_name':        body.to,
            'body':             body.text,
            'timestamp':        now,
            'direction':        'outgoing',
            'dashboard_status': 'sent',
            'wa_delivery':      None,
        })
        # Mark all unreplied incoming from this phone as replied
        for m in msgs:
            if m.get('from_phone') == to_number and m.get('direction') == 'incoming' \
                    and m.get('dashboard_status') not in ('replied',):
                m['dashboard_status'] = 'replied'
                m['reply_text']       = body.text
                m['reply_wa_id']      = wamid
                m['replied_at']       = now
        _save(msgs)

    return {'ok': True, 'messageId': wamid}


# ── Mark read ─────────────────────────────────────────────────────────────────

class MarkReadBody(BaseModel):
    phone:         str
    lastMessageId: str | None = None


@router.post('/mark-read')
async def mark_read(body: MarkReadBody):
    phone_id = (settings.whatsapp_phone_number_id or '').strip()
    token    = (settings.whatsapp_access_token    or '').strip()

    with _store_lock:
        msgs = _load()
        for m in msgs:
            if m.get('from_phone') == body.phone and m.get('dashboard_status') == 'unread':
                m['dashboard_status'] = 'read'
        _save(msgs)

    # Tell Meta the message was read
    if body.lastMessageId and phone_id and token:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                await client.post(
                    f'{_GRAPH}/{phone_id}/messages',
                    headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                    json={
                        'messaging_product': 'whatsapp',
                        'status':            'read',
                        'message_id':        body.lastMessageId,
                    },
                )
        except Exception as exc:
            logger.debug('mark-read Meta call failed: %s', exc)

    return {'ok': True}
