# Robo Wake-Up — Personal AI Voice Assistant

A desktop-first AI voice assistant that listens for the wake phrase **"Robo Wake-Up"**, routes your spoken commands to specialized agents, and responds with natural text-to-speech — all inside a futuristic real-time dashboard UI.

---

## What it does

- Wakes on voice command ("Robo Wake-Up") or a button press, with a personalised greeting
- Routes intents to 8 built-in agents: Weather, System, Google Calendar, Gmail, GitHub, Stock Market, News, General AI
- LLM-powered intent routing — when an LLM is configured, natural language decides which agent answers (no keyword lists)
- Says a contextual goodbye ("Goodnight! Rest well.", "Goodbye! Have a wonderful day.") before entering sleep mode
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

No API keys are required to run the app in browser-TTS / browser-STT mode.

---

## Quick Start

Clone the repo and run one command — it installs all dependencies on first run:

```bash
git clone <repo-url>
cd personal-ai-agent

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

## Project Structure

```
personal-ai-agent/
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

- [Architecture overview](docs/architecture.md) — system design, WebSocket protocol, agent pipeline
- [API contracts](docs/api-contracts.md) — full WebSocket message schema reference
- [Setup guide](docs/setup.md) — detailed installation, VS Code setup, phase checklist
