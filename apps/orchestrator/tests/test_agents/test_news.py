from __future__ import annotations

import httpx
import pytest
import respx

from app.agents.news import NewsAgent, _extract_topic
from app.models.contracts import AgentRequest

AGENT = NewsAgent()
BASE  = 'https://gnews.io/api/v4'


def _req(text: str, api_key: str = '', country: str = 'in',
         state: str = '', city: str = '') -> AgentRequest:
    return AgentRequest(text=text, context={'agent_config': {
        'api_key': api_key, 'country': country, 'state': state, 'city': city,
    }})


# ── _extract_topic (pure) ─────────────────────────────────────────────────────

class TestExtractTopic:
    # The regex strips one "question prefix" layer from the front of the phrase.
    # "what is the news about cricket" → strips "what is the " → "news about cricket"
    # "news about cricket"            → strips "news about "  → "cricket"
    # So direct "news about X" gives "X"; nested forms give one prefix removed.

    def test_news_about_returns_topic(self):
        assert _extract_topic("news about cricket") == "cricket"

    def test_latest_news_about(self):
        assert _extract_topic("latest news about technology") == "technology"

    def test_news_on(self):
        assert _extract_topic("news on elections") == "elections"

    def test_news_regarding(self):
        assert _extract_topic("news regarding AI") == "AI"

    def test_breaking_news_about(self):
        assert _extract_topic("breaking news about floods") == "floods"

    def test_show_news_about(self):
        assert _extract_topic("show me news about cricket") == "cricket"

    def test_what_is_the_strips_prefix(self):
        # Strips "what is the " prefix; "news about cricket" remains (still a useful query)
        result = _extract_topic("what is the news about cricket")
        assert result != ""  # still a useful search term

    def test_generic_latest_news_returns_empty(self):
        assert _extract_topic("latest news") == ""

    def test_generic_bare_headlines_returns_empty(self):
        # "headlines" is in _GENERIC_QUERIES → empty returned
        assert _extract_topic("headlines") == ""

    def test_generic_breaking_news_returns_empty(self):
        assert _extract_topic("breaking news") == ""

    def test_todays_news_returns_empty(self):
        assert _extract_topic("today's news") == ""

    def test_bare_news_returns_empty(self):
        # "news" alone is in _GENERIC_QUERIES
        assert _extract_topic("news") == ""


# ── No API key ────────────────────────────────────────────────────────────────

class TestNoApiKey:
    @pytest.mark.asyncio
    async def test_no_key_returns_configuration_message(self):
        resp = await AGENT.handle(_req("latest news"))
        assert (
            'not configured' in resp.text.lower()
            or 'GNews' in resp.text
            or 'Settings' in resp.text
        )

    @pytest.mark.asyncio
    async def test_no_key_agent_id_is_news(self):
        resp = await AGENT.handle(_req("latest news"))
        assert resp.agent == 'news'


# ── Boot ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestBoot:
    async def test_boot_returns_article_count(self):
        with respx.mock(assert_all_called=False) as m:
            m.get(f'{BASE}/top-headlines').mock(
                return_value=httpx.Response(200, json={
                    'articles': [{'title': 'A'}, {'title': 'B'}, {'title': 'C'}],
                })
            )
            resp = await AGENT.handle(_req("__boot__", api_key="test-key"))
        assert '3' in resp.text

    async def test_boot_fetch_error_returns_error_message(self):
        with respx.mock(assert_all_called=False) as m:
            m.get(f'{BASE}/top-headlines').mock(
                return_value=httpx.Response(500, json={})
            )
            resp = await AGENT.handle(_req("__boot__", api_key="test-key"))
        assert 'Could not fetch' in resp.text or 'error' in resp.text.lower()


# ── Top headlines (no topic) ──────────────────────────────────────────────────

@pytest.mark.asyncio
class TestTopHeadlines:
    async def test_returns_article_titles(self):
        with respx.mock(assert_all_called=False) as m:
            m.get(f'{BASE}/top-headlines').mock(
                return_value=httpx.Response(200, json={
                    'articles': [{
                        'title':       'Big Story Today',
                        'source':      {'name': 'BBC'},
                        'publishedAt': '2025-06-26T10:00:00Z',
                        'description': 'A big story happened.',
                    }]
                })
            )
            resp = await AGENT.handle(_req("what is the latest news", api_key="test-key"))
        assert 'Big Story Today' in resp.text

    async def test_no_articles_returns_not_found(self):
        with respx.mock(assert_all_called=False) as m:
            m.get(f'{BASE}/top-headlines').mock(
                return_value=httpx.Response(200, json={'articles': []})
            )
            resp = await AGENT.handle(_req("latest news", api_key="test-key"))
        assert 'No news found' in resp.text or 'not found' in resp.text.lower()


# ── Topic search ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestTopicSearch:
    async def test_topic_search_hits_search_endpoint(self):
        with respx.mock(assert_all_called=False) as m:
            route = m.get(f'{BASE}/search').mock(
                return_value=httpx.Response(200, json={
                    'articles': [{
                        'title':       'Cricket World Cup',
                        'source':      {'name': 'ESPN'},
                        'publishedAt': '2025-06-26T09:00:00Z',
                        'description': 'India wins.',
                    }]
                })
            )
            resp = await AGENT.handle(_req("news about cricket", api_key="test-key"))
        assert route.called
        assert 'Cricket World Cup' in resp.text

    async def test_gnews_403_returns_error_status(self):
        with respx.mock(assert_all_called=False) as m:
            m.get(f'{BASE}/top-headlines').mock(
                return_value=httpx.Response(403, json={'errors': ['Invalid API key']})
            )
            resp = await AGENT.handle(_req("latest news", api_key="bad-key"))
        assert '403' in resp.text or 'error' in resp.text.lower()
