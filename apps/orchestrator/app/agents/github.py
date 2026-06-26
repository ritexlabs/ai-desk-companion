from __future__ import annotations

import httpx

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus


class GitHubAgent(AssistantAgent):
    id         = 'github'
    name       = 'GitHub'
    config_key = 'github'
    tool_meta  = {
        'description': 'Get GitHub pull requests, issues, commits, branch info, or CI/CD workflow status.',
        'query_hint':  'The GitHub query, e.g. "open pull requests" or "recent commits on main"',
    }

    _BASE = 'https://api.github.com'

    async def initialize(self) -> None:
        return None

    async def health(self) -> AgentHealth:
        return AgentHealth(name=self.name, status=AgentStatus.ONLINE)

    async def shutdown(self) -> None:
        return None

    def _headers(self, token: str) -> dict:
        return {
            'Authorization':        f'Bearer {token}',
            'Accept':               'application/vnd.github.v3+json',
            'X-GitHub-Api-Version': '2022-11-28',
        }

    async def handle(self, request: AgentRequest) -> AgentResponse:
        cfg   = request.context.get('agent_config', {})
        token = cfg.get('personal_access_token', '').strip()

        if not token:
            return AgentResponse(
                agent=self.id,
                text='No token configured. Go to Settings → Agents → GitHub to add your Personal Access Token.',
            )

        if request.text.strip() == '__boot__':
            return await self._boot_status(token)

        text = request.text.lower()
        try:
            if any(w in text for w in ('pull request', ' pr ', 'prs', 'review')):
                return await self._pull_requests(token)
            if any(w in text for w in ('workflow', 'action', ' ci', 'failed', 'pipeline')):
                return await self._workflows(token)
            if any(w in text for w in ('notification', 'alert', 'mention')):
                return await self._notifications(token)
            if any(w in text for w in ('issue', 'bug', 'todo')):
                return await self._issues(token)
            return await self._summary(token)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                return AgentResponse(agent=self.id, text='Token is invalid or expired. Please update it in Settings → Agents → GitHub.')
            return AgentResponse(agent=self.id, text=f'GitHub API error {e.response.status_code}.')
        except Exception as e:
            return AgentResponse(agent=self.id, text=f'Could not reach GitHub. {str(e)[:60]}')

    async def _boot_status(self, token: str) -> AgentResponse:
        h = self._headers(token)
        async with httpx.AsyncClient(timeout=10.0) as client:
            prs_r   = await client.get(
                f'{self._BASE}/search/issues',
                params={'q': 'is:pr is:open review-requested:@me', 'per_page': 1},
                headers=h,
            )
            notif_r = await client.get(
                f'{self._BASE}/notifications',
                params={'all': 'false', 'per_page': 1},
                headers=h,
            )
        pr_count    = prs_r.json().get('total_count', 0) if prs_r.status_code == 200 else 0
        parts = []
        if pr_count:
            parts.append(f'{pr_count} PR{"s" if pr_count != 1 else ""} to review')
        if notif_r.status_code == 200:
            notif_count = len(notif_r.json())
            if notif_count:
                parts.append(f'{notif_count} notification{"s" if notif_count != 1 else ""}')
        elif notif_r.status_code == 403:
            parts.append('notifications blocked — add "notifications" scope to your token')
        text = 'Connected — ' + (', '.join(parts) if parts else 'all clear.')
        return AgentResponse(agent=self.id, text=text)

    async def _summary(self, token: str) -> AgentResponse:
        h = self._headers(token)
        async with httpx.AsyncClient(timeout=10.0) as client:
            prs_r   = await client.get(f'{self._BASE}/search/issues', params={'q': 'is:pr is:open review-requested:@me', 'per_page': 1}, headers=h)
            notif_r = await client.get(f'{self._BASE}/notifications', params={'all': 'false', 'per_page': 10}, headers=h)
        pr_count    = prs_r.json().get('total_count', 0) if prs_r.status_code == 200 else '?'
        notif_count = len(notif_r.json()) if notif_r.status_code == 200 else '?'
        return AgentResponse(
            agent=self.id,
            text=(
                f"{pr_count} pull request{'s' if pr_count != 1 else ''} awaiting your review "
                f"and {notif_count} unread notification{'s' if notif_count != 1 else ''}."
            ),
        )

    async def _pull_requests(self, token: str) -> AgentResponse:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f'{self._BASE}/search/issues',
                params={'q': 'is:pr is:open review-requested:@me', 'per_page': 5},
                headers=self._headers(token),
            )
        r.raise_for_status()
        data  = r.json()
        total = data.get('total_count', 0)
        if total == 0:
            return AgentResponse(agent=self.id, text='No pull requests awaiting your review. All clear!')
        titles = [f"'{item['title'][:40]}'" for item in data.get('items', [])[:3]]
        joined = ', '.join(titles)
        extra  = f" and {total - 3} more" if total > 3 else ''
        return AgentResponse(agent=self.id, text=f"{total} PR{'s' if total != 1 else ''} need your review — {joined}{extra}.")

    async def _workflows(self, token: str) -> AgentResponse:
        h = self._headers(token)
        async with httpx.AsyncClient(timeout=10.0) as client:
            repos_r = await client.get(f'{self._BASE}/user/repos', params={'per_page': 10, 'sort': 'pushed'}, headers=h)
        if repos_r.status_code != 200:
            return AgentResponse(agent=self.id, text='Could not fetch repositories.')
        repos    = repos_r.json()
        failures: list[str] = []
        async with httpx.AsyncClient(timeout=15.0) as client:
            for repo in repos[:5]:
                full = repo['full_name']
                r = await client.get(f'{self._BASE}/repos/{full}/actions/runs', params={'status': 'failure', 'per_page': 2}, headers=h)
                if r.status_code == 200:
                    for run in r.json().get('workflow_runs', [])[:1]:
                        failures.append(f"'{run['name']}' in {repo['name']}")
        if not failures:
            return AgentResponse(agent=self.id, text='No failed workflow runs in your recent repositories. All green!')
        joined = ', '.join(failures[:3])
        return AgentResponse(agent=self.id, text=f"{len(failures)} failed workflow{'s' if len(failures) != 1 else ''} — {joined}.")

    async def _notifications(self, token: str) -> AgentResponse:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f'{self._BASE}/notifications', params={'all': 'false', 'per_page': 10}, headers=self._headers(token))
        if r.status_code == 403:
            return AgentResponse(agent=self.id, text='Notifications access is blocked. Your GitHub token needs the "notifications" scope — regenerate it at github.com/settings/tokens.')
        r.raise_for_status()
        items = r.json()
        if not items:
            return AgentResponse(agent=self.id, text='No unread notifications. You are all caught up!')
        reasons: dict[str, int] = {}
        for item in items:
            reason = item.get('reason', 'other')
            reasons[reason] = reasons.get(reason, 0) + 1
        summary = ', '.join(f"{v} {k}" for k, v in list(reasons.items())[:3])
        n = len(items)
        return AgentResponse(agent=self.id, text=f"{n} unread notification{'s' if n != 1 else ''} — {summary}.")

    async def _issues(self, token: str) -> AgentResponse:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f'{self._BASE}/issues', params={'filter': 'assigned', 'state': 'open', 'per_page': 5}, headers=self._headers(token))
        r.raise_for_status()
        items = r.json()
        if not items:
            return AgentResponse(agent=self.id, text='No open issues assigned to you.')
        titles = [f"'{item['title'][:40]}'" for item in items[:3]]
        joined = ', '.join(titles)
        extra  = f" and {len(items) - 3} more" if len(items) > 3 else ''
        n = len(items)
        return AgentResponse(agent=self.id, text=f"{n} open issue{'s' if n != 1 else ''} assigned to you — {joined}{extra}.")
