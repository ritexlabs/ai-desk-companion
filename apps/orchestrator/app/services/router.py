from __future__ import annotations

import json
import re

from app.models.contracts import RouteResult
from app.services.llm import llm_service

# ── Agent catalogue ───────────────────────────────────────────────────────────
# Descriptions are shown to the LLM when classifying intent; adding a new agent
# here is enough — no keyword lists needed for LLM mode.

AGENT_DESCRIPTIONS: dict[str, str] = {
    'weather':  'Weather conditions, forecasts, temperature, rain, humidity, wind speed',
    'system':   'Current time, date, day, timezone, OS info, CPU usage, memory, battery, system health',
    'calendar': 'Meetings, events, appointments, schedule, free time slots, upcoming events',
    'email':    'Email inbox, unread messages, email summaries, sender information',
    'github':   'GitHub repos, pull requests, issues, commits, CI/CD workflows, code review status',
    'stock':    'Stock prices, market indices (Nifty 50, Sensex, S&P 500, Dow Jones), RSI, technical analysis',
    'news':      'Latest news headlines, breaking news, current events, top stories by country or city',
    'smarthome': 'Control smart home devices: lights (on/off, brightness, color), switches, climate/thermostat, covers, scenes, automations, device status',
    'whatsapp':  'Send WhatsApp messages to contacts, read incoming WhatsApp messages, check messages from a specific person',
    'general':   'General knowledge, creative writing, explanations, calculations, anything not covered above',
}

# ── Helpers shared by LLM and keyword paths ───────────────────────────────────

_JSON_RE          = re.compile(r'\{[^}]*"agent"[^}]*\}', re.S)
_FENCE_RE         = re.compile(r'^```[a-z]*\s*|\s*```$', re.M)
_CONTRACTION_RE   = re.compile(r"\bwhat'?s\b|\bwhats\b", re.I)


def _norm(text: str) -> str:
    return _CONTRACTION_RE.sub('what is', text.lower())


def _has(text: str, *keywords: str) -> bool:
    for kw in keywords:
        if ' ' in kw:
            if kw in text:
                return True
        else:
            if re.search(r'\b' + re.escape(kw) + r'\b', text):
                return True
    return False


# ── Keyword fallback ──────────────────────────────────────────────────────────

_DATETIME_PHRASES = (
    'what time', 'what is the time', 'what is the date',
    'current time', 'current date', 'the time now', 'time right now',
    'tell me the time', 'check the time', "today's date",
    'what day', 'what year', 'what month', 'what hour', 'what is today',
)
_DATETIME_SINGLE = frozenset({'time', 'date', 'clock', 'timezone', 'today'})


def _keyword_route(text: str) -> RouteResult:
    """Fast keyword-based router — used when LLM is unavailable or as safety net."""
    t  = text.lower()
    tn = _norm(t)

    if _has(t, 'weather', 'temperature', 'rain', 'forecast', 'humidity', 'wind'):
        return RouteResult(agent='weather', confidence=0.9, reason='keyword:weather')

    # Calendar checked before datetime so "what time is my meeting" → calendar, not system
    if _has(t, 'calendar', 'meeting', 'meetings', 'schedule', 'appointment',
            'appointments', 'event', 'free slot'):
        return RouteResult(agent='calendar', confidence=0.9, reason='keyword:calendar')

    if _has(t, 'email', 'mail', 'inbox', 'unread', 'sender', 'message'):
        return RouteResult(agent='email', confidence=0.9, reason='keyword:email')

    words = tn.split()
    if any(ph in tn for ph in _DATETIME_PHRASES) or \
       (len(words) <= 4 and bool(_DATETIME_SINGLE.intersection(words))):
        return RouteResult(agent='system', confidence=0.9, reason='keyword:datetime')

    if _has(t, 'system', 'cpu', 'processor', 'cores', 'memory', 'ram', 'battery',
            'network', 'health', 'os', 'operating system', 'performance',
            'hardware', 'uptime', 'heap', 'storage', 'disk'):
        return RouteResult(agent='system', confidence=0.9, reason='keyword:system')

    if _has(t, 'stock', 'share', 'equity', 'ticker',
            'nifty', 'sensex', 'banknifty', 'bank nifty',
            'nse', 'bse', 'nasdaq', 'nyse', 's&p', 'dow jones', 'dow',
            'momentum', 'rsi', 'moving average', 'sma',
            'bullish', 'bearish', 'overbought', 'oversold',
            'price of', 'quote', 'market cap', '52 week', '52-week', 'intraday',
            'support', 'resistance'):
        return RouteResult(agent='stock', confidence=0.9, reason='keyword:stock')

    if _has(t, 'github', 'repo', 'repository', 'pull request', 'pr', 'issue',
            'commit', 'branch', 'workflow'):
        return RouteResult(agent='github', confidence=0.9, reason='keyword:github')

    if _has(t, 'news', 'headline', 'headlines', 'breaking news', 'top stories',
            'latest news', 'current events', 'what is happening', "what's happening",
            'top news'):
        return RouteResult(agent='news', confidence=0.9, reason='keyword:news')

    if _has(t, 'whatsapp', 'whats app', 'wa message',
            'send whatsapp', 'whatsapp message', 'text to'):
        return RouteResult(agent='whatsapp', confidence=0.9, reason='keyword:whatsapp')

    if _has(t, 'light', 'lights', 'lamp', 'bulb', 'switch', 'plug',
            'fan', 'thermostat', 'air conditioner', 'ac', 'heater',
            'cover', 'blind', 'curtain', 'shutter', 'garage',
            'scene', 'automation', 'home assistant', 'smart home',
            'living room', 'bedroom', 'kitchen', 'bathroom', 'hallway',
            'turn on', 'turn off', 'switch on', 'switch off',
            'brightness', 'dim', 'dimmer', 'color', 'colour',
            'temperature', 'lock', 'unlock', 'vacuum', 'robot'):
        return RouteResult(agent='smarthome', confidence=0.9, reason='keyword:smarthome')

    return RouteResult(agent='general', confidence=0.6, reason='keyword:fallback')


# ── Router ────────────────────────────────────────────────────────────────────

_ROUTING_PROMPT = """\
You are an intent router for a personal AI assistant with specialised agents.
Your ONLY job is to read the user's message and pick the best agent to handle it.

Available agents:
{agent_list}

Rules:
- Prefer a specific agent over "general" whenever the user's intent clearly matches.
- Use "general" only when no other agent applies.
- Respond with ONLY a single line of valid JSON — no markdown, no extra text:
  {{"agent": "<name>", "reason": "<10 words max>"}}\
"""


class IntentRouter:
    """Routes user queries to the best agent.

    Primary path — LLM classifier (temperature=0, max_tokens=80):
      Sends the query plus a compact description of each enabled agent to the
      configured LLM and parses the JSON {"agent": "...", "reason": "..."} reply.

    Fallback path — keyword matching:
      Used when no LLM is configured, or if the LLM call fails / returns an
      unrecognised agent name. Handles all the same cases as the old router.
    """

    def __init__(self) -> None:
        self._llm_config:     dict      = {}
        self._enabled_agents: list[str] = []

    def configure_session(self, llm_config: dict, enabled_agents: list[str]) -> None:
        """Called once at start_session with the session LLM credentials and active agents."""
        self._llm_config = llm_config or {}
        agents = list(enabled_agents)
        if 'general' not in agents:
            agents.append('general')
        self._enabled_agents = agents

    async def route(self, text: str) -> RouteResult:
        if self._llm_available():
            result = await self._llm_route(text)
            if result:
                return result
        return _keyword_route(text)

    # ── LLM path ──────────────────────────────────────────────────────────────

    def _llm_available(self) -> bool:
        provider = (self._llm_config.get('provider') or '').lower()
        api_key  = (self._llm_config.get('api_key')  or '').strip()
        return bool(api_key) or provider == 'ollama'

    async def _llm_route(self, text: str) -> RouteResult | None:
        available = [a for a in self._enabled_agents if a in AGENT_DESCRIPTIONS]
        if not available:
            return None

        agent_list    = '\n'.join(f'- {n}: {AGENT_DESCRIPTIONS[n]}' for n in available)
        system_prompt = _ROUTING_PROMPT.format(agent_list=agent_list)

        try:
            raw = await llm_service.complete(
                user_message=text,
                llm_config=self._llm_config,
                system_prompt=system_prompt,
                max_tokens=80,
                temperature=0.0,  # deterministic — routing must not be creative
            )
            if not raw:
                return None

            cleaned = _FENCE_RE.sub('', raw.strip()).strip()
            m = _JSON_RE.search(cleaned)
            if not m:
                return None

            data   = json.loads(m.group())
            agent  = str(data.get('agent', '')).lower().strip()
            reason = str(data.get('reason', 'llm classified')).strip()

            if agent not in available:
                return None   # LLM hallucinated an agent name → fall through to keywords

            return RouteResult(agent=agent, confidence=0.97, reason=f'llm:{reason}')

        except Exception:
            return None   # any failure → silent fallback to keywords
