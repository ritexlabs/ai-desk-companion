from __future__ import annotations

from app.voice.tts import TTSProvider, OpenAITTSProvider, ElevenLabsTTSProvider
from app.voice.stt import STTProvider, OpenAISTTProvider
from app.dependencies import (
    tts_provider as _default_tts,
    stt_provider as _default_stt,
)

# Per-agent OpenAI TTS voice assignments.
# Only applied when the session TTS provider is OpenAI — gives each agent a distinct voice.
AGENT_VOICES: dict[str, str] = {
    'system':     'echo',
    'weather':    'nova',
    'calendar':   'shimmer',
    'email':      'alloy',
    'github':     'onyx',
    'stock':      'fable',
    'news':       'echo',
    'smarthome':  'alloy',
    'whatsapp':   'nova',
    'portfolio':  'fable',
    'websearch':  'alloy',
    'calculator': 'echo',
    'memory':     'shimmer',
    'briefing':   'nova',
    'general':    'nova',
    'dhan':       'fable',
    'zerodha':    'onyx',
}

# Per-agent default playback speed for OpenAI TTS (0.25–4.0; 1.0 = normal).
# These apply when the frontend sends no per-agent speed override.
_AGENT_SPEEDS: dict[str, float] = {
    'system':     1.05,
    'weather':    1.0,
    'calendar':   1.15,
    'email':      1.0,
    'github':     1.15,
    'stock':      1.15,
    'news':       1.15,
    'smarthome':  1.0,
    'portfolio':  1.15,
    'whatsapp':   1.0,
    'websearch':  1.1,
    'calculator': 1.1,
    'memory':     1.0,
    'briefing':   1.1,
    'general':    1.05,
    'dhan':       1.15,
    'zerodha':    1.15,
}

# Map the frontend speed label to an OpenAI TTS speed float.
_SPEED_TO_FLOAT: dict[str, float] = {
    'slow':   0.9,
    'normal': 1.05,
    'fast':   1.2,
}


def settings_label(provider: object) -> str:
    name = type(provider).__name__
    if name.startswith('Browser'):    return 'browser'
    if name.startswith('OpenAI'):     return 'openai'
    if name.startswith('ElevenLabs'): return 'elevenlabs'
    return 'unknown'


def agent_tts(base_tts: TTSProvider, agent_id: str, session_voices: dict | None = None) -> TTSProvider:
    """Return a TTS provider with the per-agent voice and speed when using OpenAI TTS.

    session_voices: optional dict from start_session payload —
        { agent_id: { 'openai_voice': '<voice>', 'speed': 'slow|normal|fast' }, ... }
    Session values override the hardcoded defaults.
    """
    if not isinstance(base_tts, OpenAITTSProvider):
        return base_tts
    if session_voices and agent_id in session_voices:
        sv    = session_voices[agent_id]
        voice = (sv.get('openai_voice') or '').strip() or AGENT_VOICES.get(agent_id, 'alloy')
        speed = _SPEED_TO_FLOAT.get(sv.get('speed') or '', _AGENT_SPEEDS.get(agent_id, 1.05))
    else:
        voice = AGENT_VOICES.get(agent_id, 'alloy')
        speed = _AGENT_SPEEDS.get(agent_id, 1.05)
    if base_tts._voice == voice and getattr(base_tts, '_speed', None) == speed:
        return base_tts
    return OpenAITTSProvider(base_tts._api_key, voice, base_tts._model, speed)


def build_session_providers(vc: dict) -> tuple[TTSProvider, STTProvider]:
    """Build per-session TTS + STT providers from voice_config sent in start_session.
    Falls back to .env defaults when the UI passes empty or 'browser' values."""
    tts_prov   = vc.get('tts_provider', 'browser')
    stt_prov   = vc.get('stt_provider', 'browser')
    openai_key = (vc.get('openai_api_key') or '').strip()

    if tts_prov == 'openai' and openai_key:
        tts: TTSProvider = OpenAITTSProvider(
            openai_key,
            (vc.get('openai_tts_voice') or 'nova').strip(),
            (vc.get('openai_tts_model') or 'tts-1').strip(),
        )
    elif tts_prov == 'elevenlabs' and (vc.get('elevenlabs_api_key') or '').strip():
        tts = ElevenLabsTTSProvider(
            vc['elevenlabs_api_key'].strip(),
            (vc.get('elevenlabs_voice_id') or 'Rachel').strip(),
        )
    else:
        tts = _default_tts

    if stt_prov == 'openai' and openai_key:
        stt: STTProvider = OpenAISTTProvider(openai_key)
    else:
        stt = _default_stt

    return tts, stt
