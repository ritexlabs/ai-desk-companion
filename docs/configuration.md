# Configuration Reference

## In-app settings guides

Configure most things through the UI — no `.env` edits needed for day-to-day use:

| Tab | What it controls | Guide |
|-----|-----------------|-------|
| **Profile** | Wake-up word, calling name | [profile.md](configuration/profile.md) |
| **Voice** | Browser voice gender, speed, voice name | [voice.md](configuration/voice.md) |
| **AI** | LLM provider, model, API key | [ai.md](configuration/ai.md) |
| **Providers** | STT/TTS provider, OpenAI/ElevenLabs keys | [providers.md](configuration/providers.md) |

---

## Server configuration (`.env`)

All runtime configuration for the orchestrator lives in `apps/orchestrator/.env`.

---

## Setup

```bash
# Copy the template (only needed once)
cp apps/orchestrator/.env.example apps/orchestrator/.env
```

Then edit `apps/orchestrator/.env` with your values. The file is listed in `.gitignore` — it is never committed.

---

## Full variable reference

### App settings

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_NAME` | `Robo Wake-Up Orchestrator` | Display name (used in logs) |
| `ENV` | `development` | `development` or `production` |
| `LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING` / `ERROR` |

### Voice providers

| Variable | Default | Options | Description |
|----------|---------|---------|-------------|
| `TTS_PROVIDER` | `browser` | `browser` `openai` `elevenlabs` | Text-to-speech engine |
| `STT_PROVIDER` | `browser` | `browser` `openai` | Speech-to-text engine |

`browser` uses the Web Speech APIs — no key required, quality varies by OS.  
See [configuration/providers.md](configuration/providers.md) for full provider setup.

### OpenAI

Required when `TTS_PROVIDER=openai` **or** `STT_PROVIDER=openai`.

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | _(empty)_ | Your OpenAI API key (`sk-...`) |
| `OPENAI_TTS_VOICE` | `nova` | `alloy` `echo` `fable` `onyx` `nova` `shimmer` |
| `OPENAI_TTS_MODEL` | `tts-1` | `tts-1` (faster) or `tts-1-hd` (higher quality) |

### ElevenLabs

Required when `TTS_PROVIDER=elevenlabs`.

| Variable | Default | Description |
|----------|---------|-------------|
| `ELEVENLABS_API_KEY` | _(empty)_ | Your ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | `Rachel` | Voice ID or name from your ElevenLabs account |

### LLM (General AI responses + intent routing)

Used when the UI does not send `llm_config` in the `start_session` command.

| Variable | Default | Options | Description |
|----------|---------|---------|-------------|
| `LLM_PROVIDER` | `openai` | `openai` `anthropic` `gemini` `ollama` | LLM provider |
| `LLM_MODEL` | _(empty)_ | provider-specific | Leave blank to use the provider default |
| `LLM_BASE_URL` | _(empty)_ | URL | Required for Ollama (e.g. `http://localhost:11434`) |

API keys for LLM providers are passed from the UI settings panel (not from `.env`).  
The LLM is used for two purposes: answering General AI queries, and classifying which agent should handle each command (intent routing). See [configuration/ai.md](configuration/ai.md) for details.

### Weather agent fallback

| Variable | Default | Description |
|----------|---------|-------------|
| `WEATHER_API_KEY` | _(empty)_ | OpenWeatherMap or WeatherAPI key |
| `WEATHER_PROVIDER` | `openweathermap` | `openweathermap` or `weatherapi` |
| `WEATHER_DEFAULT_CITY` | `Bengaluru` | Default city when no location is given |

### GitHub agent fallback

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_TOKEN` | _(empty)_ | GitHub Personal Access Token (`ghp_...`) |

### Stock Market agent

| Variable | Default | Description |
|----------|---------|-------------|
| `STOCK_DEFAULT_MARKET` | `IN` | `IN` (NSE/BSE) or `US` (NYSE/NASDAQ) — controls ticker suffix and boot indices |

No API key required — uses Yahoo Finance (`yfinance`), which is free.

### News agent

| Variable | Default | Description |
|----------|---------|-------------|
| `NEWS_API_KEY` | _(empty)_ | NewsAPI.org API key |
| `NEWS_DEFAULT_COUNTRY` | `in` | ISO 3166-1 alpha-2 country code (`in`, `us`, `gb`, `au`, `ca`, `de`, `fr`, `jp`…) |

Free NewsAPI developer plan: 100 requests/day, works from localhost.

### Google agents fallback (Calendar + Gmail)

Google access tokens are short-lived. These `.env` values are useful only for local testing or server-side automation. For normal use, configure Google credentials through the Settings panel in the UI.

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_ACCESS_TOKEN` | _(empty)_ | OAuth2 access token (`ya29...`) |
| `GOOGLE_REFRESH_TOKEN` | _(empty)_ | OAuth2 refresh token |
| `GOOGLE_CLIENT_ID` | _(empty)_ | OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | _(empty)_ | OAuth2 client secret |

### Smart Home agent (Home Assistant)

The Smart Home agent uses the `voska/hass-mcp` Docker container to communicate with Home Assistant. Docker must be running when this agent is enabled.

| Variable | Default | Description |
|----------|---------|-------------|
| `MYHOME_MCP_ENDPOINT` | `http://homeassistant.local:8123` | Home Assistant base URL (no trailing slash) |
| `MYHOME_MCP_TOKEN` | _(empty)_ | Long-lived access token from HA Profile → Long-lived access tokens |

> For normal use, configure these through the Settings UI — the `.env` values serve as server-level defaults only.

### Wake word detection

| Variable | Default | Description |
|----------|---------|-------------|
| `WAKE_WORD_ENABLED` | `false` | Set to `true` to enable server-side wake word |
| `WAKE_WORD_MODEL` | `hey_jarvis` | `hey_jarvis` `alexa` `hey_mycroft` `hey_rhasspy` |
| `WAKE_WORD_SENSITIVITY` | `0.5` | `0.1` (loose / more false positives) to `0.9` (strict) |

See [wake-word.md](wake-word.md) for installation prerequisites.

---

## Example `.env` for a fully-configured setup

```dotenv
# App
APP_NAME=Robo Wake-Up Orchestrator
ENV=development
LOG_LEVEL=INFO

# Voice
TTS_PROVIDER=openai
STT_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_TTS_VOICE=nova
OPENAI_TTS_MODEL=tts-1

# Weather agent
WEATHER_API_KEY=your-openweathermap-key
WEATHER_PROVIDER=openweathermap
WEATHER_DEFAULT_CITY=San Francisco

# GitHub agent
GITHUB_TOKEN=ghp_...

# Stock agent
STOCK_DEFAULT_MARKET=IN

# News agent
NEWS_API_KEY=your-newsapi-key
NEWS_DEFAULT_COUNTRY=in

# Smart Home agent
MYHOME_MCP_ENDPOINT=http://homeassistant.local:8123
# MYHOME_MCP_TOKEN=eyJ...  # set this in .env, never commit the real token

# Wake word
WAKE_WORD_ENABLED=false
```

---

## Configuration precedence

Settings UI (per-session) **>** `.env` file (server default) **>** built-in defaults

When the UI sends provider or credential values in the `start_session` WebSocket command, those values take effect for that session and override anything in `.env`. This means you can keep `.env` minimal (or empty) and configure everything from the UI.
