from __future__ import annotations

import re
from collections import deque
from datetime import datetime, timezone

import httpx

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus

# ── In-memory store (populated by webhook / updated by sessions) ──────────────

_incoming: deque[dict] = deque(maxlen=100)

# Active verify token — updated each time a session configures the WhatsApp agent.
# The webhook route reads this (with .env as fallback) so the UI-configured token
# takes effect immediately without restarting the orchestrator.
_active_verify_token: str = ''


def set_verify_token(token: str) -> None:
    global _active_verify_token
    _active_verify_token = token.strip()


def get_verify_token() -> str:
    return _active_verify_token


def push_incoming(sender_id: str, sender_name: str, text: str, timestamp: int) -> None:
    _incoming.appendleft({
        'sender_id':   sender_id,
        'sender_name': sender_name or sender_id,
        'text':        text,
        'timestamp':   timestamp,
        'received_at': datetime.now(timezone.utc).isoformat(),
    })


def get_incoming(limit: int = 10) -> list[dict]:
    return list(_incoming)[:limit]


# ── Intent parsing ────────────────────────────────────────────────────────────

_SEND_RE = re.compile(
    r'^(?:send|text|whatsapp|wa|message)\s+'
    r'(?:a\s+(?:whatsapp\s+)?message\s+to\s+|to\s+|message\s+to\s+|message\s+)?'
    r'(.+?)'
    r'\s*(?:saying?|to say|that|[,:-])\s*(.+)$',
    re.I,
)
_TELL_RE = re.compile(
    r'^(?:tell|inform|notify|let)\s+(.+?)\s+(?:know\s+)?(?:that\s+)?(.+)$',
    re.I,
)


def _parse_send(text: str) -> tuple[str, str] | None:
    """Return (recipient, message) when the query is a send intent."""
    for pat in (_SEND_RE, _TELL_RE):
        m = pat.match(text.strip())
        if m:
            recipient = m.group(1).strip().rstrip(',.:')
            message   = m.group(2).strip()
            if recipient and message:
                return recipient, message
    return None


def _parse_contacts(raw: str) -> dict[str, str]:
    """Parse 'Name: +number' lines into {name: number}."""
    result: dict[str, str] = {}
    for line in raw.splitlines():
        if ':' in line:
            k, _, v = line.partition(':')
            k, v = k.strip(), v.strip()
            if k and v:
                result[k] = v
    return result


def _resolve_contact(name: str, contacts: dict[str, str]) -> str | None:
    """Resolve a name or raw number to a WhatsApp-compatible phone number."""
    if name in contacts:
        return contacts[name]
    for k, v in contacts.items():
        if k.lower() == name.lower():
            return v
    # Treat as raw phone number — strip formatting
    digits = re.sub(r'[^0-9+]', '', name)
    if len(digits) >= 10:
        return digits if digits.startswith('+') else '+' + digits
    return None


# ── Agent ─────────────────────────────────────────────────────────────────────

class WhatsAppAgent(AssistantAgent):
    id         = 'whatsapp'
    name       = 'WhatsApp'
    config_key = 'whatsapp'
    tool_meta  = {
        'description': 'Send and receive WhatsApp messages via Meta Cloud API.',
        'query_hint':  'The user query about sending or reading WhatsApp messages.',
    }

    _GRAPH = 'https://graph.facebook.com/v18.0'

    async def initialize(self) -> None:
        return None

    async def health(self) -> AgentHealth:
        return AgentHealth(name=self.name, status=AgentStatus.ONLINE)

    async def shutdown(self) -> None:
        return None

    async def handle(self, request: AgentRequest) -> AgentResponse:
        cfg          = request.context.get('agent_config', {})
        phone_id     = (cfg.get('phone_number_id') or '').strip()
        access_token = (cfg.get('access_token')    or '').strip()

        if not phone_id or not access_token:
            return AgentResponse(
                agent=self.id,
                text='WhatsApp is not configured. Go to Settings → Agents → WhatsApp to add your Meta Cloud API credentials.',
            )

        # Sync verify token so the webhook route picks it up without a server restart.
        wvt = (cfg.get('webhook_verify_token') or '').strip()
        if wvt:
            set_verify_token(wvt)

        contacts = _parse_contacts(cfg.get('contacts') or '')

        if request.text.strip() == '__boot__':
            return await self._boot_status(phone_id, access_token)

        # ── Send intent ──────────────────────────────────────────────
        parsed = _parse_send(request.text.strip())
        if parsed:
            recipient_name, message = parsed
            to_number = _resolve_contact(recipient_name, contacts)
            if not to_number:
                return AgentResponse(
                    agent=self.id,
                    text=f"I don't have a number for '{recipient_name}'. "
                         f"Add them under Contacts in Settings → Agents → WhatsApp.",
                )
            return await self._send_text(phone_id, access_token, to_number, message, recipient_name)

        # ── Read messages ────────────────────────────────────────────
        msgs = get_incoming(10)
        if not msgs:
            webhook_hint = (
                '' if (cfg.get('webhook_verify_token') or '').strip()
                else ' (Configure your webhook in the Meta Developer Console to receive messages.)'
            )
            return AgentResponse(
                agent=self.id,
                text=f'No incoming WhatsApp messages received this session.{webhook_hint}',
            )

        lines = [f'{len(msgs)} recent WhatsApp message{"s" if len(msgs) != 1 else ""}:']
        for msg in msgs[:5]:
            sender = msg['sender_name']
            body   = (msg['text'] or '')[:80]
            lines.append(f'From {sender}: "{body}"')
        return AgentResponse(agent=self.id, text=' | '.join(lines))

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _auth(self, token: str) -> dict:
        return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

    async def _boot_status(self, phone_id: str, token: str) -> AgentResponse:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    f'{self._GRAPH}/{phone_id}',
                    params={'fields': 'display_phone_number,verified_name,quality_rating'},
                    headers=self._auth(token),
                )
                r.raise_for_status()
                data = r.json()
            phone  = data.get('display_phone_number', '')
            name   = data.get('verified_name', '')
            label  = f'{name} ({phone})' if name else phone or 'unknown'
            queued = len(_incoming)
            msg    = f'Connected — {label}.'
            if queued:
                msg += f' {queued} message{"s" if queued != 1 else ""} received this session.'
            return AgentResponse(agent=self.id, text=msg)
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403):
                return AgentResponse(
                    agent=self.id,
                    text='WhatsApp access token is invalid or expired. Please update in Settings → Agents → WhatsApp.',
                )
            return AgentResponse(agent=self.id, text=f'WhatsApp API error {e.response.status_code} during boot.')
        except Exception as e:
            return AgentResponse(agent=self.id, text=f'Could not reach WhatsApp API. {str(e)[:60]}')

    async def _send_text(
        self,
        phone_id: str,
        token: str,
        to: str,
        message: str,
        display_name: str,
    ) -> AgentResponse:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.post(
                    f'{self._GRAPH}/{phone_id}/messages',
                    headers=self._auth(token),
                    json={
                        'messaging_product': 'whatsapp',
                        'to':                to,
                        'type':              'text',
                        'text':              {'body': message},
                    },
                )
                r.raise_for_status()
            return AgentResponse(
                agent=self.id,
                text=f'WhatsApp message sent to {display_name}.',
            )
        except httpx.HTTPStatusError as e:
            detail = ''
            try:
                detail = e.response.json().get('error', {}).get('message', '')[:80]
            except Exception:
                pass
            if e.response.status_code in (401, 403):
                return AgentResponse(agent=self.id, text='WhatsApp access token expired. Please reconnect in Settings.')
            return AgentResponse(
                agent=self.id,
                text=f'Could not send WhatsApp message. {detail or f"API error {e.response.status_code}"}',
            )
        except Exception as e:
            return AgentResponse(agent=self.id, text=f'Could not send WhatsApp message. {str(e)[:60]}')
