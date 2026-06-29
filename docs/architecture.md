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
| Config | pydantic-settings (reads `.env`) |
| HTTP client | httpx |

### MCP Gateway — `apps/mcp-gateway/`

| Layer | Choice |
|---|---|
| Language | Python 3.13 |
| Framework | FastAPI 0.115 |
| Server | uvicorn with standard extras |
| Data | yfinance, psutil, httpx, mcp |

### Voice Providers

| Direction | Browser (default) | Server (opt-in) |
|---|---|---|
| TTS | Web Speech Synthesis API | OpenAI TTS (`tts-1` / `tts-1-hd`) or ElevenLabs |
| STT | Web Speech Recognition API | OpenAI Whisper (`whisper-1`) |

---

## 3. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (React + Vite :5173)                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  RobotAvatar · AgentBootList · SettingsPanel            │    │
│  │  useOrchestratorRuntime · useVoiceLoop · useAgentConfig │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────┬───────────────────────────────────────────┘
                       │ WebSocket  ws://localhost:8787/ws
┌──────────────────────▼───────────────────────────────────────────┐
│  Orchestrator (FastAPI :8787)                                     │
│  • Session lifecycle — start/stop, credential plumbing           │
│  • LLM tool-calling loop (OpenAI / Anthropic / Gemini / Ollama)  │
│  • Local agents: SmartHome, WhatsApp, WebSearch, Calculator,     │
│                  Memory, Briefing, GeneralAI                     │
│  • Voice: TTS (OpenAI · ElevenLabs · Browser)                   │
│           STT (Whisper · Browser)                                │
└──────────────────────┬───────────────────────────────────────────┘
                       │ HTTP  http://localhost:8788
┌──────────────────────▼───────────────────────────────────────────┐
│  MCP Gateway (FastAPI :8788)                                      │
│  • Aggregates all tool-call sources                              │
│  • Namespaces tools: weather__get_current_weather, etc.          │
│  • Injects per-call credentials — never stores tokens            │
│  Servers (in-process adapters):                                  │
│  ┌──────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌───────────┐  │
│  │ INDmoney │ │ GitHub │ │ Google │ │Weather │ │   News    │  │
│  │indmoney__│ │github__│ │google__│ │weather_│ │  news__   │  │
│  └──────────┘ └────────┘ └────────┘ └────────┘ └───────────┘  │
│  ┌──────────┐ ┌────────┐                                        │
│  │  Stocks  │ │ System │                                        │
│  │ stocks__ │ │system__│                                        │
│  └──────────┘ └────────┘                                        │
└──────────────────────────────────────────────────────────────────┘
          │                       │
    Streamable HTTP           Direct calls
    (remote MCP)              (yfinance / psutil / httpx)
          │
  https://mcp.indmoney.com/mcp
```

---

## 4. Monorepo Layout

```
ai-desk-companion/
├── apps/
│   ├── desktop/          React + Vite frontend
│   ├── orchestrator/     Python FastAPI orchestrator
│   └── mcp-gateway/      Python FastAPI MCP aggregator
├── docs/                 Architecture, API contracts, setup guides
├── scripts/              test.sh, gen_tests.py
├── start.py              Cross-platform dev launcher
├── start.sh              macOS/Linux wrapper
└── start.bat             Windows wrapper
```

### Orchestrator layout

```
apps/orchestrator/app/
├── agents/
│   ├── base.py           AssistantAgent ABC
│   ├── registry.py       AGENTS list (local agents only)
│   ├── smarthome.py      Home Assistant via hass-mcp Docker
│   ├── whatsapp.py       Meta WhatsApp Cloud API + webhook
│   ├── websearch.py      DuckDuckGo Instant Answers
│   ├── calculator.py     Safe AST evaluator
│   ├── memory.py         Persistent key-value store
│   ├── briefing.py       Parallel gateway calls → summary
│   └── general_ai.py     LLM fallback
├── api/
│   ├── routes/           REST endpoints (portfolio OAuth, health)
│   └── ws.py             WebSocket handler
├── core/config.py        Settings (pydantic-settings)
├── models/contracts.py   AgentRequest / AgentResponse / AgentHealth
└── services/
    ├── agent_manager.py  Session state, credential plumbing, orchestrate()
    ├── orchestrator.py   LLMOrchestrator — tool-call loop
    ├── session.py        Boot sequence, phrase pools, gateway/snippet maps, AGENT_LABELS
    ├── gateway_client.py GatewayClient — GET /tools, POST /tools/{name}
    ├── router.py         Keyword fallback router
    ├── llm.py            LLM provider abstraction
    ├── tts_helpers.py    Per-agent voice config
    ├── hass_mcp_client.py     Home Assistant MCP client (Docker hass-mcp bridge)
    ├── indmoney_mcp_client.py INDmoney MCP client (portfolio REST routes only)
    ├── auth.py           Session token management
    ├── event_bus.py      In-process event fan-out
    ├── metrics.py        Session metrics
    └── tunnel.py         Cloudflare tunnel helper (WhatsApp)
```

### MCP Gateway layout

```
apps/mcp-gateway/app/
├── main.py               FastAPI app, lifespan, /health /tools /tools/{name}
├── config.py             GatewaySettings (port 8788, credential placeholders)
├── aggregator.py         MCPAggregator — register, startup, shutdown, route
└── servers/
    ├── base.py           BaseMCPServer ABC (connect/disconnect/list_tools/call_tool)
    ├── indmoney_mcp_adapter.py  INDmoney BaseMCPServer adapter → mcp.indmoney.com via Streamable HTTP
    ├── github_server.py    GitHub REST API (5 tools)
    ├── google_server.py    Google Calendar + Gmail REST APIs
    ├── weather_server.py   Open-Meteo (free) or OpenWeatherMap/WeatherAPI
    ├── news_server.py      GNews API
    ├── stocks_server.py    yfinance (no key needed)
    └── system_server.py    psutil — CPU, RAM, disk, battery, processes
```

---

## 5. Data Flow — Voice Command

```
1. User speaks          → Browser STT (or OpenAI Whisper)
2. Text sent            → WebSocket to Orchestrator
3. Orchestrator         → GET http://localhost:8788/tools
                          (fetches namespaced tool list from gateway)
4. LLM call             → POST {provider}/chat/completions
                          messages=[system+user], tools=[all gateway tools + local agent tools]
5. LLM returns          → tool_call: { name: "weather__get_current_weather", arguments: { query: "..." } }
6. Orchestrator         → POST http://localhost:8788/tools/weather__get_current_weather
                          body: { arguments: {...}, credentials: { weather_api_key: "...", ... } }
7. Gateway routes       → WeatherServer.call_tool() → Open-Meteo/OWM HTTP call
8. Result returned      → Orchestrator → LLM synthesis prompt
9. LLM synthesises      → Plain spoken English (1–3 sentences)
10. TTS                 → Browser or OpenAI/ElevenLabs audio → user hears response
```

For local agent calls (smarthome, websearch, calculator, memory, briefing, general):  
steps 6–7 are replaced by `AgentManager.handle(agent_id, request)` — no gateway hop.

---

## 6. Tool Namespacing

Every gateway tool is exposed with a `<namespace>__<tool>` name to prevent collisions:

| Namespace | Tools |
|---|---|
| `weather` | `weather__get_current_weather` |
| `news` | `news__get_news` |
| `stocks` | `stocks__get_quote` |
| `system` | `system__get_system_info` |
| `github` | `github__get_summary`, `github__get_pull_requests`, `github__get_notifications`, `github__get_workflow_status`, `github__get_issues` |
| `google` | `google__get_calendar_events`, `google__get_emails` |
| `indmoney` | `indmoney__query_portfolio` |

Local agent tools keep their plain IDs: `smarthome`, `websearch`, `calculator`, `memory`, `briefing`, `general`.

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
  │  ── Gateway online ────────────────────────────────────────────────
  │  speak (randomised) "MCP gateway link established — tool matrix online."
  │  asyncio.gather(_fetch_boot_snippet × N agents, timeout=5 s each)
  │    ├─ weather__get_current_weather  → "Mumbai 28°C, partly cloudy"
  │    ├─ stocks__get_quote (Nifty 50)  → "Nifty ₹24,150 (+0.43%)"
  │    ├─ news__get_news                → top headline title
  │    ├─ github__get_summary           → "3 PRs awaiting review"
  │    ├─ google__get_calendar_events   → "Next event: 'Standup' at 10:30 AM"
  │    ├─ google__get_emails            → "7 unread emails"
  │    ├─ system__get_system_info       → "CPU 18% · RAM 54%"
  │    └─ indmoney__query_portfolio     → first line of portfolio summary
  │  for each gateway agent (individual speak + agent_status_changed: online):
  │    "Weather module synchronized and online — Mumbai 28°C, partly cloudy."
  │    "Stock Market pipeline connected — Nifty ₹24,150 (+0.43%)."
  │    … (snippet omitted silently if fetch failed / token not configured)
  │
  │  ── Gateway offline ─────────────────────────────────────────────
  │  speak (randomised) "MCP gateway unreachable — tool network dark."
  │  for each gateway agent: emit agent_status_changed: degraded (silent)
  │
  ├─ asyncio.gather(test_agent(smarthome), test_agent(whatsapp))
  │    speak individual result per local agent
  │    emit agent_status_changed: online / degraded / failed
  │
  ├─ emit online (websearch, calculator, memory, briefing) — silent
  └─ emit phase_changed: ready
```

**Boot phrase pools** (all randomised each session, defined in `session.py`):

| Pool | Purpose |
|---|---|
| `_GW_CONNECT_PHRASES` | Spoken once when gateway health check passes (8 variants) |
| `_GW_FAIL_PHRASES` | Spoken once when gateway is unreachable (8 variants) |
| `_GW_AGENT_ONLINE_PHRASES` | Per-agent message template; snippet appended as `— {data}.` (10 variants) |

**Live snippet extraction** (`_GW_BOOT_CALLS` + `_GW_SNIP_FN`):

Each gateway agent has a designated boot tool call and a snippet extractor that distils the full response into a single short phrase (≤ 70 chars). Any call that fails, times out, or returns an error string is silently suppressed — the agent still reports online, just without a snippet.

### Per-turn orchestration

```
user_message (WebSocket)
  │
  ├─ _fetch_gateway_tools()   GET /tools  (every turn)
  ├─ llm_orchestrator.handle(message, tools=[local + gateway])
  │    LLM picks tool → call_agent(fn_name, query)
  │    if '__' in fn_name → gateway_client.call_tool(fn_name, args, credentials)
  │    else               → agent_manager.handle(fn_name, request)
  └─ LLM synthesises → TTS → audio
```

---

## 8. Credential Flow

Credentials are **never stored server-side** across sessions. Flow:

```
UI (localStorage) ──start_session──► Orchestrator
                                       └─ agent_manager._session_credentials()
                                            builds flat dict: { indmoney_token, github_token,
                                            google_access_token, weather_api_key, … }
                                          ↓ forwarded on every POST /tools/{name}
                                        Gateway
                                          └─ Server.call_tool(arguments, credentials)
                                               injects only the relevant key per server
```

Fallback order: session (from UI) → `.env` environment variable → empty string.

---

## 9. WebSocket Protocol

All messages follow `{ "type": "<event>", "payload": { ... } }`.

**UI → Orchestrator (client sends)**

| type | payload | description |
|---|---|---|
| `start_session` | `assistant_name`, `calling_name`, `registered_agents`, `llm_config`, `agent_config`, `tts`, `stt`, `agent_voices` | Begin session |
| `stop_session` | — | End session, clear credentials |
| `voice_input` | `text` | Transcribed speech |
| `audio_chunk` | `data` (base64) | Raw audio for Whisper STT |
| `audio_end` | — | Signal end of audio stream |

**Orchestrator → UI (server sends)**

| type | payload | description |
|---|---|---|
| `phase_changed` | `phase` | `booting` / `ready` / `listening` / `processing` / `speaking` |
| `agent_status_changed` | `agent`, `status` | `starting` / `online` / `degraded` / `failed` |
| `boot_status` | `text`, `agent_id?`, `agent_status?` | Spoken boot line |
| `session_config` | `tts_provider`, `stt_provider`, `wake_word_enabled`, `wake_word_model` | Effective session config |
| `response` | `text`, `agent` | Final answer + which agent/tool handled it |
| `error` | `message` | Non-fatal error description |
| `transcription` | `text` | STT result echo |
| `performance` | `latency_ms`, `agent`, `timestamp` | Per-turn timing |
| `metrics` | `session_count`, `uptime_s`, … | Periodic health broadcast |

---

## 10. LLM Orchestrator

`apps/orchestrator/app/services/orchestrator.py` — `LLMOrchestrator`

Supports OpenAI, Anthropic, and Gemini. All three implement the same loop:

1. Build tools list from enabled local agents + gateway tools.
2. Send `[system, user]` + tools to the LLM.
3. If `finish_reason == tool_calls`: call each tool, append results, re-prompt the LLM.
4. Return synthesised text + agent ID used.

No keyword routing happens in this path. The LLM selects the tool from descriptions alone.

**Keyword fallback** (`services/router.py`) applies only when no LLM is configured.

---

## 11. MCP Gateway Design

`apps/mcp-gateway/` — independent FastAPI service on port 8788.

### API

| Endpoint | Description |
|---|---|
| `GET /health` | `{ status: "ok", servers: [...] }` — server statuses |
| `GET /tools` | `[ { name, description, inputSchema } ]` — all namespaced tools |
| `POST /tools/{tool_name}` | `{ arguments, credentials }` → tool result |

### Server adapters

All servers implement `BaseMCPServer`:

```python
class BaseMCPServer(ABC):
    namespace: str
    async def connect(self) -> None: ...
    async def disconnect(self) -> None: ...
    async def list_tools(self) -> list[dict]: ...
    async def call_tool(self, tool_name: str, arguments: dict, credentials: dict) -> Any: ...
```

`MCPAggregator` registers servers, merges their tool lists with namespace prefixes, and routes calls.

### Error codes

| HTTP status | Meaning |
|---|---|
| 404 | Unknown tool name |
| 401 | Missing or invalid credentials |
| 503 | Server-side call failed (upstream error, timeout, etc.) |

---

## 12. Security

- WebSocket origin is enforced against an allowlist (`ALLOWED_ORIGINS`).
- Per-connection rate limiting: 30 messages / 60 s sliding window.
- Input length capped at 2000 characters per message.
- Credentials are held in memory only for the duration of the active session.
- INDmoney MCP endpoint is hardcoded (`https://mcp.indmoney.com/mcp`) — no user-controlled URL parameters for MCP connections (SSRF prevention).
- No credentials are logged at any level.
- Portfolio OAuth uses PKCE + Dynamic Client Registration (RFC 7591).

---

## 13. Start Order

`start.py` manages all three services:

```
1. MCP Gateway starts (port 8788) — waits until /health responds
2. Orchestrator starts (port 8787) — connects to gateway on first session
3. Desktop UI starts  (port 5173) — opens browser
```

Each service runs in its own virtualenv:
- `apps/orchestrator/.venv`
- `apps/mcp-gateway/.venv`
- `apps/desktop/node_modules`
