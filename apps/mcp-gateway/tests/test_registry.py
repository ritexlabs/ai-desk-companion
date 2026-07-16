from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock

from src.tools.registry import ToolRegistry
from src.utils.errors import ToolNotFoundError


def _make_tool(namespace: str, tool_names: list[str]):
    tool = MagicMock()
    tool.namespace = namespace
    tool.list_tools = AsyncMock(return_value=[
        {'name': n, 'description': f'{namespace} {n}', 'inputSchema': {}}
        for n in tool_names
    ])
    tool.call_tool  = AsyncMock(return_value='ok')
    tool.startup    = AsyncMock()
    tool.shutdown   = AsyncMock()
    return tool


# ── registration ──────────────────────────────────────────────────────────────

class TestRegistration:
    def test_register_adds_namespace(self):
        reg = ToolRegistry()
        reg.register(_make_tool('weather', ['get_current_weather']))
        assert 'weather' in reg.namespaces()

    def test_register_multiple_namespaces(self):
        reg = ToolRegistry()
        reg.register(_make_tool('weather', ['get_current_weather']))
        reg.register(_make_tool('stocks',  ['get_quote']))
        assert reg.namespaces() == ['weather', 'stocks']

    def test_status_returns_all_namespaces(self):
        reg = ToolRegistry()
        reg.register(_make_tool('weather', ['get_current_weather']))
        reg.register(_make_tool('system',  ['get_system_info']))
        statuses = {s['namespace'] for s in reg.status()}
        assert statuses == {'weather', 'system'}


# ── list_tools ────────────────────────────────────────────────────────────────

class TestListTools:
    @pytest.mark.asyncio
    async def test_names_are_prefixed_with_namespace(self):
        reg = ToolRegistry()
        reg.register(_make_tool('weather', ['get_current_weather']))
        tools = await reg.list_tools()
        assert tools[0]['name'] == 'weather__get_current_weather'

    @pytest.mark.asyncio
    async def test_multiple_tools_all_prefixed(self):
        reg = ToolRegistry()
        reg.register(_make_tool('github', ['get_summary', 'get_pull_requests']))
        tools = await reg.list_tools()
        names = {t['name'] for t in tools}
        assert names == {'github__get_summary', 'github__get_pull_requests'}

    @pytest.mark.asyncio
    async def test_tools_from_multiple_namespaces_merged(self):
        reg = ToolRegistry()
        reg.register(_make_tool('weather', ['get_current_weather']))
        reg.register(_make_tool('stocks',  ['get_quote']))
        tools = await reg.list_tools()
        names = {t['name'] for t in tools}
        assert 'weather__get_current_weather' in names
        assert 'stocks__get_quote' in names

    @pytest.mark.asyncio
    async def test_failed_namespace_skipped_others_still_returned(self):
        reg = ToolRegistry()
        bad = _make_tool('broken', [])
        bad.list_tools = AsyncMock(side_effect=RuntimeError('oops'))
        reg.register(bad)
        reg.register(_make_tool('weather', ['get_current_weather']))
        tools = await reg.list_tools()
        assert any(t['name'] == 'weather__get_current_weather' for t in tools)


# ── call_tool ─────────────────────────────────────────────────────────────────

class TestCallTool:
    @pytest.mark.asyncio
    async def test_routes_to_correct_namespace(self):
        reg = ToolRegistry()
        weather = _make_tool('weather', ['get_current_weather'])
        stocks  = _make_tool('stocks',  ['get_quote'])
        reg.register(weather)
        reg.register(stocks)
        await reg.call_tool('weather__get_current_weather', {'query': 'Bengaluru'})
        weather.call_tool.assert_awaited_once_with('get_current_weather', {'query': 'Bengaluru'})
        stocks.call_tool.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_bare_name_without_namespace_raises(self):
        reg = ToolRegistry()
        reg.register(_make_tool('weather', ['get_current_weather']))
        with pytest.raises(ToolNotFoundError, match='namespaced'):
            await reg.call_tool('get_current_weather', {})

    @pytest.mark.asyncio
    async def test_unknown_namespace_raises(self):
        reg = ToolRegistry()
        reg.register(_make_tool('weather', ['get_current_weather']))
        with pytest.raises(ToolNotFoundError, match='ghost'):
            await reg.call_tool('ghost__do_something', {})

    @pytest.mark.asyncio
    async def test_returns_tool_result(self):
        reg = ToolRegistry()
        tool = _make_tool('system', ['get_system_info'])
        tool.call_tool = AsyncMock(return_value={'cpu': 10.0})
        reg.register(tool)
        result = await reg.call_tool('system__get_system_info', {})
        assert result == {'cpu': 10.0}


# ── startup / shutdown ────────────────────────────────────────────────────────

class TestLifecycle:
    @pytest.mark.asyncio
    async def test_startup_called_for_all_tools(self):
        reg = ToolRegistry()
        t1 = _make_tool('weather', [])
        t2 = _make_tool('stocks',  [])
        reg.register(t1)
        reg.register(t2)
        await reg.startup()
        t1.startup.assert_awaited_once()
        t2.startup.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_shutdown_called_for_all_tools(self):
        reg = ToolRegistry()
        t1 = _make_tool('weather', [])
        t2 = _make_tool('stocks',  [])
        reg.register(t1)
        reg.register(t2)
        await reg.shutdown()
        t1.shutdown.assert_awaited_once()
        t2.shutdown.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_failed_startup_does_not_abort_others(self):
        reg = ToolRegistry()
        bad  = _make_tool('broken', [])
        bad.startup = AsyncMock(side_effect=RuntimeError('fail'))
        good = _make_tool('weather', [])
        reg.register(bad)
        reg.register(good)
        await reg.startup()          # must not raise
        good.startup.assert_awaited_once()
