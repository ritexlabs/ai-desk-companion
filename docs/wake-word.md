# Wake Word Detection

Robo Wake-Up supports two wake word modes:

| Mode | How it works | Setup required |
|------|-------------|----------------|
| **Browser** (default) | Browser's Web Speech Recognition listens for "Robo Wake-Up" | None |
| **Server-side** | Always-on microphone via `openWakeWord` running in the orchestrator | Extra packages + portaudio |

---

## Browser wake word (default)

No setup required. The browser listens continuously for the phrase "Robo Wake-Up" using the Web Speech Recognition API.

**Limitations:**
- Requires a tab to be open and focused
- Works best in Chrome and Safari
- Pauses occasionally (browser limitation) — the app restarts it automatically

This mode is active by default. When the orchestrator reports `wake_word_enabled: false` (or is unreachable), the browser mode is used automatically.

---

## Server-side wake word (openWakeWord)

Always-on detection that runs in the background via the Python orchestrator. The browser does not need to be focused.

When `WAKE_WORD_ENABLED=true`, the orchestrator broadcasts a `wake_word_detected` WebSocket event to all connected clients, which triggers the UI boot sequence. The browser's continuous-listening is disabled automatically.

---

## Step 1 — Install system audio dependency

**macOS**
```bash
brew install portaudio
```

**Linux (Debian/Ubuntu)**
```bash
sudo apt install portaudio19-dev
```

**Windows**  
Download and install PortAudio from portaudio.com, or install it via pip (some packages bundle it):
```cmd
pip install pyaudio
```

---

## Step 2 — Install Python packages

Activate the orchestrator virtualenv first:

```bash
cd apps/orchestrator
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install sounddevice openwakeword numpy
```

> These packages are intentionally excluded from `requirements.txt` because they require system-level audio libraries. Install them only when you want server-side wake word.

---

## Step 3 — Enable in `.env`

Edit `apps/orchestrator/.env`:

```dotenv
WAKE_WORD_ENABLED=true
WAKE_WORD_MODEL=hey_jarvis
WAKE_WORD_SENSITIVITY=0.5
```

---

## Step 4 — Restart the orchestrator

```bash
# If using the launcher, Ctrl+C and re-run:
python3 start.py

# If running manually:
cd apps/orchestrator
source .venv/bin/activate
uvicorn app.main:app --reload --port 8787
```

The orchestrator logs will show:
```
[wake_word] Listening for 'hey_jarvis' (sensitivity=0.5) ...
```

---

## Available wake word models

| Model ID | Wake phrase | Notes |
|----------|-------------|-------|
| `hey_jarvis` | "Hey Jarvis" | Default, reliable |
| `alexa` | "Alexa" | Amazon's wake word |
| `hey_mycroft` | "Hey Mycroft" | Open-source assistant |
| `hey_rhasspy` | "Hey Rhasspy" | Privacy-focused |

Models are downloaded automatically on first use from the `openWakeWord` model hub.

---

## Sensitivity tuning

`WAKE_WORD_SENSITIVITY` controls the detection threshold:

| Value | Behaviour |
|-------|-----------|
| `0.1` – `0.3` | Loose — triggers easily, more false positives |
| `0.5` | Default — balanced |
| `0.7` – `0.9` | Strict — requires clear pronunciation, fewer false positives |

Start at `0.5` and adjust based on your environment and microphone.

---

## Troubleshooting

**"No module named 'sounddevice'"**  
You haven't installed the optional packages. Run:
```bash
pip install sounddevice openwakeword numpy
```

**"OSError: PortAudio not found"**  
Install PortAudio for your OS (see Step 1 above).

**Wake word never triggers**  
- Check that your microphone is connected and set as the default input device
- Lower `WAKE_WORD_SENSITIVITY` (try `0.3`)
- Say the phrase clearly and at normal speaking volume

**Too many false positives**  
Raise `WAKE_WORD_SENSITIVITY` (try `0.7` or higher).

**Wake word works but UI doesn't respond**  
Check that the browser is open and connected to the orchestrator (WS badge should be green).
