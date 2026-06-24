# AI Desk Companion

A desktop-first AI voice assistant with always-on wake-word detection, Alexa-style continuous conversation, and 9 real-data agents — all inside a futuristic real-time dashboard UI.

---

## What it does

- Wakes on voice command ("Hey Robo" / "Robo, Wake-Up") or the Wake Up button, with a personalised greeting
- Listens for the next command automatically after each response — no button press needed (Alexa-style)
- Understands inline commands: say "Hey Robo, what's the weather?" in one breath, it wakes and answers immediately
- Routes intents to 9 built-in agents: Weather, System, Google Calendar, Gmail, GitHub, Stock Market, News, Smart Home, General AI
- LLM-powered orchestration — the model decides which agents to call, fetches live data, and synthesises a spoken response
- Responds in the same language the user spoke — no language switching
- Speaks with distinct voice modulations per agent (different pitch and pace for each agent)
- Handles farewells naturally ("Robo, Good Night", "bye bye") and enters standby mode
- Speaks responses via browser TTS (default) or OpenAI / ElevenLabs TTS (optional)
- Transcribes voice via browser STT (default) or OpenAI Whisper (optional)
- Runs as a browser app **or** as a native desktop app via Tauri

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.10 – 3.13 | 3.13 recommended; 3.14 not yet supported |
| Node.js | 20+ | |
| npm | any recent | pnpm also supported |
| Docker | 20+ | Required for Smart Home agent (voska/hass-mcp) |

No API keys are required to run the app in browser-TTS / browser-STT mode.

---

## Quick Start

```bash
git clone https://github.com/ritexlabs/ai-desk-companion.git
cd ai-desk-companion

# macOS / Linux
python3 start.py

# Windows
python start.py
```

Then open **http://localhost:5173** in your browser (the launcher opens it automatically).

Press **Ctrl+C** to stop both services.

> **Flags:**
> ```bash
> python3 start.py --no-browser   # skip auto-opening the browser
> python3 start.py --no-color     # plain output (useful for CI / logs)
> python3 start.py --clean        # remove venv / node_modules / build artifacts
> ```

---

## How voice interaction works

### Starting a session

| Method | How |
|--------|-----|
| Wake Up button | Click the cyan **Wake Up** button in the dashboard |
| Voice (standby) | Say **"Hey Robo"** or **"Robo, Wake-Up"** — the mic listens in standby |
| Inline command | Say **"Hey Robo, what's the weather?"** — wakes and executes in one phrase |

### Giving commands

Once the session is active, the app auto-listens after every response. Just speak naturally:
- "What is the Nifty 50 price?"
- **"Robo, check my emails"** — the "Robo," prefix is stripped automatically

### Ending a session

Say any farewell phrase and the app speaks a goodbye and returns to standby:
- "Robo, Good Bye"
- "Robo, Good Night"
- "Robo, See You"
- "bye bye"
- Or press the **Sleep** button for an immediate, silent shutdown

---

## Project Structure

```
ai-desk-companion/
├── apps/
│   ├── desktop/          React + Vite frontend (port 5173)
│   └── orchestrator/     Python FastAPI backend (port 8787)
├── docs/                 Configuration guides and API reference
├── packages/
│   └── shared-types/     Shared TypeScript/Python contracts (reserved)
├── start.py              Cross-platform dev launcher
├── start.sh              macOS/Linux wrapper
└── start.bat             Windows wrapper
```

---

## Configuration

The app works out of the box with no configuration. Add API keys to unlock real integrations:

| What to configure | Guide |
|-------------------|-------|
| Environment variables (.env) | [docs/configuration.md](docs/configuration.md) |
| Voice providers (TTS / STT) | [docs/voice-providers.md](docs/voice-providers.md) |
| LLM provider (AI responses) | [docs/llm-setup.md](docs/llm-setup.md) |
| Agent API keys (Weather, GitHub, Google, Stock, News) | [docs/agents.md](docs/agents.md) |
| Smart Home agent (Home Assistant) | [docs/agents.md](docs/agents.md) |
| Server-side wake word detection | [docs/wake-word.md](docs/wake-word.md) |
| Native desktop app (Tauri) | [docs/tauri-desktop.md](docs/tauri-desktop.md) |

---

## Manual Start (two terminals)

If you prefer to run services independently:

**Terminal 1 — Orchestrator**
```bash
cd apps/orchestrator
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8787
```

**Terminal 2 — Desktop UI**
```bash
cd apps/desktop
npm install
npm run dev
```

---

## Reference Docs

- [Architecture overview](docs/architecture.md) — system design, WebSocket protocol, agent pipeline, voice interaction model
- [API contracts](docs/api-contracts.md) — full WebSocket message schema reference
- [Development guide](docs/development.md) — local setup, commands, branching strategy
- [Setup guide](docs/setup.md) — detailed installation and phase checklist
