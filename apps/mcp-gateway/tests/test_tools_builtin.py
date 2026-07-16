from __future__ import annotations

"""
Tests for tools that need no credentials: system, weather (Open-Meteo), stocks.
These tests call the real tool implementations.
"""

import pytest
from unittest.mock import AsyncMock, patch

from src.tools.system   import SystemTool
from src.tools.weather  import WeatherTool
from src.tools.stocks   import StocksTool
from src.tools.news     import NewsTool
from src.tools.github   import GitHubTool
from src.tools.google   import GoogleTool
from src.tools.portfolio import PortfolioTool
from src.utils.errors   import ToolAuthError, ToolNotFoundError


# ── SystemTool ────────────────────────────────────────────────────────────────

class TestSystemTool:
    def test_namespace(self):
        assert SystemTool().namespace == 'system'

    @pytest.mark.asyncio
    async def test_list_tools_returns_get_system_info(self):
        tools = await SystemTool().list_tools()
        assert any(t['name'] == 'get_system_info' for t in tools)

    @pytest.mark.asyncio
    async def test_get_system_info_returns_string(self):
        result = await SystemTool().call_tool('get_system_info', {})
        assert isinstance(result, str)
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_get_system_info_contains_cpu(self):
        result = await SystemTool().call_tool('get_system_info', {})
        assert 'CPU' in result or 'cpu' in result.lower()

    @pytest.mark.asyncio
    async def test_returns_result_regardless_of_tool_name(self):
        # SystemTool has a single tool and ignores the tool_name arg
        result = await SystemTool().call_tool('anything', {})
        assert isinstance(result, str)


# ── WeatherTool ───────────────────────────────────────────────────────────────

class TestWeatherTool:
    def test_namespace(self):
        assert WeatherTool().namespace == 'weather'

    @pytest.mark.asyncio
    async def test_list_tools_returns_get_current_weather(self):
        tools = await WeatherTool().list_tools()
        assert any(t['name'] == 'get_current_weather' for t in tools)

    @pytest.mark.asyncio
    async def test_get_current_weather_returns_string(self):
        result = await WeatherTool().call_tool('get_current_weather', {'query': 'Bengaluru'})
        assert isinstance(result, str)
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_get_current_weather_has_temperature(self):
        result = await WeatherTool().call_tool('get_current_weather', {'query': 'Bengaluru'})
        assert '°C' in result or 'temperature' in result.lower() or 'weather' in result.lower()

    @pytest.mark.asyncio
    async def test_returns_result_regardless_of_tool_name(self):
        # WeatherTool has a single tool and ignores the tool_name arg
        result = await WeatherTool().call_tool('anything', {'query': 'Bengaluru'})
        assert isinstance(result, str)


# ── StocksTool ────────────────────────────────────────────────────────────────

class TestStocksTool:
    def test_namespace(self):
        assert StocksTool().namespace == 'stocks'

    @pytest.mark.asyncio
    async def test_list_tools_returns_get_quote(self):
        tools = await StocksTool().list_tools()
        assert any(t['name'] == 'get_quote' for t in tools)

    @pytest.mark.asyncio
    async def test_get_quote_nifty_returns_string(self):
        result = await StocksTool().call_tool('get_quote', {'query': 'Nifty 50'})
        assert isinstance(result, str)
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_returns_result_regardless_of_tool_name(self):
        # StocksTool has a single tool and ignores the tool_name arg
        result = await StocksTool().call_tool('anything', {'query': 'Nifty 50'})
        assert isinstance(result, str)


# ── NewsTool (no key — graceful degradation) ──────────────────────────────────

class TestNewsTool:
    def test_namespace(self):
        assert NewsTool().namespace == 'news'

    @pytest.mark.asyncio
    async def test_list_tools_returns_get_news(self):
        tools = await NewsTool().list_tools()
        assert any(t['name'] == 'get_news' for t in tools)

    @pytest.mark.asyncio
    async def test_no_key_returns_config_guidance(self, monkeypatch):
        monkeypatch.setattr('src.tools.news.settings', type('S', (), {'news_api_key': '', 'news_default_country': 'in'})())
        result = await NewsTool().call_tool('get_news', {'query': 'India'})
        assert isinstance(result, str)
        assert 'NEWS_API_KEY' in result or 'not configured' in result.lower() or 'api key' in result.lower()


# ── GitHubTool (no token — graceful degradation) ─────────────────────────────

class TestGitHubTool:
    def test_namespace(self):
        assert GitHubTool().namespace == 'github'

    @pytest.mark.asyncio
    async def test_list_tools_has_get_summary(self):
        tools = await GitHubTool().list_tools()
        assert any(t['name'] == 'get_summary' for t in tools)

    @pytest.mark.asyncio
    async def test_no_token_returns_config_guidance(self, monkeypatch):
        monkeypatch.setattr('src.tools.github.settings', type('S', (), {'github_token': ''})())
        result = await GitHubTool().call_tool('get_summary', {})
        assert isinstance(result, str)
        assert 'GITHUB_TOKEN' in result or 'token' in result.lower() or 'not configured' in result.lower()


# ── GoogleTool (no token — graceful degradation) ──────────────────────────────

class TestGoogleTool:
    def test_namespace(self):
        assert GoogleTool().namespace == 'google'

    @pytest.mark.asyncio
    async def test_list_tools_has_get_calendar_events(self):
        tools = await GoogleTool().list_tools()
        assert any(t['name'] == 'get_calendar_events' for t in tools)

    @pytest.mark.asyncio
    async def test_list_tools_has_get_emails(self):
        tools = await GoogleTool().list_tools()
        assert any(t['name'] == 'get_emails' for t in tools)

    @pytest.mark.asyncio
    async def test_no_token_returns_config_guidance(self):
        result = await GoogleTool().call_tool('get_calendar_events', {})
        assert isinstance(result, str)
        assert 'GOOGLE' in result or 'not connected' in result.lower() or 'access token' in result.lower()


# ── PortfolioTool (no token — graceful degradation) ───────────────────────────

class TestPortfolioTool:
    def test_namespace(self):
        assert PortfolioTool().namespace == 'indmoney'

    @pytest.mark.asyncio
    async def test_list_tools_has_query_portfolio(self):
        tools = await PortfolioTool().list_tools()
        assert any(t['name'] == 'query_portfolio' for t in tools)

    @pytest.mark.asyncio
    async def test_no_token_raises_tool_auth_error(self, monkeypatch):
        monkeypatch.setattr('src.tools.portfolio.settings', type('S', (), {'indmoney_oauth_token': '', 'is_portfolio_configured': lambda self: False})())
        with pytest.raises(ToolAuthError, match='INDMONEY_OAUTH_TOKEN'):
            await PortfolioTool().call_tool('query_portfolio', {'query': 'my portfolio'})
