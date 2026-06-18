# Voice Providers (TTS / STT)

Robo Wake-Up supports three TTS (text-to-speech) providers and two STT (speech-to-text) providers. You can mix and match them independently.

---

## Provider overview

| Direction | Provider | Cost | Quality | Setup required |
|-----------|----------|------|---------|---------------|
| TTS | Browser (default) | Free | OS-dependent | None |
| TTS | OpenAI | Paid | High | API key |
| TTS | ElevenLabs | Paid | Very high | API key |
| STT | Browser (default) | Free | Good (Chrome/Safari) | None |
| STT | OpenAI Whisper | Paid | Very high | API key |

---

## Option 1 — Browser (default, no setup)

The app uses the browser's built-in Web Speech APIs out of the box. No API key needed.

- **TTS:** Web Speech Synthesis — quality varies by OS and browser
- **STT:** Web Speech Recognition — works best in Chrome and Safari

No configuration needed. This is the default when `TTS_PROVIDER` and `STT_PROVIDER` are both `browser` (or unset).

---

## Option 2 — Configure via Settings UI (recommended for API providers)

Use the Settings panel in the app to configure providers per-session. Changes take effect immediately and override the `.env` file.

**Steps:**
1. Click the gear icon **⚙** in the top-right corner of the dashboard
2. Go to the **Providers** tab
3. Select your TTS provider from the dropdown
4. Select your STT provider from the dropdown
5. Enter the required API key(s)
6. Choose voice/model options (if applicable)
7. Click **Test TTS Provider** to play a sample and verify the key works
8. Click **Save** — settings are stored in browser `localStorage` under `robo-voice-providers`

> Keys are stored in the browser only — they are never written to any file or sent to git.

---

## Option 3 — Configure via `.env` (server-level default)

Set server-side defaults that apply to all sessions when the UI has not overridden them.

```bash
cp apps/orchestrator/.env.example apps/orchestrator/.env
```

Edit `apps/orchestrator/.env`:

```dotenv
TTS_PROVIDER=openai          # browser | openai | elevenlabs
STT_PROVIDER=openai          # browser | openai
OPENAI_API_KEY=sk-...
```

Restart the orchestrator after changing `.env`.

---

## OpenAI TTS setup

**Get an API key:**
1. Go to platform.openai.com/api-keys
2. Click **Create new secret key**
3. Copy the key (starts with `sk-`)

**Voice options** (set `OPENAI_TTS_VOICE` in `.env` or in the UI):

| Voice | Character |
|-------|-----------|
| `nova` | Warm, female (default) |
| `alloy` | Neutral |
| `echo` | Male |
| `fable` | British male |
| `onyx` | Deep male |
| `shimmer` | Soft female |

**Model options** (set `OPENAI_TTS_MODEL`):

| Model | Speed | Quality |
|-------|-------|---------|
| `tts-1` | Faster, lower latency (default) | Good |
| `tts-1-hd` | Slower | Higher quality |

---

## OpenAI Whisper STT setup

Uses the same `OPENAI_API_KEY` as TTS. Set `STT_PROVIDER=openai`.

Accepted audio formats: webm, mp4, ogg, wav, mp3. The browser sends `webm` by default.

---

## ElevenLabs TTS setup

**Get an API key:**
1. Go to elevenlabs.io and create a free account
2. Go to **Profile → API Keys** and copy your key

**Configure in `.env`:**
```dotenv
TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=your-api-key-here
ELEVENLABS_VOICE_ID=Rachel    # or any voice name / ID from your account
```

To find your voice IDs, go to the ElevenLabs voice library and click any voice — the ID appears in the URL.

---

## Configuration precedence

```
UI Settings panel  (per-session, overrides everything)
       ↓
.env file          (server default)
       ↓
browser fallback   (always available if neither is set)
```

---

## Troubleshooting

**No audio plays after TTS**  
The browser blocks autoplay until the user interacts with the page. Click anywhere on the dashboard first, then trigger a command.

**"Test TTS Provider" returns an error**  
Check that your API key is correct and has not expired. The test call goes directly from the browser to the provider API.

**Browser STT stops recognising after a few seconds**  
This is normal browser behaviour — it pauses recognition after silence. The app restarts it automatically.

**OpenAI STT returns empty transcripts**  
Make sure you are using Chrome or a Chromium-based browser. Firefox does not support the `MediaRecorder` API formats that Whisper expects.
