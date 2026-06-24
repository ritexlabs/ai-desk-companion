# AI Desk Companion — Architecture Document

## 1. Overview

**AI Desk Companion** is a desktop-first AI voice assistant. It listens for a configurable wake phrase and opens an active voice session to greet the user, initialise agents, listen to commands, route each request to the correct agent, and speak the response back — all through a futuristic real-time dashboard UI.

---

## 2. Actual Stack (as built)

### Desktop UI — `apps/desktop/`
| Layer | Choice |
|---|---|
| Framework | React 18 |
| Build tool | Vite 5 |
| Language | TypeScript 5 (strict, `moduleResolution: "Bundler"`) |
| Styling | Tailwind CSS v3 + Framer Motion v11 |
| Icons | lucide-react |
| Dev port | 5173 |

### Orchestrator — `apps/orchestrator/`
| Layer | Choice |
|---|---|
| Language | Python 3.13 |
| Web framework | FastAPI 0.115 |
| Server | uvicorn with standard extras |
| Config | pydantic-settings (reads `.env`) |
| HTTP client | httpx (for TTS/STT/agent API calls) |
| Dev port | 8787 |

### Voice Providers
| Direction | Browser (default) | Server (opt-in) |
|---|---|---|
| TTS | Web Speech Synthesis API | OpenAI TTS (`tts-1` / `tts-1-hd`) or ElevenLabs |
| STT | Web Speech Recognition API | OpenAI Whisper (`whisper-1`) |

### Monorepo layout
```
ai-desk-companion/
├── apps/
│   ├── desktop/          React + Vite frontend
│   └── orchestrator/     Python FastAPI backend
├── docs/                 Architecture, API contracts, setup
├── packages/             Shared packages (reserved)
├── start.py              Cross-platform dev launcher
├── start.sh              macOS / Linux convenience wrapper
└── start.bat             Windows convenience wrapper
```

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (React + Vite)                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  UI Components  │  Runtime Hooks                     │   │
│  │  - RobotAvatar  │  - useOrchestratorRuntime          │   │
│  │  - AgentBootList│  - useVoice (browser STT/TTS)      │   │
│  │  - SettingsPanel│  - useAudioPlayer (server audio)   │   │
│  │  - Transcript   │  - useVoiceProviderConfig          │   │
│  │  - QuickStats   │  - useAgentConfig / useLLMConfig   │   │
│  └──────────────────────────────────────────────────────┘   │
│                     │ WebSocket ws://localhost:8787/ws       │
└─────────────────────┼───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                 Python Orchestrator (FastAPI)                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  WS endpoint /ws │ IntentRouter │ AgentManager       │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  TTSProvider (OpenAI / ElevenLabs / Browser)         │   │
│  │  STTProvider (OpenAI Whisper / Browser)              │   │
│  │  LLMService   (OpenAI / Anthropic / Gemini / Ollama) │   │
│  └──────────────────────────────────────────────────────┘   │
│    │    │    │     │     │     │     │     │                 │
│  ┌─▼─┐┌─▼─┐┌─▼─┐┌──▼─┐┌──▼─┐┌──▼─┐┌──▼─┐┌──▼──┐          │
│  │Wth││Sys││ GH ││Cal ││Stk ││News││ SM ││GenAI│          │
│  └───┘└───┘└────┘└────┘└────┘└────┘└──┬─┘└─────┘          │
└──────────────────────────────────────┬─┼─────────────────────┘
       │         │          │          │ │          │
  ┌────▼───┐ ┌───▼──┐ ┌────▼───┐ ┌───▼─┘│ ┌────▼───┐
  │Weather │ │GitHub│ │Yahoo   │ │News   │ │LLM API │
  │API     │ │API   │ │Finance │ │API    │ │        │
  └────────┘ └──────┘ └────────┘ └───────┘ └────────┘
                                         │
                              ┌──────────▼──────────┐
                              │  voska/hass-mcp      │
                              │  (Docker subprocess) │
                              │  MCP JSON-RPC 2.0    │
                              └──────────┬───────────┘
                                         │
                              ┌──────────▼───────────┐
                              │   Home Assistant      │
                              │   REST API            │
                              └──────────────────────┘
```

---

## 4. WebSocket Protocol

All UI ↔ orchestrator communication goes through a single persistent WebSocket at `ws://localhost:8787/ws`.

### UI → Orchestrator Commands

| Command | Key Payload Fields | Description |
|---|---|---|
| `start_session` | `calling_name`, `registered_agents`, `voice_config`, `llm_config`, `agent_config` | Wake + boot sequence |
| `send_text_command` | `text` | Route a text command |
| `audio_chunk` | `data_b64`, `format`, `is_final` | Stream audio for server STT |
| `stop_session` | — | Enter sleep mode (with or without farewell) |
| `retry_agent` | `agent` | Retry a failed agent |

### Orchestrator → UI Events

| Event | Key Payload Fields | Description |
|---|---|---|
| `connected` | `version`, `tts_provider`, `stt_provider` | WS opened; reports .env defaults |
| `session_config` | `tts_provider`, `stt_provider` | Sent at boot start; reports actual session providers |
| `phase_changed` | `phase` | Phase state machine transition |
| `boot_status` | `message`, `agent_id?`, `audio_b64?`, `audio_format?` | Boot narration line |
| `agent_status_changed` | `agent`, `status` | Agent lifecycle update |
| `transcript_final` | `speaker`, `text` | Confirmed transcript (user or system) |
| `route_selected` | `agent`, `confidence`, `reason` | Intent routing decision |
| `assistant_speaking` | `text`, `audio_b64?`, `audio_format?` | Agent response |
| `assistant_done` | — | Response complete |
| `error` | `message` | Error notification |

### Phase State Machine

```
standby ──wake phrase──▶ wake_detected ──▶ booting ──▶ ready ◀─────────────┐
   ▲                                                      │                 │
   │           ┌── auto-listen loop (wake word required) ─┤                 │
   │           │                                       listening            │
   │           │         (discard if no "Robo" prefix)     │               │
   │           │                                       thinking             │
   │           │                                           │                │
   │           └──────────────────────────────── responding ───────────────┘
   │                                                       │
   └──── "Robo, Good night" / Sleep button ───────────────┘
         (farewell spoken, then stop_session → doSleep)
```

**Standby wake rules (phase = standby / sleep):**
- Accepted triggers: "Hey Robo", "Hello Robo", "Robo, Wake-Up", "Wake-Up Robo"
- Rejected: bare "Robo" alone (prevents accidental wakes in conversation)
- Inline command: "Hey Robo, check the weather" → boots AND queues "check the weather" as first command

**Ready-state wake-word gate (the Alexa / Google Nest rule):**
- After boot, `autoListenRef.current = true` keeps the app in a continuous listen loop
- Each 5-second listen window is evaluated by a wake-word gate **before** the orchestrator is called
- If speech is heard **without** the wake word → silently discarded, loop continues
- If speech **contains** the wake word → prefix stripped, command sent to orchestrator
- Wake word alone ("Robo" with no command) → app acknowledges ("Yes? How can I help you?") and re-listens
- Loop continues indefinitely until: sleep phrase, Sleep button pressed, or voice toggled off

**Sleep rules (from ready state):**
- Voice command: must include wake word + sleep phrase (e.g. "Robo, Good night")
- Typed command: sleep phrase alone is sufficient (no wake word needed — explicit UI action)
- Sleep button: immediate, no farewell

### Interaction Model — Full Flow

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │  APP STARTS                                                          │
 │  Phase: STANDBY                                                      │
 │  Mic: silently listening for wake phrase in 3-second windows         │
 └─────────────────────────┬───────────────────────────────────────────┘
                           │
          ┌────────────────▼─────────────────────┐
          │  Heard: "Robo, Wake-Up"               │  ← Only these wake:
          │         "Hey Robo"                    │    "Hey Robo"
          │         "Hello Robo"                  │    "Hello Robo"
          │         "Wake-Up Robo"                │    "Robo, Wake-Up"
          │                                       │    "Wake-Up Robo"
          │  Anything else → ignored              │
          └────────────────┬─────────────────────┘
                           │
          ┌────────────────▼─────────────────────┐
          │  Phase: BOOTING                       │
          │  • LLM generates greeting             │
          │    "Good morning, Master, your        │
          │     systems are all online and ready" │
          │  • All agents boot in parallel        │
          │  • Each agent speaks its status       │
          │  • "3 of 3 agents online and ready"   │
          └────────────────┬─────────────────────┘
                           │
          ┌────────────────▼─────────────────────┐
          │  Phase: READY                         │
          │  Auto-listen loop begins              │
          │                                       │
          │  ┌─── 5-second listen window ───┐    │
          │  │  No speech → cycle again     │    │
          │  │  Speech without "Robo"        │    │
          │  │    → discard, cycle again    │    │
          │  │  Speech with "Robo":          │    │
          │  │    → strip "Robo," prefix    │    │
          │  │    → check for sleep phrase  │    │
          │  │    → else send to agent      │    │
          │  └──────────────────────────────┘    │
          └────────────────┬─────────────────────┘
                           │
    ┌──────────────────────┼──────────────────────────┐
    │                      │                          │
    ▼                      ▼                          ▼
 "Robo, Get me        "Robo, Good             "Get me weather"
  weather in Delhi"    night"                 (no wake word)
    │                      │                          │
    ▼                      ▼                          ▼
 Phase: THINKING       Sleep phrase            Silently discarded
 Route → Weather       detected                Loop continues
 Agent responds        ↓
 Phase: RESPONDING     Farewell spoken
    │                  Agents → offline
    ▼                  stop_session sent
 Phase: READY          ↓
 Loop continues        Phase: STANDBY
```

**Voice command examples (in READY state):**

| What you say | Wake word? | Result |
|---|---|---|
| "Robo, get me weather in Delhi" | ✅ | Routes to Weather agent |
| "Robo, what's my next meeting?" | ✅ | Routes to Calendar agent |
| "Robo, show GitHub pull requests" | ✅ | Routes to GitHub agent |
| "Robo, Good night" | ✅ | Farewell → sleep → standby |
| "Get me weather in Delhi" | ❌ | Silently ignored |
| "What's my next meeting?" | ❌ | Silently ignored |
| "Good night" | ❌ | Silently ignored |
| "Robo" (alone) | ✅ | "Yes? How can I help you?" → re-listen |

### Session Greeting and Farewell

**Wake-up greeting** — sent during the boot sequence as the first `boot_status` line. Varies by time of day (Good morning / afternoon / evening) with a randomised suffix.

**Sleep farewell** — triggered when the user says a sleep phrase ("Bye Robo", "Good night", "Go to sleep", "See you", etc.):
1. Frontend matches a sleep pattern against the STT text
2. Selects a random template farewell string (no LLM call)
3. Marks all agents `offline`, clears `activeAgentId`
4. Speaks the farewell via browser TTS (`await speak(farewell)`)
5. Sends `stop_session` to the orchestrator
6. Calls `doSleep()` — UI enters standby; auto-listen loop disabled

**Sleep button** — calls `doSleep()` directly and sends `stop_session` (immediate, no farewell).

### Audio Delivery
When a server TTS provider is active, `boot_status` and `assistant_speaking` events include:
- `audio_b64` — base64-encoded MP3 audio bytes
- `audio_format` — `"mp3"`

The UI plays these via `HTMLAudioElement`; falls back to browser `SpeechSynthesis` when absent.

---

## 5. Voice Provider Architecture

### Priority Order (per session)
1. **Settings → Providers tab** in UI — stored in `robo-voice-providers` (localStorage), sent in `start_session`
2. **`.env` file** — server-side fallback when UI sends `"browser"` or empty values

### Available Providers
**TTS:**
- `browser` — Web Speech Synthesis (no key, quality varies by OS)
- `openai` — `tts-1` or `tts-1-hd`; voices: alloy · echo · fable · onyx · nova · shimmer
- `elevenlabs` — ultra-realistic; configurable voice ID

**STT:**
- `browser` — Web Speech Recognition (Chrome / Safari)
- `openai` — Whisper `whisper-1`; accepts webm, mp4, ogg, wav, mp3

---

## 6. Agent Architecture

Each agent implements `handle(AgentRequest) → AgentResponse`.

### Agent Table
| Agent ID | Label | Status | Data Source |
|---|---|---|---|
| `system` | System | ✅ Real | `platform` module + system time |
| `weather` | Weather | ✅ Real | OpenWeatherMap / WeatherAPI via `agent_config.weather` |
| `calendar` | Google Calendar | ✅ Real | Google Calendar API v3 via OAuth `access_token` |
| `email` | Google Email | ✅ Real | Gmail API via OAuth `access_token` |
| `github` | GitHub | ✅ Real | GitHub REST API via Personal Access Token |
| `stock` | Stock Market | ✅ Real | Yahoo Finance via `yfinance` — no API key required |
| `news` | News | ✅ Real | NewsAPI.org via `agent_config.news.api_key` |
| `smarthome` | Smart Home | ✅ Real | Home Assistant REST API via `voska/hass-mcp` Docker (MCP JSON-RPC 2.0) |
| `general` | General AI | ✅ Real | LLM service — OpenAI / Anthropic / Gemini / Ollama |

### Intent Router

Two-tier strategy implemented in `app/services/router.py`:

**Tier 1 — LLM classifier** (when `llm_config` has a key or provider=ollama):

A lightweight call (`temperature=0.0`, `max_tokens=80`) sends the user's query plus a dynamically built list of enabled agents to the configured LLM. The LLM returns a single JSON line:
```json
{"agent": "calendar", "reason": "user asking about upcoming events"}
```
If the call fails or returns an unknown agent name, falls back to tier 2 silently.

**Tier 2 — Keyword fallback** (always active):
```
weather / temperature / rain / forecast / humidity / wind  →  WeatherAgent
calendar / meeting / schedule / appointment / event        →  CalendarAgent  (before datetime)
email / inbox / unread / mail / sender / message           →  EmailAgent
"what time" / "current time" / "what day" / date / clock  →  SystemAgent
system / cpu / battery / memory / ram / health / os        →  SystemAgent
stock / nifty / sensex / s&p / rsi / moving average…      →  StockAgent
github / repo / pr / issue / workflow / commit             →  GitHubAgent
news / headline / breaking news / current events           →  NewsAgent
light / switch / fan / lock / cover / blind / thermostat   →  SmartHomeAgent
smart home / home assistant / device / turn on / turn off  →  SmartHomeAgent
(everything else)                                          →  GeneralAgent
```

Contraction normalisation (`whats` / `what's` → `what is`) is applied before phrase matching to handle voice-to-text variations.

---

## 7. Credential & Security Design

| Rule | Detail |
|---|---|
| No secrets in source | API keys never appear in `.ts`, `.py`, or any tracked file |
| Frontend storage | `localStorage` only (`robo-*` keys) — sandboxed to origin, cannot be git-committed |
| Credential flow | localStorage → WebSocket `start_session` payload → orchestrator → external API |
| Orchestrator persistence | Session credentials are used and discarded; not stored server-side |
| `.env` file | Server-level defaults only (TTS/STT provider + key); UI settings override per session |
| External calls | Only the orchestrator calls external APIs; browser calls TTS providers only for "Test TTS" in settings |

---

## 8. Development Phases

### Phase 1 — Simulated UX ✅ COMPLETE
- Futuristic 3-column React dashboard
- Mock boot sequence, wake detection, intent routing
- All 5 agent stubs, system health panel
- Settings panel: Profile | Voice | AI | Agents
- LLM hook (Anthropic / OpenAI / Gemini / Ollama)
- Security-safe credential storage via localStorage hooks

### Phase 2 — Real Local Orchestrator ✅ COMPLETE
- Python FastAPI WebSocket orchestrator at `:8787`
- `useOrchestratorRuntime` hook: WS mode + local offline fallback
- Boot sequence via WS events, TTS serial queue, auto-reconnect
- `SystemAgent` with real OS/CPU/Python data
- WS connection badge + system health panel in UI
- `start.py` cross-platform dev launcher (auto-setup, streams output, opens browser)

### Phase 3 — Real Voice Stack ✅ COMPLETE
- `TTSProvider` / `STTProvider` abstractions with OpenAI and ElevenLabs implementations
- Per-session provider selection from UI (overrides `.env`)
- Server audio: `audio_b64` in WS events → played via `HTMLAudioElement`
- Server STT: `MediaRecorder` → `audio_chunk` WS → Whisper → `transcript_final`
- Settings → Providers tab: full TTS/STT provider configuration from UI
- `useAudioPlayer` hook, `isPlayingServerAudio` state, `orchestratorCaps` tracking

### Phase 4 — Real Integrations ✅ COMPLETE
All agent stubs replaced with real external API calls. Credentials flow from UI localStorage → `start_session` → `AgentManager.configure_session()` → individual agent `handle()`.

**New files:**
- `app/services/llm.py` — `LLMService` supporting OpenAI, Anthropic, Gemini, Ollama (OpenAI-compat)
- All 5 agent files rewritten with real httpx API calls

**WS protocol (implemented):**
`start_session` carries:
```json
{
  "llm_config":   { "provider": "openai", "api_key": "sk-...", "model": "gpt-4o", "base_url": "" },
  "agent_config": {
    "weather": { "provider": "openweathermap", "api_key": "...", "default_city": "Mumbai" },
    "github":  { "personal_access_token": "ghp_..." },
    "google":  { "access_token": "ya29...", "refresh_token": "..." }
  }
}
```

**Credential injection flow:**
1. `ws.py` extracts `llm_config` + `agent_config` from `start_session` payload
2. Calls `agent_manager.configure_session(llm_config, agent_config)`
3. `AgentManager.handle()` enriches each `AgentRequest.context` with the correct per-agent credentials
4. Agents read credentials from `request.context['agent_config']` and `request.context['llm_config']`

**Graceful degradation:** Each agent returns a helpful message if its credential is not configured rather than raising an error.

### Phase 5 — Hardening ✅ COMPLETE

**openWakeWord (always-on wake detection)**
- `app/services/wake_word.py` — `WakeWordService` thread using `sounddevice` + `openwakeword`
- Controlled by `WAKE_WORD_ENABLED`, `WAKE_WORD_MODEL`, `WAKE_WORD_SENSITIVITY` in `.env`
- Broadcasts `wake_word_detected {model}` WS event to all clients; frontend triggers `triggerWakeWord()`
- Browser continuous-listening disabled automatically when server reports `wake_word_enabled: true`
- Optional: install `sounddevice openwakeword numpy` + `portaudio` (macOS)

**Diagnostics — real-time metrics**
- `app/services/metrics.py` — `MetricsService` in-memory store (sessions, commands, agent timing, TTS/STT counts)
- `ws.py` instruments every command, agent call, and TTS/STT call
- `metrics_update` WS event broadcast every 5 s to all connected clients
- UI: "Performance" card in right sidebar shows uptime, commands, sessions, per-agent avg ms

**Tauri native desktop wrapper**
- `apps/desktop/src-tauri/` — complete Tauri v2 scaffold
  - `Cargo.toml` — tauri 2, plugin-store 2, plugin-shell 2, plugin-notification 2
  - `src/lib.rs` — system tray with show/hide + quit, click-to-toggle window
  - `src/main.rs`, `build.rs`, `capabilities/default.json`
- `apps/desktop/src/lib/secureStore.ts` — dual-mode storage abstraction
  - In Tauri: uses `@tauri-apps/plugin-store` (encrypted `.robo-config.dat` in app-data)
  - In browser: transparent localStorage pass-through
  - `hydrateFromTauriStore()` called in `main.tsx` before React mounts
- `apps/desktop/package.json` — added `@tauri-apps/api`, `@tauri-apps/plugin-store`, `@tauri-apps/cli`
- `apps/desktop/vite.config.ts` — Tauri-compatible HMR, platform-aware build targets

**Building the native app:**
```bash
# Requires Rust toolchain: https://rustup.rs
cd apps/desktop
npm install
npm run tauri:dev    # dev mode with native window
npm run tauri:build  # creates .app / .exe / .deb in src-tauri/target/release/bundle/
```

### Phase 6 — New Agents + LLM Routing ✅ COMPLETE

**Stock Market agent** (`app/agents/stock.py`)
- Yahoo Finance via `yfinance` — no API key required
- Current price, day change %, RSI(14), SMA(20/50), support/resistance, 52-week range
- Indian market support: Nifty, Sensex, BankNifty, any NSE ticker (`.NS` suffix auto-added)
- Boot confirmation: live Nifty 50 + Sensex (or S&P 500 + Dow Jones for US)
- Config: `STOCK_DEFAULT_MARKET` (`.env`) or Settings → Agents → Stock Market Agent

**News agent** (`app/agents/news.py`)
- NewsAPI.org free developer plan (100 req/day, works from localhost)
- Generic queries → `/top-headlines` by country; topic queries → `/everything`
- Boot confirmation: top 2 headlines for the configured country
- Config: country dropdown + optional State/City in Settings → Agents → News Agent

**Agent roster fix**
- Added `stock` and `news` to `AGENT_CATALOGUE` (`useOrchestratorRuntime.ts`) and `AGENT_META` (`AgentBootList.tsx`)
- Agents missing from either registry were silently dropped from the boot list

**LLM-based intent routing** (`app/services/router.py`)
- `IntentRouter.configure_session(llm_config, enabled_agents)` — called at session start
- `IntentRouter.route(text)` is now `async`
- Primary path: LLM classifier (`temperature=0.0`, `max_tokens=80`) — handles paraphrase and voice variations
- Fallback path: keyword matching — covers all cases when LLM is unavailable or fails
- `LLMService.complete()` gains a `temperature` parameter (default `0.7`; routing passes `0.0`)
- `start_session` payload now includes `news: { api_key, country, state, city }`

**Session farewell** (`app/api/ws.py` + `useOrchestratorRuntime.ts`)
- Sleep phrases ("Bye Robo", "Good night", "Go to sleep") trigger `farewell_session { phrase }` instead of `stop_session`
- Orchestrator picks a contextual goodbye from `FAREWELL_LINES` via `_pick_farewell(phrase)`:
  - "good night" → night-themed line ("Goodnight! Rest well.", "Goodnight! Sweet dreams.")
  - "bye/goodbye" → farewell-themed line ("Goodbye! Have a wonderful day.", "Farewell!…")
  - generic → random from the full list
- Farewell is spoken via the session TTS provider before sleep
- Frontend defers `phase_changed: sleep` via `pendingPhaseRef` until `drainTTSQueue` finishes, then calls `doSleep()` — guarantees the audio plays fully before the UI transitions
- Sleep button still sends `stop_session` (immediate, no farewell)

### Phase 7 — Alexa-style Conversation + Performance ✅ COMPLETE

**Alexa-style auto-listen with wake-word gate** (`useOrchestratorRuntime.ts`)
- `autoListenRef` flag enables the continuous listen loop after boot
- Set to `true` on `triggerWakeWord`; cleared to `false` only on sleep, or voice toggle off (no longer cleared on no-speech — loop keeps cycling)
- Each listen cycle: 5-second window → wake-word gate → strip prefix → route to agent
- Background speech without the wake word is silently discarded — the loop continues automatically
- 300ms delay after `ready` phase before the next `ask()` — allows TTS queue to settle
- `phaseRef` tracks the current phase in a ref so async callbacks read the live value without stale closures

**Wake / sleep command model**
- Standby wake: explicit trigger phrase only ("Hey Robo", "Robo, Wake-Up") — bare "Robo" alone is ignored
- Ready-state command gate: wake word required in all voice commands (Alexa rule)
- Inline command capture: "Hey Robo, what's the time?" → boots agents and sends "what's the time?" as the first command via `pendingCmdRef`
- Sleep: voice sleep requires wake word + sleep phrase ("Robo, Good night"); typed commands accept sleep phrase alone
- Farewell sequence: agents → offline → speak farewell → send `stop_session` → `doSleep()`

**Wake-prefix stripping**
- Strips leading "Robo, " / "Hey Robo, " / "Hello Robo, " before sending to the LLM
- "Robo" heard alone → acknowledges ("Yes? How can I help you?") and re-listens without an LLM call

**Language consistency**
- `_make_system_prompt()` in `orchestrator.py` and `_make_general_system_prompt()` in `general_ai.py` now include an explicit instruction: "Always respond in the exact same language the user wrote in. Never switch languages."
- Prevents the LLM from drifting to English when the user speaks Hindi, Spanish, or another language

**Per-agent browser TTS modulations** (`useVoice.ts`)
- `AGENT_VOICE_OFFSETS` table applies distinct pitch / rate deltas per agent on top of the base voice config
- Each agent has a perceptually distinct sound: System (lower, deliberate), Weather (brighter), Calendar (efficient), GitHub/Stock (lower, authoritative), News (clear newsreader cadence)

**Performance optimisations**

| Area | Before | After |
|---|---|---|
| TTS cold-start delay | 250 ms | 150 ms |
| TTS warm-interrupt delay | 50 ms | 30 ms |
| TTS queue pause between utterances | 200 ms | 50 ms |
| Auto-listen gap after response | 700 ms | 300 ms |
| STT timeout | 8000 ms | 5000 ms |
| Standby wake-word listen window | 4000 ms | 3000 ms |
| Standby loop gap | 80 ms | 30 ms |
| `asyncio.sleep` between WS sends | 5 × 50 ms per command | 0 |
| Agent boot | Sequential (one at a time) | Parallel (`asyncio.gather`) |
| Greeting TTS + agent init | Sequential | Parallel (`asyncio.create_task`) |
| Boot delay / per-agent pauses | 350 + 300/200 ms × N | 0 |

- Chrome TTS engine pre-warmed on mount via `window.speechSynthesis.cancel()` — primes the lazy pipeline before the first real utterance

### Phase 8 — Smart Home Agent ✅ COMPLETE

**Smart Home agent** (`app/agents/smarthome.py`)
- Controls Home Assistant devices via the `voska/hass-mcp` Docker container using MCP JSON-RPC 2.0
- A single long-lived Docker subprocess per (HA URL, token) pair is managed by `HassMCPClient` (`app/services/hass_mcp.py`)
- MCP handshake on startup: `initialize` → `notifications/initialized` → tools ready
- `asyncio.Lock` on stdin writes prevents concurrent JSON frames from colliding

**Device control strategy**
- Bulk (domain-wide) commands — e.g. "turn on lights" — call `call_service_tool(domain, service, {})` with no `entity_id`; Home Assistant broadcasts to all devices in the domain
- Named device commands — e.g. "turn off light 1" — call `list_entities(search_query=name)` first, extract the `entity_id`, then call `call_service_tool`

**LLM orchestration integration**
- `smarthome` added to `_AGENT_TOOL_META` in `orchestrator.py` — the dict that the LLM sees as available tools; agents absent from this dict are silently excluded from LLM routing
- System prompt updated to force tool use for any smart home request

**Smart Home Dashboard** (`apps/desktop/src/components/SmartHomeDashboard.tsx`)
- Animated Framer Motion card grid, grouped by device domain
- Toggle and slider controls call `POST /api/smarthome/call` directly (bypasses voice pipeline for immediate response)
- Auto-refreshes device states every 8 seconds via `GET /api/smarthome/states`

**REST API endpoints** (see [api.md](api.md) for full schema)
- `GET /api/smarthome/ping` — test HA connectivity; used by Settings UI "Test Connection" button
- `GET /api/smarthome/states` — all entity states grouped by domain; used by dashboard
- `POST /api/smarthome/call` — call any HA service (used by dashboard controls)

**UI auto-listen fix** (`useOrchestratorRuntime.ts`, `App.tsx`)
- `isAutoListening` React state mirrors `autoListenRef.current` for UI awareness
- `displayPhase` derived value masks the brief `ready` flash between auto-listen cycles — all phase-sensitive UI uses `displayPhase` without altering the real state machine
- Prevents the Listening↔Ready badge flicker introduced when the Smart Home agent was added
