from __future__ import annotations

import pytest

from app.services.session import (
    is_agent_error,
    strip_agent_prefix,
)
from app.services.phrases import phrase_engine, _EN


# ── strip_agent_prefix ────────────────────────────────────────────────────────

class TestStripAgentPrefix:
    def test_strips_agent_colon(self):
        result = strip_agent_prefix("Weather agent: the temperature is 30°C")
        assert result == "the temperature is 30°C"

    def test_strips_summary_prefix(self):
        result = strip_agent_prefix("System summary: CPU is at 45%")
        assert result == "CPU is at 45%"

    def test_strips_github_agent_prefix(self):
        result = strip_agent_prefix("GitHub agent, 3 open PRs")
        assert result == "3 open PRs"

    def test_no_prefix_unchanged(self):
        result = strip_agent_prefix("All good in Mumbai today.")
        assert result == "All good in Mumbai today."

    def test_strips_surrounding_whitespace(self):
        result = strip_agent_prefix("News agent: Top story from BBC")
        assert result == result.strip()


# ── is_agent_error ────────────────────────────────────────────────────────────

class TestIsAgentError:
    def test_no_api_key_is_error(self):
        assert is_agent_error("No API key configured")

    def test_not_configured_is_error(self):
        assert is_agent_error("Weather agent is not configured")

    def test_not_connected_is_error(self):
        assert is_agent_error("Agent is not connected to the service")

    def test_error_string_is_error(self):
        assert is_agent_error("An error occurred fetching data")

    def test_could_not_is_error(self):
        assert is_agent_error("Could not reach the GitHub API")

    def test_expired_is_error(self):
        assert is_agent_error("Token has expired")

    def test_no_token_is_error(self):
        assert is_agent_error("No token configured")

    def test_success_message_not_error(self):
        assert not is_agent_error("Sunny, 28°C in Mumbai.")

    def test_notifications_message_not_error(self):
        assert not is_agent_error("3 unread notifications — 2 mention, 1 review_requested.")

    def test_connected_message_not_error(self):
        assert not is_agent_error("Connected — all clear.")

    def test_case_insensitive(self):
        assert is_agent_error("NOT CONFIGURED")
        assert is_agent_error("No API Key found")


# ── PhraseEngine — greeting ───────────────────────────────────────────────────

class TestPhraseEngineGreeting:
    def setup_method(self):
        phrase_engine.configure({})   # no LLM — uses static pool

    def test_contains_calling_name(self):
        result = phrase_engine._static('greeting', {'tod': 'Good morning', 'name': 'Alice', 'assistant_name': 'Robo'})
        assert 'Alice' in result

    def test_ends_with_period(self):
        result = phrase_engine._static('greeting', {'tod': 'Good morning', 'name': 'Master', 'assistant_name': 'Robo'})
        assert result.endswith('.')

    def test_contains_time_of_day_phrase(self):
        result = phrase_engine._static('greeting', {'tod': 'Good afternoon', 'name': 'Ritesh', 'assistant_name': 'Robo'})
        assert 'Good afternoon' in result

    def test_different_names_work(self):
        for name in ('Master', 'Boss', 'User'):
            result = phrase_engine._static('greeting', {'tod': 'Good evening', 'name': name, 'assistant_name': 'Robo'})
            assert name in result

    def test_result_is_from_pool(self):
        result = phrase_engine._static('greeting', {'tod': 'Good morning', 'name': 'Test', 'assistant_name': 'Robo'})
        pool = _EN.get('greeting', [])
        assert any(result == t.format(tod='Good morning', name='Test', assistant_name='Robo') for t in pool)


# ── PhraseEngine — farewell ───────────────────────────────────────────────────

class TestPhraseEngineFarewell:
    def setup_method(self):
        phrase_engine.configure({})

    def test_farewell_from_pool(self):
        result = phrase_engine._static('farewell', {})
        assert result in _EN['farewell']

    def test_farewell_ends_with_period_or_exclamation(self):
        result = phrase_engine._static('farewell', {})
        assert result[-1] in ('.', '!')

    def test_farewell_is_nonempty(self):
        for _ in range(5):
            result = phrase_engine._static('farewell', {})
            assert len(result) > 5


# ── PhraseEngine — gateway phrases ───────────────────────────────────────────

class TestPhraseEngineGateway:
    def setup_method(self):
        phrase_engine.configure({})

    def test_gw_connect_from_pool(self):
        result = phrase_engine._static('gw_connect', {})
        assert result in _EN['gw_connect']

    def test_gw_fail_from_pool(self):
        result = phrase_engine._static('gw_fail', {})
        assert result in _EN['gw_fail']

    def test_agent_online_substitutes_label(self):
        result = phrase_engine._static('agent_online', {'label': 'Weather'})
        assert 'Weather' in result
        assert '{label}' not in result

    def test_boot_summary_substitutes_values(self):
        result = phrase_engine._static('boot_summary', {'total_online': 8, 'total': 10, 'plural': 's'})
        assert '8' in result
        assert '10' in result
        assert '{' not in result


# ── PhraseEngine — Hindi fallback ─────────────────────────────────────────────

class TestPhraseEngineHindi:
    def setup_method(self):
        phrase_engine.configure({}, language='hi')

    def teardown_method(self):
        phrase_engine.configure({}, language='en')

    def test_gw_connect_hindi(self):
        result = phrase_engine._static('gw_connect', {})
        assert result   # non-empty
        # Hindi pool is defined for gw_connect
        from app.services.phrases import _HI
        assert result in _HI['gw_connect']

    def test_greeting_hindi_with_name(self):
        from app.services.phrases import _HI
        result = phrase_engine._static('greeting', {'tod': 'Good morning', 'name': 'Ritesh', 'assistant_name': 'Robo'})
        assert 'Ritesh' in result

    def test_missing_category_falls_back_to_english(self):
        # 'boot_summary' is not in _HI — should fall back to _EN
        result = phrase_engine._static('boot_summary', {'total_online': 5, 'total': 10, 'plural': 's'})
        assert '5' in result
        assert '10' in result
