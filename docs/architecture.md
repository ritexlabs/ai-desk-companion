# AI Desk Companion — Architecture

## 1. Overview

**AI Desk Companion** is a desktop-first AI voice assistant with always-on wake-word detection and continuous voice conversation. It routes commands to specialised tools through an LLM orchestrator and speaks responses back — all inside a real-time dashboard UI.

Three services run locally:

| Service | Port | Language |
|---|---|---|
| Desktop UI | 5173 | React 18 + TypeScript + Vite |
| Orchestrator | 8787 | Python FastAPI + uvicorn |
| MCP Gateway | 8788 | Python FastAPI + uvicorn |

---

## 2. Stack

### Desktop UI — `apps/desktop/`

| Layer | Choice |
|---|---|
| Framework | React 18 |
| Build tool | Vite 5 |
| Language | TypeScript 5 (strict, `moduleResolution: "Bundler"`) |
| Styling | Tailwind CSS v3 + Framer Motion v11 |
| Icons | lucide-react |

### Orchestrator — `apps/orchestrator/`

| Layer | Choice |
|---|---|
| Language | Python 3.13 |
| Framework | FastAPI 0.115 |
| Server | uvicorn with standard extras |
| Config | pydantic-settings (reads `apps/orchestrator/.env`) |
| HTTP client | httpx |

### MCP Gateway — `apps/mcp-gateway/`

| Layer | Choice |
|---|---|
| Language | Python 3.13 |
| Framework | FastAPI 0.115 |
| Server | uvicorn with standard extras |
| Config | pydantic-settings (reads `apps/mcp-gateway/.env`) |
| Data | yfinance, psutil, httpx, mcp |

### Voice Providers

| Direction | Browser (default) | Server (opt-in) |
|---|---|---|
| TTS | Web Speech Synthesis API | OpenAI TTS (`tts-1` / `tts-1-hd`) or ElevenLabs |
| STT | Web Speech Recognition API | OpenAI Whisper (`whisper-1`) |

---

## 3. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser (React + Vite :5173)                                        │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  AgentOrbit3D · WeatherWidget · HoloChat                      │  │
│  │  AgentBootList · AgentDetailModal · SettingsPanel             │  │
│  │  SmartHomeDashboard · PortfolioDashboard                      │  │
│  │  useOrchestratorRuntime · useVoiceLoop · useAgentConfig       │  │
│  └───────────────────────────────────────────────────────────────┘  │
└────────────────────────┬─────────────────────────┬───────────────────┘
                         │ WebSocket                │ HTTP (auth-exempt)
                         │ ws://localhost:8787/ws   │ localhost:8788
                         │                          │ /api/portfolio/*
                         │                          │ /auth/indmoney
                         │                          │ /api/system/config
┌────────────────────────▼─────────────────────────┼───────────────────┐
│  Orchestrator (FastAPI :8787)                     │                   │
│  • Session lifecycle — start/stop                 │                   │
│  • LLM tool-calling loop (OpenAI / Anthropic /    │                   │
│    Gemini / Ollama)                               │                   │
│  • Local agents (in-process):                     │                   │
│      WebSearch · Calculator · Memory              │                   │
│      Briefing · GeneralAI                         │                   │
│  • Voice: TTS (OpenAI · ElevenLabs · Browser)    │                   │
│           STT (Whisper · Browser)                 │                   │
└────────────────────────┬──────────────────────────┘                   │
              HTTP Bearer │ http://localhost:8788                        │
┌────────────────────────▼─────────────────────────────────────────────┘
│  MCP Gateway (FastAPI :8788)                                          │
│  • Bearer auth middleware (GATEWAY_API_TOKEN)                        │
│  • ToolRegistry — namespaced tools, startup/shutdown lifecycle       │
│  • MCP StreamableHTTP at /mcp (compatible with Claude Desktop etc.)  │
│                                                                       │
│  Tools (one file per integration, credentials from gateway .env):    │
│  ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐        │
│  │ weather │ │ stocks │ │  news  │ │ github │ │  google  │        │
│  └─────────┘ └────────┘ └────────┘ └────────┘ └──────────┘        │
│  ┌─────────┐ ┌────────┐ ┌───────────┐ ┌──────────┐                │
│  │ system  │ │indmoney│ │ smarthome │ │ whatsapp │                │
│  └─────────┘ └────────┘ └───────────┘ └──────────┘                │
│                                                                       │
│  Routers (non-tool HTTP endpoints):                                  │
│  portfolio (OAuth PKCE) · system · tunnel (Cloudflare) · whatsapp   │
└───────────────────────────────────────────────────────────────────────┘
         │                  │                │
   MCP Streamable    Direct HTTP         psutil / yfinance
   (INDmoney)        (HA, Meta, GNews…)  (local calls)
         │
  https://mcp.indmoney.com/mcp
```

---

## 4. Monorepo Layout

```
ai-desk-companion/
├── apps/
│   ├── desktop/              React + Vite frontend
│   │   └── src/
│   │       ├── components/   UI components:
│   │       │                 AgentOrbit3D   — 3D orbital canvas + AI Core + agent nodes
│   │       │                 WeatherWidget  — current conditions + ForecastStrip
│   │       │                 HoloChat       — conversation message history
│   │       │                 AgentBootList · AgentDetailModal
│   │       │                 SmartHomeDashboard · PortfolioDashboard
│   │       │                 settings/      Per-agent settings accordions
│   │       ├── hooks/        React hooks (useOrchestratorRuntime, useVoiceLoop,
│   │       │                 useAgentConfig, useAgentVoiceConfig, …)
│   │       └── types/        Shared TypeScript types (runtime.ts)
│   ├── orchestrator/         Python FastAPI orchestrator (port 8787)
│   │   └── app/
│   │       ├── agents/       Local agent implementations
│   │       ├── api/          FastAPI routes + WebSocket (ws.py)
│   │       ├── core/         Config (pydantic-settings, reads .env)
│   │       ├── models/       Pydantic contracts
│   │       └── services/     LLM, TTS, STT, boot sequence, gateway client, session
│   └── mcp-gateway/          Python FastAPI MCP tool gateway (port 8788)
│       └── src/
│           ├── config/       GatewaySettings (pydantic-settings, reads .env)
│           ├── tools/        BaseTool ABC + tool adapters (one file per integration)
│           ├── routers/      HTTP routers for non-tool endpoints
│           └── main.py       FastAPI app — registers tools, auth middleware, webhook routes
├── docs/                     Full documentation
│   ├── architecture.md       ← this file
│   ├── mcp-gateway.md        Gateway API, BaseTool ABC, adding new tools
│   ├── development.md        Local setup, commands, adding new agents/services
│   ├── agents.md             Agent overview
│   └── agents/               Per-agent docs (weather.md, github.md, …)
├── scripts/
│   ├── test.sh               Master test runner (backend + frontend)
│   └── gen_tests.py          Auto-generate test stubs for new modules
└── launch.py                 Cross-platform dev launcher (all 3 services)
```

### Orchestrator layout

```
apps/orchestrator/app/
├── agents/
│   ├── base.py           AssistantAgent ABC
│   ├── registry.py       AGENTS list (local agents only)
│   ├── websearch.py      DuckDuckGo Instant Answers
│   ├── calculator.py     Safe AST evaluator
│   ├── memory.py         Persistent key-value store
│   ├── briefing.py       Parallel gateway tool calls → spoken summary
│   └── general_ai.py     LLM fallback
├── api/
│   ├── routes/           REST endpoints (smarthome proxy, whatsapp relay, health)
│   └── ws.py             WebSocket handler
├── core/config.py        Settings (pydantic-settings)
├── models/contracts.py   AgentRequest / AgentResponse / AgentHealth
└── services/
    ├── agent_manager.py  Session state, LLM config merge, local agent dispatch
    ├── orchestrator.py   LLMOrchestrator — tool-call loop
    ├── session.py        Boot sequence, phrase pools, gateway/snippet maps, AGENT_LABELS
    ├── gateway_client.py GatewayClient — GET /tools, POST /tools/{name} (Bearer auth)
    ├── router.py         Keyword fallback router (no-LLM mode)
    ├── llm.py            LLM provider abstraction
    └── tts_helpers.py    Per-agent voice config
```

### MCP Gateway layout

```
apps/mcp-gateway/src/
├── main.py               FastAPI app — lifespan, CORS, auth middleware, routers, /tools, /mcp
├── config/
│   └── settings.py       GatewaySettings — all integration credentials, read from .env
├── tools/
│   ├── base.py           BaseTool ABC (namespace, list_tools, call_tool, startup, shutdown)
│   ├── registry.py       ToolRegistry — register, startup, shutdown, list, route
│   ├── weather.py        Open-Meteo / OWM / WeatherAPI
│   ├── stocks.py         yfinance (no key needed)
│   ├── news.py           GNews API
│   ├── github.py         GitHub REST API
│   ├── google.py         Google Calendar + Gmail
│   ├── system.py         psutil (CPU, RAM, disk, battery, processes)
│   ├── portfolio.py      INDmoney MCP via StreamableHTTP
│   ├── smarthome.py      Home Assistant via hass-mcp Docker
│   └── whatsapp.py       Meta WhatsApp Cloud API
└── routers/
    ├── portfolio.py      OAuth PKCE flow + /api/portfolio/status + /api/portfolio/data
    ├── system.py         /api/system/config (metric toggle)
    ├── tunnel.py         Cloudflare tunnel start/stop/status
    └── whatsapp.py       Webhook receive + /api/whatsapp/status
```

---

## 5. Data Flow — Voice Command

```
1. User speaks          → Browser STT (or OpenAI Whisper)
2. Text sent            → WebSocket to Orchestrator
3. Orchestrator         → GET http://localhost:8788/tools
                          (fetches namespaced tool list; cached per-turn)
4. LLM call             → POST {provider}/chat/completions
                          messages=[system+user], tools=[all gateway tools + local agent tools]
5. LLM returns          → tool_call: { name: "weather__get_current_weather", arguments: {...} }
6. Orchestrator         → POST http://localhost:8788/tools/weather__get_current_weather
                          headers: { Authorization: Bearer <GATEWAY_API_TOKEN> }
                          body: { arguments: {...} }
7. Gateway routes       → WeatherTool.call_tool() → Open-Meteo HTTP call
                          (credentials read from GatewaySettings / .env)
8. Result returned      → Orchestrator → LLM synthesis prompt
9. LLM synthesises      → Plain spoken English (1–3 sentences)
10. TTS                 → Browser or OpenAI/ElevenLabs audio → user hears response
```

For local agent calls (websearch, calculator, memory, briefing, general):
steps 6–7 are replaced by `agent_manager.handle(agent_id, request)` — no gateway hop, no Bearer token.

---

## 6. Tool Namespacing

Every gateway tool is exposed with a `<namespace>__<tool>` name to prevent collisions:

| Namespace | Tools |
|---|---|
| `weather` | `weather__get_current_weather` |
| `stocks` | `stocks__get_quote` |
| `news` | `news__get_news` |
| `system` | `system__get_system_info` |
| `github` | `github__get_summary`, `github__get_pull_requests`, `github__get_notifications`, `github__get_workflow_status`, `github__get_issues` |
| `google` | `google__get_calendar_events`, `google__get_emails` |
| `indmoney` | `indmoney__query_portfolio` |
| `smarthome` | `smarthome__get_states`, `smarthome__call_service` |
| `whatsapp` | `whatsapp__send_message`, `whatsapp__get_chat` |

Local agent tools keep their plain IDs: `websearch`, `calculator`, `memory`, `briefing`, `general`.

---

## 7. Session Lifecycle

### Boot sequence

```
start_session (WebSocket message from UI)
  │
  │  payload includes:
  │    calling_name, assistant_name, registered_agents, voice_config,
  │    llm_config, agent_config (credentials per agent), agent_voices
  │
  ├─ build_session_providers(voice_config)     ← TTS / STT for this session
  ├─ agent_manager.configure_session(llm_config, agent_config, registered_agents)
  ├─ speak greeting
  ├─ emit agent_status_changed: starting (for all registered agents)
  │
  ├─ ── Credential push (async, fire-and-forget per agent) ──────────────────
  │  gateway_client.update_smarthome_session(endpoint, token)   PUT /session/smarthome
  │  gateway_client.update_weather_session(api_key, city, …)   PUT /session/weather
  │  gateway_client.update_github_session(token)               PUT /session/github
  │  gateway_client.update_news_session(api_key, country)      PUT /session/news
  │  gateway_client.update_whatsapp_session(phone_id, token)   PUT /session/whatsapp
  │  gateway_client.update_portfolio_session(…)                PUT /session/portfolio
  │  Each call mutates GatewaySettings in-memory — no .env writes.
  │
  ├─ GET http://localhost:8788/health   ← gateway health check
  │
  │  ── Gateway online ────────────────────────────────────────────────────────
  │  speak (randomised) "MCP gateway link established — tool matrix online."
  │  asyncio.gather(_fetch_boot_snippet × N agents, timeout=5 s each)
  │    ├─ weather__get_current_weather  → "Bengaluru 28°C, partly cloudy"
  │    ├─ stocks__get_quote (Nifty 50)  → "Nifty ₹24,150 (+0.43%)"
  │    ├─ news__get_news                → top headline title
  │    ├─ github__get_summary           → "3 PRs awaiting review"
  │    ├─ google__get_calendar_events   → "Next event: 'Standup' at 10:30 AM"
  │    ├─ google__get_emails            → "7 unread emails"
  │    ├─ system__get_system_info       → "CPU 18% · RAM 54%"
  │    └─ indmoney__query_portfolio     → first line of portfolio summary
  │  for each gateway agent (individual speak + agent_status_changed: online):
  │    "Weather module synchronised — Bengaluru 28°C, partly cloudy."
  │    … (snippet suppressed silently if token not configured or call failed)
  │
  │  ── Gateway offline ─────────────────────────────────────────────────────
  │  speak (randomised) "MCP gateway unreachable — tool network dark."
  │  for each gateway agent: emit agent_status_changed: degraded (silent)
  │
  ├─ emit online (websearch, calculator, memory, briefing) — silent, always online
  └─ emit phase_changed: ready
```

### Per-turn orchestration

```
user_message (WebSocket)
  │
  ├─ _fetch_gateway_tools()   GET /tools  (every turn)
  ├─ llm_orchestrator.handle(message, tools=[local + gateway])
  │    LLM picks tool → call_agent(fn_name, query)
  │    if '__' in fn_name → gateway_client.call_tool(fn_name, args)  ← Bearer auth
  │    else               → agent_manager.handle(fn_name, request)
  └─ LLM synthesises → TTS → audio
```

---

## 8. Credential Architecture

### Two-tier credential model

Credentials flow from the browser UI to the gateway through two complementary paths:

```
Browser localStorage
   │
   │  (1) WebSocket start_session  →  Orchestrator  →  PUT /session/<agent>  →  Gateway RAM
   │      agent_config payload          session.py        gateway_client.py       GatewaySettings
   │
   │  (2) .env files (fallback / static)
   │      apps/orchestrator/.env        apps/mcp-gateway/.env
```

**Path 1 — session push (primary for runtime credentials):**

When the UI sends `start_session`, the orchestrator reads credential fields from `agent_config` and pushes them to the gateway via `PUT /session/<agent>` endpoints. The gateway mutates `GatewaySettings` fields in-memory (e.g. `settings.github_token = body.token.strip()`). All subsequent tool calls for that session use the in-memory values. No `.env` file is written.

```
PUT /session/smarthome   → settings.myhome_mcp_endpoint, myhome_mcp_token
PUT /session/weather     → settings.weather_api_key, weather_default_city, weather_provider
PUT /session/github      → settings.github_token
PUT /session/news        → settings.news_api_key, news_default_country
PUT /session/whatsapp    → settings.whatsapp_phone_number_id, whatsapp_access_token, …
PUT /session/portfolio   → settings.indmoney_client_id, indmoney_oauth_token, …
```

**Path 2 — `.env` files (static startup defaults):**

```
apps/orchestrator/.env          apps/mcp-gateway/.env
─────────────────────           ───────────────────────
LLM_PROVIDER / LLM_API_KEY      GATEWAY_API_TOKEN          ← shared Bearer token
GATEWAY_URL                     GITHUB_TOKEN               ← overridden per-session
GATEWAY_API_TOKEN               WEATHER_API_KEY            ← overridden per-session
WAKE_PHRASE                     NEWS_API_KEY               ← overridden per-session
…                               GOOGLE_ACCESS_TOKEN
                                MYHOME_MCP_TOKEN           ← overridden per-session
                                WHATSAPP_ACCESS_TOKEN      ← overridden per-session
                                INDMONEY_OAUTH_TOKEN       ← written by OAuth flow
                                …
```

The orchestrator holds **no** integration credentials — it reads them from the UI's `agent_config` and forwards them to the gateway via `PUT /session/*`. `.env` values serve as fallbacks when no session push has occurred (e.g. gateway restarts between sessions).

The INDmoney `access_token` is written to `apps/mcp-gateway/.env` by the OAuth callback handler and is not subject to session push — the OAuth flow persists it directly.

---

## 9. WebSocket Protocol

All messages follow `{ "command": "<cmd>", "payload": { ... } }` (client→server) or `{ "event": "<event>", "payload": { ... } }` (server→client).

**UI → Orchestrator (client sends)**

| command | key payload fields | description |
|---|---|---|
| `start_session` | `assistant_name`, `calling_name`, `registered_agents`, `voice_config`, `llm_config`, `agent_config` (per-agent credentials), `agent_voices` | Begin session; triggers credential push to gateway |
| `stop_session` | — | End session |
| `send_text_command` | `text` | Text command (typed or post-STT) |
| `audio_chunk` | `data_b64` (base64), `format` | Raw audio for server-side Whisper STT |
| `farewell_session` | `phrase` | LLM-synthesised goodbye, then shutdown |
| `retry_agent` | `agent` | Re-run boot check for a specific agent |
| `schedule_alert` | `title`, `body`, `delay_seconds`, `id` | Schedule a push alert after a delay |

**Orchestrator → UI (server sends)**

| type | payload | description |
|---|---|---|
| `phase_changed` | `phase` | `booting` / `ready` / `listening` / `processing` / `speaking` |
| `agent_status_changed` | `agent`, `status` | `starting` / `online` / `degraded` / `failed` |
| `boot_status` | `text`, `agent_id?`, `agent_status?` | Spoken boot line |
| `session_config` | `tts_provider`, `stt_provider`, `wake_word_enabled` | Effective session config |
| `response` | `text`, `agent` | Final answer + which agent/tool handled it |
| `error` | `message` | Non-fatal error description |
| `transcription` | `text` | STT result echo |
| `performance` | `latency_ms`, `agent`, `timestamp` | Per-turn timing |
| `metrics` | `session_count`, `uptime_s`, … | Periodic health broadcast |

---

## 10. LLM Orchestrator

`apps/orchestrator/app/services/orchestrator.py` — `LLMOrchestrator`

Supports OpenAI, Anthropic, Gemini, and Ollama. All implement the same loop:

1. Build tools list from enabled local agents + gateway tools.
2. Send `[system, user]` + tools to the LLM.
3. If `finish_reason == tool_calls`: call each tool, append results, re-prompt the LLM.
4. Return synthesised text + agent ID used.

No keyword routing happens in this path. The LLM selects the tool from descriptions alone.

**Keyword fallback** (`services/router.py`) applies only when no LLM is configured.

---

## 11. Security

- WebSocket origin enforced against an allowlist (`ALLOWED_ORIGINS`).
- Per-connection rate limiting: 20 commands / 10 s sliding window (covers `start_session`, `send_text_command`, `audio_chunk`, `retry_agent`).
- Input length capped at 2000 characters per message.
- Orchestrator authenticates to the gateway with a shared Bearer token (`GATEWAY_API_TOKEN`).
- All `PUT /session/*` gateway endpoints require the same Bearer token — no auth-exempt path for credential push.
- Integration credentials flow: browser localStorage → WebSocket `agent_config` → orchestrator session.py → gateway `PUT /session/*` → in-memory GatewaySettings mutation. No credential persisted server-side beyond the process lifetime.
- Docker subprocess commands in `/api/smarthome/docker/start|stop` use a fully hardcoded command array (`['docker', 'compose', 'up', ...]`); `cwd` is resolved from source-file path at import time — no user-controlled input reaches the subprocess call.
- INDmoney MCP endpoint is hardcoded (`https://mcp.indmoney.com/mcp`) — no user-controlled URL parameters for MCP connections (SSRF prevention).
- Portfolio OAuth uses PKCE + Dynamic Client Registration (RFC 7591); the access token is stored only in the gateway's `.env`.
- No credentials are logged at any level.
- `.cloudflared/` (Cloudflare tunnel config containing tunnel UUIDs and hostnames) is gitignored.
- `apps/smarthome/.mode` (local/remote persistence file) is gitignored.

---

## 12. SmartHome Docker Lifecycle

The Smart Home agent supports two modes: **Local Docker** (runs `apps/smarthome/docker-compose.yml`) and **Self-Hosted** (points to an existing HA instance). Mode is persisted to `apps/smarthome/.mode` (gitignored) so `launch.py` skips or starts the container on the next restart without user intervention.

### Mode switching flow

```
UI Settings → SmartHome → mode toggle
  │
  ├─ Local selected:
  │    POST /api/smarthome/docker/start  (orchestrator)
  │      ├─ writes .mode = 'local'
  │      ├─ asyncio.to_thread(subprocess.run ['docker', 'compose', 'up', '-d', …])
  │      └─ returns 200 when container is up; UI auto-tests connection
  │
  └─ Self-Hosted selected:
       writes .mode = 'remote' immediately
       fires asyncio.create_task(_bg_docker_stop())  ← non-blocking, returns at once
       UI switches instantly; container stops in background
```

### launch.py behavior

```python
ha_mode = _smarthome_mode()   # reads apps/smarthome/.mode; defaults to 'local'
if ha_active:                 # local mode + docker available + compose file present
    docker compose up -d      # shown as: Home Assistant  [local docker]  http://localhost:8123
elif ha_mode == 'remote':
    skip Docker               # shown as: Home Assistant  [self-hosted]
else:
    warn: Docker not found    # Docker Desktop not running
```

### Orchestrator REST endpoints (smarthome router)

| Endpoint | Description |
|---|---|
| `GET /api/smarthome/docker/mode` | Return current persisted mode (`local`/`remote`) |
| `POST /api/smarthome/docker/start` | Write mode=local, start container via `docker compose up -d` |
| `POST /api/smarthome/docker/stop` | Write mode=remote immediately, stop container in background |
| `GET /api/smarthome/ping` | Verify HA connectivity through gateway |
| `GET /api/smarthome/states` | Fetch all entity states via gateway |
| `POST /api/smarthome/call` | Call an HA service (domain/service/data) via gateway |

---

## 13. Start Order

`launch.py` manages all three services:

```
1. MCP Gateway starts (port 8788) — waits until /health responds
2. Orchestrator starts (port 8787) — connects to gateway on first session
3. Desktop UI starts  (port 5173) — opens browser
```

Each service runs in its own virtualenv:
- `apps/mcp-gateway/.venv`
- `apps/orchestrator/.venv`
- `apps/desktop/node_modules`

```bash
python3 launch.py setup    # first-time: create venvs, install deps
python3 launch.py          # start all services (default)
python3 launch.py stop     # stop all services
python3 launch.py status   # check service status
python3 launch.py restart  # stop then start
```

---

## 13. Dashboard UI Layout

The desktop UI (`apps/desktop/src/App.tsx`) is a full-viewport 3-column layout rendered at `http://localhost:5173`.

### Header bar

Spans all three columns. Left to right:

- Title + subtitle ("AI Desk Companion")
- Spacer
- Voice on/off toggle
- **Restart** button (icon + label) — triggers a new wake-word cycle
- **Sleep / Wake Up / Booting** button — animated state machine:
  - `booting` / `wake_detected` → spinner + "Booting…" / "Activating…" (disabled)
  - `standby` / `sleep` → cyan "Wake Up" button
  - any active phase → "Sleep" button
- Settings gear

### Left panel

- `AgentBootList` — scrollable list of all registered agents with live status dots and boot-sequence log lines

### Center panel

Primary interaction area, laid out top to bottom:

1. **Orbit canvas** — `AgentOrbit3D` (fixed 420 px height, `position: relative`)

   | Canvas layer | Description |
   |---|---|
   | Orbit guide rings | Two dashed ellipses defining the 3D orbit path |
   | Communication link | Dotted animated line + sliding pulse dot between AI Core and active agent |
   | Active-agent radiation | Ambient glow + 4 expanding rings centered on the responding agent |
   | AI Core | Gyroscope rings (2 tilted), octahedron wireframe, voice-reactive glow + 5 expanding rings |
   | Agent nodes | DOM elements positioned by RAF physics — float on fibonacci ellipsoid |

   **Canvas overlays (absolute-positioned DOM):**

   | Position | Component | Content |
   |---|---|---|
   | Top-left | `ForecastStrip` | Vertical 5-day forecast (Today / Sat / Sun / Mon / Tue) |
   | Top-right | Performance HUD | Latency, active agent, CPU %, RAM % |

2. **Conversation header** — current phase label + active agent name

3. **HoloChat** — scrollable conversation history (user + assistant turns)

4. **Input bar** — text field + send button

### Right panel

Three cards stacked vertically:

| Card | Content |
|---|---|
| System Status (teal) | CPU %, RAM %, disk %, uptime — spread label/value layout |
| App Status (violet) | Orchestrator, MCP Gateway, Desktop — live health dots |
| Config | LLM provider, TTS/STT mode, wake-word status |

### AI Core — voice reactivity

`AgentOrbit3D` receives `voiceActive: boolean` and `voiceIntensity: number` (0–1) from `App.tsx`:

```
voiceActive  = isSpeaking || isListening || phase === 'responding' || phase === 'thinking'
voiceIntensity = 1.0 (speaking) | 0.9 (responding) | 0.6 (listening) | 0.32 (thinking) | 0.0
```

- **Radiation fires only when `voiceActive && voiceIntensity > 0.05`** — idle AI Core stays dark
- 5 concentric rings expand outward from the core center, staggered by `i/5` phase offset
- Ring speed: 1.4× (responding) · 1.1× (listening) · 0.75× (thinking)
- Ambient glow radius and opacity both scale with `voiceIntensity`

### Active-agent focus

When `activeAgentId` is set and `phase` is `thinking / responding / listening`:

- Active agent node: ambient glow + 4 outward-expanding rings (canvas), 3 DOM pulse rings, scaled to `1.35×`, `z-index: 200`
- All other agent nodes: dimmed to 30% opacity
- Communication link: animated dotted line + pulse dot between AI Core and active agent
