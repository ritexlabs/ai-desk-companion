# Providers Settings

Configure speech-to-text and text-to-speech providers for higher-quality voice input and output.

**Navigation:** [← AI](ai.md) | [← Configuration](../configuration.md) | [← Voice](voice.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [Browser vs cloud providers — which to choose?](#2-browser-vs-cloud-providers--which-to-choose)
3. [Speech-to-Text (STT)](#3-speech-to-text-stt)
4. [Text-to-Speech (TTS)](#4-text-to-speech-tts)
5. [Part A — Browser (free, no setup)](#part-a--browser-free-no-setup)
6. [Part B — OpenAI (Whisper + TTS)](#part-b--openai-whisper--tts)
7. [Part C — ElevenLabs (ultra-realistic TTS)](#part-c--elevenlabs-ultra-realistic-tts)
8. [Configure in the app](#8-configure-in-the-app)
9. [Testing your TTS provider](#9-testing-your-tts-provider)
10. [Key sharing between AI and Providers tabs](#10-key-sharing-between-ai-and-providers-tabs)
11. [Troubleshooting](#11-troubleshooting)
12. [Security notes](#12-security-notes)

---

## 1. Overview

The **Providers** tab (⚙ → Providers) connects Robo to cloud voice services:

- **STT** (Speech-to-Text): Converts your voice to text. Default is your browser; OpenAI Whisper is the cloud option.
- **TTS** (Text-to-Speech): Converts Robo's responses to speech. Default is your browser; OpenAI TTS and ElevenLabs are cloud options.

Cloud providers go through the **orchestrator** (the Python backend), so they require the server to be running. Browser providers work entirely in the frontend.

---

## 2. Browser vs cloud providers — which to choose?

```
┌─────────────────────────────────────────────┐
│  BROWSER (default)                          │
│  ✓ Free — no API key, no account            │
│  ✓ Works offline                            │
│  ✓ Zero latency (runs locally in browser)   │
│  ✗ Voice quality depends on your OS         │
│  ✗ Limited language support for STT         │
│  ✗ Less accurate in noisy environments      │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  OPENAI (Whisper + TTS)                     │
│  ✓ Whisper is one of the most accurate STTs │
│  ✓ Multilingual — 90+ languages             │
│  ✓ TTS sounds very natural (6 voices)       │
│  ✗ Requires API key and internet            │
│  ✗ Small per-request cost                   │
│  ✗ Slight latency (server round-trip)       │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  ELEVENLABS (TTS only)                      │
│  ✓ Ultra-realistic, near-human quality      │
│  ✓ Voice cloning available                  │
│  ✓ Fine-grained emotion control             │
│  ✗ Requires API key and internet            │
│  ✗ More expensive than OpenAI TTS           │
│  ✗ Not available for STT                    │
└─────────────────────────────────────────────┘
```

**Recommended setup for most users:** Browser STT + Browser TTS (zero-setup). Upgrade to OpenAI if you find the browser STT misses words or you want better-sounding responses.

---

## 3. Speech-to-Text (STT)

STT converts your spoken words to text after you say the wake word and give a command.

| Provider | How it works | Accuracy | Cost |
|----------|-------------|----------|------|
| **Browser** | Web Speech API — runs in Chrome/Safari | Good for clear speech | Free |
| **OpenAI Whisper** | Audio streamed to OpenAI's Whisper model | Excellent, multilingual | ~$0.006/minute |

**To change STT provider:**
1. Open ⚙ → Providers
2. Under **Speech to Text**, select **Browser** or **OpenAI Whisper**
3. If OpenAI: enter (or confirm) your API key
4. Click **Save Providers**

> OpenAI STT and TTS share the same API key — you only need to enter it once.

---

## 4. Text-to-Speech (TTS)

TTS converts Robo's text responses to spoken audio.

| Provider | Quality | Voices | Cost |
|----------|---------|--------|------|
| **Browser** | OS-dependent | All system voices | Free |
| **OpenAI TTS** | Very natural | 6 voices, 2 quality models | ~$0.015–$0.030 per 1K characters |
| **ElevenLabs** | Ultra-realistic | Thousands, including cloned | Subscription or pay-per-character |

---

## Part A — Browser (free, no setup)

No configuration needed. Select **Browser** for both STT and TTS to use the Web Speech API.

Voice quality and available voices are controlled by the **Voice tab** (⚙ → Voice). See [Voice Settings](voice.md) for details.

> Browser TTS will not play if your system has no voices installed. On Linux, install `espeak` or similar. On macOS, voices are pre-installed.

---

## Part B — OpenAI (Whisper + TTS)

OpenAI provides both the best cloud STT (Whisper) and a high-quality cloud TTS in one API key.

### B1. Get an API key

1. Go to **[platform.openai.com/api-keys](https://platform.openai.com/api-keys)**
2. Sign in or create an account
3. Click **Create new secret key** → name it (e.g. `Robo`)
4. Copy the key — it starts with `sk-`
5. Add billing in **Settings → Billing** (small per-use cost)

### B2. TTS Voice options

Six voices, each with a distinct character:

| Voice | Character |
|-------|-----------|
| `alloy` | Neutral, balanced |
| `echo` | Warm, clear |
| `fable` | Expressive, British-inflected |
| `onyx` | Deep, authoritative |
| `nova` | Friendly, upbeat |
| `shimmer` | Gentle, calm |

### B3. TTS Model options

| Model | Speed | Quality | Best for |
|-------|-------|---------|----------|
| `tts-1` | Faster | Good | Real-time responses, low latency |
| `tts-1-hd` | Slightly slower | Higher | Best quality for important responses |

`tts-1` is recommended for everyday use. Use `tts-1-hd` if audio quality is a priority.

### B4. Configure

1. Open ⚙ → Providers
2. Under **Speech to Text**, select **OpenAI Whisper** (optional)
3. Under **Text to Speech**, select **OpenAI TTS**
4. Enter your **OpenAI API Key**
5. Pick a **Voice** (try them with the Test button)
6. Pick a **Model** (`tts-1` or `tts-1-hd`)
7. Click **Save Providers**

---

## Part C — ElevenLabs (ultra-realistic TTS)

ElevenLabs provides the most natural-sounding voices available. Use it if voice quality is a top priority.

> ElevenLabs is for **TTS only**. For STT, use Browser or OpenAI Whisper alongside it.

### C1. Get an API key

1. Go to **[elevenlabs.io](https://elevenlabs.io)**
2. Create an account (free tier: 10,000 characters/month)
3. Click your avatar → **Profile** → **API Key**
4. Copy the key

### C2. Find a Voice ID

ElevenLabs voices are identified by a Voice ID string (not a name).

**To find a Voice ID:**
1. Log in to ElevenLabs
2. Go to **Voices** in the left sidebar
3. Click a voice to preview it
4. Click **ID** to copy the Voice ID string

**Common pre-made voice IDs:**

| Voice | Voice ID | Character |
|-------|----------|-----------|
| Rachel | `21m00Tcm4TlvDq8ikWAM` | Clear, conversational female |
| Bella | `EXAVITQu4vr4xnSDxMaL` | Warm, young female |
| Adam | `pNInz6obpgDQGcFmaJgB` | Deep, narrative male |
| Josh | `TxGEqnHWrfWFTfGW9XjX` | Young, casual male |
| Arnold | `VR6AewLTigWG4xSOukaG` | Strong, authoritative male |

### C3. Configure

1. Open ⚙ → Providers
2. Under **Text to Speech**, select **ElevenLabs**
3. Enter your **ElevenLabs API Key**
4. Enter the **Voice ID** (e.g. `21m00Tcm4TlvDq8ikWAM`)
5. Click **Save Providers**
6. Click **Test TTS Provider** to hear the voice

---

## 8. Configure in the app

Full walkthrough for setting up OpenAI (recommended starting point):

1. Start the app: `python3 start.py`
2. Click **⚙ → Providers**
3. Select **OpenAI Whisper** under Speech to Text
4. Select **OpenAI TTS** under Text to Speech
5. Enter your **OpenAI API Key**
6. Select a voice (`nova` or `alloy` are good defaults)
7. Leave model as `tts-1`
8. Click **Save Providers**
9. Click **Test TTS Provider** — you should hear a spoken test sentence
10. Close Settings and test with a voice command

---

## 9. Testing your TTS provider

Click **Test TTS Provider** to verify your configuration without making a full voice request.

The button sends a short test sentence through the current TTS provider and plays the audio back. If you hear the sentence, the provider is configured correctly.

**What happens during the test:**
```
Browser click "Test TTS Provider"
         │
         ▼
  Orchestrator receives test request
         │
  Calls TTS provider API (OpenAI or ElevenLabs)
         │
  Returns audio stream
         │
  Plays in browser
```

If you hear nothing:
- Check your system volume and browser audio permissions
- Confirm the orchestrator (`python3 start.py`) is running
- Check the browser console for errors

---

## 10. Key sharing between AI and Providers tabs

If you use OpenAI for both the AI tab and the Providers tab, you only need one key. The app handles reuse automatically:

| Scenario | What happens |
|----------|-------------|
| AI tab set to OpenAI, key entered in Providers tab | AI tab reuses the Providers key — no duplicate entry needed |
| Both tabs have separate keys | Each uses its own key |
| AI tab set to Anthropic/Gemini | Keys are separate — no sharing |

This means you can configure **Provider = OpenAI** in the AI tab, set your key only in Providers, and both STT/TTS and LLM calls work with one key.

---

## 11. Troubleshooting

### No audio plays after clicking "Test TTS Provider"

- Browser may be blocking audio autoplay — click anywhere on the page first, then retry
- Confirm the orchestrator is running (`python3 start.py`)
- Check the browser console for errors (F12 → Console)

### OpenAI TTS returns "401 Unauthorized"

- API key is wrong or expired — generate a new one at platform.openai.com
- Key must start with `sk-` and have billing attached

### OpenAI Whisper not recognising speech

- The audio is captured by the browser and sent to the orchestrator, then to Whisper
- Confirm your microphone is working (browser audio permission granted)
- Try speaking louder and closer to the microphone
- On Chrome: click the lock icon in the address bar → confirm Microphone is set to Allow

### ElevenLabs returns an error

- Confirm your API key is from the ElevenLabs dashboard (not an OpenAI key)
- Confirm the Voice ID is correct — copy it directly from the ElevenLabs Voices page
- Free tier has a character limit — check your quota at elevenlabs.io/dashboard

### Browser STT stopped working

- Chrome and Safari only — Firefox does not support the Web Speech API
- Confirm microphone permission is granted for `localhost`
- Try refreshing the page; the browser voice list sometimes needs a reload to initialise

---

## 12. Security notes

| What | How it is protected |
|------|-------------------|
| OpenAI API key | Stored in browser `localStorage` under `robo-voice-providers` — never in source files |
| ElevenLabs API key | Same — `localStorage` only |
| Audio transmission | Your voice audio is sent to OpenAI/ElevenLabs servers only if you select those providers |
| Browser providers | Zero data leaves your device — all processing is local |
| localStorage | Sandboxed to this origin — cannot be committed to Git or read by other websites |

> **If privacy is critical, use Browser for both STT and TTS.** No audio leaves your machine, and no keys are needed.
