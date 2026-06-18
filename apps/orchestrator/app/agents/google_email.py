from __future__ import annotations

import httpx

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus


class GoogleEmailAgent(AssistantAgent):
    id = 'email'
    name = 'Google Email'

    _BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

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
                return AgentResponse(agent=self.id, text=f'Gmail API error {e.response.status_code} during boot.')
            except Exception as e:
                return AgentResponse(agent=self.id, text=f'Could not reach Gmail. {str(e)[:60]}')

        text = request.text.lower()
        try:
            if any(w in text for w in ('urgent', 'important', 'starred', 'flagged')):
                return await self._important(token)
            return await self._unread(token)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                return AgentResponse(agent=self.id, text='Google access token expired. Please reconnect in Settings → Agents → Google.')
            return AgentResponse(agent=self.id, text=f'Gmail API error {e.response.status_code}.')
        except Exception as e:
            return AgentResponse(agent=self.id, text=f'Could not fetch email. {str(e)[:60]}')

    def _auth(self, token: str) -> dict:
        return {'Authorization': f'Bearer {token}'}

    def _get_header(self, headers: list, name: str) -> str:
        for h in headers:
            if h.get('name', '').lower() == name.lower():
                return h.get('value', '')
        return ''

    async def _fetch_subjects(self, token: str, query: str, max_results: int = 5) -> tuple[int, list[str]]:
        h = self._auth(token)
        async with httpx.AsyncClient(timeout=15.0) as client:
            list_r = await client.get(
                f'{self._BASE}/messages',
                params={'q': query, 'maxResults': max_results, 'labelIds': 'INBOX'},
                headers=h,
            )
            list_r.raise_for_status()
            data  = list_r.json()
            msgs  = data.get('messages', [])
            total = data.get('resultSizeEstimate', len(msgs))

            subjects: list[str] = []
            for msg in msgs[:3]:
                detail_r = await client.get(
                    f'{self._BASE}/messages/{msg["id"]}',
                    params={'format': 'metadata', 'metadataHeaders': ['Subject']},
                    headers=h,
                )
                if detail_r.status_code == 200:
                    hdrs = detail_r.json().get('payload', {}).get('headers', [])
                    subjects.append(self._get_header(hdrs, 'Subject') or '(no subject)')
        return total, subjects

    async def _boot_status(self, token: str) -> AgentResponse:
        h = self._auth(token)
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f'{self._BASE}/messages',
                params={'q': 'is:unread', 'maxResults': 1, 'labelIds': 'INBOX'},
                headers=h,
            )
        r.raise_for_status()
        count = r.json().get('resultSizeEstimate', 0)
        if count == 0:
            return AgentResponse(agent=self.id, text='Connected — inbox clear.')
        return AgentResponse(agent=self.id, text=f'Connected — {count} unread.')

    async def _unread(self, token: str) -> AgentResponse:
        total, subjects = await self._fetch_subjects(token, 'is:unread')
        if total == 0:
            return AgentResponse(agent=self.id, text='No unread emails. Your inbox is clear!')
        joined = ', '.join(f"'{s[:50]}'" for s in subjects)
        extra  = f" and {total - 3} more" if total > 3 else ''
        return AgentResponse(
            agent=self.id,
            text=f"{total} unread email{'s' if total != 1 else ''} — {joined}{extra}.",
        )

    async def _important(self, token: str) -> AgentResponse:
        total, subjects = await self._fetch_subjects(token, 'is:important is:unread', max_results=5)
        if total == 0:
            return AgentResponse(agent=self.id, text='No important unread emails right now.')
        joined = ', '.join(f"'{s[:50]}'" for s in subjects)
        return AgentResponse(
            agent=self.id,
            text=f"{total} important email{'s' if total != 1 else ''} — {joined}.",
        )
