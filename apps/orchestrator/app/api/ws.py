from __future__ import annotations

import asyncio
import base64
import random
import re
import time
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.dependencies import (
    agent_manager,
    router_service,
    metrics_service,
    wake_word_service,
    tts_provider as _default_tts,
    stt_provider as _default_stt,
)
from app.core.config import settings
from app.models.contracts import AgentRequest
from app.services.tts import TTSProvider, BrowserTTSProvider, OpenAITTSProvider, ElevenLabsTTSProvider

# ── Per-agent OpenAI TTS voice assignments ────────────────────────────────────
# Only applied when session TTS is OpenAI — gives each agent a distinct voice.
AGENT_VOICES: dict[str, str] = {
    'system':   'echo',     # clear, neutral — good for technical data
    'weather':  'nova',     # warm, natural
    'calendar': 'shimmer',  # soft, organised
    'email':    'alloy',    # balanced, professional
    'github':   'onyx',     # deeper, tech
    'stock':    'fable',    # expressive, financial
    'news':     'echo',     # clear, newsreader
    'general':  'nova',     # default LLM voice
}
from app.services.stt import STTProvider, BrowserSTTProvider, OpenAISTTProvider

router = APIRouter()

# ── active WebSocket connections (for broadcast) ─────────────────────────────
_connections: set[WebSocket] = set()


async def broadcast(event: str, payload: dict) -> None:
    """Send an event to every currently-connected WebSocket client."""
    dead: set[WebSocket] = set()
    for ws in list(_connections):
        try:
            await ws.send_json({'event': event, 'payload': payload})
            metrics_service.record_ws_out()
        except Exception:
            dead.add(ws)
    _connections.difference_update(dead)


# ── constants ─────────────────────────────────────────────────────────────────

AGENT_LABELS: dict[str, str] = {
    'weather':  'Weather',
    'system':   'System',
    'calendar': 'Google Calendar',
    'email':    'Google Email',
    'github':   'GitHub',
    'stock':    'Stock Market',
    'news':     'News',
    'general':  'General AI',
}

# Natural spoken name for each agent — used in "I'm the X agent" prefix
AGENT_SPOKEN_NAME: dict[str, str] = {
    'weather':  'Weather',
    'system':   'System',
    'calendar': 'Calendar',
    'email':    'Email',
    'github':   'GitHub',
    'stock':    'Stock Market',
    'news':     'News',
    'general':  'General AI',
}

# Test prompt sent to each agent during boot to verify real data
AGENT_BOOT_QUERY: dict[str, str] = {
    'weather':  '__boot__',
    'system':   '__boot__',
    'github':   '__boot__',
    'calendar': '__boot__',
    'email':    '__boot__',
    'stock':    '__boot__',
    'news':     '__boot__',
    'general':  '',   # skip — no LLM call on boot; just announce ready
}

# Regex to strip "Foo agent: " / "Foo summary: " prefixes agents add to their own text
_AGENT_PREFIX_RE = re.compile(r'^[A-Za-z\s]{2,25}\s+(?:agent|summary)[,:\s]+\s*', re.I)


def _strip_agent_prefix(text: str) -> str:
    return _AGENT_PREFIX_RE.sub('', text).strip()


def _is_agent_error(text: str) -> bool:
    """Detect 'not configured / no credentials / error' patterns in agent responses."""
    markers = ('no api key', 'not configured', 'not connected', 'could not', 'error', 'no token')
    return any(m in text.lower() for m in markers)

GREETING_SUFFIXES = [
    'wonderful to have you back',
    'your systems are all online and ready',
    'all agents are standing by for your command',
    "I've been waiting for you",
    'ready to assist you at full capacity',
    "it's great to have you back online",
    'everything is looking good on my end',
    'fully operational and at your command',
    "let's make this a productive session",
    'your personal AI is fired up and ready',
    'running at peak performance, ready when you are',
    'all systems nominal, awaiting your instructions',
    'I have everything ready and waiting for you',
]

FAREWELL_LINES = [
    "Goodbye! Have a wonderful day.",
    "Take care! I'll be here when you need me.",
    "Goodnight! Rest well.",
    "Farewell! It was a pleasure assisting you.",
    "See you soon! Powering down now.",
    "Goodbye! Don't hesitate to wake me up anytime.",
    "Goodnight! Sweet dreams.",
    "Until next time! Take care of yourself.",
    "Signing off now. Goodbye!",
    "It was great working with you. Goodbye!",
]


def _pick_farewell(text: str) -> str:
    """Pick a contextually appropriate farewell based on the sleep phrase used."""
    t = text.lower()
    if 'night' in t:
        night_lines = [l for l in FAREWELL_LINES if 'night' in l.lower() or 'dream' in l.lower()]
        return random.choice(night_lines) if night_lines else random.choice(FAREWELL_LINES)
    if 'bye' in t or 'goodbye' in t:
        bye_lines = [l for l in FAREWELL_LINES if 'goodbye' in l.lower() or 'farewell' in l.lower() or 'see you' in l.lower()]
        return random.choice(bye_lines) if bye_lines else random.choice(FAREWELL_LINES)
    return random.choice(FAREWELL_LINES)


# ── helpers ───────────────────────────────────────────────────────────────────

def _time_of_day() -> str:
    h = datetime.now().hour
    if h < 12: return 'Good morning'
    if h < 18: return 'Good afternoon'
    return 'Good evening'


def _greeting(calling_name: str) -> str:
    return f"{_time_of_day()}, {calling_name}, {random.choice(GREETING_SUFFIXES)}."


async def _send(ws: WebSocket, event: str, payload: dict | None = None) -> None:
    await ws.send_json({'event': event, 'payload': payload or {}})
    metrics_service.record_ws_out()


def _agent_tts(base_tts: TTSProvider, agent_id: str) -> TTSProvider:
    """Return a TTS provider with the per-agent voice when using OpenAI TTS."""
    if not isinstance(base_tts, OpenAITTSProvider):
        return base_tts
    voice = AGENT_VOICES.get(agent_id, 'alloy')
    if base_tts._voice == voice:
        return base_tts
    return OpenAITTSProvider(base_tts._api_key, voice, base_tts._model)


def _build_session_providers(vc: dict) -> tuple[TTSProvider, STTProvider]:
    """Build per-session TTS + STT providers from the voice_config sent with start_session.
    Falls back to .env defaults when the UI passes empty or 'browser' values."""
    tts_prov  = vc.get('tts_provider', 'browser')
    stt_prov  = vc.get('stt_provider', 'browser')
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


async def _speak_event(
    ws: WebSocket,
    event: str,
    text: str,
    extra: dict | None = None,
    tts: TTSProvider | None = None,
) -> None:
    provider = tts if tts is not None else _default_tts
    payload: dict = {**(extra or {}), 'message' if event == 'boot_status' else 'text': text}

    if provider.available:
        audio = await provider.synthesize(text)
        if audio:
            metrics_service.record_tts()
            payload['audio_b64']    = base64.b64encode(audio).decode()
            payload['audio_format'] = provider.format

    await _send(ws, event, payload)


# ── boot sequence ─────────────────────────────────────────────────────────────

async def _boot_sequence(
    ws: WebSocket,
    calling_name: str,
    registered_agents: list[str],
    tts: TTSProvider,
    stt: STTProvider,
    llm_config: dict,
    agent_config: dict,
) -> None:
    # System agent always boots first — it seeds the live clock for all other agents
    if 'system' not in registered_agents:
        registered_agents = ['system'] + registered_agents
    elif registered_agents[0] != 'system':
        registered_agents = ['system'] + [a for a in registered_agents if a != 'system']

    agent_manager.configure_session(llm_config, agent_config, registered_agents)
    router_service.configure_session(llm_config, registered_agents)
    metrics_service.record_session()

    await _send(ws, 'session_config', {
        'tts_provider':      settings_label(tts),
        'stt_provider':      settings_label(stt),
        'wake_word_enabled': settings.wake_word_enabled and wake_word_service.available,
        'wake_word_model':   settings.wake_word_model,
    })

    await _send(ws, 'phase_changed', {'phase': 'wake_detected'})
    await asyncio.sleep(0.05)
    await _send(ws, 'phase_changed', {'phase': 'booting'})
    await asyncio.sleep(0.05)

    await _speak_event(ws, 'boot_status', _greeting(calling_name), tts=tts)
    await asyncio.sleep(0.05)

    n = len(registered_agents)
    await _speak_event(ws, 'boot_status', f'Starting {n} agent{"s" if n != 1 else ""}.', tts=tts)
    await asyncio.sleep(0.05)

    await agent_manager.initialize_enabled_agents()

    online_count = 0
    for agent_id in registered_agents:
        label = AGENT_LABELS.get(agent_id, agent_id.title())
        await _send(ws, 'agent_status_changed', {'agent': agent_id, 'status': 'starting'})
        await _speak_event(ws, 'boot_status', f'Starting agent {label}.', {'agent_id': agent_id}, tts=tts)
        await asyncio.sleep(0.05)

        boot_query = AGENT_BOOT_QUERY.get(agent_id, '')
        if boot_query:
            try:
                test_resp = await agent_manager.handle(agent_id, AgentRequest(text=boot_query))
                raw = test_resp.text
                clean = _strip_agent_prefix(raw)
                if _is_agent_error(raw):
                    status = 'degraded'
                    msg = f"{label} agent — configuration needed. {clean}"
                else:
                    status = 'online'
                    online_count += 1
                    msg = f"{label} agent, online. {clean}"
            except Exception as exc:
                status = 'failed'
                msg = f"{label} agent failed to start: {str(exc)[:60]}"
        else:
            # General AI: skip real call, just announce ready
            status = 'online'
            online_count += 1
            msg = f"{label} agent, online and ready."

        # Boot messages use the session voice for uniformity.
        # Per-agent voices only apply when the agent responds to a real query.
        await _speak_event(
            ws, 'boot_status', msg,
            {'agent_id': agent_id, 'agent_status': status},
            tts=tts,
        )
        await _send(ws, 'agent_status_changed', {'agent': agent_id, 'status': status})
        await asyncio.sleep(0.05)

    await _speak_event(
        ws, 'boot_status',
        f'{online_count} of {n} agent{"s" if n != 1 else ""} online and ready for your command.',
        tts=tts,
    )
    await asyncio.sleep(0.05)
    await _send(ws, 'phase_changed', {'phase': 'ready'})


# ── command handlers ──────────────────────────────────────────────────────────

async def _handle_text_command(
    ws: WebSocket,
    text: str,
    tts: TTSProvider,
    emit_transcript: bool = True,
) -> None:
    text = text.strip()
    if not text:
        return

    metrics_service.record_command()
    metrics_service.record_ws_in()

    if emit_transcript:
        await _send(ws, 'transcript_final', {'speaker': 'user', 'text': text})
    await _send(ws, 'phase_changed', {'phase': 'thinking'})
    await asyncio.sleep(0.05)

    t0 = time.monotonic()
    try:
        response_text, agent_used = await agent_manager.orchestrate(text)
    except Exception as exc:
        metrics_service.record_agent_call('general', (time.monotonic() - t0) * 1000, error=True)
        await _speak_event(ws, 'assistant_speaking', f"I ran into an error: {str(exc)[:80]}", tts=tts)
        await asyncio.sleep(0.05)
        await _send(ws, 'assistant_done', {})
        await asyncio.sleep(0.05)
        await _send(ws, 'phase_changed', {'phase': 'ready'})
        return

    metrics_service.record_agent_call(agent_used, (time.monotonic() - t0) * 1000)
    await _send(ws, 'route_selected', {'agent': agent_used, 'confidence': 1.0, 'reason': 'llm:orchestrated'})
    await asyncio.sleep(0.05)
    await _send(ws, 'phase_changed', {'phase': 'responding'})

    await _speak_event(ws, 'assistant_speaking', response_text, tts=_agent_tts(tts, agent_used))
    await asyncio.sleep(0.05)
    await _send(ws, 'assistant_done', {})
    await asyncio.sleep(0.05)
    await _send(ws, 'phase_changed', {'phase': 'ready'})


async def _handle_audio_chunk(ws: WebSocket, payload: dict, stt: STTProvider, tts: TTSProvider) -> None:
    if not stt.available:
        await _send(ws, 'error', {'message': 'No STT provider configured on the server.'})
        return

    data_b64: str = payload.get('data_b64', '')
    fmt: str      = payload.get('format', 'webm')
    if not data_b64:
        return

    try:
        audio_bytes = base64.b64decode(data_b64)
    except Exception:
        await _send(ws, 'error', {'message': 'Invalid base64 audio data.'})
        return

    await _send(ws, 'phase_changed', {'phase': 'thinking'})
    text = await stt.transcribe(audio_bytes, fmt)

    if not text:
        await _send(ws, 'error', {'message': 'STT could not transcribe audio — please try again.'})
        await _send(ws, 'phase_changed', {'phase': 'ready'})
        return

    metrics_service.record_stt()
    await _send(ws, 'transcript_final', {'speaker': 'user', 'text': text})
    await _handle_text_command(ws, text, tts, emit_transcript=False)


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket('/ws')
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    _connections.add(ws)
    metrics_service.record_ws_in()

    await _send(ws, 'connected', {
        'phase':               'standby',
        'version':             '0.1.0',
        'tts_provider':        settings_label(_default_tts),
        'stt_provider':        settings_label(_default_stt),
        'wake_word_enabled':   settings.wake_word_enabled and wake_word_service.available,
        'wake_word_model':     settings.wake_word_model,
    })

    # Per-session providers — updated from start_session voice_config
    session_tts: TTSProvider = _default_tts
    session_stt: STTProvider = _default_stt

    try:
        while True:
            data: dict     = await ws.receive_json()
            command: str   = data.get('command', '')
            payload: dict  = data.get('payload', {})
            metrics_service.record_ws_in()

            if command == 'start_session':
                calling_name: str        = payload.get('calling_name', 'Master')
                registered_agents: list  = payload.get('registered_agents', ['weather', 'system'])
                voice_config: dict       = payload.get('voice_config', {})
                llm_config: dict         = payload.get('llm_config', {})
                agent_config: dict       = payload.get('agent_config', {})
                session_tts, session_stt = _build_session_providers(voice_config)
                await _boot_sequence(
                    ws, calling_name, registered_agents,
                    session_tts, session_stt,
                    llm_config, agent_config,
                )

            elif command == 'send_text_command':
                # emit_transcript=False: UI already added the user turn before sending
                await _handle_text_command(ws, payload.get('text', ''), session_tts, emit_transcript=False)

            elif command == 'audio_chunk':
                await _handle_audio_chunk(ws, payload, session_stt, session_tts)

            elif command == 'farewell_session':
                farewell = _pick_farewell(payload.get('phrase', ''))
                await _send(ws, 'phase_changed', {'phase': 'responding'})
                await _speak_event(ws, 'assistant_speaking', farewell, tts=session_tts)
                await asyncio.sleep(0.1)
                await _send(ws, 'assistant_done', {})
                await agent_manager.shutdown()
                await _send(ws, 'phase_changed', {'phase': 'sleep'})

            elif command == 'stop_session':
                await agent_manager.shutdown()
                await _send(ws, 'phase_changed', {'phase': 'sleep'})

            elif command == 'retry_agent':
                agent_id: str = payload.get('agent', '')
                if agent_id:
                    label = AGENT_LABELS.get(agent_id, agent_id.title())
                    await _send(ws, 'agent_status_changed', {'agent': agent_id, 'status': 'starting'})
                    boot_query = AGENT_BOOT_QUERY.get(agent_id, '')
                    if boot_query:
                        try:
                            test_resp = await agent_manager.handle(agent_id, AgentRequest(text=boot_query))
                            raw   = test_resp.text
                            clean = _strip_agent_prefix(raw)
                            if _is_agent_error(raw):
                                status = 'degraded'
                                msg = f"{label} reloaded — configuration still needed. {clean}"
                            else:
                                status = 'online'
                                msg = f"{label} reloaded successfully. {clean}"
                        except Exception as exc:
                            status = 'failed'
                            msg = f"{label} failed to reload: {str(exc)[:60]}"
                    else:
                        status = 'online'
                        msg = f"{label} is ready."
                    await _speak_event(
                        ws, 'boot_status', msg,
                        {'agent_id': agent_id, 'agent_status': status},
                        tts=session_tts,
                    )
                    await _send(ws, 'agent_status_changed', {'agent': agent_id, 'status': status})

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await _send(ws, 'error', {'message': str(exc)})
        except Exception:
            pass
    finally:
        _connections.discard(ws)


# ── utility ───────────────────────────────────────────────────────────────────

def settings_label(provider: object) -> str:
    name = type(provider).__name__
    if name.startswith('Browser'):    return 'browser'
    if name.startswith('OpenAI'):     return 'openai'
    if name.startswith('ElevenLabs'): return 'elevenlabs'
    return 'unknown'
