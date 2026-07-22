# IMPLEMENTATION PLAN — AI Desk Companion

**Date:** 2026-07-20  
**Branch target:** `main`  
**Authored by:** Architect agent  

---

## Executive Summary

This plan covers six implementation phases plus a documentation phase. Each phase is self-contained; a developer can implement, test, and commit one phase without touching the next.

The plan adds: a centralized phrase library with LLM-dynamic generation (Phase 1); bilingual Hindi/English support (Phase 2); formal inter-agent messaging and per-agent response caching (Phase 3); a backend-driven notification scheduler that pushes to the frontend via WebSocket (Phase 4); a redesigned settings UI using holographic card components with a per-agent neon palette and Framer Motion animations (Phase 5); and a complete developer guide for adding new agents (Documentation).

---

## ASCII Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Desktop UI  (React 18 + TypeScript + Vite + Tailwind — port 5173)        │
│                                                                           │
│  ┌─── Hooks ──────────────────────┐   ┌─── Settings UI (Phase 5) ───────┐ │
│  │ useOrchestratorRuntime         │   │ AgentSettingsCard (new)          │ │
│  │  ├── handleWsEvent             │   │  └── HoloCard (new)              │ │
│  │  │    └── 'agent_notification' │   │ agentPalette.ts (new)            │ │
│  │  │         (Phase 4 new event) │   │ Framer Motion stagger/3D (Ph. 5) │ │
│  │  └── pushNotification()        │   └─────────────────────────────────┘ │
│  │ useAgentConfig                 │                                        │
│  └────────────────────────────────┘                                        │
└──────────────────────┬────────────────────────────────────────────────────┘
                       │ WebSocket (/ws)
                       │  Commands: start_session, send_text_command, etc.
                       │  Events:   boot_status, agent_status_changed,
                       │            agent_notification (Phase 4 new)
┌──────────────────────▼────────────────────────────────────────────────────┐
│  Orchestrator  (Python FastAPI — port 8787)                                │
│                                                                           │
│  api/ws.py                                                                │
│    ├── boot_sequence() ──► phrase_engine.generate()  ◄── phrases.py (P1)  │
│    ├── _handle_text_command() ──► detect_language()  ◄── language.py (P2) │
│    └── notification_scheduler.start()  ◄── notification_scheduler.py (P4) │
│                                                                           │
│  services/                                                                │
│    ├── phrases.py         PhraseEngine singleton          (Phase 1 NEW)   │
│    ├── language.py        detect_language()               (Phase 2 NEW)   │
│    ├── cache.py           AgentResponseCache singleton    (Phase 3 NEW)   │
│    ├── notification_scheduler.py  NotificationScheduler  (Phase 4 NEW)   │
│    ├── orchestrator.py    LLMOrchestrator (lang-aware sys prompt)  (P2)   │
│    ├── agent_manager.py   + enabled_agents prop + _session_language (P2)  │
│    │                      + call_agent_from_agent()                (P3)   │
│    └── session.py         phrases removed → phrase_engine calls    (P1)   │
│                                                                           │
│  models/                                                                  │
│    └── agent_message.py   AgentMessage dataclass         (Phase 3 NEW)   │
│                                                                           │
│  agents/                                                                  │
│    └── briefing.py        use AgentMessage protocol      (Phase 3)        │
└──────────────────────┬────────────────────────────────────────────────────┘
                       │ HTTP (Bearer auth)
┌──────────────────────▼────────────────────────────────────────────────────┐
│  MCP Gateway  (Python FastAPI — port 8788)       ◄── NOT TOUCHED          │
│  tools/: weather, stocks, news, github, google, smarthome, ...            │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Do-Not-Touch List

The following are working correctly and must not regress across any phase:

- WebSocket command/event names and payload shapes in `apps/orchestrator/app/api/ws.py`
- Boot sequence ORDER: greeting → credential push → gateway health → per-agent snippets (parallel) → local agents (parallel) → final summary
- Rate limiter (`_RateLimiter`) and origin enforcement in `ws.py`
- TTS/STT provider selection in `apps/orchestrator/app/services/tts_helpers.py`
- `BaseTool` ABC in `apps/mcp-gateway/src/tools/base.py`
- `GatewaySettings` in `apps/mcp-gateway/src/config/settings.py`
- `launch.py` and `scripts/test.sh`
- `apps/desktop/src/components/AgentOrbit3D.tsx`
- `apps/desktop/src/components/HoloChat.tsx`
- `apps/desktop/src/components/SmartHomeDashboard.tsx`
- All existing gateway tool files under `apps/mcp-gateway/src/tools/`
- `apps/desktop/src/hooks/useVoiceLoop.ts` and `useVoice.ts`
- The localStorage key `robo-agent-config` and the `AgentConfig` type contract

---

## Phase 1 — Sentence Library + PhraseEngine

### Goal

Extract every hard-coded string from `session.py` into a dedicated `phrases.py` module. Introduce a `PhraseEngine` singleton with a `generate()` method that calls the LLM when configured, and falls back to the static library otherwise.

### Files to Create

**`apps/orchestrator/app/services/phrases.py`** (new file, ~200 lines)

### Files to Modify

**`apps/orchestrator/app/services/session.py`**
- Remove all phrase pool constants (`_GW_CONNECT_PHRASES`, `_GW_FAIL_PHRASES`, `_GW_AGENT_ONLINE_PHRASES`, `GREETING_SUFFIXES`, `FAREWELL_LINES`)
- Remove `make_greeting()`, `pick_farewell()`, `llm_farewell()` — these move to `PhraseEngine`
- Replace every phrase-selection callsite with `await phrase_engine.generate(category, context)`
- Add `phrase_engine.configure(llm_config)` call at the top of `boot_sequence()`

### Technical Approach

#### `PhraseEngine` class in `phrases.py`

```python
from __future__ import annotations
import random
from typing import Literal

# ── Static phrase pools (all phrases from session.py move here) ───────────

_EN: dict[str, list[str]] = {
    'gw_connect': [
        'MCP gateway link established — tool matrix online.',
        'Secure tunnel to tool gateway confirmed — all channels open.',
        # ... (8 total, copied verbatim from session.py _GW_CONNECT_PHRASES)
    ],
    'gw_fail': [
        'MCP gateway unreachable — tool network dark.',
        # ... (8 total, from _GW_FAIL_PHRASES)
    ],
    'agent_online': [
        '{label} module synchronized and online.',
        '{label} integration confirmed, link active.',
        # ... (10 total, from _GW_AGENT_ONLINE_PHRASES)
    ],
    'greeting': [
        '{tod}, {name}, wonderful to have you back.',
        # ... GREETING_SUFFIXES formatted with {tod} and {name}
    ],
    'farewell': [
        'Goodbye! Have a wonderful day.',
        # ... (10 total, from FAREWELL_LINES)
    ],
    'agent_online_local': ['{label} agent, online.'],
    'agent_degraded_local': ['{label} agent — configuration needed.'],
    'agent_failed_local': ['{label} agent failed to start.'],
    'boot_summary': [
        '{total_online} of {total} agent{plural} online and ready for your command.',
    ],
    'smarthome_starting': [
        'Smart Home bridge is starting — I will notify you when it comes online.',
    ],
    'smarthome_auth_error': [
        'Smart Home not configured — please add your Home Assistant token in Settings.',
    ],
    'smarthome_timeout': [
        'Smart Home took too long to connect. '
        'Verify your Home Assistant token and endpoint in Settings, '
        'and ensure the voska/hass-mcp container can reach your Home Assistant instance.',
    ],
    'google_connected': ['Google connected — {detail}.'],
    'google_online': ['Google integration online.'],
    'google_not_configured': ['Google not configured — credentials needed.'],
    'portfolio_auth_error': [
        'Portfolio offline — INDmoney token may have expired. '
        'Please reconnect in Settings to restore access.',
    ],
}

# Hindi fallback pool — partial (high-frequency phrases only)
_HI: dict[str, list[str]] = {
    'gw_connect': ['MCP गेटवे से कनेक्शन सफल — टूल नेटवर्क सक्रिय।'],
    'gw_fail':    ['MCP गेटवे से कनेक्शन विफल — बाहरी सेवाएं बंद।'],
    'agent_online': ['{label} ऑनलाइन और तैयार है।'],
    'greeting': ['{tod}, {name}, आपका स्वागत है।'],
    'farewell': ['अलविदा! जब जरूरत हो, मुझे जगाएं।'],
    'smarthome_starting': ['स्मार्ट होम ब्रिज शुरू हो रहा है — ऑनलाइन होने पर सूचित करूंगा।'],
    'smarthome_auth_error': ['स्मार्ट होम कॉन्फ़िगर नहीं — Settings में Home Assistant टोकन जोड़ें।'],
    'google_not_configured': ['Google कनेक्ट नहीं — क्रेडेंशियल जरूरी हैं।'],
}

# LLM system prompts per category (used only when LLM is configured)
_LLM_PROMPTS: dict[str, str] = {
    'agent_online': (
        'You are a futuristic sci-fi voice assistant. '
        'Generate exactly ONE excited 8-12 word announcement that {label} is now online. '
        'Plain text only. No markdown. No quotes.'
    ),
    'gw_connect': (
        'You are a futuristic AI. Generate exactly ONE short (8-14 word) announcement '
        'that the MCP tool gateway is now connected. Sci-fi tone. Plain text only.'
    ),
    'gw_fail': (
        'You are a futuristic AI. Generate exactly ONE short (8-14 word) announcement '
        'that the MCP tool gateway is unreachable. Concise. Plain text only.'
    ),
    'greeting': (
        'You are {assistant_name}, a warm AI voice assistant. '
        'Generate exactly ONE natural greeting for {name} (time of day: {tod}). '
        '10-16 words, spoken English, no markdown.'
    ),
    'farewell': (
        'You are {assistant_name}, a warm AI voice assistant saying goodbye to {name}. '
        'Generate exactly ONE short farewell (10-18 words). Match user\'s tone from: "{phrase}". '
        'Plain spoken English only. No markdown, no quotes.'
    ),
    'boot_summary': (
        'Generate exactly ONE sentence summarising that {total_online} of {total} agents are online. '
        'Upbeat, futuristic tone. 10-16 words. Plain text only.'
    ),
}


class PhraseEngine:
    """Singleton. Call configure() at session start; then generate() anywhere."""

    def __init__(self) -> None:
        self._llm_config: dict = {}
        self._language: str = 'en'

    def configure(self, llm_config: dict, language: str = 'en') -> None:
        self._llm_config = llm_config or {}
        self._language = language

    async def generate(self, category: str, context: dict) -> str:
        """Return a phrase for `category`, filling `context` placeholders.

        Tries LLM first when configured; falls back to static pool.
        `context` values are also used to format the static template.
        """
        if self._llm_config:
            result = await self._llm(category, context)
            if result:
                return result
        return self._static(category, context)

    async def _llm(self, category: str, context: dict) -> str:
        prompt_template = _LLM_PROMPTS.get(category)
        if not prompt_template:
            return ''
        from app.services.llm import llm_service
        lang_suffix = ' Respond in Hindi using Devanagari script.' if self._language == 'hi' else ''
        try:
            result = await llm_service.complete(
                prompt_template.format(**{**context, 'phrase': context.get('phrase', '')}) + lang_suffix,
                self._llm_config,
                max_tokens=60,
                temperature=0.88,
            )
            return (result or '').strip()
        except Exception:
            return ''

    def _static(self, category: str, context: dict) -> str:
        pool_map = _HI if self._language == 'hi' else {}
        pool = pool_map.get(category) or _EN.get(category, [])
        if not pool:
            return ''
        return random.choice(pool).format(**{k: v for k, v in context.items()})


phrase_engine = PhraseEngine()
```

#### Changes to `session.py`

After the imports block, add:
```python
from app.services.phrases import phrase_engine
```

Remove all constants: `_GW_CONNECT_PHRASES`, `_GW_FAIL_PHRASES`, `_GW_AGENT_ONLINE_PHRASES`, `GREETING_SUFFIXES`, `FAREWELL_LINES`.

Remove functions: `make_greeting()`, `pick_farewell()`, `llm_farewell()` — their logic moves to `PhraseEngine`.

At the top of `boot_sequence()`, before the credential-push block, add:
```python
phrase_engine.configure(llm_config)
```

Replace every phrase-selection callsite as follows:

| Old callsite | New callsite |
|---|---|
| `random.choice(_GW_CONNECT_PHRASES)` | `await phrase_engine.generate('gw_connect', {})` |
| `random.choice(_GW_FAIL_PHRASES)` | `await phrase_engine.generate('gw_fail', {})` |
| `random.choice(_GW_AGENT_ONLINE_PHRASES).format(label=label)` | `await phrase_engine.generate('agent_online', {'label': label})` |
| `make_greeting(calling_name)` | `await phrase_engine.generate('greeting', {'tod': _time_of_day(), 'name': calling_name, 'assistant_name': assistant_name})` |
| `'Smart Home not configured — please add your Home Assistant token in Settings.'` | `await phrase_engine.generate('smarthome_auth_error', {})` |
| `'Smart Home bridge is starting…'` | `await phrase_engine.generate('smarthome_starting', {})` |
| `'Smart Home took too long to connect…'` | `await phrase_engine.generate('smarthome_timeout', {})` |
| `f'Google connected — {cal_snip}…'` | `await phrase_engine.generate('google_connected', {'detail': cal_snip + (', ' + email_snip if email_snip else '')})` |
| `'Google not configured — credentials needed.'` | `await phrase_engine.generate('google_not_configured', {})` |
| `'Google integration online.'` | `await phrase_engine.generate('google_online', {})` |
| `f'{label} agent, online. {clean}'` | `await phrase_engine.generate('agent_online_local', {'label': label}) + f' {clean}'` |
| `f'{label} agent — configuration needed. {clean}'` | `await phrase_engine.generate('agent_degraded_local', {'label': label}) + f' {clean}'` |
| `f'{total_online} of {total_configured} agent…'` | `await phrase_engine.generate('boot_summary', {'total_online': total_online, 'total': total_configured, 'plural': 's' if total_configured != 1 else ''})` |
| `'Portfolio offline — INDmoney token may have expired…'` | `await phrase_engine.generate('portfolio_auth_error', {})` |

In `ws.py`, replace the `llm_farewell()` call in `farewell_session` handler:
```python
# Old
farewell = await llm_farewell(payload.get('phrase', ''), session_llm_config, session_calling_name)

# New
phrase_engine.configure(session_llm_config)
farewell = await phrase_engine.generate('farewell', {
    'phrase': payload.get('phrase', ''),
    'name': session_calling_name,
    'assistant_name': session_assistant_name,
})
```

### What NOT to Change

- `test_agent()` signature — it still returns `(agent_id, status, msg)`. The msg it returns already uses formatted strings; replace those with `await phrase_engine.generate(...)` inside `test_agent()` as well.
- The snippet extractor functions (`_snip_weather`, `_snip_stock`, etc.) — leave unchanged.
- The `_fetch_boot_snippet()` and `_fetch_stock_boot_snippet()` functions — leave unchanged.
- `reload_agent()` — update the phrase callsites inside it the same way (it calls `test_agent()` internally, so the message strings flow from there).

### Acceptance Criteria

- `python3 -m py_compile apps/orchestrator/app/services/phrases.py` passes
- `python3 -m py_compile apps/orchestrator/app/services/session.py` passes
- Boot sequence completes without NameError or AttributeError
- When LLM is not configured, boot proceeds using static phrase pool (verified by disabling LLM in test env)
- When LLM is configured, boot messages vary noticeably from the static pool
- No string constants remain in `session.py` (grep for `random.choice` returns 0 hits)

---

## Phase 2 — Language Detection + Bilingual Support

### Goal

Detect whether the user is speaking Hindi or English from each voice/text input. Store the detected language per-session. Propagate to LLM system prompts and PhraseEngine static fallback so all responses match the detected language.

### Files to Create

**`apps/orchestrator/app/services/language.py`** (new file, ~30 lines)

### Files to Modify

- `apps/orchestrator/app/services/agent_manager.py`
- `apps/orchestrator/app/services/orchestrator.py`
- `apps/orchestrator/app/api/ws.py`
- `apps/orchestrator/app/services/session.py` (minor — `boot_sequence` signature)

### Technical Approach

#### `language.py`

```python
from __future__ import annotations
import re

_DEVANAGARI = re.compile(r'[ऀ-ॿ]')

def detect_language(text: str) -> str:
    """Return 'hi' if >15% of non-space chars are Devanagari, else 'en'."""
    stripped = text.replace(' ', '')
    if not stripped:
        return 'en'
    ratio = len(_DEVANAGARI.findall(stripped)) / len(stripped)
    return 'hi' if ratio > 0.15 else 'en'
```

#### Changes to `agent_manager.py`

Add one attribute to `AgentManager.__init__`:
```python
self._session_language: str = 'en'
```

Add one method:
```python
def update_language(self, language: str) -> None:
    """Called by ws.py after each user turn to track detected language."""
    self._session_language = language
```

Expose as read-only property:
```python
@property
def session_language(self) -> str:
    return self._session_language
```

Add `language: str = 'en'` parameter to `configure_session()` and set `self._session_language = language`.

Reset in `clear_session()`: `self._session_language = 'en'`.

#### Changes to `orchestrator.py`

Modify `_make_system_prompt(name: str) -> str` to accept language:

```python
def _make_system_prompt(name: str, language: str = 'en') -> str:
    base = (
        f'You are {name}, a voice assistant. '
        # ... existing text unchanged ...
        'Replies: 1–3 sentences, no markdown, no bullet points, plain spoken language. '
    )
    if language == 'hi':
        base += (
            'IMPORTANT: The user is speaking Hindi. '
            'Respond entirely in Hindi using Devanagari script. '
            'Do not mix English words unless they are technical proper nouns.'
        )
    else:
        base += 'IMPORTANT: Always respond in English unless the user explicitly asks otherwise.'
    return base
```

Update every call to `_make_system_prompt(assistant_name)` in `_openai_handle`, `_anthropic_handle`, `_gemini_handle` to pass `language`:
```python
system_prompt = _make_system_prompt(assistant_name, language=getattr(self, '_language', 'en'))
```

Add `_language: str = 'en'` instance attribute on `LLMOrchestrator`. Pass it via `LLMOrchestrator.handle()`:

```python
async def handle(
    self,
    user_message: str,
    llm_config: dict,
    enabled_agents: list[str],
    agents: dict,
    call_agent: object,
    assistant_name: str = 'Robo',
    gateway_tools: dict | None = None,
    language: str = 'en',          # NEW PARAMETER
) -> tuple[str, str]:
    self._language = language
    # ... existing logic unchanged
```

In `agent_manager.py`, update `orchestrate()` to pass `self._session_language`:
```python
return await llm_orchestrator.handle(
    user_message,
    self._session_llm_config,
    self._session_enabled_agents,
    self._agents,
    self.handle_as_tool,
    assistant_name=self._session_assistant_name,
    gateway_tools=gateway_tools if gateway_tools else None,
    language=self._session_language,    # NEW
)
```

#### Changes to `ws.py`

Add import at the top:
```python
from app.services.language import detect_language
from app.services.phrases import phrase_engine
```

In `_handle_text_command()`, after `text = text.strip()` and before `metrics_service.record_command()`:
```python
lang = detect_language(text)
agent_manager.update_language(lang)
phrase_engine.configure(session_llm_config, lang)   # updates language mid-session
```

#### Changes to `session.py`

`boot_sequence()` signature: add `language: str = 'en'` parameter (default keeps backward compat):
```python
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
    language: str = 'en',           # NEW
) -> None:
    phrase_engine.configure(llm_config, language)   # updated call
    agent_manager.configure_session(llm_config, agent_config, registered_agents, calling_name, assistant_name, language)
```

In `ws.py`, pass `language='en'` explicitly to `boot_sequence()` (it defaults to 'en' at boot; language is updated dynamically on each user turn).

### What NOT to Change

- STT provider selection — STT transcribes audio regardless of language; no changes to TTS/STT providers.
- Snippet extractors in `session.py` — these parse English API responses which are always in English.
- Frontend — no TypeScript changes needed for Phase 2.

### Acceptance Criteria

- Sending "नमस्ते, आज का मौसम कैसा है?" produces a Hindi response from the LLM
- Sending "What is the weather today?" produces an English response
- `detect_language('hello world')` returns `'en'`
- `detect_language('नमस्ते दुनिया')` returns `'hi'`
- Static boot phrases remain in English (boot always starts with `language='en'`; Hindi detection activates on first user turn)
- `python3 -m py_compile` passes for all modified files

---

## Phase 3 — Agent Modularity + Inter-agent Communication + Performance

### Goal

(A) Define a formal `AgentMessage` protocol for inter-agent calls routed through the orchestrator. Fix `briefing.py` accessing private `agent_manager` attributes. (B) Add an in-memory per-agent response cache with configurable TTL. (C) Parallelize credential pushes with the greeting at boot start to reduce perceived latency.

### Files to Create

- `apps/orchestrator/app/models/agent_message.py` (new)
- `apps/orchestrator/app/services/cache.py` (new)

### Files to Modify

- `apps/orchestrator/app/services/agent_manager.py`
- `apps/orchestrator/app/agents/briefing.py`
- `apps/orchestrator/app/services/session.py` (boot parallelization)

### Technical Approach

#### `apps/orchestrator/app/models/agent_message.py`

```python
from __future__ import annotations
from dataclasses import dataclass, field

@dataclass
class AgentMessage:
    """Inter-agent call routed through the orchestrator.

    Agents must NOT import each other directly. Use this protocol
    and route through agent_manager.call_agent_from_agent().
    """
    source_agent: str       # ID of the calling agent (e.g. 'briefing')
    tool_name: str          # gateway tool (e.g. 'weather__get_current_weather')
                            # OR local agent ID (e.g. 'calculator')
    arguments: dict = field(default_factory=dict)
    timeout: float = 5.0
```

#### `apps/orchestrator/app/services/cache.py`

```python
from __future__ import annotations
import hashlib
import time
from dataclasses import dataclass

@dataclass
class _Entry:
    value: str
    expires_at: float

# Per-agent cache TTLs in seconds
_TTL: dict[str, float] = {
    'weather':   300.0,   # 5 min — conditions change slowly
    'stock':     60.0,    # 1 min — market data changes frequently
    'news':      900.0,   # 15 min — headlines are relatively stable
    'github':    120.0,   # 2 min
    'calendar':  30.0,    # 30 sec — schedule is user-editable
    'email':     30.0,    # 30 sec
    'system':    10.0,    # 10 sec — CPU/RAM fluctuates
    'smarthome': 15.0,    # 15 sec — device state changes
    'portfolio': 120.0,   # 2 min
    'whatsapp':  20.0,    # 20 sec
}
_DEFAULT_TTL = 60.0


class AgentResponseCache:
    def __init__(self) -> None:
        self._store: dict[str, _Entry] = {}

    def _key(self, agent_id: str, query: str) -> str:
        h = hashlib.md5(query.lower().strip().encode()).hexdigest()[:10]
        return f'{agent_id}:{h}'

    def get(self, agent_id: str, query: str) -> str | None:
        k = self._key(agent_id, query)
        e = self._store.get(k)
        if e and time.monotonic() < e.expires_at:
            return e.value
        if e:
            del self._store[k]
        return None

    def set(self, agent_id: str, query: str, value: str) -> None:
        ttl = _TTL.get(agent_id, _DEFAULT_TTL)
        self._store[self._key(agent_id, query)] = _Entry(value, time.monotonic() + ttl)

    def invalidate(self, agent_id: str) -> None:
        prefix = f'{agent_id}:'
        for k in [k for k in self._store if k.startswith(prefix)]:
            del self._store[k]

    def clear(self) -> None:
        self._store.clear()


agent_cache = AgentResponseCache()
```

#### Changes to `agent_manager.py`

Expose `enabled_agents` as a public read-only property:
```python
@property
def enabled_agents(self) -> list[str]:
    return list(self._session_enabled_agents)
```

Add `call_agent_from_agent()` method:
```python
async def call_agent_from_agent(self, msg: AgentMessage) -> str:
    """Route an AgentMessage. Checks cache; sets cache on miss.

    Gateway tools: delegated to gateway_client.call_tool().
    Local agents:  delegated to self.handle_as_tool().
    """
    from app.services.cache import agent_cache
    # Derive agent_id for cache key from tool_name
    agent_id = msg.tool_name.split('__')[0] if '__' in msg.tool_name else msg.tool_name
    query = msg.arguments.get('query', '')

    cached = agent_cache.get(agent_id, query)
    if cached is not None:
        return cached

    result = await asyncio.wait_for(
        self.handle_as_tool(msg.tool_name, query),
        timeout=msg.timeout,
    )
    if result and not result.startswith('Tool call failed'):
        agent_cache.set(agent_id, query, result)
    return result
```

Add import at the top of `agent_manager.py`:
```python
from app.models.agent_message import AgentMessage
```

Also update `handle_as_tool()` to consult the cache before forwarding to the gateway:
```python
async def handle_as_tool(self, fn_name: str, query: str) -> str:
    from app.services.cache import agent_cache
    agent_id = fn_name.split('__')[0] if '__' in fn_name else fn_name
    cached = agent_cache.get(agent_id, query)
    if cached is not None:
        return cached

    # ... existing gateway / local agent dispatch unchanged ...

    # After getting result, cache it:
    if result and isinstance(result, str) and 'failed' not in result.lower()[:20]:
        agent_cache.set(agent_id, query, result)
    return result
```

In `clear_session()`, call `agent_cache.clear()` to flush stale data on session end.

#### Changes to `briefing.py`

Replace private attribute access and direct `gateway_client` import:

```python
# OLD (remove these)
from app.dependencies import agent_manager
enabled = set(agent_manager._session_enabled_agents)
# ... self._gw() which calls gateway_client.call_tool() directly

# NEW
from app.dependencies import agent_manager
from app.models.agent_message import AgentMessage

# In handle():
enabled = set(agent_manager.enabled_agents)   # use public property

# Replace self._gw() calls:
async def _call(self, tool_name: str, arguments: dict) -> str:
    try:
        return await agent_manager.call_agent_from_agent(
            AgentMessage(source_agent=self.id, tool_name=tool_name, arguments=arguments)
        )
    except Exception:
        return ''
```

Remove `_gw()` method entirely from `BriefingAgent`.

Also update `AgentRequest` import in `briefing.py` — it's currently missing (the `handle()` signature uses `AgentRequest` as type hint):
```python
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus
```

#### Boot Performance: Parallelize Credential Pushes with Greeting

In `session.py`'s `boot_sequence()`, the current flow is serial:
1. `configure_session()` — synchronous, fast
2. Credential push tasks created (`asyncio.create_task(...)`) — fire-and-forget, but created before greeting
3. `speak_fn(greeting)` — awaited
4. `agent_manager.initialize_enabled_agents()` — awaited

Move the SmartHome credential await (currently the only `await` in the push block) to run in parallel with the greeting:

```python
# OLD:
if 'smarthome' in registered_agents and endpoint and token:
    await gateway_client.update_smarthome_session(endpoint, token)   # blocks!

greeting_task = asyncio.create_task(speak_fn('boot_status', greeting, None, tts))
init_task     = asyncio.create_task(agent_manager.initialize_enabled_agents())
await greeting_task
await init_task

# NEW: wrap smarthome push in a task alongside greeting
smarthome_task = asyncio.create_task(
    gateway_client.update_smarthome_session(endpoint, token)
) if ('smarthome' in registered_agents and endpoint and token) else None

greeting_task = asyncio.create_task(speak_fn('boot_status', greeting, None, tts))
init_task     = asyncio.create_task(agent_manager.initialize_enabled_agents())
await asyncio.gather(greeting_task, init_task, smarthome_task or asyncio.sleep(0))
```

This removes the SmartHome credential-push blocking delay before the greeting.

### What NOT to Change

- `BaseTool` ABC in the MCP Gateway
- Gateway tool files — they don't call other agents
- The `handle_as_tool` gateway dispatch logic beyond adding the cache check
- The LLM orchestrator in `orchestrator.py` — no changes needed for this phase

### Acceptance Criteria

- `from app.models.agent_message import AgentMessage` succeeds
- `briefing.py` has zero references to `agent_manager._session_enabled_agents`
- Briefing agent still produces correct multi-source output in a live session
- Second identical query to a gateway agent within the TTL window returns the cached response (verify via log timing: second call should be <5 ms)
- Boot sequence completes at least 500 ms faster on SmartHome-enabled sessions (SmartHome push no longer blocks greeting)
- `python3 -m py_compile` passes for all modified files

---

## Phase 4 — Agent Notification System

### Goal

Move agent polling from the frontend to the backend. Each enabled agent with `notificationsEnabled: true` gets an asyncio background task that polls its gateway tool at a configurable interval. Results push to the frontend via a new WebSocket event `agent_notification`. Frontend handles the new event with `rt.pushNotification()`.

### Files to Create

**`apps/orchestrator/app/services/notification_scheduler.py`** (new, ~120 lines)

### Files to Modify

- `apps/orchestrator/app/api/ws.py` (start/stop scheduler, pass `notifications_enabled` map)
- `apps/desktop/src/hooks/useOrchestratorRuntime.ts` (handle `agent_notification` event)

### Technical Approach

#### `notification_scheduler.py`

```python
from __future__ import annotations
import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class AgentNotification:
    agent_id: str
    text: str
    severity: str          # 'info' | 'warning' | 'alert'
    condition_key: str     # stable dedup key; frontend filters by this

BroadcastFn = Callable[[str, dict], Awaitable[None]]

# Poll intervals in seconds per agent
_INTERVALS: dict[str, float] = {
    'weather':   300.0,   # 5 min
    'stock':     120.0,   # 2 min
    'news':      600.0,   # 10 min
    'github':    180.0,   # 3 min
    'calendar':  60.0,    # 1 min
    'email':     60.0,    # 1 min
    'system':    30.0,    # 30 sec
    'smarthome': 60.0,    # 1 min
    'portfolio': 300.0,   # 5 min
    'whatsapp':  45.0,    # 45 sec
}


class NotificationScheduler:
    """Manages per-agent background polling tasks."""

    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task] = {}
        self._broadcast: BroadcastFn | None = None
        self._notifications_enabled: dict[str, bool] = {}

    def configure(
        self,
        enabled_agents: list[str],
        notifications_enabled: dict[str, bool],
        broadcast: BroadcastFn,
    ) -> None:
        self._broadcast = broadcast
        # Build map: agent_id -> bool (only agents in enabled_agents list)
        self._notifications_enabled = {
            agent_id: notifications_enabled.get(agent_id, False)
            for agent_id in enabled_agents
        }

    async def start(self) -> None:
        await self.stop()
        for agent_id, enabled in self._notifications_enabled.items():
            if not enabled:
                continue
            interval = _INTERVALS.get(agent_id, 120.0)
            self._tasks[agent_id] = asyncio.create_task(
                self._poll_loop(agent_id, interval),
                name=f'notif_{agent_id}',
            )

    async def stop(self) -> None:
        for task in self._tasks.values():
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks.values(), return_exceptions=True)
        self._tasks.clear()

    async def _poll_loop(self, agent_id: str, interval: float) -> None:
        # Initial delay of half the interval so we don't hammer all agents at t=0
        await asyncio.sleep(interval / 2)
        while True:
            try:
                notifications = await self._check(agent_id)
                for n in notifications:
                    if self._broadcast:
                        await self._broadcast('agent_notification', {
                            'agent_id':      n.agent_id,
                            'text':          n.text,
                            'severity':      n.severity,
                            'condition_key': n.condition_key,
                        })
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.debug('Notif poll error [%s]: %s', agent_id, exc)
            try:
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break

    async def _check(self, agent_id: str) -> list[AgentNotification]:
        """Evaluate one agent for notification-worthy conditions.

        Each agent's check calls its gateway boot tool and looks for
        threshold breaches. Returns empty list when nothing notable.
        """
        from app.dependencies import gateway_client
        from app.services.session import _GW_BOOT_CALLS, is_agent_error
        import json as _json, asyncio as _asyncio

        call = _GW_BOOT_CALLS.get(agent_id)
        if not call:
            return []
        tool_name, args = call
        try:
            raw = await _asyncio.wait_for(
                gateway_client.call_tool(tool_name, args), timeout=8.0
            )
            if not raw:
                return []
            text = _json.dumps(raw) if isinstance(raw, (dict, list)) else str(raw)
            if is_agent_error(text):
                return []
            return self._evaluate(agent_id, text)
        except Exception:
            return []

    def _evaluate(self, agent_id: str, text: str) -> list[AgentNotification]:
        """Rule-based threshold evaluation — returns 0 or 1 notification."""
        import re
        if agent_id == 'system':
            cpu = re.search(r'CPU usage:\s*([\d.]+)%', text)
            if cpu and float(cpu.group(1)) > 85:
                return [AgentNotification(
                    agent_id='system',
                    text=f'CPU at {cpu.group(1)}% — system under heavy load.',
                    severity='warning',
                    condition_key='system_cpu_high',
                )]
        if agent_id == 'weather':
            t = text.lower()
            if any(w in t for w in ('storm', 'thunder', 'heavy rain', 'cyclone', 'flood')):
                return [AgentNotification(
                    agent_id='weather',
                    text='Weather alert: severe conditions reported in your area.',
                    severity='alert',
                    condition_key='weather_severe',
                )]
        if agent_id == 'stock':
            m = re.search(r'\(([+-][\d.]+)%\)', text)
            if m and abs(float(m.group(1))) > 2.0:
                pct = float(m.group(1))
                direction = 'up' if pct > 0 else 'down'
                return [AgentNotification(
                    agent_id='stock',
                    text=f'Market move: Nifty {direction} {abs(pct):.1f}% today.',
                    severity='info',
                    condition_key=f'stock_move_{direction}',
                )]
        if agent_id == 'github':
            m = re.search(r'(\d+) pull request', text)
            if m and int(m.group(1)) > 0:
                return [AgentNotification(
                    agent_id='github',
                    text=f'{m.group(1)} GitHub pull request(s) awaiting your review.',
                    severity='info',
                    condition_key=f'github_prs_{m.group(1)}',
                )]
        return []


notification_scheduler = NotificationScheduler()
```

#### Changes to `ws.py`

Add import:
```python
from app.services.notification_scheduler import notification_scheduler
from app.api.ws import broadcast   # already in module scope
```

In the `start_session` command handler, after `await boot_sequence(...)`, add:
```python
# Build notifications_enabled map from the agent_config sent by the frontend
_notif_enabled: dict[str, bool] = {}
for _key, _sub in (agent_config or {}).items():
    if isinstance(_sub, dict):
        _notif_enabled[_key] = bool(_sub.get('notifications_enabled', False))
# Map google sub-agents
_google = (agent_config or {}).get('google', {})
_notif_enabled['calendar'] = bool(_google.get('calendar_notifications_enabled', False))
_notif_enabled['email']    = bool(_google.get('email_notifications_enabled', False))

notification_scheduler.configure(
    enabled_agents=registered_agents,
    notifications_enabled=_notif_enabled,
    broadcast=broadcast,
)
asyncio.create_task(notification_scheduler.start())
```

In `farewell_session` and `stop_session` handlers, after `agent_manager.clear_session()`:
```python
await notification_scheduler.stop()
```

#### Changes to `useOrchestratorRuntime.ts`

In `handleWsEvent` switch block, add a new case after `case 'alert':`:

```typescript
case 'agent_notification': {
  const text      = payload.text      as string;
  const agentId   = payload.agent_id  as string;
  const severity  = (payload.severity as string) ?? 'info';
  const condKey   = (payload.condition_key as string) ?? agentId;
  // pushNotification speaks + appends to transcript
  pushNotification(text, agentId);
  // Also surface as a visual notification in AgentNotificationPanel
  // by emitting a synthetic AgentNotification event the App.tsx listener picks up.
  // We do this by dispatching a custom DOM event to avoid prop-drilling.
  window.dispatchEvent(new CustomEvent('agent-notification', {
    detail: { text, agentId, severity, conditionKey: condKey },
  }));
  break;
}
```

In `App.tsx`, inside the `useEffect` that already listens for notifications, add a `window.addEventListener('agent-notification', ...)` handler:

```typescript
useEffect(() => {
  const handler = (e: Event) => {
    const { text, agentId, severity, conditionKey } = (e as CustomEvent).detail;
    setActiveNotifications((prev) => {
      const without = prev.filter((n) => n.conditionKey !== conditionKey);
      return [...without, {
        id: `${conditionKey}-${Date.now()}`,
        conditionKey,
        agentId,
        agentLabel: AGENT_LABELS[agentId] ?? agentId,
        message: text,
        severity,
        timestamp: Date.now(),
      }];
    });
    rt.pushNotification(text, agentId);
  };
  window.addEventListener('agent-notification', handler);
  return () => window.removeEventListener('agent-notification', handler);
}, [rt.pushNotification]);
```

Note: This approach avoids modifying the `useOrchestratorRuntime` return type or adding new state to the hook. The CustomEvent bridges the gap cleanly.

### What NOT to Change

- The existing `useProactiveNotifications` hook — leave it in place; the backend notifications augment it, not replace it
- `AgentNotificationPanel.tsx` — it already handles the `AgentNotification` type
- Frontend polling for social media (in `App.tsx`) and reminders (notes API) — these stay frontend-only since they require OAuth tokens the backend doesn't hold

### Acceptance Criteria

- Starting a session with `system.notificationsEnabled: true` creates a `notif_system` asyncio task
- Stopping the session cancels all notification tasks (verify: no `notif_*` tasks in asyncio running loop after stop)
- A simulated CPU spike (>85%) causes an `agent_notification` WebSocket event within 30 s
- The notification appears in `AgentNotificationPanel` without duplicate entries (dedup by `conditionKey`)
- `python3 -m py_compile` passes for `notification_scheduler.py`

---

## Phase 5 — Frontend Refactor (Settings + Theme + Animations)

### Goal

(A) Introduce `AgentSettingsCard` as the uniform base component for every agent in the settings panel, replacing the per-agent custom HTML in `AgentsSettings.tsx`. (B) Create `HoloCard` for 3D perspective-tilt holographic glassmorphism effects. (C) Define a canonical per-agent neon palette in `agentPalette.ts` used by both the settings panel and `App.tsx`. (D) Add Framer Motion animations: drawer open/close, card stagger entrance, modal pop-in. (E) Refactor agent grouping: Always On / Gateway Integrations / Smart Devices.

### Files to Create

- `apps/desktop/src/lib/agentPalette.ts` (new)
- `apps/desktop/src/components/settings/AgentSettingsCard.tsx` (new)
- `apps/desktop/src/components/settings/HoloCard.tsx` (new)

### Files to Modify

- `apps/desktop/src/components/settings/AgentsSettings.tsx`
- `apps/desktop/src/components/SettingsPanel.tsx` (drawer animation only)
- `apps/desktop/src/App.tsx` (import `AGENT_PALETTE` for `AGENT_PILL_META` unification)

### Files to NOT Touch in Phase 5

- `WeatherSettings.tsx`, `GoogleSettings.tsx`, `GithubSettings.tsx`, `NewsSettings.tsx`, `SmartHomeSettings.tsx`, `PortfolioSettings.tsx`, `WhatsappSettings.tsx`, `StockSettings.tsx`, `SystemSettings.tsx`, `SocialMediaSettings.tsx` — credential form contents stay unchanged
- `shared.tsx` (TokenField, StatusBadge, SecurityNotice) — these are consumed by AgentSettingsCard unchanged
- `AgentAccordion.tsx` — keep for backward compatibility; AgentSettingsCard is the new standard
- `VoiceSettings.tsx`, `ProfileSettings.tsx`, `AISettings.tsx`, `ProvidersSettings.tsx`
- `AgentOrbit3D.tsx`, `HoloChat.tsx`, `ParticleField.tsx`

### Technical Approach

#### `apps/desktop/src/lib/agentPalette.ts`

This becomes the single source of truth for per-agent visual identity. Both `App.tsx`'s `AGENT_PILL_META` and `AgentsSettings.tsx`'s `AGENT_META` should import from here.

```typescript
export interface AgentPaletteEntry {
  // Tailwind utility classes
  text:       string;   // e.g. 'text-cyan-400'
  bg:         string;   // e.g. 'bg-cyan-400/10'
  border:     string;   // e.g. 'border-cyan-400/25'
  ring:        string;  // e.g. 'ring-cyan-400/30'
  // CSS values for effects that Tailwind can't express at runtime
  glowRgba:   string;   // e.g. 'rgba(34,211,238,0.35)' — for box-shadow
  neonRgba:   string;   // e.g. 'rgba(34,211,238,0.7)' — for text drop-shadow
}

export const AGENT_PALETTE: Record<string, AgentPaletteEntry> = {
  weather:     { text: 'text-cyan-400',    bg: 'bg-cyan-400/10',    border: 'border-cyan-400/25',   ring: 'ring-cyan-400/30',    glowRgba: 'rgba(34,211,238,0.35)',   neonRgba: 'rgba(34,211,238,0.7)'   },
  calendar:    { text: 'text-violet-400',  bg: 'bg-violet-400/10',  border: 'border-violet-400/25', ring: 'ring-violet-400/30',  glowRgba: 'rgba(167,139,250,0.35)',  neonRgba: 'rgba(167,139,250,0.7)'  },
  email:       { text: 'text-rose-400',    bg: 'bg-rose-400/10',    border: 'border-rose-400/25',   ring: 'ring-rose-400/30',    glowRgba: 'rgba(251,113,133,0.35)',  neonRgba: 'rgba(251,113,133,0.7)'  },
  github:      { text: 'text-amber-400',   bg: 'bg-amber-400/10',   border: 'border-amber-400/25',  ring: 'ring-amber-400/30',   glowRgba: 'rgba(251,191,36,0.35)',   neonRgba: 'rgba(251,191,36,0.7)'   },
  stock:       { text: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/25',ring: 'ring-emerald-400/30', glowRgba: 'rgba(52,211,153,0.35)',   neonRgba: 'rgba(52,211,153,0.7)'   },
  news:        { text: 'text-sky-400',     bg: 'bg-sky-400/10',     border: 'border-sky-400/25',    ring: 'ring-sky-400/30',     glowRgba: 'rgba(56,189,248,0.35)',   neonRgba: 'rgba(56,189,248,0.7)'   },
  smarthome:   { text: 'text-orange-400',  bg: 'bg-orange-400/10',  border: 'border-orange-400/25', ring: 'ring-orange-400/30',  glowRgba: 'rgba(251,146,60,0.35)',   neonRgba: 'rgba(251,146,60,0.7)'   },
  portfolio:   { text: 'text-pink-400',    bg: 'bg-pink-400/10',    border: 'border-pink-400/25',   ring: 'ring-pink-400/30',    glowRgba: 'rgba(244,114,182,0.35)',  neonRgba: 'rgba(244,114,182,0.7)'  },
  whatsapp:    { text: 'text-green-400',   bg: 'bg-green-400/10',   border: 'border-green-400/25',  ring: 'ring-green-400/30',   glowRgba: 'rgba(74,222,128,0.35)',   neonRgba: 'rgba(74,222,128,0.7)'   },
  notes:       { text: 'text-purple-400',  bg: 'bg-purple-400/10',  border: 'border-purple-400/25', ring: 'ring-purple-400/30',  glowRgba: 'rgba(192,132,252,0.35)',  neonRgba: 'rgba(192,132,252,0.7)'  },
  socialmedia: { text: 'text-red-400',     bg: 'bg-red-400/10',     border: 'border-red-400/25',    ring: 'ring-red-400/30',     glowRgba: 'rgba(248,113,113,0.35)',  neonRgba: 'rgba(248,113,113,0.7)'  },
  websearch:   { text: 'text-indigo-400',  bg: 'bg-indigo-400/10',  border: 'border-indigo-400/25', ring: 'ring-indigo-400/30',  glowRgba: 'rgba(129,140,248,0.35)',  neonRgba: 'rgba(129,140,248,0.7)'  },
  calculator:  { text: 'text-amber-300',   bg: 'bg-amber-300/10',   border: 'border-amber-300/25',  ring: 'ring-amber-300/30',   glowRgba: 'rgba(252,211,77,0.35)',   neonRgba: 'rgba(252,211,77,0.7)'   },
  memory:      { text: 'text-teal-400',    bg: 'bg-teal-400/10',    border: 'border-teal-400/25',   ring: 'ring-teal-400/30',    glowRgba: 'rgba(45,212,191,0.35)',   neonRgba: 'rgba(45,212,191,0.7)'   },
  briefing:    { text: 'text-cyan-300',    bg: 'bg-cyan-300/10',    border: 'border-cyan-300/25',   ring: 'ring-cyan-300/30',    glowRgba: 'rgba(103,232,249,0.35)',  neonRgba: 'rgba(103,232,249,0.7)'  },
  general:     { text: 'text-violet-400',  bg: 'bg-violet-400/10',  border: 'border-violet-400/25', ring: 'ring-violet-400/30',  glowRgba: 'rgba(167,139,250,0.35)',  neonRgba: 'rgba(167,139,250,0.7)'  },
  system:      { text: 'text-teal-400',    bg: 'bg-teal-400/10',    border: 'border-teal-400/25',   ring: 'ring-teal-400/30',    glowRgba: 'rgba(45,212,191,0.35)',   neonRgba: 'rgba(45,212,191,0.7)'   },
  google:      { text: 'text-blue-400',    bg: 'bg-blue-400/10',    border: 'border-blue-400/25',   ring: 'ring-blue-400/30',    glowRgba: 'rgba(96,165,250,0.35)',   neonRgba: 'rgba(96,165,250,0.7)'   },
};

export const AGENT_PALETTE_FALLBACK: AgentPaletteEntry = AGENT_PALETTE['general'];
```

#### `HoloCard.tsx`

```typescript
// apps/desktop/src/components/settings/HoloCard.tsx

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AGENT_PALETTE, AGENT_PALETTE_FALLBACK } from '../../lib/agentPalette';

interface HoloCardProps {
  agentId: string;
  className?: string;
  children: React.ReactNode;
}

export function HoloCard({ agentId, className = '', children }: HoloCardProps) {
  const p = AGENT_PALETTE[agentId] ?? AGENT_PALETTE_FALLBACK;
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt]     = useState({ rotateX: 0, rotateY: 0 });
  const [shimmer, setShimmer] = useState({ x: 50, y: 50 });

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top)  / rect.height;
    setTilt({ rotateX: (0.5 - y) * 8, rotateY: (x - 0.5) * 8 });
    setShimmer({ x: x * 100, y: y * 100 });
  };

  const onMouseLeave = () => {
    setTilt({ rotateX: 0, rotateY: 0 });
    setShimmer({ x: 50, y: 50 });
  };

  return (
    <div style={{ perspective: '900px' }} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      <motion.div
        ref={cardRef}
        animate={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        style={{
          transformStyle: 'preserve-3d',
          boxShadow: `0 0 14px ${p.glowRgba}`,
        }}
        className={`relative rounded-2xl border ${p.border} ${p.bg} backdrop-blur-sm ${className}`}
      >
        {/* Holographic shimmer overlay — appears on hover only */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-200"
          style={{
            background: `radial-gradient(circle at ${shimmer.x}% ${shimmer.y}%, rgba(255,255,255,0.07) 0%, transparent 65%)`,
            opacity: tilt.rotateX !== 0 || tilt.rotateY !== 0 ? 1 : 0,
          }}
        />
        {/* Neon border highlight — top edge */}
        <div
          className="pointer-events-none absolute top-0 inset-x-0 h-px rounded-t-2xl"
          style={{ background: `linear-gradient(90deg, transparent, ${p.glowRgba}, transparent)` }}
        />
        {children}
      </motion.div>
    </div>
  );
}
```

#### `AgentSettingsCard.tsx`

```typescript
// apps/desktop/src/components/settings/AgentSettingsCard.tsx

import { type LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { AGENT_PALETTE, AGENT_PALETTE_FALLBACK } from '../../lib/agentPalette';
import { HoloCard } from './HoloCard';
import { StatusBadge } from './shared';
import type { ConnectionStatus } from '../../hooks/useAgentConfig';

interface AgentSettingsCardProps {
  id: string;
  name: string;
  tagline: string;
  icon: LucideIcon;
  status: ConnectionStatus;
  info?: string;
  enabled: boolean;
  onToggleEnabled?: () => void;   // undefined = always-on agent (no toggle rendered)
  open: boolean;
  onToggleOpen: () => void;
  children?: React.ReactNode;     // credential form content
}

export function AgentSettingsCard({
  id, name, tagline, icon: Icon, status, info,
  enabled, onToggleEnabled, open, onToggleOpen, children,
}: AgentSettingsCardProps) {
  const p = AGENT_PALETTE[id] ?? AGENT_PALETTE_FALLBACK;
  const effectiveStatus = enabled ? status : 'idle';
  const effectiveInfo   = enabled ? info    : 'Disabled — toggle to enable';

  return (
    <HoloCard agentId={id}>
      {/* Header row */}
      <button
        onClick={onToggleOpen}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        {/* Icon badge with neon glow */}
        <div
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${p.bg} border ${p.border}`}
          style={{ boxShadow: `0 0 8px ${p.glowRgba}` }}
        >
          <Icon
            className={`h-4.5 w-4.5 ${p.text}`}
            style={{ filter: `drop-shadow(0 0 4px ${p.neonRgba})` }}
          />
        </div>

        {/* Name + tagline */}
        <div className="flex-1 min-w-0">
          <div
            className={`text-sm font-semibold truncate ${p.text}`}
            style={{ filter: `drop-shadow(0 0 5px ${p.neonRgba})` }}
          >
            {name}
          </div>
          <div className="text-[10px] text-slate-500 truncate mt-0.5">{tagline}</div>
          <StatusBadge status={effectiveStatus} info={effectiveInfo} />
        </div>

        {/* Enable/disable toggle (absent for always-on agents) */}
        {onToggleEnabled !== undefined && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleEnabled(); }}
            aria-label={enabled ? `Disable ${name}` : `Enable ${name}`}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
              enabled ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        )}

        {/* Expand chevron (only when card has credential fields) */}
        {children && (
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-4 w-4 text-slate-600" />
          </motion.div>
        )}
      </button>

      {/* Collapsible credential content */}
      <AnimatePresence initial={false}>
        {open && children && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 pt-1 space-y-3 border-t"
              style={{ borderColor: `${p.glowRgba.replace('0.35', '0.12')}` }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </HoloCard>
  );
}
```

#### `AgentsSettings.tsx` Refactor

Replace the current large render function with a three-section layout. The `AGENT_META` constant and its duplicate data are removed — import from `AGENT_PALETTE` instead.

Structure:

```typescript
// imports — keep all existing per-agent settings imports unchanged
import { AGENT_PALETTE } from '../../lib/agentPalette';
import { AgentSettingsCard } from './AgentSettingsCard';

// ── Group definitions ─────────────────────────────────────────────

const ALWAYS_ON_IDS = ['websearch', 'calculator', 'memory', 'briefing'] as const;
const GATEWAY_IDS   = ['system', 'weather', 'google', 'github', 'stock', 'news', 'portfolio', 'whatsapp', 'socialmedia'] as const;
const DEVICE_IDS    = ['smarthome'] as const;

// ── Section header component ──────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mt-2 mb-1 px-1">
      <div className="h-px flex-1 bg-white/6" />
      <span className="text-[9px] font-mono uppercase tracking-[0.3em] text-slate-600">
        {label}{count !== undefined ? ` (${count})` : ''}
      </span>
      <div className="h-px flex-1 bg-white/6" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export function AgentsSettings(/* same props as today */) {
  const [openId, setOpenId] = useState<string | null>(null);
  const toggle = (id: string) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <div className="space-y-2 px-1">

      {/* Always On */}
      <SectionHeader label="Always On" count={ALWAYS_ON_IDS.length} />
      {ALWAYS_ON_IDS.map((id, i) => (
        <motion.div
          key={id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.2, ease: 'easeOut' }}
        >
          <AgentSettingsCard
            id={id}
            name={AGENT_META[id].label}
            tagline={AGENT_META[id].tagline}
            icon={AGENT_META[id].Icon}
            status="connected"
            info="Always active — no configuration needed"
            enabled={true}
            onToggleEnabled={undefined}    // no toggle for always-on
            open={openId === id}
            onToggleOpen={() => toggle(id)}
          />
          {/* AgentVoiceRow per agent — place inside card children */}
        </motion.div>
      ))}

      {/* Gateway Integrations */}
      <SectionHeader label="Gateway Integrations" />
      {GATEWAY_IDS.map((id, i) => {
        const state = getState(id, config);
        return (
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (ALWAYS_ON_IDS.length + i) * 0.05, duration: 0.2, ease: 'easeOut' }}
          >
            <AgentSettingsCard
              id={id}
              name={AGENT_META[id].label}
              tagline={AGENT_META[id].tagline}
              icon={AGENT_META[id].Icon}
              status={state.status}
              info={state.info}
              enabled={state.enabled}
              onToggleEnabled={() => handleToggle(id)}
              open={openId === id}
              onToggleOpen={() => toggle(id)}
            >
              {/* Existing per-agent settings components unchanged */}
              {id === 'weather' && <WeatherSettings config={config.weather} onPatch={...} onVerify={...} />}
              {/* ... etc ... */}
            </AgentSettingsCard>
          </motion.div>
        );
      })}

      {/* Smart Devices */}
      <SectionHeader label="Smart Devices" />
      {DEVICE_IDS.map((id, i) => {
        const state = getState(id, config);
        return (
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (ALWAYS_ON_IDS.length + GATEWAY_IDS.length + i) * 0.05, duration: 0.2, ease: 'easeOut' }}
          >
            <AgentSettingsCard
              id={id}
              name={AGENT_META[id].label}
              tagline={AGENT_META[id].tagline}
              icon={AGENT_META[id].Icon}
              status={state.status}
              info={state.info}
              enabled={state.enabled}
              onToggleEnabled={() => handleToggle(id)}
              open={openId === id}
              onToggleOpen={() => toggle(id)}
            >
              <SmartHomeSettings config={config.smarthome} onPatch={...} onVerify={...} />
            </AgentSettingsCard>
          </motion.div>
        );
      })}
    </div>
  );
}
```

Keep the existing `AGENT_META` record (it still holds the taglines and icons); just remove the `color`, `ring`, `bg` fields from it — those now come from `AGENT_PALETTE`.

#### Settings Drawer Animation in `SettingsPanel.tsx`

Find the outermost panel `<div>` that slides in from the right. Wrap its content with:

```tsx
// In SettingsPanel.tsx, the open/close logic
<AnimatePresence>
  {open && (
    <motion.div
      key="settings-panel"
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="fixed inset-y-0 right-0 w-[480px] z-50 ..."
    >
      {/* existing panel content */}
    </motion.div>
  )}
</AnimatePresence>
```

Duration 250 ms, cubic-bezier easing `[0.25, 0.46, 0.45, 0.94]` (matches iOS sheet).

#### `App.tsx` — Unify `AGENT_PILL_META`

Replace the `AGENT_PILL_META` constant in `App.tsx` with a version derived from `AGENT_PALETTE`:

```typescript
import { AGENT_PALETTE } from './lib/agentPalette';
import type { LucideIcon } from 'lucide-react';

// Keep icon mapping here (palette doesn't store icons)
const AGENT_ICONS: Record<string, LucideIcon> = {
  weather: Cloud, calendar: Calendar, email: Mail, /* ... etc ... */
};

// Derive AGENT_PILL_META from palette
const AGENT_PILL_META = Object.fromEntries(
  Object.entries(AGENT_PALETTE).map(([id, p]) => [
    id,
    { icon: AGENT_ICONS[id] ?? Zap, text: p.text, bg: p.bg, border: p.border },
  ])
);
```

### Acceptance Criteria

- `npx tsc --noEmit` in `apps/desktop` passes with zero errors
- Settings drawer opens and closes with slide animation (visible 250 ms transition)
- Cards appear with stagger entrance (each 50 ms later than the previous)
- Hovering a settings card produces measurable 3D tilt (rotateX/Y non-zero in browser devtools)
- Holographic shimmer follows the cursor position within the card
- Agent names display with neon glow (visible drop-shadow)
- Three section headers (Always On, Gateway Integrations, Smart Devices) render correctly
- Enabling/disabling a gateway agent via the toggle in the settings card persists to localStorage
- `npm test` in `apps/desktop` passes (no regression in existing test suite)

---

## Documentation Phase — `docs/adding-new-agent.md`

### Goal

A single reference document for adding either a new local agent or a new gateway tool. It must contain exact file paths and the minimal code shape for each step, so developers add new agents without reading the entire codebase.

### File to Create

**`docs/adding-new-agent.md`**

### Structure

The document must cover:

1. **Decision tree** — "Is this a local agent (runs inside the orchestrator process) or a gateway tool (served by MCP Gateway and accessed over HTTP)?"

2. **Case A — New Gateway Tool** (3 steps)
   - Step 1: Create `apps/mcp-gateway/src/tools/<name>.py` — full minimal template implementing `BaseTool` (`namespace`, `list_tools()`, `call_tool()`, `startup()`, `shutdown()`). Read credentials from `settings` parameter.
   - Step 2: Add credential fields to `apps/mcp-gateway/src/config/settings.py` (exact field format: `field_name: str = Field('', env='FIELD_NAME')`) and to `apps/mcp-gateway/.env.sample`.
   - Step 3: Register in `apps/mcp-gateway/src/main.py` → `_register_tools()` with exact one-liner.

3. **Case B — New Local Agent** (8 steps with exact paths)
   - Step 1: Create `apps/orchestrator/app/agents/<name>.py` — full minimal template extending `AssistantAgent`, setting `id`, `name`, `config_key`, `tool_meta`, implementing `handle()`, `initialize()`, `health()`, `shutdown()`.
   - Step 2: Register in `apps/orchestrator/app/agents/registry.py` — add import and class to `AGENTS` list.
   - Step 3: Add keyword routing in `apps/orchestrator/app/services/router.py` — exact `if keyword in t:` block format.
   - Step 4: Add entry to `AGENT_LABELS` in `apps/orchestrator/app/services/session.py`.
   - Step 5: Add entry to `AGENT_BOOT_QUERY` in `apps/orchestrator/app/services/session.py` (use `''` to skip boot test, `'__boot__'` for a live query).
   - Step 6: Add entry to `AGENT_CATALOGUE` in `apps/desktop/src/hooks/useOrchestratorRuntime.ts` (exact interface fields: `id`, `label`, `description`, `example`, `status: 'offline'`, `color`).
   - Step 7: Add palette entry in `apps/desktop/src/lib/agentPalette.ts`.
   - Step 8: Add the agent's settings card in `apps/desktop/src/components/settings/AgentsSettings.tsx` — choose `ALWAYS_ON_IDS` or `GATEWAY_IDS` array and add `AGENT_META` entry.

4. **Credential handling** — reminder that credentials never flow through the orchestrator; gateway reads `.env`; orchestrator forwards only session credentials via `gateway_client.update_*_session()` calls.

5. **Test checklist** — how to run `pytest tests/` against the new agent and how to add a stub via `scripts/gen_tests.py`.

---

## Risk Notes

**Phase 1 — PhraseEngine**
- Risk: If the LLM produces a phrase over 60 tokens, it may be truncated mid-sentence. Mitigation: `max_tokens=60` hard limit in `_llm()`.
- Risk: The `_LLM_PROMPTS.format(**context)` call will raise `KeyError` if context is missing a placeholder key. Mitigation: wrap in `try/except` and fall back to `_static()`.
- Risk: `llm_service.complete()` is shared with the main orchestrator flow. If PhraseEngine is called during boot while a user query is in-flight, they compete on the same HTTP connection pool (httpx 30 s timeout). This is unlikely during boot (no user input yet) but callers must not block the boot if LLM is slow. Mitigation: `asyncio.wait_for(..., timeout=3.0)` on the `_llm()` call.

**Phase 2 — Language Detection**
- Risk: Mixed-language inputs (Hinglish) will be classified as English. This is acceptable for the first iteration; the 15% threshold can be tuned.
- Risk: URLs and code snippets sent as queries contain alphanumeric chars only, so detection is always `'en'` — correct behavior.

**Phase 3 — Cache**
- Risk: Serving stale weather or stock data if a user asks multiple times within the TTL. TTLs are short (10–60 s for real-time agents). Acceptable tradeoff; cache can be invalidated via `agent_cache.invalidate(agent_id)` if needed.
- Risk: Memory growth if many distinct queries are made. The desktop usage pattern (one active session at a time) makes this negligible. Add `clear()` in `clear_session()` to prevent cross-session contamination.

**Phase 4 — Notification Scheduler**
- Risk: Multiple WebSocket connections (e.g., two browser tabs) will both receive the `broadcast()` notification. This is the intended behavior — the user sees all tabs notified.
- Risk: If the gateway is slow, `_check()` can back up. The `asyncio.wait_for(..., timeout=8.0)` ensures individual polls never block the loop.
- Risk: The `_GW_BOOT_CALLS` import in `notification_scheduler.py` creates a circular-ish dependency (scheduler imports from session). Extract `_GW_BOOT_CALLS` to a new `apps/orchestrator/app/services/boot_calls.py` module imported by both. This is a clean-up, not a functional issue.

**Phase 5 — Frontend**
- Risk: The 3D perspective tilt `onMouseMove` fires every pixel of mouse movement, which can cause excessive re-renders. Mitigation: the tilt state stores only `{rotateX, rotateY}` — two floats — making the re-render cost minimal.
- Risk: If `AGENT_PALETTE` entry is missing for a new agent ID, `HoloCard` falls back to `AGENT_PALETTE_FALLBACK` silently. This is intentional.
- Risk: `AgentSettingsCard` introduces a new stagger delay pattern. If a session has 15+ agents, the last card animates in at 750 ms delay. Cap stagger delay at `Math.min(index * 0.05, 0.35)` seconds.

---

## Phased Delivery Sequence

```
Phase 1 → commit: refactor(session): extract PhraseEngine to phrases.py
Phase 2 → commit: feat(i18n): add Hindi language detection and bilingual support
Phase 3 → commit: feat(agents): AgentMessage protocol + AgentResponseCache + boot parallelism
Phase 4 → commit: feat(notifications): backend notification scheduler with WS push
Phase 5 → commit: feat(ui): holographic agent settings cards with neon palette
Docs    → commit: docs: add complete guide for adding new agents and gateway tools
```

Each phase is independently testable and committable. Phases 1 and 2 can be implemented by the same developer in one session; Phases 3, 4, and 5 are independent of each other and can be parallelized across developers.
