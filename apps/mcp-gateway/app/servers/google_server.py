from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from app.servers.base import BaseMCPServer

_CAL_BASE   = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
_GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'


def _auth(token: str) -> dict:
    return {'Authorization': f'Bearer {token}'}


def _local_now() -> datetime:
    return datetime.now().astimezone()


def _today_range() -> tuple[str, str]:
    now   = _local_now()
    start = now.replace(hour=0,  minute=0,  second=0,  microsecond=0)
    end   = now.replace(hour=23, minute=59, second=59, microsecond=0)
    return start.isoformat(), end.isoformat()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fmt_event_time(dt_str: str) -> str:
    if 'T' in dt_str:
        dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        return dt.astimezone().strftime('%I:%M %p').lstrip('0')
    return 'all day'


class GoogleServer(BaseMCPServer):
    """Unified Google server: Calendar + Gmail using the REST APIs."""

    namespace = 'google'

    async def connect(self) -> None:
        pass

    async def disconnect(self) -> None:
        pass

    async def list_tools(self) -> list[dict]:
        return [
            {
                'name': 'get_calendar_events',
                'description': (
                    'Get upcoming meetings, events, or appointments from Google Calendar. '
                    'Use for queries about schedule, meetings, events today, or next event.'
                ),
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'query': {
                            'type': 'string',
                            'description': 'Calendar query, e.g. "meetings today" or "what is on my schedule this week"',
                        },
                    },
                    'required': ['query'],
                },
            },
            {
                'name': 'get_emails',
                'description': (
                    'Read Gmail inbox, check unread emails, or get important message summaries. '
                    'Use for queries about email, inbox, unread messages, or urgent emails.'
                ),
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'query': {
                            'type': 'string',
                            'description': 'Email query, e.g. "unread emails" or "important emails today"',
                        },
                    },
                    'required': ['query'],
                },
            },
        ]

    async def call_tool(self, tool_name: str, arguments: dict, credentials: dict) -> Any:
        token = credentials.get('google_access_token', '').strip()
        if not token:
            return (
                'Not connected to Google. '
                'Go to Settings → Agents → Google to connect your account.'
            )

        query = arguments.get('query', '').lower()

        try:
            if tool_name == 'get_calendar_events':
                return await self._calendar(token, query)
            if tool_name == 'get_emails':
                return await self._emails(token, query)
            return f'Unknown Google tool: {tool_name}'
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                return 'Google access token expired. Please reconnect in Settings → Agents → Google.'
            return f'Google API error {exc.response.status_code}.'
        except Exception as exc:
            return f'Could not reach Google. {str(exc)[:80]}'

    # ── Calendar ──────────────────────────────────────────────────────────────

    async def _calendar(self, token: str, query: str) -> str:
        if any(w in query for w in ('today', "today's", 'schedule', 'upcoming', 'this week', 'week')):
            return await self._today_events(token)
        return await self._next_event(token)

    async def _next_event(self, token: str) -> str:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                _CAL_BASE,
                params={
                    'timeMin':      _utc_now_iso(),
                    'maxResults':   1,
                    'orderBy':      'startTime',
                    'singleEvents': 'true',
                },
                headers=_auth(token),
            )
        r.raise_for_status()
        items = r.json().get('items', [])
        if not items:
            return 'No upcoming events on your calendar.'
        event = items[0]
        title = event.get('summary', 'Untitled event')
        start = event.get('start', {})
        time  = _fmt_event_time(start.get('dateTime') or start.get('date', ''))
        return f"Next event: '{title}' at {time}."

    async def _today_events(self, token: str) -> str:
        start, end = _today_range()
        now        = _local_now()
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                _CAL_BASE,
                params={
                    'timeMin':      start,
                    'timeMax':      end,
                    'orderBy':      'startTime',
                    'singleEvents': 'true',
                    'maxResults':   10,
                },
                headers=_auth(token),
            )
        r.raise_for_status()
        items = r.json().get('items', [])
        date_str = now.strftime('%A, %B %d')
        if not items:
            return f'No events on your calendar for today ({date_str}).'
        lines = [f"{len(items)} event{'s' if len(items) != 1 else ''} for {date_str}:"]
        for i, event in enumerate(items, 1):
            title = event.get('summary', 'Untitled')
            start_dt = event.get('start', {})
            time  = _fmt_event_time(start_dt.get('dateTime') or start_dt.get('date', ''))
            lines.append(f'{i}. {title} — {time}')
        return '\n'.join(lines)

    # ── Gmail ─────────────────────────────────────────────────────────────────

    async def _emails(self, token: str, query: str) -> str:
        if any(w in query for w in ('urgent', 'important', 'starred', 'flagged')):
            return await self._important_emails(token)
        return await self._unread_emails(token)

    async def _fetch_subjects(self, token: str, gmail_query: str, max_results: int = 5) -> tuple[int, list[str]]:
        h = _auth(token)
        async with httpx.AsyncClient(timeout=15.0) as client:
            list_r = await client.get(
                f'{_GMAIL_BASE}/messages',
                params={'q': gmail_query, 'maxResults': max_results, 'labelIds': 'INBOX'},
                headers=h,
            )
            list_r.raise_for_status()
            data  = list_r.json()
            msgs  = data.get('messages', [])
            total = data.get('resultSizeEstimate', len(msgs))

            subjects: list[str] = []
            for msg in msgs[:3]:
                detail_r = await client.get(
                    f'{_GMAIL_BASE}/messages/{msg["id"]}',
                    params={'format': 'metadata', 'metadataHeaders': ['Subject']},
                    headers=h,
                )
                if detail_r.status_code == 200:
                    hdrs = detail_r.json().get('payload', {}).get('headers', [])
                    subj = next(
                        (h['value'] for h in hdrs if h.get('name', '').lower() == 'subject'),
                        '(no subject)',
                    )
                    subjects.append(subj)
        return total, subjects

    async def _unread_emails(self, token: str) -> str:
        total, subjects = await self._fetch_subjects(token, 'is:unread')
        if total == 0:
            return 'No unread emails. Your inbox is clear!'
        joined = ', '.join(f"'{s[:50]}'" for s in subjects)
        extra  = f' and {total - 3} more' if total > 3 else ''
        return f"{total} unread email{'s' if total != 1 else ''} — {joined}{extra}."

    async def _important_emails(self, token: str) -> str:
        total, subjects = await self._fetch_subjects(token, 'is:important is:unread')
        if total == 0:
            return 'No important unread emails right now.'
        joined = ', '.join(f"'{s[:50]}'" for s in subjects)
        return f"{total} important email{'s' if total != 1 else ''} — {joined}."
