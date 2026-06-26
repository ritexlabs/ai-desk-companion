from __future__ import annotations

import base64
import time
from collections import deque

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.dependencies import (
    agent_manager,
    metrics_service,
    wake_word_service,
    tts_provider as _default_tts,
    stt_provider as _default_stt,
)
from app.core.config import settings
from app.models.contracts import AgentRequest
from app.voice.tts import TTSProvider
from app.voice.stt import STTProvider
from app.services.tts_helpers import agent_tts, build_session_providers, settings_label
from app.services.session import (
    AGENT_LABELS,
    AGENT_BOOT_QUERY,
    boot_sequence,
    llm_farewell,
    strip_agent_prefix,
    is_agent_error,
    test_agent,
)

router = APIRouter()

# Active WebSocket connections — used by broadcast() for push events (e.g. wake word)
_connections: set[WebSocket] = set()

# ── Security constants ────────────────────────────────────────────────────────

MAX_INPUT_CHARS = 2000           # Maximum characters accepted per text command
_RATE_LIMIT_CALLS = 20           # Max commands per window
_RATE_LIMIT_WINDOW = 10.0        # Sliding window in seconds


class _RateLimiter:
    """Per-connection sliding-window rate limiter."""

    def __init__(self, max_calls: int, window_sec: float) -> None:
        self._max   = max_calls
        self._win   = window_sec
        self._times: deque[float] = deque()

    def is_allowed(self) -> bool:
        now = time.monotonic()
        while self._times and now - self._times[0] > self._win:
            self._times.popleft()
        if len(self._times) >= self._max:
            return False
        self._times.append(now)
        return True


async def broadcast(event: str, payload: dict) -> None:
    dead: set[WebSocket] = set()
    for ws in list(_connections):
        try:
            await ws.send_json({'event': event, 'payload': payload})
            metrics_service.record_ws_out()
        except Exception:
            dead.add(ws)
    _connections.difference_update(dead)


# ── Per-connection helpers ────────────────────────────────────────────────────

async def _send(ws: WebSocket, event: str, payload: dict | None = None) -> None:
    await ws.send_json({'event': event, 'payload': payload or {}})
    metrics_service.record_ws_out()


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


# ── Command handlers ──────────────────────────────────────────────────────────

async def _handle_text_command(
    ws: WebSocket,
    text: str,
    tts: TTSProvider,
    emit_transcript: bool = True,
    agent_voices: dict | None = None,
) -> None:
    text = text.strip()
    if not text:
        return

    metrics_service.record_command()
    metrics_service.record_ws_in()

    if emit_transcript:
        await _send(ws, 'transcript_final', {'speaker': 'user', 'text': text})
    await _send(ws, 'phase_changed', {'phase': 'thinking'})

    t0 = time.monotonic()
    try:
        response_text, agent_used = await agent_manager.orchestrate(text)
    except Exception as exc:
        metrics_service.record_agent_call('general', (time.monotonic() - t0) * 1000, error=True)
        await _speak_event(ws, 'assistant_speaking', f"I ran into an error: {str(exc)[:80]}", tts=tts)
        await _send(ws, 'assistant_done', {})
        await _send(ws, 'phase_changed', {'phase': 'ready'})
        return

    metrics_service.record_agent_call(agent_used, (time.monotonic() - t0) * 1000)
    await _send(ws, 'route_selected', {'agent': agent_used, 'confidence': 1.0, 'reason': 'llm:orchestrated'})
    await _send(ws, 'phase_changed', {'phase': 'responding'})
    await _speak_event(ws, 'assistant_speaking', response_text, extra={'agent_id': agent_used}, tts=agent_tts(tts, agent_used, agent_voices))
    await _send(ws, 'assistant_done', {})
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

    text = await stt.transcribe(audio_bytes, fmt)
    if not text:
        await _send(ws, 'error', {'message': 'STT could not transcribe audio — please try again.'})
        await _send(ws, 'phase_changed', {'phase': 'ready'})
        return

    metrics_service.record_stt()
    # Echo transcript back — the client applies the wake-word gate before sending a command
    await _send(ws, 'transcript_final', {'speaker': 'user', 'text': text})


async def _handle_retry_agent(ws: WebSocket, agent_id: str, tts: TTSProvider) -> None:
    label = AGENT_LABELS.get(agent_id, agent_id.title())
    await _send(ws, 'agent_status_changed', {'agent': agent_id, 'status': 'starting'})
    boot_query = AGENT_BOOT_QUERY.get(agent_id, '')
    if boot_query:
        _, status, msg = await test_agent(agent_id)
        if status == 'online':
            msg = f"{label} reloaded successfully. {strip_agent_prefix(msg.split('. ', 1)[-1])}"
        elif status == 'degraded':
            msg = f"{label} reloaded — configuration still needed."
        else:
            msg = f"{label} failed to reload."
    else:
        status = 'online'
        msg    = f"{label} is ready."
    await _speak_event(ws, 'boot_status', msg, {'agent_id': agent_id, 'agent_status': status}, tts=tts)
    await _send(ws, 'agent_status_changed', {'agent': agent_id, 'status': status})


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket('/ws')
async def websocket_endpoint(ws: WebSocket) -> None:
    # Enforce Origin: browser clients always send it; empty origin is allowed for
    # local tooling (wscat, tests). Reject only explicitly wrong origins.
    origin = ws.headers.get('origin', '')
    if origin and origin not in set(settings.allowed_origins):
        await ws.close(code=4003, reason='Origin not allowed')
        return

    await ws.accept()
    _connections.add(ws)
    metrics_service.record_ws_in()

    rate_limiter = _RateLimiter(_RATE_LIMIT_CALLS, _RATE_LIMIT_WINDOW)

    await _send(ws, 'connected', {
        'phase':             'standby',
        'version':           '0.1.0',
        'tts_provider':      settings_label(_default_tts),
        'stt_provider':      settings_label(_default_stt),
        'wake_word_enabled': settings.wake_word_enabled and wake_word_service.available,
        'wake_word_model':   settings.wake_word_model,
    })

    session_tts: TTSProvider    = _default_tts
    session_stt: STTProvider    = _default_stt
    session_llm_config: dict    = {}
    session_calling_name: str   = 'Master'
    session_assistant_name: str = 'Robo'
    session_agent_voices: dict  = {}

    # Bind per-connection send/speak callables so session.py has no WS import
    async def send_fn(event: str, payload: dict) -> None:
        await _send(ws, event, payload)

    async def speak_fn(event: str, text: str, extra: dict | None, tts: TTSProvider | None) -> None:
        await _speak_event(ws, event, text, extra, tts)

    try:
        while True:
            data: dict    = await ws.receive_json()
            command: str  = data.get('command', '')
            payload: dict = data.get('payload', {})
            metrics_service.record_ws_in()

            # Rate-limit all user-initiated commands
            if command in ('send_text_command', 'audio_chunk', 'start_session', 'retry_agent'):
                if not rate_limiter.is_allowed():
                    await _send(ws, 'error', {'message': 'Too many requests — please wait a moment.'})
                    continue

            if command == 'start_session':
                calling_name      = payload.get('calling_name', 'Master')
                assistant_name    = payload.get('assistant_name', 'Robo') or 'Robo'
                registered_agents = payload.get('registered_agents', ['weather', 'system'])
                voice_config      = payload.get('voice_config', {})
                llm_config        = payload.get('llm_config', {})
                agent_config      = payload.get('agent_config', {})
                agent_voices      = payload.get('agent_voices', {})
                session_tts, session_stt = build_session_providers(voice_config)
                session_llm_config    = llm_config
                session_calling_name  = calling_name
                session_assistant_name = assistant_name
                session_agent_voices  = agent_voices if isinstance(agent_voices, dict) else {}
                await boot_sequence(
                    send_fn, speak_fn,
                    calling_name, registered_agents,
                    session_tts, session_stt,
                    llm_config, agent_config,
                    assistant_name,
                )

            elif command == 'send_text_command':
                raw_text = payload.get('text', '')[:MAX_INPUT_CHARS]
                await _handle_text_command(ws, raw_text, session_tts, emit_transcript=False, agent_voices=session_agent_voices)

            elif command == 'audio_chunk':
                await _handle_audio_chunk(ws, payload, session_stt, session_tts)

            elif command == 'farewell_session':
                farewell = await llm_farewell(payload.get('phrase', ''), session_llm_config, session_calling_name)
                await _send(ws, 'phase_changed', {'phase': 'responding'})
                await _speak_event(ws, 'assistant_speaking', farewell, tts=session_tts)
                await _send(ws, 'assistant_done', {})
                await agent_manager.shutdown()
                agent_manager.clear_session()
                await _send(ws, 'phase_changed', {'phase': 'sleep'})

            elif command == 'stop_session':
                await agent_manager.shutdown()
                agent_manager.clear_session()
                await _send(ws, 'phase_changed', {'phase': 'sleep'})

            elif command == 'retry_agent':
                agent_id = payload.get('agent', '')
                if agent_id:
                    await _handle_retry_agent(ws, agent_id, session_tts)

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await _send(ws, 'error', {'message': str(exc)})
        except Exception:
            pass
    finally:
        _connections.discard(ws)
