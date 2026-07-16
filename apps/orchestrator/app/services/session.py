from __future__ import annotations

import asyncio
import random
import re
from collections.abc import Awaitable, Callable
from datetime import datetime

from app.dependencies import agent_manager, gateway_client, router_service, metrics_service, wake_word_service
from app.core.config import settings
from app.models.contracts import AgentRequest
from app.services.llm import llm_service
from app.voice.tts import TTSProvider
from app.voice.stt import STTProvider
from app.services.tts_helpers import settings_label, agent_tts

# ── Agent protocol constants ──────────────────────────────────────────────────

AGENT_LABELS: dict[str, str] = {
    'websearch':  'Web Search',
    'calculator': 'Calculator',
    'memory':     'Memory',
    'briefing':   'Briefing',
    'general':    'General AI',
}

# '__boot__' triggers the agent's built-in boot summary; '' skips the test call.
# Only built-in skills that run locally in the orchestrator are listed here.
AGENT_BOOT_QUERY: dict[str, str] = {
    'websearch':  '',
    'calculator': '',
    'memory':     '',
    'briefing':   '',
    'general':    '',
}

# All external integrations are served by the MCP Gateway.
# Key: frontend agent ID  →  Value: gateway server namespace
_GATEWAY_AGENT_MAP: dict[str, str] = {
    'weather':   'weather',
    'system':    'system',
    'calendar':  'google',
    'email':     'google',
    'github':    'github',
    'stock':     'stocks',
    'news':      'news',
    'portfolio': 'indmoney',
    'smarthome': 'smarthome',
    'whatsapp':  'whatsapp',
}

# Human-readable labels for gateway-served agents (used in boot messages)
_GATEWAY_LABELS: dict[str, str] = {
    'weather':   'Weather',
    'system':    'System',
    'calendar':  'Google Calendar',
    'email':     'Google Email',
    'github':    'GitHub',
    'stock':     'Stock Market',
    'news':      'News',
    'portfolio': 'Portfolio',
    'smarthome': 'Smart Home',
    'whatsapp':  'WhatsApp',
}

# Randomised phrases for gateway-level events
_GW_CONNECT_PHRASES = [
    'MCP gateway link established — tool matrix online.',
    'Secure tunnel to tool gateway confirmed — all channels open.',
    'Gateway handshake complete — external services armed.',
    'MCP bridge authenticated — routing layer active.',
    'Tool aggregator online — gateway API responding.',
    'Gateway protocol negotiated — data pipelines hot.',
    'Control plane connected — gateway ready to route.',
    'MCP transport layer up — tool mesh online.',
]

_GW_FAIL_PHRASES = [
    'MCP gateway unreachable — tool network dark.',
    'Gateway link failed — external tools suspended.',
    'No response from MCP gateway — tool services offline.',
    'Gateway connection dropped — reverting to local agents.',
    'MCP bridge down — gateway tools unavailable.',
    'Handshake timeout — gateway unreachable on port 8788.',
    'Tool aggregator not responding — gateway circuit open.',
    'MCP control plane silent — external services suspended.',
]

# Per-agent phrases when gateway is online — {label} is substituted at runtime.
# Kept dash-free so a live snippet can be appended as "— {data}."
_GW_AGENT_ONLINE_PHRASES = [
    '{label} module synchronized and online.',
    '{label} integration confirmed, link active.',
    '{label} service handshake complete.',
    '{label} pipeline connected and streaming.',
    '{label} bridge authenticated, ready to serve.',
    '{label} online, endpoints responding.',
    '{label} channel open and standing by.',
    '{label} node connected, live feed established.',
    '{label} interface wired and ready.',
    '{label} subsystem nominal, stream open.',
]

# Per-agent boot call: (gateway tool name, arguments)
_GW_BOOT_CALLS: dict[str, tuple[str, dict]] = {
    'weather':   ('weather__get_current_weather',    {'query': 'current weather'}),
    'stock':     ('stocks__get_quote',               {'query': 'Nifty 50'}),
    'news':      ('news__get_news',                  {'query': 'top news today'}),
    'github':    ('github__get_summary',             {}),
    'calendar':  ('google__get_calendar_events',     {'query': 'next event'}),
    'email':     ('google__get_emails',              {'query': 'unread emails'}),
    'system':    ('system__get_system_info',         {'query': 'system status'}),
    'portfolio': ('indmoney__query_portfolio',       {'query': 'portfolio overview'}),
    'smarthome': ('smarthome__system_overview',      {}),
    'whatsapp':  ('whatsapp__get_status',            {}),
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
    'connection lost', 'unreachable', 'failed',
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def strip_agent_prefix(text: str) -> str:
    return _AGENT_PREFIX_RE.sub('', text).strip()


def is_agent_error(text: str) -> bool:
    t = text.lower()
    return any(m in t for m in _ERROR_MARKERS)


# ── Boot snippet extractors (one per gateway agent) ───────────────────────────

def _snip_weather(raw: str) -> str:
    # "In Mumbai, India: partly cloudy, 32°C. Humidity 72%, wind 20 km/h."
    m = re.search(r'In ([^:]+):\s*([^,]+),\s*(\d+)°C', raw)
    if m:
        city = m.group(1).split(',')[0].strip()
        return f'{city} {m.group(3)}°C, {m.group(2).strip()}'
    return raw.split('.')[0][:55]

def _snip_stock(raw: str) -> str:
    # "NIFTY 50 — ₹24,100.50  +₹150.20 (+0.62%)"
    first = raw.split('\n')[0]
    m = re.search(r'—\s*(\S+)\s+.*?(\([+-][\d.]+%\))', first)
    if m:
        return f'Nifty {m.group(1)} {m.group(2)}'
    return first[:55]

def _snip_news(raw: str) -> str:
    # "Top headlines from India:\n1. Headline (Source · date)\n   desc"
    for line in raw.split('\n')[1:]:
        line = line.strip()
        if line and line[0].isdigit():
            text = re.sub(r'^\d+\.\s*', '', line)
            text = re.sub(r'\s*\([^)]+\)\s*$', '', text)
            return text[:65]
    return raw[:55]

def _snip_github(raw: str) -> str:
    # "3 pull requests awaiting your review and 5 unread notifications."
    return raw.split('.')[0][:75]

def _snip_calendar(raw: str) -> str:
    # "Next event: 'Team standup' at 10:00 AM." or "No upcoming events."
    return raw.split('\n')[0][:75]

def _snip_email(raw: str) -> str:
    # "12 unread emails — 'Sub1', ..."
    m = re.match(r'(\d+ (?:unread|important) emails?)', raw)
    if m:
        return m.group(1)
    if 'no unread' in raw.lower() or 'inbox is clear' in raw.lower():
        return 'inbox clear'
    return raw.split('.')[0][:55]

def _snip_system(raw: str) -> str:
    # Multi-line — extract CPU % and RAM %
    cpu = re.search(r'CPU usage:\s*([\d.]+)%', raw)
    ram = re.search(r'\((\d+)% used', raw)
    parts = []
    if cpu: parts.append(f'CPU {cpu.group(1)}%')
    if ram: parts.append(f'RAM {ram.group(1)}%')
    return ' · '.join(parts) if parts else raw.split('\n')[0][:50]

def _snip_portfolio(raw: str) -> str:
    text = str(raw).strip()
    if text.startswith(('{', '[')):
        return ''
    for line in text.split('\n'):
        line = line.strip()
        if line and not is_agent_error(line):
            return line[:70]
    return ''

def _snip_smarthome(raw: str) -> str:
    # Gateway returns a dict — may arrive as dict, JSON string, or Python repr string
    import json as _json, ast as _ast
    if isinstance(raw, dict):
        data = raw
    else:
        try:
            data = _json.loads(raw)
        except Exception:
            try:
                data = _ast.literal_eval(raw)
            except Exception:
                return str(raw).split('.')[0][:55]
    location = data.get('location_name', 'Home')
    total    = data.get('total_entities', '?')
    domains  = data.get('domain_count', '?')
    return f'{location} — {total} entities, {domains} domains'

def _snip_whatsapp(raw: str) -> str:
    # "Connected — +91... (Name). N messages received this session."
    return str(raw).split('.')[0][:65]

_GW_SNIP_FN: dict[str, Callable[[str], str]] = {
    'weather':   _snip_weather,
    'stock':     _snip_stock,
    'news':      _snip_news,
    'github':    _snip_github,
    'calendar':  _snip_calendar,
    'email':     _snip_email,
    'system':    _snip_system,
    'portfolio': _snip_portfolio,
    'smarthome': _snip_smarthome,
    'whatsapp':  _snip_whatsapp,
}


async def _fetch_boot_snippet(agent_id: str) -> str:
    """Call the agent's boot tool and return a short live-data snippet, or '' on any failure."""
    call = _GW_BOOT_CALLS.get(agent_id)
    if not call:
        return ''
    tool_name, args = call
    try:
        raw = await asyncio.wait_for(
            gateway_client.call_tool(tool_name, args),
            timeout=5.0,
        )
        if not raw:
            return ''
        # Serialize dicts/lists as JSON so snippet fns get valid JSON strings
        import json as _json
        text = _json.dumps(raw) if isinstance(raw, (dict, list)) else str(raw)
        if is_agent_error(text):
            return ''
        fn = _GW_SNIP_FN.get(agent_id)
        return fn(text) if fn else text[:55]
    except Exception:
        return ''


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


# Built-in skills that are always available regardless of user configuration
_ALWAYS_ON_SKILLS = ('websearch', 'calculator', 'memory', 'briefing')


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
    agent_voices: dict | None = None,
) -> None:
    # Auto-inject built-in skills at the end
    for skill in _ALWAYS_ON_SKILLS:
        if skill not in registered_agents:
            registered_agents = registered_agents + [skill]

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

    greeting_task = asyncio.create_task(speak_fn('boot_status', make_greeting(calling_name), None, tts))
    init_task     = asyncio.create_task(agent_manager.initialize_enabled_agents())
    await greeting_task
    await init_task

    skill_ids = set(_ALWAYS_ON_SKILLS)

    # Separate registered agents into gateway-served vs locally-managed
    gateway_ids = [a for a in registered_agents if a in _GATEWAY_AGENT_MAP and a not in skill_ids]
    local_ids   = [a for a in registered_agents if a not in _GATEWAY_AGENT_MAP and a not in skill_ids]
    silent_skills = [a for a in registered_agents if a in skill_ids]

    # Broadcast 'starting' for every agent the frontend knows about
    for agent_id in registered_agents:
        await send_fn('agent_status_changed', {'agent': agent_id, 'status': 'starting'})

    # Check gateway health once
    gw_ok = False
    try:
        gw_health = await gateway_client.health()
        gw_ok = gw_health.get('status') == 'ok'
    except Exception:
        pass

    # ── Gateway-served agents ─────────────────────────────────────────────────
    gw_online = 0
    if gateway_ids:
        gw_phrase = random.choice(_GW_CONNECT_PHRASES if gw_ok else _GW_FAIL_PHRASES)
        await speak_fn('boot_status', gw_phrase, None, agent_tts(tts, 'general', agent_voices))

    # Fetch live snippets for all online gateway agents in parallel
    if gw_ok and gateway_ids:
        snippets = await asyncio.gather(*[_fetch_boot_snippet(a) for a in gateway_ids])
        snippet_map = dict(zip(gateway_ids, snippets))
    else:
        snippet_map = {}

    for agent_id in gateway_ids:
        status = 'online' if gw_ok else 'degraded'
        if gw_ok:
            gw_online += 1
            label = _GATEWAY_LABELS.get(agent_id, agent_id.title())
            base  = random.choice(_GW_AGENT_ONLINE_PHRASES).format(label=label)
            snip  = snippet_map.get(agent_id, '')
            msg   = f'{base.rstrip(".")} — {snip}.' if snip else base
            await speak_fn(
                'boot_status', msg,
                {'agent_id': agent_id, 'agent_status': status},
                agent_tts(tts, agent_id, agent_voices),
            )
        await send_fn('agent_status_changed', {'agent': agent_id, 'status': status})

    # ── Local built-in agents (websearch, calculator, memory, briefing, general) ─
    results: list[tuple[str, str, str]] = await asyncio.gather(
        *[test_agent(agent_id) for agent_id in local_ids]
    )

    local_online = 0
    for agent_id, status, msg in results:
        if status == 'online':
            local_online += 1
        await speak_fn(
            'boot_status', msg,
            {'agent_id': agent_id, 'agent_status': status},
            agent_tts(tts, agent_id, agent_voices),
        )
        await send_fn('agent_status_changed', {'agent': agent_id, 'status': status})

    # Mark built-in skills online silently
    for agent_id in silent_skills:
        await send_fn('agent_status_changed', {'agent': agent_id, 'status': 'online'})

    # Final summary
    total_online = gw_online + local_online
    total_configured = len(gateway_ids) + len(local_ids)
    await speak_fn(
        'boot_status',
        f'{total_online} of {total_configured} service{"s" if total_configured != 1 else ""} online and ready for your command.',
        None,
        agent_tts(tts, 'general', agent_voices),
    )
    await send_fn('phase_changed', {'phase': 'ready'})
