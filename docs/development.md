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

# One-command setup and launch (installs deps on first run)
python3 start.py          # macOS / Linux
python start.py           # Windows
```

The launcher:
1. Creates a Python virtual environment in `apps/orchestrator/.venv`
2. Installs Python dependencies from `requirements.txt`
3. Runs `npm install` in `apps/desktop`
4. Starts both services and opens the browser

### Manual setup (two terminals)

**Terminal 1 — Orchestrator**
```bash
cd apps/orchestrator
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.sample .env              # then edit with your keys
uvicorn app.main:app --reload --port 8787
```

**Terminal 2 — Desktop UI**
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
| WeatherAgent | `test_agents/test_weather.py` | 17 — `_extract_city`, OWM, WeatherAPI, Open-Meteo, 401/404 |
| SystemAgent | `test_agents/test_system.py` | 13 — boot format, metrics fields, battery, top-procs |
| GitHubAgent | `test_agents/test_github.py` | 11 — no token, routing (PR/workflow/notification/issue), 401/403 |
| NewsAgent | `test_agents/test_news.py` | 20 — `_extract_topic`, boot, headlines, topic search, API errors |
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

## Adding a New Agent

Follow these eight steps in order. Each one is required — skipping any causes the agent to be invisible in the roster, missing from voice config, or silently ignored by the router.

### Step 1 — Backend Python class

Create `apps/orchestrator/app/agents/<name>.py`:

```python
from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus

class MyAgent(AssistantAgent):
    id         = 'myagent'        # unique snake_case — used everywhere as the key
    name       = 'My Agent'       # display label
    config_key = 'myagent'        # matches key in agent_config dict; set None if no credentials
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

### Step 2 — Register

`apps/orchestrator/app/agents/registry.py` — add `MyAgent` to the `AGENTS` list.

### Step 3 — Keyword routing

`apps/orchestrator/app/services/router.py` → `_keyword_route()` — add keyword patterns that route to `'myagent'`.

### Step 4 — Boot labels + health query

`apps/orchestrator/app/services/session.py`:

```python
AGENT_LABELS['myagent']     = 'My Agent'
AGENT_BOOT_QUERY['myagent'] = 'boot'   # any string triggers a health check on session start
```

Omit `AGENT_BOOT_QUERY` entry if the agent needs no meaningful health check.

### Step 5 — Default OpenAI TTS voice

`apps/orchestrator/app/services/tts_helpers.py` → `AGENT_VOICES`:

```python
AGENT_VOICES['myagent'] = 'nova'   # alloy | echo | fable | nova | onyx | shimmer
```

### Step 6 — Frontend roster catalogue

`apps/desktop/src/hooks/useOrchestratorRuntime.ts` → `AGENT_CATALOGUE`:

```typescript
{ id: 'myagent', label: 'My Agent', description: 'Short description.',
  example: 'Ask me about X', status: 'offline', color: 'from-X-400 to-Y-500' }
```

The roster panel (left column) shows/hides, enables/disables, and displays boot status for every entry here automatically.

### Step 7 — Default per-agent browser voice

`apps/desktop/src/hooks/useAgentVoiceConfig.ts` → `DEFAULT_AGENT_VOICES`:

```typescript
myagent: { gender: 'female', speed: 'normal', voiceName: '', openaiVoice: 'nova' },
```

Users can override any field in **Settings → Agents → My Agent → Voice**.

### Step 8 — Settings accordion + credentials

**If the agent has credentials**, create `apps/desktop/src/components/settings/MyAgentSettings.tsx` (see any existing settings component as a template) and add `myagent` to `AgentConfig` in `useAgentConfig.ts`.

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

`voiceRow(id, label)` is a helper already defined in `AgentsSettings.tsx` — it renders the full gender/speed/OpenAI/browser voice config row with reset and test buttons.

**Enable/disable flow:** The accordion toggle calls `onPatch` → `useAgentConfig` → `registeredAgentIds` (computed from all enabled agents) → sent to backend as `registered_agents` in `start_session` → backend only boots and routes to listed agents.

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
│   │   │   │   ├── hooks/        agentVerify.test.ts, voiceLoop.patterns.test.ts
│   │   │   │   └── lib/          utils.test.ts
│   │   │   ├── components/       UI components (RobotAvatar, AgentBootList, …)
│   │   │   │   └── settings/     Per-module settings panels (12 components)
│   │   │   ├── hooks/            React hooks (useOrchestratorRuntime, useVoiceLoop, …)
│   │   │   ├── types/            Shared TypeScript types (runtime.ts)
│   │   │   └── App.tsx           Root component
│   │   ├── src-tauri/            Tauri native wrapper (Rust)
│   │   ├── vitest.config.ts      Vitest configuration
│   │   └── package.json
│   └── orchestrator/
│       ├── app/
│       │   ├── agents/           Individual agent implementations
│       │   ├── api/              FastAPI routes and WebSocket endpoint (ws.py)
│       │   ├── core/             Config and settings (reads .env)
│       │   ├── models/           Pydantic contracts
│       │   └── services/         LLM, TTS, STT, routing, metrics
│       ├── tests/                Pytest test suite
│       │   ├── conftest.py       Shared fixtures
│       │   ├── test_agents/      Per-agent tests
│       │   ├── test_services/    Service-layer tests
│       │   └── test_api/         API / security tests
│       ├── .env.sample           Template — copy to .env and fill in keys
│       ├── pytest.ini            Pytest configuration
│       ├── requirements.txt      Runtime dependencies
│       └── requirements-dev.txt  Test-only dependencies
├── docs/                         All documentation
├── scripts/
│   ├── test.sh                   Master test runner (backend + frontend + report)
│   └── gen_tests.py              Auto-generate test stubs for new modules
├── start.py                      Cross-platform dev launcher
├── start.sh                      macOS/Linux shell wrapper
└── start.bat                     Windows wrapper
```

---

## Environment Variables

Copy `apps/orchestrator/.env.sample` to `apps/orchestrator/.env` and fill in any keys you need.

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
| `WEATHER_API_KEY` | OpenWeatherMap or WeatherAPI key | For Weather agent |
| `WEATHER_PROVIDER` | `openweathermap` or `weatherapi` | No (defaults to openweathermap) |
| `WEATHER_DEFAULT_CITY` | Default city for weather queries | No |
| `GITHUB_TOKEN` | GitHub Personal Access Token | For GitHub agent |
| `GOOGLE_ACCESS_TOKEN` | Google OAuth2 access token | For Calendar/Gmail agents |
| `GOOGLE_REFRESH_TOKEN` | Google OAuth2 refresh token | For token refresh |
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID | For token refresh |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret | For token refresh |
| `STOCK_DEFAULT_MARKET` | `IN` (NSE) or `US` (NYSE/NASDAQ) | No (defaults to IN) |
| `NEWS_API_KEY` | NewsAPI.org API key | For News agent |
| `NEWS_DEFAULT_COUNTRY` | ISO 3166-1 alpha-2 code (`in`, `us`, …) | No |
| `WAKE_WORD_ENABLED` | `true` / `false` | No (defaults to false) |
| `WAKE_WORD_MODEL` | openWakeWord model name | No |

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
