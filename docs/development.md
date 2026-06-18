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

## Running Tests

### TypeScript type-check
```bash
cd apps/desktop
npx tsc --noEmit
```

### Python syntax check
```bash
python3 -m py_compile apps/orchestrator/app/api/ws.py
python3 -m py_compile apps/orchestrator/app/services/orchestrator.py
# or check the entire package:
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
│   │   │   ├── components/       UI components (RobotAvatar, AgentBootList, …)
│   │   │   ├── hooks/            React hooks (useOrchestratorRuntime, useVoice, …)
│   │   │   ├── types/            Shared TypeScript types (runtime.ts)
│   │   │   └── App.tsx           Root component
│   │   ├── src-tauri/            Tauri native wrapper (Rust)
│   │   └── package.json
│   └── orchestrator/
│       ├── app/
│       │   ├── agents/           Individual agent implementations
│       │   ├── api/              FastAPI routes and WebSocket endpoint (ws.py)
│       │   ├── core/             Config and settings (reads .env)
│       │   ├── models/           Pydantic contracts
│       │   └── services/         LLM, TTS, STT, routing, metrics
│       ├── .env.sample           Template — copy to .env and fill in keys
│       └── requirements.txt
├── docs/                         All documentation
├── packages/
│   └── shared-types/             Shared TypeScript/Python contracts (reserved)
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
