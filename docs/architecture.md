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
│  │  RobotAvatar · AgentBootList · AgentDetailModal               │  │
│  │  SmartHomeDashboard · PortfolioDashboard · SettingsPanel      │  │
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
│   │       ├── components/   UI components (RobotAvatar, AgentBootList, AgentDetailModal,
│   │       │                 AgentBackground, SmartHomeDashboard, PortfolioDashboard,
│   │       │                 settings/)
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
  ├─ agent_manager.configure_session(llm_config, agent_config, registered_agents)
  ├─ speak greeting
  ├─ emit agent_status_changed: starting (for all registered agents)
  │
  ├─ GET http://localhost:8788/health   ← one gateway health check
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

Credentials are split across two `.env` files — one per service:

```
apps/orchestrator/.env          apps/mcp-gateway/.env
─────────────────────           ───────────────────────
LLM_PROVIDER / LLM_API_KEY      GATEWAY_API_TOKEN          ← shared Bearer token
GATEWAY_URL                     GITHUB_TOKEN
GATEWAY_API_TOKEN               WEATHER_API_KEY
WAKE_PHRASE                     NEWS_API_KEY
…                               GOOGLE_ACCESS_TOKEN
                                MYHOME_MCP_TOKEN
                                WHATSAPP_ACCESS_TOKEN
                                INDMONEY_OAUTH_TOKEN        ← written by OAuth flow
                                …
```

The orchestrator holds **no** integration credentials. It sends only `GATEWAY_API_TOKEN` as a Bearer header. All integration credentials live in the gateway's own `.env` and are read at startup by `GatewaySettings`.

The INDmoney `access_token` is written to `apps/mcp-gateway/.env` by the OAuth callback handler — the desktop UI never receives or stores it.

---

## 9. WebSocket Protocol

All messages follow `{ "type": "<event>", "payload": { ... } }`.

**UI → Orchestrator (client sends)**

| type | payload | description |
|---|---|---|
| `start_session` | `assistant_name`, `calling_name`, `registered_agents`, `llm_config`, `agent_config`, `tts`, `stt`, `agent_voices` | Begin session |
| `stop_session` | — | End session |
| `voice_input` | `text` | Transcribed speech |
| `audio_chunk` | `data` (base64) | Raw audio for Whisper STT |
| `audio_end` | — | Signal end of audio stream |

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
- Per-connection rate limiting: 30 messages / 60 s sliding window.
- Input length capped at 2000 characters per message.
- Orchestrator authenticates to the gateway with a shared Bearer token (`GATEWAY_API_TOKEN`).
- All integration credentials live in `apps/mcp-gateway/.env` — never in the orchestrator or the UI.
- INDmoney MCP endpoint is hardcoded (`https://mcp.indmoney.com/mcp`) — no user-controlled URL parameters for MCP connections (SSRF prevention).
- Portfolio OAuth uses PKCE + Dynamic Client Registration (RFC 7591); the access token is stored only in the gateway's `.env`.
- No credentials are logged at any level.
- `.cloudflared/` (Cloudflare tunnel config containing tunnel UUIDs and hostnames) is gitignored.

---

## 12. Start Order

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
