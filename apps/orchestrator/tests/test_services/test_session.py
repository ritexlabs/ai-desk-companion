from __future__ import annotations

import pytest

from app.services.session import (
    FAREWELL_LINES,
    GREETING_SUFFIXES,
    is_agent_error,
    make_greeting,
    pick_farewell,
    strip_agent_prefix,
)


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
        # is_agent_error lower-cases before matching; check that casing doesn't matter
        assert is_agent_error("NOT CONFIGURED")       # contains "not configured"
        assert is_agent_error("No API Key found")     # contains "no api key"


# ── make_greeting ─────────────────────────────────────────────────────────────

class TestMakeGreeting:
    def test_contains_calling_name(self):
        assert "Alice" in make_greeting("Alice")

    def test_ends_with_period(self):
        assert make_greeting("Master").endswith(".")

    def test_contains_time_of_day_phrase(self):
        greeting = make_greeting("Ritesh")
        time_phrases = ("Good morning", "Good afternoon", "Good evening")
        assert any(p in greeting for p in time_phrases)

    def test_contains_a_suffix_from_list(self):
        greeting = make_greeting("Test")
        assert any(suffix in greeting for suffix in GREETING_SUFFIXES)

    def test_different_names_work(self):
        for name in ("Master", "Boss", "User"):
            g = make_greeting(name)
            assert name in g


# ── pick_farewell ─────────────────────────────────────────────────────────────

class TestPickFarewell:
    def test_night_farewell_is_nighttime_line(self):
        result = pick_farewell("Good night Robo")
        night_lines = [l for l in FAREWELL_LINES if 'night' in l.lower() or 'dream' in l.lower()]
        assert result in night_lines, f"Expected a night line, got: {result!r}"

    def test_goodbye_farewell_is_goodbye_line(self):
        result = pick_farewell("Goodbye Robo")
        goodbye_lines = [
            l for l in FAREWELL_LINES
            if any(w in l.lower() for w in ('goodbye', 'farewell', 'see you'))
        ]
        assert result in goodbye_lines, f"Expected a goodbye line, got: {result!r}"

    def test_bye_farewell_is_from_list(self):
        result = pick_farewell("Bye")
        assert result in FAREWELL_LINES

    def test_generic_farewell_is_from_list(self):
        result = pick_farewell("See you later")
        assert result in FAREWELL_LINES

    def test_empty_phrase_returns_something(self):
        result = pick_farewell("")
        assert result in FAREWELL_LINES
