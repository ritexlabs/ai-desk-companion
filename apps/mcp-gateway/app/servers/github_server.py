from __future__ import annotations

import logging
from typing import Any

import httpx

from app.servers.base import BaseMCPServer

logger = logging.getLogger(__name__)

_BASE = 'https://api.github.com'


def _gh_headers(token: str) -> dict:
    return {
        'Authorization':        f'Bearer {token}',
        'Accept':               'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
    }


class GitHubServer(BaseMCPServer):
    namespace = 'github'

    async def connect(self) -> None:
        pass

    async def disconnect(self) -> None:
        pass

    async def list_tools(self) -> list[dict]:
        return [
            {
                'name': 'get_summary',
                'description': 'Get a GitHub overview: PRs awaiting review and unread notifications.',
                'inputSchema': {'type': 'object', 'properties': {}, 'required': []},
            },
            {
                'name': 'get_pull_requests',
                'description': 'List GitHub pull requests awaiting your review.',
                'inputSchema': {'type': 'object', 'properties': {}, 'required': []},
            },
            {
                'name': 'get_notifications',
                'description': 'List unread GitHub notifications (mentions, reviews, etc.).',
                'inputSchema': {'type': 'object', 'properties': {}, 'required': []},
            },
            {
                'name': 'get_workflow_status',
                'description': 'Check GitHub Actions CI/CD workflow run statuses for your repositories.',
                'inputSchema': {'type': 'object', 'properties': {}, 'required': []},
            },
            {
                'name': 'get_issues',
                'description': 'List open GitHub issues assigned to you.',
                'inputSchema': {'type': 'object', 'properties': {}, 'required': []},
            },
        ]

    async def call_tool(self, tool_name: str, arguments: dict, credentials: dict) -> Any:
        token = credentials.get('github_token', '').strip()
        if not token:
            return (
                'No GitHub token configured. '
                'Go to Settings → Agents → GitHub to add your Personal Access Token.'
            )
        try:
            if tool_name == 'get_pull_requests':
                return await self._pull_requests(token)
            if tool_name == 'get_notifications':
                return await self._notifications(token)
            if tool_name == 'get_workflow_status':
                return await self._workflows(token)
            if tool_name == 'get_issues':
                return await self._issues(token)
            return await self._summary(token)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                return 'GitHub token is invalid or expired. Please update it in Settings → Agents → GitHub.'
            return f'GitHub API error {exc.response.status_code}.'
        except Exception as exc:
            return f'Could not reach GitHub. {str(exc)[:80]}'

    async def _summary(self, token: str) -> str:
        h = _gh_headers(token)
        async with httpx.AsyncClient(timeout=10.0) as client:
            prs_r   = await client.get(
                f'{_BASE}/search/issues',
                params={'q': 'is:pr is:open review-requested:@me', 'per_page': 1},
                headers=h,
            )
            notif_r = await client.get(
                f'{_BASE}/notifications',
                params={'all': 'false', 'per_page': 10},
                headers=h,
            )
        pr_count    = prs_r.json().get('total_count', 0) if prs_r.status_code == 200 else '?'
        notif_count = len(notif_r.json()) if notif_r.status_code == 200 else '?'
        return (
            f"{pr_count} pull request{'s' if pr_count != 1 else ''} awaiting your review "
            f"and {notif_count} unread notification{'s' if notif_count != 1 else ''}."
        )

    async def _pull_requests(self, token: str) -> str:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f'{_BASE}/search/issues',
                params={'q': 'is:pr is:open review-requested:@me', 'per_page': 5},
                headers=_gh_headers(token),
            )
        r.raise_for_status()
        data  = r.json()
        total = data.get('total_count', 0)
        if total == 0:
            return 'No pull requests awaiting your review. All clear!'
        titles = [f"'{item['title'][:40]}'" for item in data.get('items', [])[:3]]
        joined = ', '.join(titles)
        extra  = f' and {total - 3} more' if total > 3 else ''
        return f"{total} PR{'s' if total != 1 else ''} need your review — {joined}{extra}."

    async def _notifications(self, token: str) -> str:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f'{_BASE}/notifications',
                params={'all': 'false', 'per_page': 10},
                headers=_gh_headers(token),
            )
        if r.status_code == 403:
            return (
                'Notifications access is blocked. '
                'Your GitHub token needs the "notifications" scope — '
                'regenerate it at github.com/settings/tokens.'
            )
        r.raise_for_status()
        items = r.json()
        if not items:
            return 'No unread notifications. You are all caught up!'
        reasons: dict[str, int] = {}
        for item in items:
            reason = item.get('reason', 'other')
            reasons[reason] = reasons.get(reason, 0) + 1
        summary = ', '.join(f'{v} {k}' for k, v in list(reasons.items())[:3])
        n = len(items)
        return f"{n} unread notification{'s' if n != 1 else ''} — {summary}."

    async def _workflows(self, token: str) -> str:
        h = _gh_headers(token)
        async with httpx.AsyncClient(timeout=10.0) as client:
            repos_r = await client.get(
                f'{_BASE}/user/repos',
                params={'per_page': 10, 'sort': 'pushed'},
                headers=h,
            )
        if repos_r.status_code != 200:
            return 'Could not fetch repositories.'
        failures: list[str] = []
        async with httpx.AsyncClient(timeout=15.0) as client:
            for repo in repos_r.json()[:5]:
                r = await client.get(
                    f'{_BASE}/repos/{repo["full_name"]}/actions/runs',
                    params={'status': 'failure', 'per_page': 2},
                    headers=h,
                )
                if r.status_code == 200:
                    for run in r.json().get('workflow_runs', [])[:1]:
                        failures.append(f"'{run['name']}' in {repo['name']}")
        if not failures:
            return 'No failed workflow runs in your recent repositories. All green!'
        joined = ', '.join(failures[:3])
        return f"{len(failures)} failed workflow{'s' if len(failures) != 1 else ''} — {joined}."

    async def _issues(self, token: str) -> str:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f'{_BASE}/issues',
                params={'filter': 'assigned', 'state': 'open', 'per_page': 5},
                headers=_gh_headers(token),
            )
        r.raise_for_status()
        items = r.json()
        if not items:
            return 'No open issues assigned to you.'
        titles = [f"'{item['title'][:40]}'" for item in items[:3]]
        joined = ', '.join(titles)
        extra  = f' and {len(items) - 3} more' if len(items) > 3 else ''
        n = len(items)
        return f"{n} open issue{'s' if n != 1 else ''} assigned to you — {joined}{extra}."
