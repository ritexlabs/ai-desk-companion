from __future__ import annotations

import httpx

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus
from app.services.clock import local_now, local_today_range, utc_now_iso


class GoogleCalendarAgent(AssistantAgent):
    id         = 'calendar'
    name       = 'Google Calendar'
    config_key = 'google'
    tool_meta  = {
        'description': 'Get upcoming meetings, events, appointments, or free time slots from Google Calendar.',
        'query_hint':  'The calendar query, e.g. "meetings today" or "what is on my schedule this week"',
    }

    _BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

    async def initialize(self) -> None:
        return None

    async def health(self) -> AgentHealth:
        return AgentHealth(name=self.name, status=AgentStatus.ONLINE)

    async def shutdown(self) -> None:
        return None

    async def handle(self, request: AgentRequest) -> AgentResponse:
        cfg   = request.context.get('agent_config', {})
        token = cfg.get('access_token', '').strip()

        if not token:
            return AgentResponse(
                agent=self.id,
                text='Not connected to Google. Go to Settings → Agents → Google to connect your account.',
            )

        if request.text.strip() == '__boot__':
            try:
                return await self._boot_status(token)
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 401:
                    return AgentResponse(agent=self.id, text='Google access token expired. Please reconnect in Settings → Agents → Google.')
                return AgentResponse(agent=self.id, text=f'Google Calendar API error {e.response.status_code} during boot.')
            except Exception as e:
                return AgentResponse(agent=self.id, text=f'Could not reach Google Calendar. {str(e)[:60]}')

        text = request.text.lower()
        try:
            if any(w in text for w in ('today', "today's", 'schedule', 'upcoming', 'this week', 'week')):
                return await self._today_events(token)
            return await self._next_event(token)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                return AgentResponse(agent=self.id, text='Google access token expired. Please reconnect in Settings → Agents → Google.')
            return AgentResponse(agent=self.id, text=f'Google Calendar API error {e.response.status_code}.')
        except Exception as e:
            return AgentResponse(agent=self.id, text=f'Could not fetch calendar. {str(e)[:60]}')

    def _auth(self, token: str) -> dict:
        return {'Authorization': f'Bearer {token}'}

    def _fmt_time(self, dt_str: str) -> str:
        if 'T' in dt_str:
            from datetime import datetime
            dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
            return dt.astimezone().strftime('%I:%M %p').lstrip('0')
        return 'all day'

    async def _boot_status(self, token: str) -> AgentResponse:
        start, end = local_today_range()
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                self._BASE,
                params={'timeMin': start, 'timeMax': end, 'singleEvents': 'true', 'maxResults': 20},
                headers=self._auth(token),
            )
        r.raise_for_status()
        count = len(r.json().get('items', []))
        if count == 0:
            return AgentResponse(agent=self.id, text='Connected — no events today.')
        return AgentResponse(agent=self.id, text=f'Connected — {count} event{"s" if count != 1 else ""} today.')

    async def _next_event(self, token: str) -> AgentResponse:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                self._BASE,
                params={'timeMin': utc_now_iso(), 'maxResults': 1, 'orderBy': 'startTime', 'singleEvents': 'true'},
                headers=self._auth(token),
            )
        r.raise_for_status()
        items = r.json().get('items', [])
        if not items:
            return AgentResponse(agent=self.id, text='No upcoming events on your calendar.')
        event = items[0]
        title = event.get('summary', 'Untitled event')
        start = event.get('start', {})
        time  = self._fmt_time(start.get('dateTime') or start.get('date', ''))
        return AgentResponse(agent=self.id, text=f"Next event: '{title}' at {time}.")

    async def _today_events(self, token: str) -> AgentResponse:
        start, end = local_today_range()
        now        = local_now()
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                self._BASE,
                params={
                    'timeMin':      start,
                    'timeMax':      end,
                    'orderBy':      'startTime',
                    'singleEvents': 'true',
                    'maxResults':   10,
                },
                headers=self._auth(token),
            )
        r.raise_for_status()
        items = r.json().get('items', [])

        date_str = now.strftime('%A, %B %d')
        if not items:
            return AgentResponse(agent=self.id, text=f'No events on your calendar for today ({date_str}).')

        lines = [f"{len(items)} event{'s' if len(items) != 1 else ''} for {date_str}:"]
        for i, event in enumerate(items, 1):
            title  = event.get('summary', 'Untitled')
            start_ = event.get('start', {})
            time   = self._fmt_time(start_.get('dateTime') or start_.get('date', ''))
            lines.append(f"{i}. {title} — {time}")
        return AgentResponse(agent=self.id, text='\n'.join(lines))
