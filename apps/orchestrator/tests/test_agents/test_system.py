from __future__ import annotations

import re
from datetime import datetime
from unittest.mock import patch

import pytest

from app.agents.system import SystemAgent
from app.models.contracts import AgentRequest

AGENT = SystemAgent()

_FAKE_NOW = datetime(2025, 6, 26, 10, 30, 0)

MOCK_METRICS = {
    'now':       _FAKE_NOW,
    'tz_name':   'IST',
    'os_name':   'macOS',
    'machine':   'arm64',
    'cores':     8,
    'py_ver':    '3.12.0',
    'cpu_pct':   22.5,
    'per_core':  [10.0, 20.0, 15.0, 30.0],
    'mem_total': 16 * (1024 ** 3),
    'mem_used':   8 * (1024 ** 3),
    'mem_avail':  8 * (1024 ** 3),
    'mem_pct':   50.0,
    'swap_used':  0,
    'swap_total': 4 * (1024 ** 3),
    'disk_total': 500 * (1024 ** 3),
    'disk_used':  200 * (1024 ** 3),
    'disk_pct':   40.0,
    'bat_info':  None,
    'top_procs': [],
}


def _req(text: str) -> AgentRequest:
    return AgentRequest(text=text, context={})


@pytest.mark.asyncio
class TestBootResponse:
    async def test_boot_matches_format(self):
        with patch('app.agents.system._collect_metrics', return_value=MOCK_METRICS):
            resp = await AGENT.handle(_req('__boot__'))
        assert re.match(
            r'CPU \d+\.?\d*%, RAM \d+\.?\d*%, disk \d+\.?\d*% — healthy\.',
            resp.text,
        ), f"Boot format mismatch: {resp.text!r}"

    async def test_boot_contains_healthy(self):
        with patch('app.agents.system._collect_metrics', return_value=MOCK_METRICS):
            resp = await AGENT.handle(_req('__boot__'))
        assert 'healthy' in resp.text

    async def test_boot_single_line(self):
        with patch('app.agents.system._collect_metrics', return_value=MOCK_METRICS):
            resp = await AGENT.handle(_req('__boot__'))
        assert '\n' not in resp.text


@pytest.mark.asyncio
class TestFullMetricsResponse:
    async def test_contains_time_line(self):
        with patch('app.agents.system._collect_metrics', return_value=MOCK_METRICS):
            resp = await AGENT.handle(_req('what time is it?'))
        assert 'Time:' in resp.text

    async def test_contains_date_line(self):
        with patch('app.agents.system._collect_metrics', return_value=MOCK_METRICS):
            resp = await AGENT.handle(_req('what is today?'))
        assert 'Date:' in resp.text

    async def test_contains_os_name(self):
        with patch('app.agents.system._collect_metrics', return_value=MOCK_METRICS):
            resp = await AGENT.handle(_req('what OS am I running?'))
        assert 'macOS' in resp.text

    async def test_contains_cpu_usage(self):
        with patch('app.agents.system._collect_metrics', return_value=MOCK_METRICS):
            resp = await AGENT.handle(_req('cpu usage'))
        assert 'CPU usage:' in resp.text

    async def test_contains_ram_info(self):
        with patch('app.agents.system._collect_metrics', return_value=MOCK_METRICS):
            resp = await AGENT.handle(_req('memory info'))
        assert 'RAM:' in resp.text

    async def test_contains_disk_info(self):
        with patch('app.agents.system._collect_metrics', return_value=MOCK_METRICS):
            resp = await AGENT.handle(_req('disk usage'))
        assert 'Disk:' in resp.text

    async def test_no_battery_line_when_none(self):
        with patch('app.agents.system._collect_metrics', return_value=MOCK_METRICS):
            resp = await AGENT.handle(_req('system info'))
        assert 'Battery:' not in resp.text

    async def test_battery_line_shown_when_present(self):
        metrics = {**MOCK_METRICS, 'bat_info': '75% (charging)'}
        with patch('app.agents.system._collect_metrics', return_value=metrics):
            resp = await AGENT.handle(_req('battery?'))
        assert '75% (charging)' in resp.text

    async def test_top_procs_shown_when_present(self):
        metrics = {**MOCK_METRICS, 'top_procs': ['Chrome (45.2% CPU, 3.1% RAM)']}
        with patch('app.agents.system._collect_metrics', return_value=metrics):
            resp = await AGENT.handle(_req('system info'))
        assert 'Chrome' in resp.text

    async def test_agent_id_is_system(self):
        with patch('app.agents.system._collect_metrics', return_value=MOCK_METRICS):
            resp = await AGENT.handle(_req('time'))
        assert resp.agent == 'system'
