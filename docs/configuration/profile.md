# Profile Settings

Personalise how Robo wakes up and how it addresses you.

**Navigation:** [← Configuration](../configuration.md) | [Voice →](voice.md) | [AI →](ai.md) | [Providers →](providers.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [Wake-Up Word](#2-wake-up-word)
3. [Calling Name](#3-calling-name)
4. [Saving your profile](#4-saving-your-profile)
5. [Where settings are stored](#5-where-settings-are-stored)

---

## 1. Overview

The **Profile** tab (⚙ → Profile) contains two settings that control how you interact with Robo at the most fundamental level:

- **Wake-Up Word** — the phrase you say to activate Robo from standby
- **Calling Name** — how Robo addresses you in responses

These are the only settings you need to change to make Robo feel like yours.

---

## 2. Wake-Up Word

The wake-up word is the phrase Robo listens for continuously while in standby mode. When it hears this phrase, it switches to active mode and starts processing your command.

### Default

```
Robo
```

Activate with: *"Hey Robo"*, *"Hello Robo"*, or *"Robo, Wake-Up"*

### Choosing a good wake-up word

| Tip | Why |
|-----|-----|
| Use 2+ words | Single words get false-triggered by casual speech |
| Make it unique | Avoid common words that appear in normal conversation |
| Keep it easy to say | You will say this dozens of times a day |
| Test it | After saving, say it in different tones to confirm it triggers reliably |

**Examples of good wake-up words:**
- `Hey Robo`
- `Wake Up Robo`
- `Hello Assistant`
- `Hey Jarvis`

### How it works

Robo listens for your wake word using one of two methods depending on configuration:

| Method | When used |
|--------|-----------|
| **Browser Speech API** | Default — Chrome or Safari, no setup needed |
| **Server wake-word** | When `WAKE_WORD_ENABLED=true` in `.env` — uses openWakeWord on the orchestrator |

The browser method listens in 6-second windows and matches your phrase using the pattern:

```
"Hey [Word]" / "Hello [Word]" / "[Word], Wake-Up" / "Wake-Up [Word]"
```

So if your wake word is `Robo`, any of these trigger it:
- *"Hey Robo"*
- *"Hello Robo"*
- *"Robo, Wake-Up"*
- *"Wake-Up Robo"*

### Change the wake-up word

1. Open ⚙ → **Profile**
2. Clear the **Wake-Up Word** field
3. Type your new phrase (e.g. `Hey Jarvis`)
4. Click **Save Profile**
5. Test by saying the new phrase — Robo should activate immediately

> The default falls back to `Wakeup Robo` if you save an empty field.

---

## 3. Calling Name

The calling name is how Robo addresses you in responses. It appears in greetings, farewells, and acknowledgement phrases.

### Default

```
Master
```

Used in responses like: *"Good evening, Master. How can I help?"*

### Examples

| Calling Name | Sample greeting |
|---|---|
| `Master` | *"Good morning, Master. All systems online."* |
| `Boss` | *"Good afternoon, Boss. What can I do for you?"* |
| `Ritesh` | *"Good evening, Ritesh. Ready for your command."* |
| `Sir` | *"Hello Sir. How may I assist you today?"* |

### Change your calling name

1. Open ⚙ → **Profile**
2. Clear the **Calling Name** field
3. Type your preferred name or title
4. Click **Save Profile**

> The default falls back to `Master` if you save an empty field.

---

## 4. Saving your profile

Both settings are saved together with the **Save Profile** button. Changes take effect immediately — no restart needed.

**Profile tab → Save Profile** updates:
- The wake-up word pattern used by the browser voice listener
- The calling name used in all TTS responses for the current and future sessions

---

## 5. Where settings are stored

Profile settings are stored in your browser's `localStorage` under the key `robo-app-config`:

```json
{
  "wakeWord": "Robo",
  "callingName": "Master"
}
```

| Property | Notes |
|----------|-------|
| Stored in | Browser `localStorage` — sandboxed to this origin |
| Committed to Git | Never — `localStorage` is not a file |
| Shared across devices | No — each browser/device has its own storage |
| Lost if you clear browser data | Yes — re-enter after clearing localStorage |

> If you use multiple browsers or devices, configure the profile on each one separately.
