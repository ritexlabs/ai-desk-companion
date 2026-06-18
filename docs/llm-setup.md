# LLM Setup (Intent Routing + General AI Responses)

Configuring an LLM provider unlocks two capabilities:

1. **Intent routing** — the LLM reads each command and decides which agent should handle it, replacing the keyword-based fallback with natural language understanding.
2. **General AI agent** — open-ended questions that don't map to a specific agent are answered by the LLM.

Both use the same LLM configuration. No separate setup is needed.

---

## Supported providers

| Provider | Models | Notes |
|----------|--------|-------|
| OpenAI | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-3.5-turbo` | Default provider |
| Anthropic | `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5` | Latest Claude models |
| Google Gemini | `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro` | via Google AI Studio |
| Ollama | any local model | Runs entirely offline |

---

## Option 1 — Configure via Settings UI (recommended)

Changes are saved per-session in browser `localStorage` under `robo-llm-config`.

**Steps:**
1. Click the gear icon **⚙** in the top-right corner
2. Go to the **AI** tab
3. Select your LLM provider from the dropdown
4. Enter your API key
5. Select or type the model name
6. Click **Connect & Verify** — sends a short test request to confirm the key works
7. Click **Save**

Keys are stored in the browser only and never written to any file.

---

## Option 2 — Configure via `.env` (server-level fallback)

These values are used when the UI has not sent `llm_config` in the session start command.

```bash
cp apps/orchestrator/.env.example apps/orchestrator/.env
```

Edit `apps/orchestrator/.env`:
```dotenv
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
# LLM_BASE_URL is only needed for Ollama
```

The API key itself must be passed from the UI settings — it is not read from `.env` for security reasons.

---

## Provider-specific setup

### OpenAI

1. Go to platform.openai.com/api-keys
2. Create a new API key
3. In the Settings UI → AI tab:
   - Provider: `OpenAI`
   - API Key: `sk-...`
   - Model: `gpt-4o` (recommended) or `gpt-4o-mini` (cheaper)

### Anthropic (Claude)

1. Go to console.anthropic.com/keys
2. Create a new API key
3. In the Settings UI → AI tab:
   - Provider: `Anthropic`
   - API Key: `sk-ant-...`
   - Model: `claude-sonnet-4-6` (recommended) or `claude-haiku-4-5` (faster)

Available model IDs:
- `claude-opus-4-8` — most capable, highest cost
- `claude-sonnet-4-6` — balanced capability and speed
- `claude-haiku-4-5-20251001` — fastest, lowest cost

### Google Gemini

1. Go to aistudio.google.com/apikey
2. Create a new API key
3. In the Settings UI → AI tab:
   - Provider: `Gemini`
   - API Key: `AIza...`
   - Model: `gemini-2.5-flash` (recommended)

### Ollama (local / offline)

Ollama runs models locally — no API key required and no data leaves your machine.

**Install Ollama:**
```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh
```

**Pull a model:**
```bash
ollama pull llama3.2        # 3B, fast
ollama pull mistral         # 7B, capable
ollama pull phi3:mini       # 3.8B, very fast
```

**Start the Ollama server:**
```bash
ollama serve                # runs on http://localhost:11434
```

**Configure in the Settings UI → AI tab:**
- Provider: `Ollama`
- Base URL: `http://localhost:11434`
- Model: `llama3.2` (or whichever you pulled)
- API Key: _(leave blank)_

Or set the base URL in `.env` as the server-side default:
```dotenv
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
LLM_BASE_URL=http://localhost:11434
```

---

## How LLM-based intent routing works

When an LLM is configured, every spoken command goes through a lightweight classification call before being dispatched to an agent.

The router sends a system prompt that lists only the agents enabled for the current session, along with a one-line description of what each handles. The LLM returns a single JSON line:

```json
{"agent": "calendar", "reason": "user asking about upcoming meetings"}
```

- **Temperature is fixed at 0.0** — routing is deterministic and never creative
- **`max_tokens=80`** — the call is fast (typically 100–400 ms)
- **Only enabled agents appear** in the prompt — the LLM cannot route to an agent you haven't turned on
- **Graceful fallback** — if the LLM call fails, times out, or returns an unknown agent name, keyword matching handles the request silently

This means paraphrases like *"is it going to rain this weekend?"*, *"remind me what Nifty was doing yesterday"*, or *"am I free tomorrow afternoon?"* all route correctly without keyword tuning.

### Which model to use for routing

Routing only needs a fast, cheap model — it does not need to understand the answer, just the intent. Recommendations:

| Provider | Routing model | Response model |
|----------|---------------|----------------|
| OpenAI | `gpt-4o-mini` | `gpt-4o` |
| Anthropic | `claude-haiku-4-5-20251001` | `claude-sonnet-4-6` |
| Gemini | `gemini-2.0-flash` | `gemini-2.5-flash` |
| Ollama | `phi3:mini` | `llama3.2` / `mistral` |

Currently both routing and General AI use the same configured model. Using a fast model for the configured LLM is therefore the best trade-off.

---

## How the General AI agent works

When the intent router selects the `general` agent (because no other agent fits), the General AI agent constructs a prompt with:
- The user's command text
- A system prompt that identifies the assistant as "Robo"
- The session `llm_config` (provider, model, key)

The response is sent back as an `assistant_speaking` WebSocket event and spoken aloud via TTS.

---

## Troubleshooting

**"General AI agent not configured"**  
No LLM has been set up. Open Settings → AI tab and configure a provider.

**"Connect & Verify" fails with 401**  
Your API key is invalid or expired. Generate a new one from the provider's dashboard.

**Ollama returns a connection error**  
Make sure `ollama serve` is running. Check that the base URL matches (default: `http://localhost:11434`).

**Responses are very slow**  
Switch to a smaller model (e.g. `gpt-4o-mini`, `claude-haiku-4-5`, `phi3:mini` for Ollama) or use `tts-1` instead of `tts-1-hd`.
