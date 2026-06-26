from __future__ import annotations

import pytest

from app.models.contracts import AgentRequest
from app.services.agent_manager import AgentManager, _merge, _merge_llm


# ── _merge (pure) ──────────────────────────────────────────────────────────────

class TestMerge:
    def test_session_non_empty_overrides_env(self):
        env     = {'api_key': 'env-key', 'provider': 'openweathermap'}
        session = {'api_key': 'session-key'}
        result  = _merge(env, session)
        assert result['api_key'] == 'session-key'
        assert result['provider'] == 'openweathermap'

    def test_empty_string_does_not_override(self):
        env     = {'api_key': 'env-key'}
        session = {'api_key': ''}
        result  = _merge(env, session)
        assert result['api_key'] == 'env-key'

    def test_none_does_not_override(self):
        env     = {'api_key': 'env-key'}
        session = {'api_key': None}
        result  = _merge(env, session)
        assert result['api_key'] == 'env-key'

    def test_empty_list_does_not_override(self):
        env     = {'scopes': ['calendar', 'gmail']}
        session = {'scopes': []}
        result  = _merge(env, session)
        assert result['scopes'] == ['calendar', 'gmail']

    def test_extra_session_keys_added(self):
        env     = {'api_key': 'env-key'}
        session = {'country': 'us'}
        result  = _merge(env, session)
        assert result['country'] == 'us'
        assert result['api_key'] == 'env-key'

    def test_empty_session_preserves_env(self):
        env    = {'api_key': 'env-key', 'provider': 'openweathermap'}
        result = _merge(env, {})
        assert result == env


# ── _merge_llm (pure) ─────────────────────────────────────────────────────────

class TestMergeLlm:
    def test_session_with_key_wins(self):
        env     = {'provider': 'openai', 'api_key': 'env-key'}
        session = {'provider': 'openai',  'api_key': 'session-key'}
        result  = _merge_llm(env, session)
        assert result['api_key'] == 'session-key'

    def test_different_provider_no_session_key_uses_env_intact(self):
        env     = {'provider': 'openai',     'api_key': 'env-key'}
        session = {'provider': 'anthropic', 'api_key': ''}
        result  = _merge_llm(env, session)
        assert result['api_key']  == 'env-key'
        assert result['provider'] == 'openai'

    def test_same_provider_no_key_merges_env_key(self):
        env     = {'provider': 'openai', 'api_key': 'env-key'}
        session = {'provider': 'openai', 'api_key': ''}
        result  = _merge_llm(env, session)
        assert result['api_key'] == 'env-key'

    def test_no_provider_in_session_falls_back(self):
        env     = {'provider': 'openai', 'api_key': 'env-key'}
        session = {'api_key': ''}
        result  = _merge_llm(env, session)
        assert result['api_key'] == 'env-key'


# ── AgentManager ─────────────────────────────────────────────────────────────

class TestAgentManager:
    def test_all_core_agents_registered(self):
        mgr = AgentManager()
        for agent_id in ('weather', 'system', 'github', 'news', 'general'):
            assert agent_id in mgr.agents, f"'{agent_id}' missing from registry"

    def test_configure_session_always_adds_general(self):
        mgr = AgentManager()
        mgr.configure_session({}, {}, ['weather', 'system'])
        assert 'general' in mgr._session_enabled_agents

    def test_configure_does_not_duplicate_general(self):
        mgr = AgentManager()
        mgr.configure_session({}, {}, ['weather', 'general'])
        assert mgr._session_enabled_agents.count('general') == 1

    def test_llm_configured_with_api_key(self):
        mgr = AgentManager()
        mgr.configure_session({'provider': 'openai', 'api_key': 'sk-test'}, {})
        assert mgr.llm_configured

    def test_llm_not_configured_without_key(self):
        mgr = AgentManager()
        mgr.configure_session({'provider': 'openai', 'api_key': ''}, {})
        assert not mgr.llm_configured

    def test_llm_configured_for_ollama_without_key(self):
        mgr = AgentManager()
        mgr.configure_session({'provider': 'ollama', 'api_key': ''}, {})
        assert mgr.llm_configured

    def test_clear_session_resets_all_fields(self):
        mgr = AgentManager()
        mgr.configure_session({'provider': 'openai', 'api_key': 'sk'}, {}, ['weather'])
        mgr.clear_session()
        assert mgr._session_llm_config     == {}
        assert mgr._session_agent_config   == {}
        assert mgr._session_enabled_agents == []
        assert mgr._session_calling_name   == 'Robo'

    def test_calling_name_stored(self):
        mgr = AgentManager()
        mgr.configure_session({}, {}, [], 'Boss')
        assert mgr._session_calling_name == 'Boss'

    @pytest.mark.asyncio
    async def test_handle_known_agent_returns_response(self):
        from unittest.mock import patch
        mgr = AgentManager()
        mgr.configure_session({}, {}, ['system'])
        with patch('app.agents.system._collect_metrics', return_value={
            'now': __import__('datetime').datetime(2025, 6, 26, 10, 0),
            'tz_name': 'UTC', 'os_name': 'Linux', 'machine': 'x86_64',
            'cores': 4, 'py_ver': '3.12', 'cpu_pct': 10.0, 'per_core': [],
            'mem_total': 8*(1024**3), 'mem_used': 4*(1024**3), 'mem_avail': 4*(1024**3),
            'mem_pct': 50.0, 'swap_used': 0, 'swap_total': 0,
            'disk_total': 100*(1024**3), 'disk_used': 50*(1024**3), 'disk_pct': 50.0,
            'bat_info': None, 'top_procs': [],
        }):
            req  = AgentRequest(text='__boot__', context={})
            resp = await mgr.handle('system', req)
        assert resp.agent == 'system'
        assert 'healthy' in resp.text

    @pytest.mark.asyncio
    async def test_handle_unknown_agent_falls_back_to_general(self):
        mgr = AgentManager()
        req = AgentRequest(text='test', context={})
        resp = await mgr.handle('nonexistent_xyz', req)
        assert resp.agent == 'general'
