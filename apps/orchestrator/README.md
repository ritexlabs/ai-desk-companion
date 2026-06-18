# Orchestrator

Python FastAPI sidecar/orchestrator for Robo Wake-Up.

## Responsibilities
- session lifecycle
- intent routing
- agent management
- future wakeword / STT / TTS provider wiring
- provider auth scaffolding
- MCP-friendly expansion path

## Run
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8787
```
