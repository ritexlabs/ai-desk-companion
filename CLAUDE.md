# CLAUDE.md

Project context for Claude Code. Read this before touching any code.

---

## What This Project Is

**AI Desk Companion** — a desktop-first AI voice assistant with always-on wake-word detection, Alexa-style continuous conversation, and real-data integrations inside a futuristic real-time dashboard UI.

Three services run locally:

| Service | Port | Stack |
|---|---|---|
| Desktop UI | 5173 | React 18 + TypeScript + Vite + Tailwind |
| Orchestrator | 8787 | Python FastAPI + uvicorn |
| MCP Gateway | 8788 | Python FastAPI + uvicorn |

---

## Repository Structure

```
ai-desk-companion/
├── apps/
│   ├── desktop/          React + Vite frontend
│   │   └── src/
│   │       ├── components/   UI components (RobotAvatar, AgentBootList, settings/)
│   │       ├── hooks/        React hooks (useOrchestratorRuntime, useVoiceLoop, useAgentConfig)
│   │       └── types/        Shared TypeScript types (runtime.ts)
│   ├── orchestrator/     Python FastAPI orchestrator (port 8787)
│   │   └── app/
│   │       ├── agents/       Local agent implementations (websearch, calculator, memory, briefing, general)
│   │       ├── api/          FastAPI routes + WebSocket (ws.py)
│   │       ├── core/         Config (pydantic-settings, reads .env)
│   │       ├── models/       Pydantic contracts
│   │       └── services/     LLM, TTS, STT, boot sequence, gateway client, session
│   └── mcp-gateway/      Python FastAPI MCP tool gateway (port 8788)
│       └── src/
│           ├── config/       GatewaySettings (pydantic-settings, reads .env)
│           ├── tools/        BaseTool ABC + tool adapters (one file per integration)
│           └── main.py       FastAPI app — registers tools, auth middleware, webhook routes
├── docs/                 Full documentation (read before answering architecture questions)
│   ├── architecture.md   System design, 3-service stack, WebSocket protocol, boot sequence
│   ├── agents.md         Local agents, gateway tools, built-in skills
│   ├── mcp-gateway.md    Gateway API, BaseTool ABC, adding new tools
│   └── development.md    Local setup, commands, adding new agents/services
├── scripts/
│   ├── test.sh           Master test runner (backend + frontend)
│   └── gen_tests.py      Auto-generate test stubs for new modules
└── launch.py             Cross-platform dev launcher (all 3 services) — use on macOS, Linux, Windows
```

---

## Development Commands

```bash
# First-time setup after cloning
python3 launch.py setup             # create venvs, install all deps, prepare .env files

# Start / stop / status / restart all services
python3 launch.py                   # start (default)
python3 launch.py start             # start all services
python3 launch.py stop              # stop all services
python3 launch.py status            # check service status
python3 launch.py restart           # stop then start
python3 launch.py clean             # wipe venv / node_modules / build artefacts

python3 launch.py start --no-browser        # skip auto-opening browser
python3 launch.py start --browser safari    # open in Safari
python3 launch.py start --no-color          # plain output (CI / logs)

# Run tests
./scripts/test.sh              # backend + frontend
./scripts/test.sh --backend    # pytest only
./scripts/test.sh --frontend   # vitest only
./scripts/test.sh --coverage   # with HTML coverage report

# Backend tests (inside orchestrator venv)
cd apps/orchestrator
.venv/bin/python3 -m pytest tests/ -v

# Frontend tests
cd apps/desktop
npm test

# Type-check frontend
cd apps/desktop && npx tsc --noEmit

# Python syntax check
find apps/orchestrator/app -name '*.py' -exec python3 -m py_compile {} \;
find apps/mcp-gateway/src -name '*.py' -exec python3 -m py_compile {} \;
```

### Manual start (three terminals — alternative to launch.py)

```bash
# Terminal 1 — MCP Gateway (start first)
cd apps/mcp-gateway && source .venv/bin/activate
uvicorn src.main:app --reload --port 8788

# Terminal 2 — Orchestrator
cd apps/orchestrator && source .venv/bin/activate
uvicorn app.main:app --reload --port 8787

# Terminal 3 — Desktop UI
cd apps/desktop && npm run dev
```

---

## Agents & Tools

### Local agents (run inside orchestrator process)

| ID | Class | Boot check | Notes |
|---|---|---|---|
| `websearch` | `websearch.py` | No | DuckDuckGo, always online |
| `calculator` | `calculator.py` | No | Safe AST evaluator, always online |
| `memory` | `memory.py` | No | Persistent key-value, always online |
| `briefing` | `briefing.py` | No | Parallel gateway summary, always online |
| `general` | `general_ai.py` | No | LLM fallback, always online |

### Gateway tools (served by MCP Gateway — credentials live in `apps/mcp-gateway/.env`)

| Frontend ID | Namespace | Tool file | Credential keys |
|---|---|---|---|
| `smarthome` | `smarthome` | `smarthome.py` | `myhome_mcp_endpoint`, `myhome_mcp_token` |
| `whatsapp` | `whatsapp` | `whatsapp.py` | `whatsapp_phone_number_id`, `whatsapp_access_token`, `whatsapp_app_secret` |
| `weather` | `weather` | `weather.py` | `weather_api_key` (optional), `weather_default_city` |
| `stock` | `stocks` | `stocks.py` | `stock_default_market` |
| `news` | `news` | `news.py` | `news_api_key`, `news_default_country` |
| `system` | `system` | `system.py` | none (psutil) |
| `github` | `github` | `github.py` | `github_token` |
| `calendar` | `google` | `google.py` | `google_access_token`, `google_refresh_token` |
| `email` | `google` | `google.py` | `google_access_token`, `google_refresh_token` |
| `portfolio` | `indmoney` | `portfolio.py` | `indmoney_token` |

---

## Key Files to Know

| File | Purpose |
|---|---|
| `apps/orchestrator/app/services/session.py` | Boot sequence, phrase pools, gateway/snippet maps, AGENT_LABELS |
| `apps/orchestrator/app/services/orchestrator.py` | LLM tool-calling loop (OpenAI / Anthropic / Gemini / Ollama) |
| `apps/orchestrator/app/services/agent_manager.py` | Session state, LLM config merge, local agent dispatch |
| `apps/orchestrator/app/services/gateway_client.py` | HTTP client for MCP Gateway — `list_tools()`, `call_tool()` |
| `apps/orchestrator/app/api/ws.py` | WebSocket handler — `start_session`, `voice_input`, `stop_session` |
| `apps/mcp-gateway/src/main.py` | FastAPI gateway app — registers tools, auth middleware, webhook routes |
| `apps/mcp-gateway/src/tools/base.py` | `BaseTool` ABC — `namespace`, `list_tools()`, `call_tool()`, `startup()`, `shutdown()` |
| `apps/mcp-gateway/src/config/settings.py` | `GatewaySettings` — all integration credentials, read from gateway `.env` |
| `apps/desktop/src/hooks/useOrchestratorRuntime.ts` | WebSocket runtime, AGENT_CATALOGUE, boot event handling |
| `apps/desktop/src/hooks/useAgentConfig.ts` | Per-agent credential state (frontend) |

---

## Adding a New Gateway Tool (3 steps)

1. Create `apps/mcp-gateway/src/tools/<name>.py` implementing `BaseTool` (`namespace`, `list_tools()`, `call_tool()`, `startup()`, `shutdown()`). Read credentials from `settings` (injected via `GatewaySettings`).
2. Add credential fields to `apps/mcp-gateway/src/config/settings.py` and `apps/mcp-gateway/.env.sample`.
3. Register the tool instance in `apps/mcp-gateway/src/main.py` → `_register_tools()`.

No orchestrator changes are needed — the gateway reads its own `.env` and credentials never flow through the orchestrator.

See `docs/mcp-gateway.md` for the full guide with a minimal example.

## Adding a New Local Agent (8 steps)

Follow the 8-step checklist in `docs/development.md` → "Case B — New local agent":
backend class → registry → keyword routing → `AGENT_LABELS` + `AGENT_BOOT_QUERY` → TTS voice → frontend catalogue → browser voice default → settings accordion.

---

## Code Conventions

- Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`
- Branch names: `feat/<slug>`, `fix/<slug>`, `chore/<slug>` — all PRs target `main`
- Python: no comments unless the WHY is non-obvious; no multi-line docstrings
- TypeScript: strict mode; `moduleResolution: "Bundler"`
- No abstractions or features beyond what the task requires

---

---

## Agent and Skill Dispatch

You are the orchestrator. Route every task through the correct agent and skill before acting.
Never write code or make architectural decisions directly — always follow the pipeline below.

### Agent Pipeline

```
New feature / module / component
  → architect → developer → tester

Bug fix
  → tester (diagnose) → developer (fix) → tester (verify)

Complex bug or unclear root cause
  → architect (analyse) → developer (fix) → tester (verify)

Refactor / restructure
  → architect (plan) → developer (execute) → tester (verify)

Tests only (no code change)
  → tester
```

**architect** — invoke first whenever the task requires a plan before any code is written:
- User asks for a new feature, new API, new module, new service
- User asks "how should I...", "what's the best approach...", "design a..."
- Task touches multiple files or has unclear scope
- Output: always an `IMPLEMENTATION_PLAN.md` or inline plan for the developer

**developer** — invoke only after the architect has produced a plan:
- Implement the plan exactly — no improvising structure
- Write, edit, and create files
- Never runs tests or executes the app

**tester** — invoke after every developer handoff, and directly for test-only tasks:
- Run the test suite
- Analyse failure logs and fix inline
- Verify the implementation matches the plan
- Report a pass/fail checklist to the user

### Skill Dispatch

Invoke the relevant skill **before** writing any code for that concern.

| Trigger | Skill to invoke |
|---|---|
| Any UI work — page, component, layout, dashboard, app screen | `ui-ux-pro-max` then `magic` MCP |
| Implementing shadcn/ui components or Tailwind styling | `ui-styling` |
| Creating or updating design tokens, component specs | `design-system` |
| Logo, icon, banner, CIP mockup, social image, presentation | `design` |
| Brand voice, messaging, style guide, visual identity | `brand` |
| Social media banner, ad creative, web hero image | `banner-design` |
| HTML slide deck or presentation | `slides` |

Skill invocation is non-negotiable for UI work — do not generate UI code without first reading the `ui-ux-pro-max` skill output for style, palette, and typography decisions.

---
## Security & Secrets

- Never hardcode or commit credentials, tokens, API keys, or secrets
- All secrets live in `.env` (git-ignored); use `.env.sample` as the placeholder template
- INDmoney MCP endpoint is hardcoded (`https://mcp.indmoney.com/mcp`) — no user-controlled URL for MCP connections (SSRF prevention)
- Credentials are held in memory only for the duration of an active session; never stored server-side
- WebSocket origin enforced against an allowlist; rate-limited to 30 msg/60 s per connection
- Never commit or push on behalf of the user

---

## AI Assistance Notes

- Read `docs/architecture.md` before answering any architecture or boot-sequence question
- Read `docs/mcp-gateway.md` before touching gateway tools or tool namespacing
- Read `docs/development.md` → "Adding a New Service" before adding any agent or gateway tool
- Prefer editing existing files over creating new ones
- Do not add abstractions, error handling, or features beyond what the task requires
- Do not explain WHAT code does in comments — only WHY when non-obvious
- Gateway tool errors propagate via `RuntimeError(detail)` from `gateway_client.call_tool()` — preserve the detail string so the LLM can give the user a meaningful message
