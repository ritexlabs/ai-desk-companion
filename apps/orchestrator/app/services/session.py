from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Awaitable, Callable
from datetime import datetime

from app.dependencies import agent_manager, gateway_client, router_service, metrics_service, wake_word_service
from app.core.config import settings
from app.models.contracts import AgentRequest
from app.services.phrases import phrase_engine
from app.voice.tts import TTSProvider
from app.voice.stt import STTProvider
from app.services.tts_helpers import settings_label, agent_tts

# ── Agent protocol constants ──────────────────────────────────────────────────

AGENT_LABELS: dict[str, str] = {
    'websearch':  'Web Search',
    'calculator': 'Calculator',
    'memory':     'Memory',
    'briefing':   'Briefing',
    'notes':      'Notes & Reminders',
    'general':    'General AI',
}

# '__boot__' triggers the agent's built-in boot summary; '' skips the test call.
# Only built-in skills that run locally in the orchestrator are listed here.
AGENT_BOOT_QUERY: dict[str, str] = {
    'websearch':  '',
    'calculator': '',
    'memory':     '',
    'briefing':   '',
    'notes':      '',
    'general':    '',
}

# All external integrations are served by the MCP Gateway.
# Key: frontend agent ID  →  Value: gateway server namespace
_GATEWAY_AGENT_MAP: dict[str, str] = {
    'weather':     'weather',
    'system':      'system',
    'calendar':    'google',
    'email':       'google',
    'github':      'github',
    'stock':       'stocks',
    'news':        'news',
    'portfolio':   'indmoney',
    'smarthome':   'smarthome',
    'whatsapp':    'whatsapp',
    'socialmedia': 'socialmedia',
    'dhan':        'dhan',
    'zerodha':     'zerodha',
}

# Per-session credentials stored so reload_agent can re-push to the gateway
_session_google_access_token:  str = ''
_session_google_refresh_token: str = ''

_session_smarthome_endpoint: str = ''
_session_smarthome_token:    str = ''

_session_weather_api_key:    str = ''
_session_weather_city:       str = ''
_session_weather_provider:   str = ''

_session_github_token: str = ''

_session_news_api_key: str = ''
_session_news_country: str = ''

_session_whatsapp_phone_id:    str = ''
_session_whatsapp_token:       str = ''
_session_whatsapp_verify:      str = ''
_session_whatsapp_contacts:    str = ''

_session_portfolio_client_id:     str = ''
_session_portfolio_client_secret: str = ''
_session_portfolio_access_token:  str = ''
_session_portfolio_refresh_token: str = ''
_session_portfolio_expires_at:    int = 0

_session_socialmedia_accounts: str = ''

_session_dhan_trade_enabled:    bool = False
_session_zerodha_trade_enabled: bool = False

# Human-readable labels for gateway-served agents (used in boot messages)
_GATEWAY_LABELS: dict[str, str] = {
    'weather':     'Weather',
    'system':      'System',
    'calendar':    'Google Calendar',
    'email':       'Google Email',
    'github':      'GitHub',
    'stock':       'Stock Market',
    'news':        'News',
    'portfolio':   'Portfolio',
    'smarthome':   'Smart Home',
    'whatsapp':    'WhatsApp',
    'socialmedia': 'Social Media',
    'dhan':        'Dhan Broker',
    'zerodha':     'Zerodha Broker',
}

# Per-agent boot call: (gateway tool name, arguments)
_GW_BOOT_CALLS: dict[str, tuple[str, dict]] = {
    'weather':   ('weather__get_current_weather',    {'query': 'current weather'}),
    'stock':     ('stocks__get_quote',               {'query': 'Nifty 50'}),
    'news':      ('news__get_news',                  {'query': 'top news today'}),
    'github':    ('github__get_summary',             {}),
    'calendar':  ('google__get_calendar_events',     {'query': "today's schedule"}),
    'email':     ('google__get_emails',              {'query': 'unread emails'}),
    'system':    ('system__get_system_info',         {'query': 'system status'}),
    'portfolio': ('indmoney__query_portfolio',       {'query': 'portfolio overview'}),
    'smarthome': ('smarthome__system_overview',      {}),
    'whatsapp':  ('whatsapp__get_status',            {}),
    'dhan':      ('dhan__query_dhan',                {'query': 'portfolio overview'}),
    'zerodha':   ('zerodha__query_zerodha',          {'query': 'portfolio overview'}),
}

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
    m = re.search(r'\(([+-][\d.]+)%\)', first)
    if m:
        pct  = float(m.group(1))
        sign = '+' if pct >= 0 else ''
        dirn = 'up' if pct >= 0 else 'down'
        return f'Nifty {dirn} {sign}{pct:.2f}% today'
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
    lines = [l.strip() for l in raw.split('\n') if l.strip()]
    if not lines:
        return ''
    first = lines[0]
    # "N event(s) for Wednesday, July 16:"
    m_count = re.match(r'(\d+) events? for .+', first)
    if m_count:
        count = int(m_count.group(1))
        label = f'{count} event{"s" if count != 1 else ""} today'
        if len(lines) > 1:
            m_event = re.match(r'\d+\.\s*(.+?)\s*[—-]\s*(.+)', lines[1])
            if m_event:
                title = m_event.group(1).strip()
                time  = m_event.group(2).strip().rstrip('.')
                more  = f', and {count - 1} more' if count > 1 else ''
                return f'{label} — {title} at {time}{more}'
        return label
    if 'no events' in first.lower():
        return 'no events today'
    # fallback: "Next event: 'Title' at time."
    return first[:75]

def _snip_email(raw: str) -> str:
    if 'no unread' in raw.lower() or 'inbox is clear' in raw.lower():
        return 'inbox clear'
    m = re.match(r'(\d+) (unread|important) emails?', raw)
    if m:
        count = m.group(1)
        return f'{count} unread email{"s" if count != "1" else ""}'
    return raw.split('.')[0][:55]

def _snip_system(raw: str) -> str:
    cpu       = re.search(r'CPU usage:\s*([\d.]+)%', raw)
    ram_used  = re.search(r'RAM:\s*([\d.]+ GB) used / ([\d.]+ GB) total \(([\d.]+)%', raw)
    load      = re.search(r'Load average:\s*([\d.]+)', raw)
    parts = []
    if cpu:
        parts.append(f'CPU {cpu.group(1)}%')
    if ram_used:
        parts.append(f'RAM {ram_used.group(1)} / {ram_used.group(2)} ({ram_used.group(3)}% used)')
    if load:
        parts.append(f'Load {load.group(1)}')
    return ' · '.join(parts) if parts else raw.split('\n')[0][:60]

_PNL_CANDIDATES = (
    'absoluteReturnsPercentage', 'totalReturnsPercent', 'total_returns_percent',
    'returns_pct', 'total_return_pct', 'returnPct', 'return_percentage',
    'total_gain_percent', 'gain_percent', 'net_pnl_percent', 'pnl_percent',
    'overall_return_pct', 'overallReturnPercent', 'overallGainPercent',
    'absoluteReturn', 'absoluteReturnPercentage', 'xirr',
)

def _extract_pnl_pct(data: object, depth: int = 0) -> float | None:
    if depth > 4:
        return None
    if isinstance(data, str):
        try:
            import json as _j; data = _j.loads(data)
        except Exception:
            return None
    if isinstance(data, list):
        for item in data:
            r = _extract_pnl_pct(item, depth + 1)
            if r is not None:
                return r
        return None
    if not isinstance(data, dict):
        return None
    for key in _PNL_CANDIDATES:
        if key in data:
            try:
                return float(data[key])
            except (ValueError, TypeError):
                pass
    for v in data.values():
        r = _extract_pnl_pct(v, depth + 1)
        if r is not None:
            return r
    return None

def _snip_portfolio(raw: str) -> str:
    import json as _json
    text = str(raw).strip()
    data = None
    if text.startswith(('{', '[')):
        try:
            data = _json.loads(text)
        except Exception:
            pass
    if data is not None:
        pct = _extract_pnl_pct(data)
        if pct is not None:
            sign = '+' if pct >= 0 else ''
            return f'portfolio {sign}{pct:.1f}% overall returns'
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

def _snip_dhan(raw: str) -> str:
    import json as _json
    text = str(raw).strip()
    data = None
    if text.startswith(('{', '[')):
        try:
            data = _json.loads(text)
        except Exception:
            pass
    if data is not None:
        pct = _extract_pnl_pct(data)
        if pct is not None:
            sign = '+' if pct >= 0 else ''
            return f'Dhan portfolio {sign}{pct:.1f}% overall'
        return ''
    return text.split('.')[0][:55] if text and not is_agent_error(text) else ''

def _snip_zerodha(raw: str) -> str:
    import json as _json
    text = str(raw).strip()
    data = None
    if text.startswith(('{', '[')):
        try:
            data = _json.loads(text)
        except Exception:
            pass
    if data is not None:
        pct = _extract_pnl_pct(data)
        if pct is not None:
            sign = '+' if pct >= 0 else ''
            return f'Zerodha portfolio {sign}{pct:.1f}% overall'
        return ''
    return text.split('.')[0][:55] if text and not is_agent_error(text) else ''

def _snip_socialmedia(raw: str) -> str:
    # raw is "; "-joined channel summaries, e.g. "MyChannel: 3 new videos, 1.2K views; MyIG: 2 new posts"
    # Empty string means no activity — return empty to skip announcement
    raw = str(raw).strip()
    if not raw:
        return ''
    # Truncate to keep boot message concise
    return raw[:120]

_GW_SNIP_FN: dict[str, Callable[[str], str]] = {
    'weather':     _snip_weather,
    'stock':       _snip_stock,
    'news':        _snip_news,
    'github':      _snip_github,
    'calendar':    _snip_calendar,
    'email':       _snip_email,
    'system':      _snip_system,
    'portfolio':   _snip_portfolio,
    'smarthome':   _snip_smarthome,
    'whatsapp':    _snip_whatsapp,
    'socialmedia': _snip_socialmedia,
    'dhan':        _snip_dhan,
    'zerodha':     _snip_zerodha,
}


async def _fetch_stock_boot_snippet() -> tuple[bool, str]:
    """Fetch Nifty quote + Google Sheet portfolio in parallel and combine."""
    import json as _json
    async def _safe(coro):
        try:
            return await asyncio.wait_for(coro, timeout=8.0)
        except Exception:
            return None

    nifty_raw, sheet_raw = await asyncio.gather(
        _safe(gateway_client.call_tool('stocks__get_quote',     {'query': 'Nifty 50'})),
        _safe(gateway_client.call_tool('stocks__get_portfolio', {})),
    )

    parts: list[str] = []
    ok = False

    if nifty_raw and not is_agent_error(str(nifty_raw)):
        snip = _snip_stock(str(nifty_raw))
        if snip:
            parts.append(snip)
            ok = True

    if isinstance(sheet_raw, list) and sheet_raw:
        total_invested = sum(h.get('buy', 0) * h.get('qty', 0) for h in sheet_raw)
        total_current  = sum(h.get('curr', 0) * h.get('qty', 0) for h in sheet_raw)
        if total_invested > 0:
            overall_pct = (total_current - total_invested) / total_invested * 100
            sign = '+' if overall_pct >= 0 else ''
            dirn = 'up' if overall_pct >= 0 else 'down'
            parts.append(f'your stocks {dirn} {sign}{overall_pct:.1f}%')
            ok = True

    return ok, ' · '.join(parts)


async def _fetch_boot_snippet(agent_id: str) -> tuple[bool, str]:
    """Call the agent's boot tool; returns (success, snippet).

    success=False means the agent is unconfigured or the call failed — the
    gateway may be up but this specific integration has no working credentials.
    snippet may be empty even on success when there is no useful live data.

    For smarthome: snippet '__auth__' means credentials are missing (PermissionError).
    snippet '' with success=False means connection failure (HA still starting).
    """
    if agent_id == 'stock':
        return await _fetch_stock_boot_snippet()

    call = _GW_BOOT_CALLS.get(agent_id)
    if not call:
        return True, ''
    tool_name, args = call
    try:
        raw = await asyncio.wait_for(
            gateway_client.call_tool(tool_name, args),
            timeout=5.0,
        )
        if not raw:
            return True, ''
        text = json.dumps(raw) if isinstance(raw, (dict, list)) else str(raw)
        if is_agent_error(text):
            return False, ''
        fn = _GW_SNIP_FN.get(agent_id)
        return True, (fn(text) if fn else text[:55])
    except PermissionError:
        return False, '__auth__' if agent_id in ('smarthome', 'portfolio') else ''
    except Exception:
        return False, ''


_HA_POLL_INTERVAL = 5.0    # seconds between retries during background polling
_HA_POLL_TIMEOUT  = 120.0  # give up after 2 minutes
_GOOGLE_GROUP     = frozenset({'calendar', 'email'})


async def _fetch_snippet_and_phrase(
    agent_id: str, assistant_name: str
) -> tuple[bool, str, str]:
    """Fetch boot snippet then immediately generate the announcement phrase.

    Both steps happen sequentially per agent, but all agents run concurrently
    via asyncio.gather — so snippet+phrase cost only max(single_agent_time)
    instead of sum(all_agents_time).
    Returns (ok, snippet, pre_generated_phrase).
    google-group agents return phrase='' (complex combined logic handled in loop).
    """
    ok, snippet = await _fetch_boot_snippet(agent_id)
    phrase = ''
    if agent_id == 'smarthome':
        if ok:
            phrase = await phrase_engine.generate('agent_online', {'label': _GATEWAY_LABELS['smarthome']})
        elif snippet == '__auth__':
            phrase = await phrase_engine.generate('smarthome_auth_error', {})
        else:
            phrase = await phrase_engine.generate('smarthome_starting', {})
    elif agent_id not in _GOOGLE_GROUP:
        if ok:
            if agent_id in ('dhan', 'zerodha'):
                broker = 'Dhan' if agent_id == 'dhan' else 'Zerodha'
                phrase = await phrase_engine.generate(
                    'broker_connected', {'broker': broker, 'assistant_name': assistant_name}
                )
            else:
                label  = _GATEWAY_LABELS.get(agent_id, agent_id.title())
                phrase = await phrase_engine.generate('agent_online', {'label': label})
        elif agent_id == 'portfolio' and snippet == '__auth__':
            phrase = await phrase_engine.generate('portfolio_auth_error', {})
    return ok, snippet, phrase


async def _poll_smarthome_until_online(
    send_fn:      SendFn,
    speak_fn:     SpeakFn,
    tts:          TTSProvider,
    agent_voices: dict | None,
) -> None:
    """Background task: polls HA every 5 s until online, not-configured, or 2-min timeout."""
    import json as _json
    deadline = asyncio.get_event_loop().time() + _HA_POLL_TIMEOUT
    try:
        while asyncio.get_event_loop().time() < deadline:
            await asyncio.sleep(_HA_POLL_INTERVAL)
            try:
                raw  = await asyncio.wait_for(
                    gateway_client.call_tool('smarthome__system_overview', {}),
                    timeout=10.0,
                )
                text  = _json.dumps(raw) if isinstance(raw, (dict, list)) else str(raw)
                snip  = _snip_smarthome(text)
                label = _GATEWAY_LABELS['smarthome']
                base  = await phrase_engine.generate('agent_online', {'label': label})
                msg   = f'{base.rstrip(".")} — {snip}.' if snip else base
                await speak_fn(
                    'boot_status', msg,
                    {'agent_id': 'smarthome', 'agent_status': 'online'},
                    agent_tts(tts, 'smarthome', agent_voices),
                )
                await send_fn('agent_status_changed', {'agent': 'smarthome', 'status': 'online'})
                return
            except PermissionError:
                await speak_fn(
                    'boot_status',
                    await phrase_engine.generate('smarthome_auth_error', {}),
                    {'agent_id': 'smarthome', 'agent_status': 'degraded'},
                    agent_tts(tts, 'smarthome', agent_voices),
                )
                await send_fn('agent_status_changed', {'agent': 'smarthome', 'status': 'degraded'})
                return
            except Exception:
                pass  # still starting — keep polling
        # 2-minute timeout — tell the user what to check
        await speak_fn(
            'boot_status',
            await phrase_engine.generate('smarthome_timeout', {}),
            {'agent_id': 'smarthome', 'agent_status': 'degraded'},
            agent_tts(tts, 'smarthome', agent_voices),
        )
        await send_fn('agent_status_changed', {'agent': 'smarthome', 'status': 'degraded'})
    except Exception:
        pass  # WebSocket closed or fatal error — background task exits quietly


def _time_of_day() -> str:
    h = datetime.now().hour
    if h < 12: return 'Good morning'
    if h < 18: return 'Good afternoon'
    return 'Good evening'


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
            msg = (await phrase_engine.generate('agent_degraded_local', {'label': label})) + f' {clean}'
            return agent_id, 'degraded', msg
        msg = (await phrase_engine.generate('agent_online_local', {'label': label})) + f' {clean}'
        return agent_id, 'online', msg
    except Exception as exc:
        return agent_id, 'failed', f"{label} agent failed to start: {str(exc)[:60]}"


async def reload_agent(agent_id: str) -> tuple[str, str]:
    """Reload any agent (gateway or local) and return (status, spoken_message)."""
    label = AGENT_LABELS.get(agent_id) or _GATEWAY_LABELS.get(agent_id) or agent_id.title()

    if agent_id in _GATEWAY_AGENT_MAP:
        # Re-push the stored session credentials to the gateway before re-checking
        if agent_id in ('calendar', 'email') and _session_google_access_token:
            await gateway_client.update_google_session(_session_google_access_token, _session_google_refresh_token)
        if agent_id == 'smarthome' and _session_smarthome_endpoint and _session_smarthome_token:
            await gateway_client.update_smarthome_session(_session_smarthome_endpoint, _session_smarthome_token)
        if agent_id == 'weather':
            await gateway_client.update_weather_session(
                _session_weather_api_key, _session_weather_city, _session_weather_provider,
            )
        if agent_id == 'github' and _session_github_token:
            await gateway_client.update_github_session(_session_github_token)
        if agent_id == 'news':
            await gateway_client.update_news_session(_session_news_api_key, _session_news_country)
        if agent_id == 'whatsapp' and _session_whatsapp_phone_id and _session_whatsapp_token:
            await gateway_client.update_whatsapp_session(
                _session_whatsapp_phone_id, _session_whatsapp_token,
                _session_whatsapp_verify, _session_whatsapp_contacts,
            )
        if agent_id == 'portfolio' and _session_portfolio_access_token:
            await gateway_client.update_portfolio_session(
                _session_portfolio_client_id, _session_portfolio_client_secret,
                _session_portfolio_access_token, _session_portfolio_refresh_token,
                _session_portfolio_expires_at,
            )
        if agent_id == 'socialmedia' and _session_socialmedia_accounts:
            await gateway_client.update_socialmedia_session(_session_socialmedia_accounts)
        if agent_id == 'dhan' and _session_dhan_trade_enabled:
            await gateway_client.update_dhan_session(_session_dhan_trade_enabled)
        if agent_id == 'zerodha' and _session_zerodha_trade_enabled:
            await gateway_client.update_zerodha_session(_session_zerodha_trade_enabled)
        ok, snippet = await _fetch_boot_snippet(agent_id)
        if ok:
            phrase = await phrase_engine.generate('agent_online', {'label': label})
            msg    = phrase if not snippet else f"{phrase} — {snippet.rstrip('.')}."
            return 'online', msg
        return 'degraded', f"{label} reloaded — configuration still needed."

    boot_query = AGENT_BOOT_QUERY.get(agent_id, '')
    if boot_query:
        _, status, msg = await test_agent(agent_id)
        if status == 'online':
            return 'online', f"{label} reloaded. {strip_agent_prefix(msg.split('. ', 1)[-1])}"
        if status == 'degraded':
            return 'degraded', f"{label} reloaded — configuration still needed."
        return 'failed', f"{label} failed to reload."

    return 'online', f"{label} is ready."


# Built-in skills that are always available regardless of user configuration
_ALWAYS_ON_SKILLS = ('websearch', 'calculator', 'memory', 'briefing', 'notes')


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
    language: str = 'en',
) -> None:
    # Auto-inject built-in skills at the end
    for skill in _ALWAYS_ON_SKILLS:
        if skill not in registered_agents:
            registered_agents = registered_agents + [skill]

    phrase_engine.configure(llm_config, language)
    agent_manager.configure_session(llm_config, agent_config, registered_agents, calling_name, assistant_name, language=language)
    router_service.configure_session(llm_config, registered_agents)
    metrics_service.record_session()

    # Push all agent credentials from the frontend session to the gateway.
    # The gateway reads from its .env at startup; these in-memory overrides let
    # users configure everything from the Settings UI without editing .env.
    global _session_google_access_token, _session_google_refresh_token
    global _session_smarthome_endpoint, _session_smarthome_token
    global _session_weather_api_key, _session_weather_city, _session_weather_provider
    global _session_github_token
    global _session_news_api_key, _session_news_country
    global _session_whatsapp_phone_id, _session_whatsapp_token, _session_whatsapp_verify, _session_whatsapp_contacts
    global _session_portfolio_client_id, _session_portfolio_client_secret
    global _session_portfolio_access_token, _session_portfolio_refresh_token, _session_portfolio_expires_at
    global _session_socialmedia_accounts
    global _session_dhan_trade_enabled
    global _session_zerodha_trade_enabled
    ac = agent_config if agent_config else {}

    # Google
    g = ac.get('google', {})
    _session_google_access_token  = (g.get('access_token')  or '').strip()
    _session_google_refresh_token = (g.get('refresh_token') or '').strip()
    if _session_google_access_token:
        asyncio.create_task(
            gateway_client.update_google_session(_session_google_access_token, _session_google_refresh_token)
        )

    # SmartHome — awaited so credentials are live before the boot check
    sh = ac.get('smarthome', {})
    _session_smarthome_endpoint = (sh.get('endpoint') or '').strip().rstrip('/')
    if (sh.get('mode') or 'remote') == 'local' and not _session_smarthome_endpoint:
        _session_smarthome_endpoint = 'http://localhost:8123'
    _session_smarthome_token = (sh.get('token') or '').strip()
    _sh_push_task = None
    if 'smarthome' in registered_agents and _session_smarthome_endpoint and _session_smarthome_token:
        _sh_push_task = asyncio.create_task(
            gateway_client.update_smarthome_session(_session_smarthome_endpoint, _session_smarthome_token)
        )

    # Weather
    w = ac.get('weather', {})
    _session_weather_api_key  = (w.get('api_key')      or '').strip()
    _session_weather_city     = (w.get('default_city') or '').strip()
    _session_weather_provider = (w.get('provider')     or '').strip()
    if 'weather' in registered_agents:
        asyncio.create_task(
            gateway_client.update_weather_session(
                _session_weather_api_key, _session_weather_city, _session_weather_provider,
            )
        )

    # GitHub
    gh = ac.get('github', {})
    _session_github_token = (gh.get('personal_access_token') or '').strip()
    if 'github' in registered_agents and _session_github_token:
        asyncio.create_task(gateway_client.update_github_session(_session_github_token))

    # News
    nw = ac.get('news', {})
    _session_news_api_key = (nw.get('api_key') or '').strip()
    _session_news_country = (nw.get('country')  or '').strip()
    if 'news' in registered_agents:
        asyncio.create_task(
            gateway_client.update_news_session(_session_news_api_key, _session_news_country)
        )

    # WhatsApp
    wa = ac.get('whatsapp', {})
    _session_whatsapp_phone_id  = (wa.get('phone_number_id')      or '').strip()
    _session_whatsapp_token     = (wa.get('access_token')          or '').strip()
    _session_whatsapp_verify    = (wa.get('webhook_verify_token')  or '').strip()
    _session_whatsapp_contacts  = (wa.get('contacts')              or '').strip()
    if 'whatsapp' in registered_agents and _session_whatsapp_phone_id and _session_whatsapp_token:
        asyncio.create_task(
            gateway_client.update_whatsapp_session(
                _session_whatsapp_phone_id, _session_whatsapp_token,
                _session_whatsapp_verify, _session_whatsapp_contacts,
            )
        )

    # Portfolio (INDmoney)
    pf = ac.get('portfolio', {})
    _session_portfolio_client_id     = (pf.get('client_id')     or '').strip()
    _session_portfolio_client_secret = (pf.get('client_secret') or '').strip()
    _session_portfolio_access_token  = (pf.get('access_token')  or '').strip()
    _session_portfolio_refresh_token = (pf.get('refresh_token') or '').strip()
    _session_portfolio_expires_at    = int(pf.get('expires_at') or 0)
    if 'portfolio' in registered_agents and _session_portfolio_access_token:
        asyncio.create_task(
            gateway_client.update_portfolio_session(
                _session_portfolio_client_id, _session_portfolio_client_secret,
                _session_portfolio_access_token, _session_portfolio_refresh_token,
                _session_portfolio_expires_at,
            )
        )

    # Social Media
    sm = ac.get('socialmedia', {})
    accounts_raw = sm.get('accounts', [])
    import json as _json
    _session_socialmedia_accounts = _json.dumps(accounts_raw) if accounts_raw else ''
    if 'socialmedia' in registered_agents and _session_socialmedia_accounts:
        asyncio.create_task(
            gateway_client.update_socialmedia_session(_session_socialmedia_accounts)
        )

    # Dhan Broker — OAuth token is stored in gateway; only push trade_enabled
    dh = ac.get('dhan', {})
    _session_dhan_trade_enabled = bool(dh.get('trade_enabled', False))
    if 'stock' in registered_agents and _session_dhan_trade_enabled:
        asyncio.create_task(
            gateway_client.update_dhan_session(_session_dhan_trade_enabled)
        )

    # Zerodha Broker — OAuth token is stored in gateway; only push trade_enabled
    zr = ac.get('zerodha', {})
    _session_zerodha_trade_enabled = bool(zr.get('trade_enabled', False))
    if 'stock' in registered_agents and _session_zerodha_trade_enabled:
        asyncio.create_task(
            gateway_client.update_zerodha_session(_session_zerodha_trade_enabled)
        )

    await send_fn('session_config', {
        'tts_provider':      settings_label(tts),
        'stt_provider':      settings_label(stt),
        'wake_word_enabled': settings.wake_word_enabled and wake_word_service.available,
        'wake_word_model':   settings.wake_word_model,
    })
    await send_fn('phase_changed', {'phase': 'wake_detected'})
    await send_fn('phase_changed', {'phase': 'booting'})

    # Start agent init in background immediately so it runs while we speak
    init_task = asyncio.create_task(agent_manager.initialize_enabled_agents())

    # Generate both phrases concurrently (LLM / static)
    greeting_msg, assembling_msg = await asyncio.gather(
        phrase_engine.generate('greeting',   {'tod': _time_of_day(), 'name': calling_name, 'assistant_name': assistant_name}),
        phrase_engine.generate('assembling', {'name': calling_name, 'assistant_name': assistant_name}),
    )

    # Speak greeting then assembling sequentially; init runs in the background during this
    await speak_fn('boot_status', greeting_msg,   None, tts)
    await speak_fn('boot_status', assembling_msg, None, tts)

    # Now wait for init (and smarthome cred push) to complete before agent checks
    _init_waitlist: list = [init_task]
    if _sh_push_task:
        _init_waitlist.append(_sh_push_task)
    await asyncio.gather(*_init_waitlist)

    skill_ids = set(_ALWAYS_ON_SKILLS)

    # Separate registered agents into gateway-served vs locally-managed
    gateway_ids = [a for a in registered_agents if a in _GATEWAY_AGENT_MAP and a not in skill_ids]
    local_ids   = [a for a in registered_agents if a not in _GATEWAY_AGENT_MAP and a not in skill_ids]
    silent_skills = [a for a in registered_agents if a in skill_ids]

    # Broadcast 'starting' for every agent the frontend knows about
    for agent_id in registered_agents:
        await send_fn('agent_status_changed', {'agent': agent_id, 'status': 'starting'})

    # Check gateway health — retry up to 3× (gateway may still be in lifespan startup)
    gw_ok = False
    gw_tool_count = 0
    gw_namespace_count = 0
    for _attempt in range(3):
        try:
            gw_health = await gateway_client.health()
            gw_ok = gw_health.get('status') == 'ok'
            if gw_ok:
                gw_tools = await gateway_client.list_tools()
                gw_tool_count = len(gw_tools)
                gw_namespace_count = len({t.get('namespace', t['name'].split('__')[0]) for t in gw_tools if isinstance(t, dict)})
            break
        except Exception:
            if _attempt < 2:
                await asyncio.sleep(2)  # gateway may still be finishing lifespan init

    # ── Gateway-served agents ─────────────────────────────────────────────────
    gw_online = 0
    if gateway_ids:
        if gw_ok and gw_tool_count:
            gw_phrase = (
                f'MCP gateway connected — {gw_tool_count} tool{"s" if gw_tool_count != 1 else ""} '
                f'across {gw_namespace_count} service{"s" if gw_namespace_count != 1 else ""} discovered.'
            )
        elif gw_ok:
            gw_phrase = await phrase_engine.generate('gw_connect', {})
        else:
            gw_phrase = await phrase_engine.generate('gw_fail', {})
        await speak_fn('boot_status', gw_phrase, None, agent_tts(tts, 'general', agent_voices))

    # Fetch live snippets AND pre-generate announcement phrases in parallel.
    # Each _fetch_snippet_and_phrase coroutine fetches its snippet then immediately
    # generates the matching LLM phrase — all agents run concurrently via gather.
    # google_online / google_not_configured phrases are also pre-generated here.
    pre_phrases:       dict[str, str] = {}
    phrase_map:        dict[str, str] = {}
    success_map:       dict[str, bool] = {}
    snippet_map:       dict[str, str] = {}
    google_detail_task = None
    if gw_ok and gateway_ids:
        _has_google = any(a in _GOOGLE_GROUP for a in gateway_ids)
        extra_keys  = ['google_online', 'google_not_configured'] if _has_google else []
        extra_coros = (
            [phrase_engine.generate('google_online', {}),
             phrase_engine.generate('google_not_configured', {})]
            if _has_google else []
        )
        all_results   = await asyncio.gather(
            *[_fetch_snippet_and_phrase(a, assistant_name) for a in gateway_ids],
            *extra_coros,
        )
        boot_results  = all_results[:len(gateway_ids)]
        extra_results = all_results[len(gateway_ids):]
        success_map = {a: ok   for a, (ok, _, _)  in zip(gateway_ids, boot_results)}
        snippet_map  = {a: snip for a, (_, snip, _) in zip(gateway_ids, boot_results)}
        phrase_map   = {a: ph   for a, (_, _, ph)  in zip(gateway_ids, boot_results)}
        pre_phrases  = dict(zip(extra_keys, extra_results))
        # Start google_connected phrase as background task — snippet data now available
        if _has_google:
            _cal_snip_pre   = snippet_map.get('calendar', '') if success_map.get('calendar') else ''
            _email_snip_pre = snippet_map.get('email', '')   if success_map.get('email')    else ''
            if _cal_snip_pre or _email_snip_pre:
                _detail = (f'{_cal_snip_pre}, and {_email_snip_pre}'
                           if _cal_snip_pre and _email_snip_pre
                           else _cal_snip_pre or _email_snip_pre)
                google_detail_task = asyncio.create_task(
                    phrase_engine.generate('google_connected', {'detail': _detail})
                )

    google_announced = False

    for agent_id in gateway_ids:
        agent_ok = gw_ok and success_map.get(agent_id, False)
        status   = 'online' if agent_ok else 'degraded'

        if agent_id == 'smarthome':
            snip = snippet_map.get(agent_id, '')
            if agent_ok:
                gw_online += 1
                base = phrase_map.get(agent_id) or await phrase_engine.generate(
                    'agent_online', {'label': _GATEWAY_LABELS['smarthome']}
                )
                msg = f'{base.rstrip(".")} — {snip}.' if snip else base
                await speak_fn('boot_status', msg, {'agent_id': agent_id, 'agent_status': 'online'}, agent_tts(tts, agent_id, agent_voices))
                await send_fn('agent_status_changed', {'agent': agent_id, 'status': 'online'})
            elif snip == '__auth__' or not gw_ok:
                base = phrase_map.get(agent_id) or await phrase_engine.generate('smarthome_auth_error', {})
                await speak_fn('boot_status', base, {'agent_id': agent_id, 'agent_status': 'degraded'}, agent_tts(tts, agent_id, agent_voices))
                await send_fn('agent_status_changed', {'agent': agent_id, 'status': 'degraded'})
            else:
                base = phrase_map.get(agent_id) or await phrase_engine.generate('smarthome_starting', {})
                await speak_fn('boot_status', base, {'agent_id': agent_id, 'agent_status': 'starting'}, agent_tts(tts, agent_id, agent_voices))
                asyncio.create_task(_poll_smarthome_until_online(send_fn, speak_fn, tts, agent_voices))
            continue

        if agent_id in _GOOGLE_GROUP:
            # Announce both Google sub-services together on the first one encountered
            if not google_announced:
                google_announced = True
                cal_ok   = gw_ok and success_map.get('calendar', False)
                email_ok = gw_ok and success_map.get('email', False)
                if cal_ok or email_ok:
                    cal_snip   = snippet_map.get('calendar', '') if cal_ok else ''
                    email_snip = snippet_map.get('email', '') if email_ok else ''
                    if (cal_snip or email_snip) and google_detail_task:
                        msg = await google_detail_task
                    else:
                        msg = pre_phrases.get('google_online') or await phrase_engine.generate('google_online', {})
                    google_status = 'online'
                else:
                    msg = pre_phrases.get('google_not_configured') or await phrase_engine.generate('google_not_configured', {})
                    google_status = 'degraded'
                await speak_fn(
                    'boot_status', msg,
                    {'agent_id': 'google', 'agent_status': google_status},
                    agent_tts(tts, 'calendar', agent_voices),
                )
            if agent_ok:
                gw_online += 1
            await send_fn('agent_status_changed', {'agent': agent_id, 'status': status})
        else:
            if agent_ok:
                gw_online += 1
                snip = snippet_map.get(agent_id, '')
                base = phrase_map.get(agent_id) or await phrase_engine.generate(
                    'agent_online', {'label': _GATEWAY_LABELS.get(agent_id, agent_id.title())}
                )
                msg  = f'{base.rstrip(".")} — {snip}.' if snip else base
                await speak_fn(
                    'boot_status', msg,
                    {'agent_id': agent_id, 'agent_status': status},
                    agent_tts(tts, agent_id, agent_voices),
                )
            elif agent_id == 'portfolio' and snippet_map.get(agent_id) == '__auth__':
                await speak_fn(
                    'boot_status',
                    phrase_map.get(agent_id) or await phrase_engine.generate('portfolio_auth_error', {}),
                    {'agent_id': agent_id, 'agent_status': 'degraded'},
                    agent_tts(tts, agent_id, agent_voices),
                )
            await send_fn('agent_status_changed', {'agent': agent_id, 'status': status})

    # ── Local built-in agents (websearch, calculator, memory, briefing, general) ─
    results: list[tuple[str, str, str]] = await asyncio.gather(
        *[test_agent(agent_id) for agent_id in local_ids]
    )

    local_online = sum(1 for _, s, _ in results if s == 'online')

    # Start boot_ready phrase in background so it overlaps with local announcements
    total_online     = gw_online + local_online
    total_configured = len(gateway_ids) + len(local_ids)
    boot_ready_task  = asyncio.create_task(phrase_engine.generate('boot_ready', {
        'total_online':   total_online,
        'total':          total_configured,
        'name':           calling_name,
        'assistant_name': assistant_name,
    }))

    for agent_id, status, msg in results:
        await speak_fn(
            'boot_status', msg,
            {'agent_id': agent_id, 'agent_status': status},
            agent_tts(tts, agent_id, agent_voices),
        )
        await send_fn('agent_status_changed', {'agent': agent_id, 'status': status})

    # Mark built-in skills online silently
    for agent_id in silent_skills:
        await send_fn('agent_status_changed', {'agent': agent_id, 'status': 'online'})

    # boot_ready phrase should already be resolved by now
    await speak_fn(
        'boot_status',
        await boot_ready_task,
        None,
        agent_tts(tts, 'general', agent_voices),
    )
    await send_fn('phase_changed', {'phase': 'ready'})
