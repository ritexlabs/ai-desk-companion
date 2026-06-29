# Setup Guide

Step-by-step instructions for getting Robo Wake-Up running on your machine after `git clone`.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.10 – 3.13 | 3.13 recommended; 3.14 not yet supported (pydantic-core) |
| Node.js | 20+ | |
| npm | any recent | pnpm also works |

Check your versions:
```bash
python3 --version
node --version
npm --version
```

---

## Option A — Single-command launcher (recommended)

The `start.py` launcher does everything on first run: creates the Python virtualenv, installs all Python and Node dependencies, starts both services in parallel, and opens the browser.

**macOS / Linux**
```bash
python3 start.py
```

**Windows**
```cmd
python start.py
```

**Launcher flags**
```bash
python3 start.py --no-browser   # skip auto-opening the browser
python3 start.py --no-color     # plain terminal output (CI-friendly)
python3 start.py --clean        # wipe venv / node_modules / build artifacts, then exit
```

The launcher prefixes each output line with `[ORCH]` (orchestrator) or `[ UI ]` (desktop).  
Press **Ctrl+C** to stop both services cleanly.

---

## Option B — Manual start (three terminals)

Use this when you want to restart one service independently, attach a debugger, or see raw logs.  
Start services in this order: Gateway → Orchestrator → Desktop.

**Terminal 1 — MCP Gateway (Python FastAPI, port 8788)**
```bash
cd apps/mcp-gateway

# First time only
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Every time
source .venv/bin/activate
uvicorn app.main:app --reload --port 8788
```

**Terminal 2 — Orchestrator (Python FastAPI, port 8787)**
```bash
cd apps/orchestrator

# First time only
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Every time
source .venv/bin/activate
uvicorn app.main:app --reload --port 8787
```

**Terminal 3 — Desktop UI (React + Vite, port 5173)**
```bash
cd apps/desktop

# First time only
npm install

# Every time
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## First-run checklist

After both services are running, verify each step in the browser:

- [ ] **UI loads** at http://localhost:5173 — robot avatar and dashboard visible
- [ ] **WS badge** in the header shows green (connected to orchestrator)
- [ ] **Say or type "Robo"** — boot sequence starts, agents initialise
- [ ] **Say a command** — e.g. "What is the weather today?" — you get a response

If the WS badge is red, the orchestrator is not running. Check Terminal 1 for errors.

---

## VS Code setup

Recommended extensions:
- **Python** (`ms-python.python`) + **Pylance** (`ms-python.vscode-pylance`)
- **ESLint** + **Prettier** (`esbenp.prettier-vscode`)
- **Tailwind CSS IntelliSense** (`bradlc.vscode-tailwindcss`)

Recommended workspace settings (`.vscode/settings.json`):
```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/apps/orchestrator/.venv/bin/python",
  "editor.formatOnSave": true,
  "[python]": { "editor.defaultFormatter": "ms-python.black-formatter" },
  "[typescript]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
  "[typescriptreact]": { "editor.defaultFormatter": "esbenp.prettier-vscode" }
}
```

---

## Next steps

Once the app is running with the default browser voice, configure real integrations:

| Step | Guide |
|------|-------|
| Add OpenAI / ElevenLabs voice | [configuration/providers.md](configuration/providers.md) |
| Add an LLM for AI responses | [configuration/ai.md](configuration/ai.md) |
| Connect Weather / GitHub / Google | [agents.md](agents.md) |
| Enable server-side wake word | [wake-word.md](wake-word.md) |
| Build native desktop app | [tauri-desktop.md](tauri-desktop.md) |

---

## Troubleshooting

**"python3: command not found"**  
Install Python 3.10+ from python.org. On Windows use `python` instead of `python3`.

**"node: command not found"**  
Install Node.js 20+ from nodejs.org.

**Port 8788, 8787, or 5173 already in use**  
Find and kill the existing process:
```bash
# macOS / Linux
lsof -ti:8788 | xargs kill
lsof -ti:8787 | xargs kill
lsof -ti:5173 | xargs kill
```

**`pip install` fails on `pydantic-core`**  
You are likely on Python 3.14 which is not yet supported. Use Python 3.13.

**Orchestrator crashes on startup**  
Check that `.env` exists in `apps/orchestrator/`. If not:
```bash
cp apps/orchestrator/.env.example apps/orchestrator/.env
```

---

## Implementation phases (reference)

### Phase 1 — Simulated UX
- Futuristic 3-column React dashboard
- Mock boot sequence, wake detection, intent routing
- All agent stubs + system health panel
- Settings panel: Profile / Voice / AI / Agents

### Phase 2 — Real local orchestrator
- Python FastAPI WebSocket orchestrator at `:8787`
- Boot sequence via WS events, auto-reconnect, WS badge in header
- `start.py` cross-platform launcher

### Phase 3 — Real voice stack
- OpenAI TTS and Whisper STT integration
- Per-session provider selection from UI (overrides `.env`)
- Browser TTS/STT fallback

### Phase 4 — Real integrations
- General AI via OpenAI / Anthropic / Gemini / Ollama
- Weather, GitHub, Google Calendar, Gmail agents with real API calls

### Phase 5 — Hardening
- Server-side always-on wake word (`openWakeWord`)
- Real-time performance metrics broadcast every 5 s
- Tauri v2 native desktop wrapper with system tray
- Encrypted credential store (`@tauri-apps/plugin-store`)
