# Voice Settings

Control how Robo speaks — gender, speed, and which browser voice to use.

**Navigation:** [← Profile](profile.md) | [← Configuration](../configuration.md) | [AI →](ai.md) | [Providers →](providers.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [Voice vs Providers — what is the difference?](#2-voice-vs-providers--what-is-the-difference)
3. [Voice Gender](#3-voice-gender)
4. [Speaking Speed](#4-speaking-speed)
5. [Specific Voice](#5-specific-voice)
6. [Testing your voice](#6-testing-your-voice)
7. [Recommended voices by platform](#7-recommended-voices-by-platform)
8. [Where settings are stored](#8-where-settings-are-stored)

---

## 1. Overview

The **Voice** tab (⚙ → Voice) controls the browser's built-in speech synthesis — the voice Robo uses to speak responses when no cloud TTS provider is configured.

Three settings are available:

| Setting | What it controls |
|---------|-----------------|
| **Voice Gender** | Filters available voices to male or female |
| **Speaking Speed** | How fast Robo speaks (slow / normal / fast) |
| **Specific Voice** | Pick an exact voice from your browser's voice list |

---

## 2. Voice vs Providers — what is the difference?

Robo has two separate voice stacks:

```
┌─────────────────────────────────────────────────────────────────┐
│  Voice tab (⚙ → Voice)                                          │
│  Uses the browser's Web Speech API (SpeechSynthesis)            │
│  → Free, no key needed                                          │
│  → Quality depends on your OS and browser                       │
│  → Configured here: gender, speed, voice name                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Providers tab (⚙ → Providers)                                  │
│  Uses OpenAI TTS or ElevenLabs via the orchestrator             │
│  → Higher quality, natural sound                                │
│  → Requires an API key                                          │
│  → Overrides the Voice tab settings when active                 │
└─────────────────────────────────────────────────────────────────┘
```

**If you have a Providers tab provider configured**, Robo uses that for speech and the Voice tab settings are not applied.

**If no provider is configured** (or provider is set to Browser), the Voice tab settings are used.

---

## 3. Voice Gender

Selecting a gender tells Robo to filter the browser's available voices to only male or female voices, and pick the best match.

| Option | What Robo picks |
|--------|----------------|
| **Female** (default) | Best available English female voice on your system |
| **Male** | Best available English male voice on your system |

Changing gender clears any specifically selected voice name so the auto-selection takes effect.

> The exact voices available depend on your operating system. macOS has more built-in high-quality voices than Windows. Chrome on Linux has very few.

---

## 4. Speaking Speed

| Option | Rate multiplier | Feel |
|--------|----------------|------|
| **Slow** | 0.8× | Calm and deliberate — good for complex information |
| **Normal** (default) | 1.0× | Natural conversational pace |
| **Fast** | 1.25× | Quick and snappy — good if you use Robo frequently |

Speed is applied via the browser's `SpeechSynthesisUtterance.rate` property. The exact audible difference varies by voice and platform.

---

## 5. Specific Voice

If the auto-selected voice for your gender preference does not sound right, you can pick any specific voice from the dropdown.

The dropdown shows all English-language voices available in your browser at that moment. Voices marked `(remote)` are downloaded on demand by the browser; local voices play instantly.

**To use a specific voice:**
1. Open ⚙ → Voice
2. Select your preferred gender first (this helps narrow results)
3. Open the **Specific Voice** dropdown
4. Pick a voice
5. Click **Test Voice** to hear it

**To go back to auto-selection:**
- Set the dropdown back to `Auto — best match for gender`

> The voice list only appears if your browser has voices loaded. If the dropdown is empty, click **Test Voice** to trigger the browser to load voices, then re-open Settings.

---

## 6. Testing your voice

Click **Test Voice** to hear Robo speak a test sentence with the current settings:

> *"Good Evening, Master. I am Robo, your AI assistant. All systems are online and ready for your command."*

The test uses your current gender, speed, and voice name settings without saving. Click **Test Voice** again after changing any setting to compare.

---

## 7. Recommended voices by platform

### macOS

| Voice name | Character |
|---|---|
| **Samantha Enhanced** | Clear, natural US English — recommended |
| **Karen Enhanced** | Australian English, pleasant |
| **Daniel** (male) | British English, authoritative |
| **Alex** (male) | Standard US English |

Enhanced voices (`…Enhanced`) are higher-quality neural voices. They download once from Apple and play locally.

**How to install enhanced voices on macOS:**
1. Open **System Settings → Accessibility → Spoken Content**
2. Click the **System Voice** dropdown → **Customize**
3. Expand your language → tick `Samantha (Enhanced)` or similar
4. Click **Done** — download starts automatically

### Chrome on Windows

| Voice name | Character |
|---|---|
| **Google UK English Female** | Clear, natural |
| **Google US English** | Standard US English |
| **Microsoft Zira** (female) | Windows built-in |
| **Microsoft David** (male) | Windows built-in |

### Chrome on Linux

Browser voices on Linux are often limited. Consider using the Providers tab with OpenAI TTS for a significantly better experience.

---

## 8. Where settings are stored

Voice settings are stored in your browser's `localStorage` under the key `robo-voice-config`:

```json
{
  "gender": "female",
  "speed": "normal",
  "voiceName": "Samantha Enhanced"
}
```

| Property | Notes |
|----------|-------|
| Stored in | Browser `localStorage` — sandboxed to this origin |
| Committed to Git | Never |
| Shared across devices | No — configure separately on each device |

> **No server-side effect.** Voice tab settings only affect browser-side speech synthesis. They have no impact on OpenAI TTS or ElevenLabs, which are configured in the Providers tab.
