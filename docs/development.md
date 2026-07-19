# Development Guide

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.10 – 3.13 | 3.13 recommended |
| Node.js | 20+ | |
| npm | any recent | pnpm also supported |
| Rust | stable | Only required for Tauri native desktop build |

---

## Setup

```bash
git clone https://github.com/ritexlabs/ai-desk-companion.git
cd ai-desk-companion

python3 launch.py setup   # first-time install (creates venvs, installs all deps)
python3 launch.py start   # start all services and open the browser

# Windows: use  python launch.py  instead of  python3 launch.py
```

`launch.py setup`:
1. Creates a Python virtual environment in `apps/mcp-gateway/.venv`
2. Installs MCP Gateway Python dependencies from `apps/mcp-gateway/requirements.txt`
3. Creates a Python virtual environment in `apps/orchestrator/.venv`
4. Installs orchestrator Python dependencies from `apps/orchestrator/requirements.txt`
5. Runs `npm install` in `apps/desktop`
6. Starts all three services (gateway → orchestrator → desktop) and opens the browser

### Manual setup (three terminals)

**Terminal 1 — MCP Gateway**
```bash
cd apps/mcp-gateway
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8788
```

**Terminal 2 — Orchestrator**
```bash
cd apps/orchestrator
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.sample .env              # then edit with your keys
uvicorn app.main:app --reload --port 8787
```

**Terminal 3 — Desktop UI**
```bash
cd apps/desktop
npm install
npm run dev
```

Then open **http://localhost:5173**.

---

## Testing

### Quick start — run everything

```bash
./scripts/test.sh              # both backend and frontend; prints per-module summary
./scripts/test.sh --backend    # pytest only
./scripts/test.sh --frontend   # vitest only
./scripts/test.sh --coverage   # add HTML coverage report
```

The script auto-installs test dependencies on first run.

---

### Backend tests (pytest)

**Install dev dependencies** (one-time, inside the venv):
```bash
cd apps/orchestrator
.venv/bin/python3 -m pip install -r requirements-dev.txt
```

**Run all tests:**
```bash
.venv/bin/python3 -m pytest tests/
```

**Useful flags:**
```bash
.venv/bin/python3 -m pytest tests/ -v                    # verbose output
.venv/bin/python3 -m pytest tests/ --tb=short            # short tracebacks
.venv/bin/python3 -m pytest tests/test_agents/           # one subdirectory
.venv/bin/python3 -m pytest tests/ -k "weather"          # filter by name
.venv/bin/python3 -m pytest tests/ --cov=app --cov-report=html  # coverage
```

**What's tested:**

| Module | File | Tests |
|--------|------|-------|
| session.py | `test_services/test_session.py` | 26 — `strip_agent_prefix`, `is_agent_error`, `make_greeting`, `pick_farewell` |
| tts_helpers.py | `test_services/test_tts_helpers.py` | 10 — `settings_label`, `agent_tts` voice assignment |
| agent_manager.py | `test_services/test_agent_manager.py` | 20 — `_merge`, `_merge_llm`, configure/clear, `llm_configured` |
| ws.py security | `test_api/test_ws_security.py` | 8 — `_RateLimiter` sliding window, `MAX_INPUT_CHARS` |

---

### Frontend tests (vitest)

**Install dependencies** (one-time):
```bash
cd apps/desktop
npm install
```

**Run tests:**
```bash
npm test               # single run (vitest run)
npm run test:watch     # watch mode — re-runs on file change
npm run test:coverage  # with v8 coverage report in coverage/
```

**What's tested:**

| File | Tests |
|------|-------|
| `src/__tests__/lib/utils.test.ts` | 14 — `partOfDayFromHour` all 24 h, `nowIso` ISO validity |
| `src/__tests__/hooks/agentVerify.test.ts` | 16 — Weather/GitHub/News/SmartHome verify with stubbed `fetch` |
| `src/__tests__/hooks/voiceLoop.patterns.test.ts` | 45 — wake-word pattern (12 positive, 6 negative), sleep pattern (15 + 5 + 5), special-char normalisation |

---

### Auto-generate test stubs for new modules

When you add a new agent or service, the generator creates a boilerplate stub so you never start from a blank file:

```bash
python3 scripts/gen_tests.py --list   # show ✓ / ✗ coverage for all modules
python3 scripts/gen_tests.py          # create stub files for any uncovered module
python3 scripts/gen_tests.py --dry-run  # preview what would be created
```

Stubs are created in `tests/test_agents/` or `tests/test_services/` matching the source tree. **Existing test files are never overwritten.**

---

## Adding a New Service

There are two cases depending on where the service runs.

### Case A — New MCP Gateway tool (recommended for external APIs)

This is the right path for services like stocks, weather, news, GitHub — any service that makes HTTP calls to an external API. No orchestrator changes needed.

See the full guide: [docs/mcp-gateway.md](mcp-gateway.md)

**Short version — 4 steps:**

1. Create `apps/mcp-gateway/src/tools/myservice.py` implementing `BaseTool` (see any existing tool as a template). Credentials are read from `settings` — no forwarding needed.
2. Register it in `apps/mcp-gateway/src/main.py` → `_register_tools()`.
3. Add credential keys to `apps/mcp-gateway/.env` (and document them in `.env.sample`).
4. The orchestrator and frontend need no changes — the gateway discovers the tool automatically.

The LLM discovers the tool automatically from its description. No keyword rules, no boot query, no agent class.

### Case B — New local agent (for agents that run entirely in-process)

Use this for pure in-process logic — calculators, memory stores, keyword tools. Services that call external APIs or receive webhooks should be gateway tools (Case A). Follow these steps in order — skipping any makes the agent invisible in the roster or silently ignored by the router.

#### Step 1 — Backend Python class

Create `apps/orchestrator/app/agents/<name>.py`:

```python
from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus

class MyAgent(AssistantAgent):
    id         = 'myagent'
    name       = 'My Agent'
    config_key = 'myagent'   # key in agent_config dict; None if no credentials
    tool_meta  = {
        'description': 'One sentence describing what this agent can answer.',
        'query_hint':  'The user query passed to this tool.',
    }

    async def initialize(self) -> None: ...
    async def health(self) -> AgentHealth: return AgentHealth(name=self.name, status=AgentStatus.ONLINE)
    async def handle(self, request: AgentRequest) -> AgentResponse: ...
    async def shutdown(self) -> None: ...
```

Use `request.context['agent_config']` for credentials and `request.context['llm_config']` for LLM access.

#### Step 2 — Register

`apps/orchestrator/app/agents/registry.py` — add `MyAgent` to the `AGENTS` list.

#### Step 3 — Keyword routing

`apps/orchestrator/app/services/router.py` → `_keyword_route()` — add keyword patterns that route to `'myagent'`.

#### Step 4 — Boot labels + health query

`apps/orchestrator/app/services/session.py`:

```python
AGENT_LABELS['myagent']     = 'My Agent'
AGENT_BOOT_QUERY['myagent'] = '__boot__'   # triggers health check on session start
```

Omit `AGENT_BOOT_QUERY` entry if no health check is needed.

#### Step 5 — Default OpenAI TTS voice

`apps/orchestrator/app/services/tts_helpers.py` → `AGENT_VOICES`:

```python
AGENT_VOICES['myagent'] = 'nova'   # alloy | echo | fable | nova | onyx | shimmer
```

#### Step 6 — Frontend roster catalogue

`apps/desktop/src/hooks/useOrchestratorRuntime.ts` → `AGENT_CATALOGUE`:

```typescript
{ id: 'myagent', label: 'My Agent', description: 'Short description.',
  example: 'Ask me about X', status: 'offline', color: 'from-X-400 to-Y-500' }
```

#### Step 7 — Default per-agent browser voice

`apps/desktop/src/hooks/useAgentVoiceConfig.ts` → `DEFAULT_AGENT_VOICES`:

```typescript
myagent: { gender: 'female', speed: 'normal', voiceName: '', openaiVoice: 'nova' },
```

#### Step 8 — Settings accordion + credentials

If the agent has credentials, create `apps/desktop/src/components/settings/MyAgentSettings.tsx` and add `myagent` to `AgentConfig` in `useAgentConfig.ts`.

Then in `apps/desktop/src/components/settings/AgentsSettings.tsx`:

```tsx
<AgentAccordion
  id="myagent" label="My Agent" emoji="🔧"
  status={config.myagent.status} info={config.myagent.info}
  open={openSection === 'myagent'} onToggle={() => toggle('myagent')}
  enabled={config.myagent.enabled}
  onToggleEnabled={() => onPatch('myagent', { enabled: !config.myagent.enabled })}
>
  <MyAgentSettings config={config.myagent} onPatch={(p) => onPatch('myagent', p)} onVerify={...} />
  {voiceRow('myagent', 'My Agent')}
</AgentAccordion>
```

---

### TypeScript type-check
```bash
cd apps/desktop
npx tsc --noEmit
```

### Python syntax check
```bash
find apps/orchestrator/app -name '*.py' -exec python3 -m py_compile {} \;
```

---

## Build

### Frontend only
```bash
cd apps/desktop
npm run build
# output: apps/desktop/dist/
```

### Tauri native desktop app
```bash
# Requires Rust toolchain: https://rustup.rs
cd apps/desktop
npm install
npm run tauri:dev       # dev mode with native window
npm run tauri:build     # creates .app / .exe / .deb
# output: apps/desktop/src-tauri/target/release/bundle/
```

---

## Project Structure

```
ai-desk-companion/
├── apps/
│   ├── desktop/
│   │   ├── src/
│   │   │   ├── __tests__/        Unit tests (vitest)
│   │   │   ├── components/       UI components:
│   │   │   │   AgentOrbit3D.tsx  — 3D orbital canvas, AI Core, agent nodes, voice radiation
│   │   │   │   WeatherWidget.tsx — ForecastStrip (vertical, canvas overlay)
│   │   │   │   HoloChat.tsx      — conversation history
│   │   │   │   AgentBootList.tsx · AgentDetailModal.tsx
│   │   │   │   SmartHomeDashboard.tsx · PortfolioDashboard.tsx
│   │   │   │   └── settings/     Per-agent settings accordions
│   │   │   ├── hooks/            React hooks (useOrchestratorRuntime, useVoiceLoop, …)
│   │   │   ├── types/            Shared TypeScript types (runtime.ts)
│   │   │   └── App.tsx           Root component
│   │   ├── src-tauri/            Tauri native wrapper (Rust)
│   │   ├── vitest.config.ts      Vitest configuration
│   │   └── package.json
│   ├── orchestrator/
│   │   ├── app/
│   │   │   ├── agents/           Local agent implementations (websearch, calculator, memory, briefing, general_ai)
│   │   │   ├── api/              FastAPI routes and WebSocket endpoint (ws.py)
│   │   │   ├── core/             Config and settings (reads .env)
│   │   │   ├── models/           Pydantic contracts
│   │   │   └── services/         LLM, TTS, STT, routing, gateway client, session
│   │   ├── tests/                Pytest test suite
│   │   │   ├── conftest.py       Shared fixtures
│   │   │   ├── test_services/    Service-layer tests
│   │   │   └── test_api/         API / security tests
│   │   ├── .env.sample           Template — copy to .env and fill in keys
│   │   ├── pytest.ini            Pytest configuration
│   │   ├── requirements.txt      Runtime dependencies
│   │   └── requirements-dev.txt  Test-only dependencies
│   └── mcp-gateway/
│       ├── src/
│       │   ├── main.py           FastAPI app (Bearer auth, /health, /tools, /mcp)
│       │   ├── config/settings.py  GatewaySettings — all credentials from .env
│       │   ├── tools/            BaseTool ABC + 9 tool implementations
│       │   ├── routers/          portfolio (OAuth), system, tunnel, whatsapp
│       │   └── utils/            errors.py, logger.py
│       ├── .env.sample           Template — copy to .env and fill in keys
│       └── requirements.txt
├── docs/                         All documentation
├── scripts/
│   ├── test.sh                   Master test runner (backend + frontend + report)
│   └── gen_tests.py              Auto-generate test stubs for new modules
└── launch.py                     Cross-platform launcher (setup/start/stop/status/restart/clean)
```

---

## Environment Variables

Credentials are split across two `.env` files — one per service. Copy the matching `.env.sample` and fill in only the keys you need.

### `apps/orchestrator/.env`

| Variable | Description | Required |
|----------|-------------|----------|
| `LLM_PROVIDER` | `openai` / `anthropic` / `gemini` / `ollama` | No (defaults to openai) |
| `OPENAI_API_KEY` | OpenAI API key (LLM + TTS + STT) | For OpenAI features |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | For Anthropic LLM |
| `GEMINI_API_KEY` | Google Gemini API key | For Gemini LLM |
| `TTS_PROVIDER` | `browser` / `openai` / `elevenlabs` | No (defaults to browser) |
| `STT_PROVIDER` | `browser` / `openai` | No (defaults to browser) |
| `OPENAI_TTS_VOICE` | OpenAI TTS voice name | No (defaults to nova) |
| `OPENAI_TTS_MODEL` | `tts-1` or `tts-1-hd` | No (defaults to tts-1) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key | For ElevenLabs TTS |
| `ELEVENLABS_VOICE_ID` | ElevenLabs voice ID | For ElevenLabs TTS |
| `GATEWAY_URL` | MCP Gateway base URL | No (defaults to http://localhost:8788) |
| `GATEWAY_API_TOKEN` | Shared Bearer token to authenticate with the gateway | No (leave blank for local dev) |
| `WAKE_PHRASE` | Wake word / phrase the assistant listens for | No (defaults to Robo) |

### `apps/mcp-gateway/.env`

| Variable | Description | Required |
|----------|-------------|----------|
| `GATEWAY_API_TOKEN` | Must match the orchestrator's `GATEWAY_API_TOKEN` | No (leave blank for local dev) |
| `GITHUB_TOKEN` | GitHub Personal Access Token | For GitHub agent |
| `GOOGLE_ACCESS_TOKEN` | Google OAuth2 access token | For Calendar/Gmail agents |
| `GOOGLE_REFRESH_TOKEN` | Google OAuth2 refresh token | For token refresh |
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID | For token refresh |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret | For token refresh |
| `WEATHER_API_KEY` | OpenWeatherMap or WeatherAPI key | No (Open-Meteo free fallback) |
| `WEATHER_PROVIDER` | `open_meteo` / `openweathermap` / `weatherapi` | No (defaults to open_meteo) |
| `WEATHER_DEFAULT_CITY` | Default city for weather queries | No |
| `STOCK_DEFAULT_MARKET` | `IN` (NSE) or `US` (NYSE/NASDAQ) | No (defaults to IN) |
| `NEWS_API_KEY` | GNews API key | For News agent |
| `NEWS_DEFAULT_COUNTRY` | ISO 3166-1 alpha-2 code (`in`, `us`, …) | No |
| `MYHOME_MCP_ENDPOINT` | Home Assistant URL | For Smart Home agent |
| `MYHOME_MCP_TOKEN` | Home Assistant long-lived access token | For Smart Home agent |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp phone number ID | For WhatsApp agent |
| `WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp system user token | For WhatsApp agent |
| `WHATSAPP_APP_SECRET` | Meta app secret (webhook signature validation) | For WhatsApp webhooks |
| `INDMONEY_OAUTH_TOKEN` | Written automatically by the OAuth flow | — (do not set manually) |

---

## Branching Strategy

- `main` — production-ready code, protected
- `feat/<slug>` — new features
- `fix/<slug>` — bug fixes
- `chore/<slug>` — maintenance (docs, deps, refactor)

All PRs target `main`.

---

## Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add per-agent voice modulation in browser TTS
fix: prevent double-listen when auto-listen fires simultaneously with button press
chore: update docs with current architecture
refactor: parallelize agent boot sequence in ws.py
```

Prefixes: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`
