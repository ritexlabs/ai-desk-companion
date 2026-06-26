from __future__ import annotations

import asyncio
import random
import re
from collections.abc import Awaitable, Callable
from datetime import datetime

from app.dependencies import agent_manager, router_service, metrics_service, wake_word_service
from app.core.config import settings
from app.models.contracts import AgentRequest
from app.services.llm import llm_service
from app.voice.tts import TTSProvider
from app.voice.stt import STTProvider
from app.services.tts_helpers import settings_label

# ── Agent protocol constants ──────────────────────────────────────────────────

AGENT_LABELS: dict[str, str] = {
    'weather':   'Weather',
    'system':    'System',
    'calendar':  'Google Calendar',
    'email':     'Google Email',
    'github':    'GitHub',
    'stock':     'Stock Market',
    'news':      'News',
    'smarthome': 'Smart Home',
    'whatsapp':  'WhatsApp',
    'general':   'General AI',
}

# '__boot__' triggers the agent's built-in boot summary; '' skips the test call
AGENT_BOOT_QUERY: dict[str, str] = {
    'weather':   '__boot__',
    'system':    '__boot__',
    'github':    '__boot__',
    'calendar':  '__boot__',
    'email':     '__boot__',
    'stock':     '__boot__',
    'news':      '__boot__',
    'smarthome': '__boot__',
    'whatsapp':  '__boot__',
    'general':   '',
}

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

# Strips "Foo agent: " / "Foo summary: " prefixes agents sometimes prepend
_AGENT_PREFIX_RE = re.compile(r'^[A-Za-z\s]{2,25}\s+(?:agent|summary)[,:\s]+\s*', re.I)

# Error patterns that indicate an agent is unconfigured or degraded
_ERROR_MARKERS = (
    'no api key', 'not configured', 'not connected',
    'could not', 'error', 'no token', 'expired', 'could not reach',
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def strip_agent_prefix(text: str) -> str:
    return _AGENT_PREFIX_RE.sub('', text).strip()


def is_agent_error(text: str) -> bool:
    t = text.lower()
    return any(m in t for m in _ERROR_MARKERS)


def _time_of_day() -> str:
    h = datetime.now().hour
    if h < 12: return 'Good morning'
    if h < 18: return 'Good afternoon'
    return 'Good evening'


def make_greeting(calling_name: str) -> str:
    return f"{_time_of_day()}, {calling_name}, {random.choice(GREETING_SUFFIXES)}."


def _make_farewell_prompt(name: str) -> str:
    return (
        f'You are {name}, a warm AI voice assistant saying goodbye to your user. '
        'Generate exactly ONE short farewell sentence (10–18 words) that naturally responds '
        'to how the user said goodbye. Match the tone: sleepy if they said goodnight, '
        'casual if they said bye, warm if they said see you. '
        'No markdown, no quotes, plain spoken English only.'
    )


def pick_farewell(text: str) -> str:
    t = text.lower()
    if 'night' in t:
        lines = [l for l in FAREWELL_LINES if 'night' in l.lower() or 'dream' in l.lower()]
        return random.choice(lines) if lines else random.choice(FAREWELL_LINES)
    if 'bye' in t or 'goodbye' in t:
        lines = [l for l in FAREWELL_LINES if 'goodbye' in l.lower() or 'farewell' in l.lower() or 'see you' in l.lower()]
        return random.choice(lines) if lines else random.choice(FAREWELL_LINES)
    return random.choice(FAREWELL_LINES)


async def llm_farewell(phrase: str, llm_config: dict, name: str = 'Robo') -> str:
    """Generate a farewell via LLM; falls back to static pick if LLM is unavailable."""
    if llm_config:
        result = await llm_service.complete(
            phrase,
            llm_config,
            system_prompt=_make_farewell_prompt(name),
            max_tokens=60,
            temperature=0.9,
        )
        if result:
            return result
    return pick_farewell(phrase)


# ── Boot sequence ─────────────────────────────────────────────────────────────
# send_fn  : async (event: str, payload: dict) -> None
# speak_fn : async (event: str, text: str, extra: dict | None, tts: TTSProvider | None) -> None
SendFn  = Callable[[str, dict], Awaitable[None]]
SpeakFn = Callable[[str, str, dict | None, TTSProvider | None], Awaitable[None]]


async def test_agent(agent_id: str) -> tuple[str, str, str]:
    """Health-check a single agent; returns (agent_id, status, message)."""
    label      = AGENT_LABELS.get(agent_id, agent_id.title())
    boot_query = AGENT_BOOT_QUERY.get(agent_id, '')
    if not boot_query:
        return agent_id, 'online', f"{label} agent, online and ready."
    try:
        resp  = await agent_manager.handle(agent_id, AgentRequest(text=boot_query))
        raw   = resp.text
        clean = strip_agent_prefix(raw)
        if is_agent_error(raw):
            return agent_id, 'degraded', f"{label} agent — configuration needed. {clean}"
        return agent_id, 'online', f"{label} agent, online. {clean}"
    except Exception as exc:
        return agent_id, 'failed', f"{label} agent failed to start: {str(exc)[:60]}"


async def boot_sequence(
    send_fn: SendFn,
    speak_fn: SpeakFn,
    calling_name: str,
    registered_agents: list[str],
    tts: TTSProvider,
    stt: STTProvider,
    llm_config: dict,
    agent_config: dict,
    assistant_name: str = 'Robo',
) -> None:
    # System agent always initialises first — it seeds the live clock
    if 'system' not in registered_agents:
        registered_agents = ['system'] + registered_agents
    elif registered_agents[0] != 'system':
        registered_agents = ['system'] + [a for a in registered_agents if a != 'system']

    agent_manager.configure_session(llm_config, agent_config, registered_agents, calling_name, assistant_name)
    router_service.configure_session(llm_config, registered_agents)
    metrics_service.record_session()

    await send_fn('session_config', {
        'tts_provider':      settings_label(tts),
        'stt_provider':      settings_label(stt),
        'wake_word_enabled': settings.wake_word_enabled and wake_word_service.available,
        'wake_word_model':   settings.wake_word_model,
    })
    await send_fn('phase_changed', {'phase': 'wake_detected'})
    await send_fn('phase_changed', {'phase': 'booting'})

    n             = len(registered_agents)
    greeting_task = asyncio.create_task(speak_fn('boot_status', make_greeting(calling_name), None, tts))
    init_task     = asyncio.create_task(agent_manager.initialize_enabled_agents())
    await greeting_task
    await init_task

    for agent_id in registered_agents:
        await send_fn('agent_status_changed', {'agent': agent_id, 'status': 'starting'})

    results: list[tuple[str, str, str]] = await asyncio.gather(
        *[test_agent(agent_id) for agent_id in registered_agents]
    )

    online_count = 0
    for agent_id, status, msg in results:
        if status == 'online':
            online_count += 1
        await speak_fn('boot_status', msg, {'agent_id': agent_id, 'agent_status': status}, tts)
        await send_fn('agent_status_changed', {'agent': agent_id, 'status': status})

    await speak_fn(
        'boot_status',
        f'{online_count} of {n} agent{"s" if n != 1 else ""} online and ready for your command.',
        None,
        tts,
    )
    await send_fn('phase_changed', {'phase': 'ready'})
