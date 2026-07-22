from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import time
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from src.config.settings import settings
from src.tools.base import BaseTool
from src.utils.errors import ToolAuthError, ToolNotFoundError

logger = logging.getLogger(__name__)

_GRAPH       = 'https://graph.facebook.com/v21.0'
_BASE_DIR    = Path(__file__).parent.parent.parent   # apps/mcp-gateway/
_MSG_FILE    = _BASE_DIR / '.whatsapp-messages.json'
_MAX_MSGS    = 500
_store_lock  = threading.Lock()


# ── Persistent message store ──────────────────────────────────────────────────

def _load() -> list[dict]:
    try:
        return json.loads(_MSG_FILE.read_text())
    except Exception:
        return []


def _save(msgs: list[dict]) -> None:
    msgs.sort(key=lambda m: m.get('timestamp', 0), reverse=True)
    _MSG_FILE.write_text(json.dumps(msgs[:_MAX_MSGS], indent=2))


def push_incoming(sender_id: str, sender_name: str, text: str, timestamp: int,
                  wa_message_id: str = '') -> None:
    with _store_lock:
        msgs = _load()
        # Deduplicate by wa_message_id
        if wa_message_id and any(m.get('wa_message_id') == wa_message_id for m in msgs):
            return
        msgs.append({
            'wa_message_id':    wa_message_id,
            'from_phone':       sender_id,
            'from_name':        sender_name or sender_id,
            'body':             text,
            'timestamp':        timestamp,
            'direction':        'incoming',
            'dashboard_status': 'unread',
            'wa_delivery':      None,
            'reply_text':       None,
            'reply_wa_id':      None,
            'replied_at':       None,
        })
        _save(msgs)


def update_delivery(wa_message_id: str, status: str, error_code: int | None = None) -> None:
    with _store_lock:
        msgs = _load()
        for m in msgs:
            if m.get('wa_message_id') == wa_message_id:
                m['wa_delivery'] = status
                if error_code is not None:
                    m['wa_delivery_error'] = error_code
        _save(msgs)


def get_incoming(limit: int = 10) -> list[dict]:
    return _load()[:limit]


def get_conversations() -> list[dict]:
    """Return messages grouped by phone, newest conversation first."""
    msgs = _load()
    seen: dict[str, dict] = {}
    for m in msgs:
        phone = m.get('from_phone', '')
        if phone not in seen:
            seen[phone] = {
                'phone':    phone,
                'name':     m.get('from_name', phone),
                'messages': [],
                'unread':   0,
            }
        seen[phone]['messages'].append(m)
        if m.get('dashboard_status') == 'unread' and m.get('direction') == 'incoming':
            seen[phone]['unread'] += 1
    return list(seen.values())


def verify_meta_signature(body: bytes, header: str | None, secret: str) -> bool:
    if not secret:
        return True
    if not header or not header.startswith('sha256='):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    received = header[len('sha256='):]
    return hmac.compare_digest(expected, received)


# ── Contact helpers ───────────────────────────────────────────────────────────

def _parse_contacts(raw: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in raw.replace('\\n', '\n').splitlines():
        if ':' in line:
            k, _, v = line.partition(':')
            k, v = k.strip(), v.strip()
            if k and v:
                result[k] = v
    return result


def _resolve_contact(name: str, contacts: dict[str, str]) -> str | None:
    if name in contacts:
        return contacts[name]
    for k, v in contacts.items():
        if k.lower() == name.lower():
            return v
    digits = re.sub(r'[^0-9+]', '', name)
    if len(digits) >= 10:
        return digits if digits.startswith('+') else '+' + digits
    return None


# ── BaseTool implementation ───────────────────────────────────────────────────

class WhatsAppTool(BaseTool):
    namespace = 'whatsapp'

    async def list_tools(self) -> list[dict]:
        return [
            {
                'name': 'send_message',
                'description': (
                    'Send a WhatsApp message to a contact or phone number via Meta Cloud API. '
                    'Use when the user asks to send a WhatsApp message, text someone, or notify a contact.'
                ),
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'to':      {'type': 'string', 'description': 'Contact name (from contacts list) or E.164 phone number, e.g. "+919876543210"'},
                        'message': {'type': 'string', 'description': 'Text message to send'},
                    },
                    'required': ['to', 'message'],
                },
            },
            {
                'name': 'get_status',
                'description': (
                    'Get WhatsApp phone number status and connection info. '
                    'Use for boot checks and "is WhatsApp connected?" queries.'
                ),
                'inputSchema': {'type': 'object', 'properties': {}, 'required': []},
            },
            {
                'name': 'get_messages',
                'description': (
                    'Get recent incoming WhatsApp messages. '
                    'Use when user asks to read messages, check WhatsApp, or see what was received.'
                ),
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'limit': {'type': 'integer', 'description': 'Max messages to return (default 10)'},
                    },
                },
            },
            {
                'name': 'get_conversations',
                'description': 'Get WhatsApp message history grouped by contact as structured data for the dashboard.',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'limit': {'type': 'integer', 'description': 'Max conversations to return (default 30)'},
                    },
                },
            },
        ]

    def _require_creds(self) -> tuple[str, str]:
        phone_id = (settings.whatsapp_phone_number_id or '').strip()
        token    = (settings.whatsapp_access_token    or '').strip()
        if not phone_id or not token:
            raise ToolAuthError(
                'WhatsApp not configured. '
                'Add WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to the gateway .env file.'
            )
        return phone_id, token

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        if tool_name == 'get_messages':
            return self._format_messages(arguments.get('limit', 10))

        if tool_name == 'get_conversations':
            limit = arguments.get('limit', 30)
            return get_conversations()[:limit]

        phone_id, token = self._require_creds()

        if tool_name == 'get_status':
            return await self._get_status(phone_id, token)

        if tool_name == 'send_message':
            return await self._send(phone_id, token, arguments)

        raise ToolNotFoundError(f'Unknown whatsapp tool: {tool_name}')

    def _format_messages(self, limit: int) -> str:
        msgs = get_incoming(limit)
        if not msgs:
            return 'No WhatsApp messages yet.'
        lines = [f'{len(msgs)} recent WhatsApp message{"s" if len(msgs) != 1 else ""}:']
        for msg in msgs[:5]:
            body = (msg.get('body') or '')[:80]
            lines.append(f'From {msg.get("from_name", msg.get("from_phone", "?"))}: "{body}"')
        return ' | '.join(lines)

    async def _get_status(self, phone_id: str, token: str) -> str:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    f'{_GRAPH}/{phone_id}',
                    params={'fields': 'display_phone_number,verified_name,quality_rating'},
                    headers={'Authorization': f'Bearer {token}'},
                )
                r.raise_for_status()
                data = r.json()
            phone = data.get('display_phone_number', '')
            name  = data.get('verified_name', '')
            label = f'{name} ({phone})' if name else phone or 'unknown'
            total = len(_load())
            msg   = f'Connected — {label}.'
            if total:
                msg += f' {total} message{"s" if total != 1 else ""} stored.'
            return msg
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403):
                raise ToolAuthError('WhatsApp access token is invalid or expired.')
            raise RuntimeError(f'WhatsApp API error {e.response.status_code}') from e

    async def _send(self, phone_id: str, token: str, arguments: dict) -> str:
        to_raw  = (arguments.get('to')      or '').strip()
        message = (arguments.get('message') or '').strip()
        if not to_raw or not message:
            return 'Missing "to" or "message" argument.'

        contacts  = _parse_contacts(settings.whatsapp_contacts or '')
        to_number = _resolve_contact(to_raw, contacts)
        display   = to_raw

        if not to_number:
            return (
                f"I don't have a number for '{to_raw}'. "
                "Add them to WHATSAPP_CONTACTS in the gateway .env file."
            )

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.post(
                    f'{_GRAPH}/{phone_id}/messages',
                    headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                    json={
                        'messaging_product': 'whatsapp',
                        'to':                to_number,
                        'type':              'text',
                        'text':              {'body': message},
                    },
                )
                r.raise_for_status()
                wamid = r.json().get('messages', [{}])[0].get('id', '')

            # Store outgoing in message file
            with _store_lock:
                msgs = _load()
                msgs.append({
                    'wa_message_id':    wamid,
                    'from_phone':       to_number,
                    'from_name':        display,
                    'body':             message,
                    'timestamp':        int(time.time()),
                    'direction':        'outgoing',
                    'dashboard_status': 'sent',
                    'wa_delivery':      None,
                })
                _save(msgs)

            return f'WhatsApp message sent to {display}.'
        except httpx.HTTPStatusError as e:
            detail = ''
            try:
                detail = e.response.json().get('error', {}).get('message', '')[:80]
            except Exception:
                pass
            if e.response.status_code in (401, 403):
                raise ToolAuthError('WhatsApp access token expired.') from e
            raise RuntimeError(f'Could not send WhatsApp message. {detail or f"API error {e.response.status_code}"}') from e

    async def startup(self) -> None:
        if not _MSG_FILE.exists():
            _MSG_FILE.write_text('[]')
