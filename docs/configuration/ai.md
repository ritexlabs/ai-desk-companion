# AI Settings

Connect an LLM to power Robo's natural language understanding, intent routing, and General AI responses.

**Navigation:** [← Voice](voice.md) | [← Configuration](../configuration.md) | [Providers →](providers.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [What the LLM is used for](#2-what-the-llm-is-used-for)
3. [Supported providers](#3-supported-providers)
4. [Part A — Anthropic (Claude)](#part-a--anthropic-claude)
5. [Part B — OpenAI (GPT)](#part-b--openai-gpt)
6. [Part C — Google (Gemini)](#part-c--google-gemini)
7. [Part D — Ollama (local, free)](#part-d--ollama-local-free)
8. [Configure in the app](#8-configure-in-the-app)
9. [Switching providers](#9-switching-providers)
10. [Troubleshooting](#10-troubleshooting)
11. [Security notes](#11-security-notes)

---

## 1. Overview

The **AI** tab (⚙ → AI) connects Robo to a large language model (LLM). The LLM handles:

- Deciding which agent should answer your command (intent routing)
- Generating natural, conversational responses for the General AI agent
- Personalised greetings and session-aware replies

Without an LLM, Robo falls back to keyword-based intent routing and cannot answer open-ended questions.

---

## 2. What the LLM is used for

```
You say: "What is the meaning of life?"
         │
         ▼
   Orchestrator ──► LLM classifier
                         │
                    "No specific agent — route to General AI"
                         │
                    General AI agent ──► LLM generates answer
                         │
                   "The meaning of life is..."
```

```
You say: "Turn on the living room lights"
         │
         ▼
   Orchestrator ──► LLM classifier
                         │
                    "Route to Smart Home agent"
                         │
                    Smart Home agent handles it directly
                    (LLM not needed again)
```

The LLM is called **twice** for General AI queries (routing + answer) and **once** for agent queries (routing only). Temperature is fixed at `0.0` for routing to keep intent classification deterministic.

---

## 3. Supported providers

| Provider | Models | Key needed | Cost | Best for |
|----------|--------|-----------|------|----------|
| **Anthropic — Claude** | Sonnet 4.6, Haiku 4.5, Opus 4.8 | Yes | Pay-per-token | Highest quality responses, nuanced conversations |
| **OpenAI — GPT** | GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-3.5-turbo | Yes | Pay-per-token | Widely used, large ecosystem |
| **Google — Gemini** | Gemini 2.0 Flash, 1.5 Flash, 1.5 Pro | Yes | Free tier available | Fast, free to start |
| **Ollama — Local** | Llama3, Mistral, Gemma2, Phi3, Qwen2.5… | No | Free | Privacy-first, no internet needed |

---

## Part A — Anthropic (Claude)

### A1. Get an API key

1. Go to **[console.anthropic.com](https://console.anthropic.com)**
2. Sign in or create an account
3. Navigate to **API Keys** in the left sidebar
4. Click **Create Key** → give it a name (e.g. `Robo`)
5. Copy the key — it starts with `sk-ant-`

> New accounts get free credits. After that, usage is billed per token. Claude Haiku is the most cost-efficient choice for frequent use.

### A2. Choose a model

| Model | Speed | Quality | Recommended for |
|-------|-------|---------|----------------|
| `claude-sonnet-4-6` ★ | Fast | Excellent | Daily use — best balance |
| `claude-haiku-4-5-20251001` | Very fast | Good | High-frequency commands, cost-conscious |
| `claude-opus-4-8` | Slower | Highest | Complex reasoning tasks |

★ Recommended — the same model that powers this app.

---

## Part B — OpenAI (GPT)

### B1. Get an API key

1. Go to **[platform.openai.com/api-keys](https://platform.openai.com/api-keys)**
2. Sign in or create an account
3. Click **Create new secret key** → name it → copy it
4. Key starts with `sk-`

> Add a billing method in **Settings → Billing** before your free credits run out.

### B2. Choose a model

| Model | Speed | Quality | Recommended for |
|-------|-------|---------|----------------|
| `gpt-4o` | Fast | Excellent | General daily use |
| `gpt-4o-mini` | Very fast | Good | High-frequency, cost-conscious |
| `gpt-4-turbo` | Medium | Excellent | Long conversations |
| `gpt-3.5-turbo` | Very fast | Moderate | Simple queries only |

### B3. Custom Base URL (optional)

For OpenAI-compatible APIs (e.g. Azure OpenAI, Groq, Together AI), enter the base URL in the **Custom Base URL** field. Leave blank for the standard OpenAI endpoint.

---

## Part C — Google (Gemini)

### C1. Get an API key

1. Go to **[aistudio.google.com](https://aistudio.google.com)**
2. Sign in with your Google account
3. Click **Get API key** → **Create API key in new project**
4. Copy the key — it starts with `AIza`

> Gemini has a generous free tier (15 requests/minute, 1500/day on Flash). No billing required to start.

### C2. Choose a model

| Model | Speed | Quality | Notes |
|-------|-------|---------|-------|
| `gemini-2.0-flash` | Very fast | Good | Best free-tier choice |
| `gemini-1.5-flash` | Fast | Good | Stable, reliable |
| `gemini-1.5-pro` | Medium | Excellent | Long context, complex tasks |

---

## Part D — Ollama (local, free)

Ollama runs LLMs locally on your machine. No API key, no internet, no cost — and your data never leaves your device.

### D1. Install Ollama

**macOS:**
```bash
brew install ollama
```

Or download from **[ollama.com](https://ollama.com)** and install the app.

**Start Ollama (runs on port 11434):**
```bash
ollama serve
```

### D2. Pull a model

```bash
ollama pull llama3           # Llama 3 8B — good balance (~5 GB)
ollama pull llama3.1         # Llama 3.1 8B — improved reasoning
ollama pull mistral          # Mistral 7B — fast (~4 GB)
ollama pull gemma2           # Google Gemma 2 9B
ollama pull phi3             # Microsoft Phi-3 Mini (~2 GB, fastest)
ollama pull qwen2.5          # Alibaba Qwen 2.5 — strong multilingual
```

**Check what you have installed:**
```bash
ollama list
```

### D3. Recommended models by hardware

| RAM | Recommended model | Size |
|-----|------------------|------|
| 8 GB | `phi3` or `mistral` | ~2–4 GB |
| 16 GB | `llama3` or `mistral` | ~4–5 GB |
| 32 GB+ | `llama3.1` or `gemma2` | ~5–9 GB |

### D4. Base URL

The default Ollama base URL is `http://localhost:11434`. If you run Ollama on a different machine or port, enter the custom URL in the **Ollama Base URL** field.

---

## 8. Configure in the app

1. Start the app: `python3 start.py`
2. Click **⚙ → AI**
3. Select your **Provider** (Anthropic / OpenAI / Gemini / Ollama)
4. Choose a **Model** from the dropdown
5. Enter your **API Key** (not needed for Ollama)
6. For Ollama: optionally set a **Base URL** if not running on localhost
7. Click **Connect & Verify**

Robo sends a quick test prompt (`Reply with just the word: ready`) to confirm the key and model work. On success, the status shows:

```
✓ Connected — claude-sonnet-4-6 · Anthropic — Claude
```

From this point, all voice sessions use this LLM for intent routing and General AI responses.

---

## 9. Switching providers

When you click a different provider button, the model resets to that provider's first option and the API key is cleared. This prevents accidentally using a key from one provider with another.

To switch:
1. Click the new provider
2. Enter the new API key
3. Select a model
4. Click **Connect & Verify**

---

## 10. Troubleshooting

### "Empty response from model"

The API returned an empty string. Usually means:
- The model name is invalid — check spelling and try the default model
- The API endpoint is rate-limited — wait a moment and retry
- For Ollama: the model is not downloaded — run `ollama pull <model>`

### "Connection failed" / network error

- Check your internet connection (not needed for Ollama)
- For Ollama: confirm `ollama serve` is running (`curl http://localhost:11434`)
- For cloud providers: the API endpoint may be temporarily down

### "401 Unauthorized" / "Invalid API key"

- Your API key is wrong, expired, or has no billing method attached
- For Anthropic: make sure the key starts with `sk-ant-`
- For OpenAI: make sure the key starts with `sk-`
- For Gemini: make sure the key starts with `AIza`

### AI tab says connected but routing still seems wrong

The LLM is connected correctly but may be routing commands to the wrong agent. This is an intent classification issue — try a more specific command, or check that the relevant agent is enabled in the Agents tab.

---

## 11. Security notes

| What | How it is protected |
|------|-------------------|
| API keys | Stored in browser `localStorage` under `robo-llm-config` — never in any source file or `.env` |
| Key transmission | Sent only to the specific LLM API endpoint you selected — never logged by the orchestrator |
| localStorage | Sandboxed to this origin — cannot be committed to Git or read by other websites |
| OpenAI key reuse | If you enter an OpenAI key in the Providers tab, the AI tab reuses it automatically when provider is set to OpenAI — one key for both |

> **Ollama is the only option with zero data transmission.** All inference happens locally. Choose Ollama if you process sensitive or private voice commands.
