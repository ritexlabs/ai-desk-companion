from __future__ import annotations

import pytest

from app.services.tts_helpers import AGENT_VOICES, agent_tts, settings_label
from app.voice.tts import BrowserTTSProvider, ElevenLabsTTSProvider, OpenAITTSProvider


# ── settings_label ────────────────────────────────────────────────────────────

class TestSettingsLabel:
    def test_openai_provider_returns_openai(self):
        provider = OpenAITTSProvider("fake-key", "nova", "tts-1")
        assert settings_label(provider) == 'openai'

    def test_elevenlabs_provider_returns_elevenlabs(self):
        provider = ElevenLabsTTSProvider("fake-key", "Rachel")
        assert settings_label(provider) == 'elevenlabs'

    def test_browser_provider_returns_browser(self):
        provider = BrowserTTSProvider()
        assert settings_label(provider) == 'browser'

    def test_unknown_type_returns_unknown(self):
        class RandomProvider:
            pass
        assert settings_label(RandomProvider()) == 'unknown'


# ── agent_tts ─────────────────────────────────────────────────────────────────

class TestAgentTts:
    def test_non_openai_provider_returned_unchanged(self):
        browser = BrowserTTSProvider()
        result = agent_tts(browser, 'weather')
        assert result is browser

    def test_elevenlabs_provider_returned_unchanged(self):
        elabs = ElevenLabsTTSProvider("key", "Rachel")
        result = agent_tts(elabs, 'weather')
        assert result is elabs

    def test_openai_same_voice_returns_same_instance(self):
        voice = AGENT_VOICES.get('weather', 'alloy')
        base  = OpenAITTSProvider("key", voice, "tts-1")
        result = agent_tts(base, 'weather')
        assert result is base

    def test_openai_different_voice_returns_new_instance(self):
        # system → 'echo', weather → 'nova': different agents have different voices
        base   = OpenAITTSProvider("key", "echo", "tts-1")
        result = agent_tts(base, 'weather')
        # weather voice is 'nova', base has 'echo' → new provider created
        assert result is not base
        assert isinstance(result, OpenAITTSProvider)

    def test_openai_unknown_agent_falls_back_to_alloy(self):
        base   = OpenAITTSProvider("key", "echo", "tts-1")
        result = agent_tts(base, 'unknown_xyz')
        assert isinstance(result, OpenAITTSProvider)

    def test_agent_voices_map_has_core_agents(self):
        for agent in ('system', 'weather', 'calendar', 'email', 'github', 'stock', 'news', 'general'):
            assert agent in AGENT_VOICES
