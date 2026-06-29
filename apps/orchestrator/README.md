# Orchestrator

Python FastAPI backend for AI Desk Companion — port 8787.

## Responsibilities

- Session lifecycle and WebSocket protocol
- LLM tool-calling loop (OpenAI / Anthropic / Gemini / Ollama)
- Local agent management: SmartHome, WhatsApp, WebSearch, Calculator, Memory, Briefing, GeneralAI
- Gateway integration: fetches tool lists from MCP Gateway (port 8788), forwards tool calls with credentials
- Voice providers: TTS (OpenAI · ElevenLabs · Browser), STT (Whisper · Browser)
- WebSocket security: rate limiting, origin enforcement, input length cap

## Run

The repo-root launcher starts all three services in order (gateway first, then orchestrator, then desktop):

```bash
python3 start.py
```

To start the orchestrator independently (gateway must already be running on port 8788):

```bash
cd apps/orchestrator
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.sample .env                # fill in keys
uvicorn app.main:app --reload --port 8787
```

## Testing

**Install test dependencies (one-time):**
```bash
.venv/bin/python3 -m pip install -r requirements-dev.txt
```

**Run all tests:**
```bash
.venv/bin/python3 -m pytest tests/ -v
```

**With coverage:**
```bash
.venv/bin/python3 -m pytest tests/ --cov=app --cov-report=term-missing
```

Or use the master runner from the repo root:

```bash
./scripts/test.sh --backend
```

### Test coverage

| File | Tests | What is covered |
|------|-------|-----------------|
| `tests/test_services/test_session.py` | 26 | `strip_agent_prefix`, `is_agent_error`, `make_greeting`, `pick_farewell` |
| `tests/test_services/test_tts_helpers.py` | 10 | `settings_label`, `agent_tts` voice assignment |
| `tests/test_services/test_agent_manager.py` | 20 | `_merge`, `_merge_llm`, configure/clear, `llm_configured`, unknown-agent fallback |
| `tests/test_api/test_ws_security.py` | 8 | `_RateLimiter` sliding-window, `MAX_INPUT_CHARS`, `allowed_origins` |

## Directory layout

```
apps/orchestrator/
├── app/
│   ├── agents/
│   │   ├── base.py           AssistantAgent ABC
│   │   ├── registry.py       AGENTS list (local agents only)
│   │   ├── smarthome.py      Home Assistant via hass-mcp Docker bridge
│   │   ├── whatsapp.py       Meta WhatsApp Cloud API + webhook
│   │   ├── websearch.py      DuckDuckGo Instant Answers
│   │   ├── calculator.py     Safe AST evaluator
│   │   ├── memory.py         Persistent key-value store
│   │   ├── briefing.py       Parallel gateway calls → spoken summary
│   │   └── general_ai.py     LLM fallback
│   ├── api/
│   │   ├── routes/           REST endpoints (portfolio OAuth, health)
│   │   └── ws.py             WebSocket handler
│   ├── core/config.py        Settings (pydantic-settings, reads .env)
│   ├── models/contracts.py   AgentRequest / AgentResponse / AgentHealth
│   └── services/
│       ├── agent_manager.py  Session state, credential plumbing, orchestrate()
│       ├── orchestrator.py   LLMOrchestrator — tool-call loop (3 providers)
│       ├── session.py        Boot sequence, gateway/snippet maps, phrase pools, AGENT_LABELS
│       ├── gateway_client.py GatewayClient — GET /tools, POST /tools/{name}
│       ├── router.py         Keyword fallback router (no-LLM mode)
│       ├── llm.py            LLM provider abstraction
│       ├── tts_helpers.py    Per-agent voice config
│       ├── hass_mcp_client.py     Home Assistant MCP client (Docker hass-mcp bridge)
│       ├── indmoney_mcp_client.py INDmoney MCP client (portfolio REST routes only)
│       ├── auth.py           Session token management
│       ├── event_bus.py      In-process event fan-out
│       ├── metrics.py        Session metrics broadcast
│       └── tunnel.py         Cloudflare tunnel helper (WhatsApp)
├── tests/
│   ├── conftest.py           Shared pytest fixtures
│   ├── test_services/        Service-layer tests
│   └── test_api/             API / security tests
├── .env.sample               Template — copy to .env and fill in keys
├── pytest.ini                asyncio_mode = auto, testpaths = tests
├── requirements.txt          Runtime dependencies
└── requirements-dev.txt      Test-only dependencies
```

## Which agents are local vs gateway

**Local agents** (run inside this process):

| Agent | ID | Boot check |
|---|---|---|
| Smart Home | `smarthome` | Yes — `__boot__` |
| WhatsApp | `whatsapp` | Yes — `__boot__` |
| Web Search | `websearch` | No (always online) |
| Calculator | `calculator` | No (always online) |
| Memory | `memory` | No (always online) |
| Briefing | `briefing` | No (always online) |
| General AI | `general` | No (always online) |

**Gateway tools** (served by `apps/mcp-gateway/`):

Weather · News · Stocks · System · GitHub · Google Calendar · Gmail · Portfolio

These are discovered dynamically via `GET /tools` at the start of each turn — no agent classes in this codebase.
