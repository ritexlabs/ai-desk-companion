# WebSocket API Contracts

All UI ↔ orchestrator communication happens over a single persistent WebSocket at:

```
ws://localhost:8787/ws
```

---

## Connection lifecycle

1. UI opens the WebSocket connection
2. Orchestrator sends a `connected` event with server capability info
3. UI sends `start_session` to begin the wake + boot sequence
4. All subsequent commands and events flow bidirectionally over the same connection
5. On disconnect, the UI retries with exponential backoff

---

## Commands (UI → Orchestrator)

All commands use this envelope:
```json
{
  "command": "<command_name>",
  "payload": { ... }
}
```

---

### `start_session`

Begins the wake/boot sequence. Passes session-level configuration for all providers.

```json
{
  "command": "start_session",
  "payload": {
    "calling_name": "Robo",
    "registered_agents": ["weather", "system", "calendar", "email", "github", "general"],
    "voice_config": {
      "tts_provider": "openai",
      "stt_provider": "openai",
      "openai_api_key": "sk-...",
      "openai_tts_voice": "nova",
      "openai_tts_model": "tts-1",
      "elevenlabs_api_key": "",
      "elevenlabs_voice_id": "Rachel"
    },
    "llm_config": {
      "provider": "openai",
      "api_key": "sk-...",
      "model": "gpt-4o",
      "base_url": ""
    },
    "agent_config": {
      "weather": {
        "provider": "openweathermap",
        "api_key": "...",
        "default_city": "San Francisco"
      },
      "github": {
        "personal_access_token": "ghp_..."
      },
      "google": {
        "access_token": "ya29...",
        "refresh_token": "...",
        "client_id": "...",
        "client_secret": "..."
      },
      "smarthome": {
        "endpoint": "http://homeassistant.local:8123",
        "token": "eyJ..."
      }
    }
  }
}
```

All payload fields are optional — omitted values fall back to `.env` defaults.

---

### `stop_session`

Puts the assistant into sleep mode.

```json
{
  "command": "stop_session"
}
```

---

### `send_text_command`

Sends a text command to be processed by the intent router.

```json
{
  "command": "send_text_command",
  "payload": {
    "text": "What is the weather in Tokyo?"
  }
}
```

---

### `audio_chunk`

Streams a chunk of microphone audio to the orchestrator for server-side STT (Whisper). Used when `STT_PROVIDER=openai`.

```json
{
  "command": "audio_chunk",
  "payload": {
    "data_b64": "<base64-encoded audio bytes>",
    "format": "webm",
    "is_final": false
  }
}
```

Set `is_final: true` on the last chunk to signal end of utterance and trigger transcription.

---

### `retry_agent`

Retries a previously failed agent.

```json
{
  "command": "retry_agent",
  "payload": {
    "agent": "weather"
  }
}
```

---

## Events (Orchestrator → UI)

All events use this envelope:
```json
{
  "event": "<event_name>",
  "timestamp": "2026-06-17T10:30:00Z",
  ...additional fields
}
```

---

### `connected`

Sent immediately after the WebSocket connection is established. Reports server-side defaults.

```json
{
  "event": "connected",
  "version": "1.0.0",
  "tts_provider": "browser",
  "stt_provider": "browser",
  "wake_word_enabled": false
}
```

When `wake_word_enabled` is `true`, the UI disables browser continuous listening.

---

### `session_config`

Sent at the start of the boot sequence. Confirms which providers are active for this session.

```json
{
  "event": "session_config",
  "tts_provider": "openai",
  "stt_provider": "openai"
}
```

---

### `phase_changed`

Reports a transition in the session state machine.

```json
{
  "event": "phase_changed",
  "phase": "booting"
}
```

**Phase state machine:**
```
standby ──wake──▶ wake_detected ──▶ booting ──▶ ready ◀──────┐
                                                 │            │
                                             listening        │
                                                 │            │
                                             thinking         │
                                                 │            │
                                            responding ───────┘
ready / booting ──sleep──▶ sleep ──wake──▶ wake_detected
```

Valid phases: `standby`, `wake_detected`, `booting`, `ready`, `listening`, `thinking`, `responding`, `sleep`

---

### `boot_status`

Narration line during the boot sequence.

```json
{
  "event": "boot_status",
  "message": "Starting 6 agents...",
  "agent_id": "weather",
  "audio_b64": "<base64 MP3>",
  "audio_format": "mp3"
}
```

`audio_b64` and `audio_format` are present only when a server TTS provider is active.

---

### `agent_status_changed`

Reports an agent's lifecycle state.

```json
{
  "event": "agent_status_changed",
  "agent": "weather",
  "status": "online"
}
```

Valid statuses: `offline`, `booting`, `online`, `error`

---

### `transcript_final`

A confirmed speech transcript from either the user or the system.

```json
{
  "event": "transcript_final",
  "speaker": "user",
  "text": "What is the weather in Tokyo?"
}
```

`speaker`: `"user"` or `"system"`

---

### `route_selected`

Reports which agent was selected by the intent router.

```json
{
  "event": "route_selected",
  "agent": "weather",
  "confidence": 0.93,
  "reason": "matched keywords: weather"
}
```

---

### `assistant_speaking`

The agent's response text (and optional audio).

```json
{
  "event": "assistant_speaking",
  "text": "In Tokyo right now it is 24°C and partly cloudy.",
  "audio_b64": "<base64 MP3>",
  "audio_format": "mp3"
}
```

`audio_b64` and `audio_format` are present only when a server TTS provider is active. The UI plays audio via `HTMLAudioElement` and falls back to browser `SpeechSynthesis` when absent.

---

### `assistant_done`

Signals that the agent has finished speaking. The session transitions back to `ready`.

```json
{
  "event": "assistant_done"
}
```

---

### `metrics_update`

Broadcast every 5 seconds to all connected clients. Contains real-time performance data.

```json
{
  "event": "metrics_update",
  "uptime_seconds": 3600,
  "total_commands": 42,
  "total_sessions": 3,
  "tts_calls": 28,
  "stt_calls": 42,
  "agent_avg_ms": {
    "weather": 320,
    "github": 540,
    "general": 1200
  }
}
```

---

### `wake_word_detected`

Sent when the server-side `openWakeWord` listener detects the wake phrase. Triggers `triggerWakeWord()` in the UI.

```json
{
  "event": "wake_word_detected",
  "model": "hey_jarvis"
}
```

---

### `error`

Sent when a non-fatal error occurs.

```json
{
  "event": "error",
  "message": "Weather agent: API key not configured."
}
```

---

## Audio delivery

When a server TTS provider (`openai` or `elevenlabs`) is active:

- `boot_status` and `assistant_speaking` events include `audio_b64` (base64-encoded MP3) and `audio_format` (`"mp3"`)
- The UI queues and plays audio chunks via `HTMLAudioElement`
- When no `audio_b64` is present, the UI falls back to browser `SpeechSynthesis` using the `text` field

When server STT (`openai`) is active:

- The browser captures microphone audio via `MediaRecorder` and sends it as `audio_chunk` WebSocket commands
- The orchestrator forwards audio to OpenAI Whisper and returns a `transcript_final` event
