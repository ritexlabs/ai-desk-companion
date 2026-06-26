# Orchestrator

Python FastAPI backend for AI Desk Companion.

## Responsibilities

- Session lifecycle and WebSocket protocol
- Intent routing (LLM classifier + keyword fallback)
- Agent management — configure, enable, invoke, and boot-test agents
- LLM / TTS / STT provider wiring (per-session override from UI)
- WebSocket security: per-connection rate limiting, origin enforcement, input length cap
- MCP-friendly expansion path

## Run

```bash
cd apps/orchestrator
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.sample .env                # fill in keys
uvicorn app.main:app --reload --port 8787
```

Or use the repo-root launcher which starts both services together:

```bash
python3 start.py
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

**Run a single module:**
```bash
.venv/bin/python3 -m pytest tests/test_agents/test_weather.py -v
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
| `tests/test_agents/test_weather.py` | 17 | `_extract_city` regex, OWM/WeatherAPI/Open-Meteo responses, 401/404 errors |
| `tests/test_agents/test_system.py` | 13 | Boot format, CPU/RAM/disk fields, battery and top-procs sections |
| `tests/test_agents/test_github.py` | 11 | No-token guard, PR/workflow/notification/issue routing, 401/403 error paths |
| `tests/test_agents/test_news.py` | 20 | `_extract_topic` pure function, boot article count, headlines, topic search, GNews errors |
| `tests/test_services/test_session.py` | 26 | `strip_agent_prefix`, `is_agent_error`, `make_greeting`, `pick_farewell` |
| `tests/test_services/test_tts_helpers.py` | 10 | `settings_label`, `agent_tts` voice assignment (same vs new instance) |
| `tests/test_services/test_agent_manager.py` | 20 | `_merge`, `_merge_llm`, configure/clear, `llm_configured`, unknown-agent fallback |
| `tests/test_api/test_ws_security.py` | 8 | `_RateLimiter` sliding-window, `MAX_INPUT_CHARS`, `allowed_origins` |

### Auto-generate stubs for new modules

When you add a new agent or service, run:

```bash
python3 scripts/gen_tests.py --list   # show ✓ / ✗ coverage gaps
python3 scripts/gen_tests.py          # create boilerplate stubs for uncovered modules
```

Existing test files are never overwritten.

## Directory layout

```
apps/orchestrator/
├── app/
│   ├── agents/          Individual agent implementations
│   ├── api/             FastAPI routes and WebSocket endpoint (ws.py)
│   ├── core/            Config and settings (reads .env)
│   ├── models/          Pydantic request/response contracts
│   └── services/        LLM, TTS, STT, routing, metrics, session
├── tests/
│   ├── conftest.py      Shared pytest fixtures (make_req, mock_http)
│   ├── test_agents/     Per-agent test modules
│   ├── test_services/   Service-layer tests
│   └── test_api/        API / security tests
├── .env.sample          Template — copy to .env and fill in keys
├── pytest.ini           asyncio_mode = auto, testpaths = tests
├── requirements.txt     Runtime dependencies
└── requirements-dev.txt Test-only dependencies (pytest, respx, …)
```
