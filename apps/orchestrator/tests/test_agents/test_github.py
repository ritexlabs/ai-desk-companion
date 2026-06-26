from __future__ import annotations

import httpx
import pytest
import respx

from app.agents.github import GitHubAgent
from app.models.contracts import AgentRequest

AGENT = GitHubAgent()
BASE  = 'https://api.github.com'


def _req(text: str, token: str = '') -> AgentRequest:
    return AgentRequest(
        text=text,
        context={'agent_config': {'personal_access_token': token}},
    )


# ── No token ──────────────────────────────────────────────────────────────────

class TestNoToken:
    @pytest.mark.asyncio
    async def test_no_token_returns_config_prompt(self):
        resp = await AGENT.handle(_req("open PRs"))
        assert 'No token' in resp.text or 'Settings' in resp.text

    @pytest.mark.asyncio
    async def test_no_token_agent_id_is_github(self):
        resp = await AGENT.handle(_req("open PRs"))
        assert resp.agent == 'github'


# ── Routing ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestRoutingWithToken:
    async def test_pr_routing(self):
        with respx.mock(assert_all_called=False) as m:
            m.get(f'{BASE}/search/issues').mock(
                return_value=httpx.Response(200, json={
                    'total_count': 2,
                    'items': [{'title': 'Fix login bug'}, {'title': 'Add dark mode'}],
                })
            )
            resp = await AGENT.handle(_req("show my pull requests", "fake-token"))
        assert 'PR' in resp.text or 'pull request' in resp.text.lower()

    async def test_workflow_routing(self):
        with respx.mock(assert_all_called=False) as m:
            m.get(f'{BASE}/user/repos').mock(
                return_value=httpx.Response(200, json=[
                    {'full_name': 'user/repo', 'name': 'repo'},
                ])
            )
            m.get(f'{BASE}/repos/user/repo/actions/runs').mock(
                return_value=httpx.Response(200, json={'workflow_runs': []})
            )
            resp = await AGENT.handle(_req("any failed workflows?", "fake-token"))
        assert 'green' in resp.text.lower() or 'workflow' in resp.text.lower()

    async def test_notification_routing(self):
        with respx.mock(assert_all_called=False) as m:
            m.get(f'{BASE}/notifications').mock(
                return_value=httpx.Response(200, json=[
                    {'reason': 'mention'},
                    {'reason': 'review_requested'},
                ])
            )
            resp = await AGENT.handle(_req("any notifications?", "fake-token"))
        assert '2' in resp.text or 'notification' in resp.text.lower()

    async def test_issue_routing(self):
        with respx.mock(assert_all_called=False) as m:
            m.get(f'{BASE}/issues').mock(
                return_value=httpx.Response(200, json=[
                    {'title': 'Bug in login flow'},
                    {'title': 'Fix dark mode crash'},
                ])
            )
            resp = await AGENT.handle(_req("show issues assigned to me", "fake-token"))
        assert 'issue' in resp.text.lower()

    async def test_no_prs_message(self):
        with respx.mock(assert_all_called=False) as m:
            m.get(f'{BASE}/search/issues').mock(
                return_value=httpx.Response(200, json={'total_count': 0, 'items': []})
            )
            resp = await AGENT.handle(_req("my pull requests", "fake-token"))
        assert 'No pull requests' in resp.text or 'all clear' in resp.text.lower()


# ── Error handling ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestErrorHandling:
    async def test_401_returns_friendly_message(self):
        with respx.mock(assert_all_called=False) as m:
            m.get(f'{BASE}/search/issues').mock(
                return_value=httpx.Response(401, json={'message': 'Unauthorized'})
            )
            resp = await AGENT.handle(_req("open pull requests", "invalid-token"))
        assert 'invalid' in resp.text.lower() or 'expired' in resp.text.lower()

    async def test_403_notifications_scope_error(self):
        with respx.mock(assert_all_called=False) as m:
            m.get(f'{BASE}/notifications').mock(
                return_value=httpx.Response(403, json={'message': 'Forbidden'})
            )
            resp = await AGENT.handle(_req("notifications", "fake-token"))
        assert 'scope' in resp.text.lower() or 'blocked' in resp.text.lower() or 'Forbidden' in resp.text


# ── Boot ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestBoot:
    async def test_boot_all_clear(self):
        with respx.mock(assert_all_called=False) as m:
            m.get(f'{BASE}/search/issues').mock(
                return_value=httpx.Response(200, json={'total_count': 0, 'items': []})
            )
            m.get(f'{BASE}/notifications').mock(
                return_value=httpx.Response(200, json=[])
            )
            resp = await AGENT.handle(_req("__boot__", "fake-token"))
        assert 'Connected' in resp.text

    async def test_boot_shows_pr_count(self):
        with respx.mock(assert_all_called=False) as m:
            m.get(f'{BASE}/search/issues').mock(
                return_value=httpx.Response(200, json={'total_count': 3, 'items': []})
            )
            m.get(f'{BASE}/notifications').mock(
                return_value=httpx.Response(200, json=[])
            )
            resp = await AGENT.handle(_req("__boot__", "fake-token"))
        assert '3' in resp.text
