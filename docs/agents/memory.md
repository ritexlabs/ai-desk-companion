# Memory Skill

Store personal notes, preferences, and reminders by voice — persisted to disk so they survive restarts.

**Navigation:** [← All Agents](../agents.md) | [Architecture](../architecture.md) | [Setup](../setup.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [How it works](#2-how-it-works)
3. [Prerequisites](#3-prerequisites)
4. [Voice commands](#4-voice-commands)
5. [Storage details](#5-storage-details)
6. [Limitations](#6-limitations)
7. [Troubleshooting](#7-troubleshooting)
8. [Privacy notes](#8-privacy-notes)

---

## 1. Overview

The Memory skill turns Robo into a personal assistant that actually remembers things across sessions. Unlike the base LLM — which has no memory of previous conversations — this skill writes facts to disk and retrieves them on demand.

**Always active** — requires no setup, no API key, and no toggle in Settings.

Use it to store:
- **Personal dates** — birthdays, anniversaries, important deadlines
- **Preferences** — *"remember I prefer Celsius"*, *"remember I drink black coffee"*
- **Quick facts** — phone numbers, PINs (keep these private), vehicle plate numbers
- **Personal notes** — any information you want to recall later by voice

---

## 2. How it works

```
Your voice command
       │
       ▼
 LLM Orchestrator
  "User wants to save/recall info → call memory tool"
       │
       ▼
 MemoryAgent — intent detection (regex patterns)
  ├─ "remember X is Y"  → STORE  key=X, value=Y
  ├─ "what is X"        → RECALL key=X (exact → partial → keyword)
  ├─ "forget X"         → DELETE key=X (exact → fuzzy)
  └─ "list memories"    → LIST   first 10 entries
       │
       ▼
 apps/orchestrator/data/user_memory.json
  {
    "wife anniversary": { "value": "June 15", "saved_at": "2026-06-27T10:30:00" },
    "parking spot":     { "value": "B-42",    "saved_at": "2026-06-27T11:00:00" }
  }
       │
       ▼
 LLM synthesises: "Your anniversary is June 15."
```

**Recall search order:**
1. Exact key match
2. Partial key match (search term inside key, or key inside search term)
3. Keyword scan — each word in the query searched against all keys and values

---

## 3. Prerequisites

None. The skill creates `apps/orchestrator/data/` automatically on first write.

---

## 4. Voice commands

### Storing memories

| What you say | What is stored |
|---|---|
| *"Remember wife birthday is March 5"* | `wife birthday → March 5` |
| *"Remember my anniversary is June 15"* | `anniversary → June 15` |
| *"Note that parking spot is B-42"* | `parking spot → B-42` |
| *"Save that I prefer Celsius"* | `I prefer → Celsius` |
| *"Store home wifi password as RoboNet2025"* | `home wifi password → RoboNet2025` |
| *"Remember my blood group is O positive"* | `blood group → O positive` |
| *"Log that flight PNR is QX7834"* | `flight pnr → QX7834` |

### Recalling memories

| What you say | What is looked up |
|---|---|
| *"What is wife birthday?"* | recalls `wife birthday` |
| *"Do you remember my anniversary?"* | recalls `anniversary` |
| *"What's my parking spot?"* | recalls `parking spot` |
| *"Tell me about my blood group"* | recalls `blood group` |
| *"Recall parking"* | keyword search for "parking" |

### Deleting memories

| What you say | What is deleted |
|---|---|
| *"Forget parking spot"* | deletes `parking spot` |
| *"Delete wife birthday"* | deletes `wife birthday` |
| *"Remove flight PNR"* | deletes `flight pnr` |
| *"Clear my wifi password"* | deletes `wifi password` |

### Listing all memories

| What you say | Effect |
|---|---|
| *"List all my memories"* | Returns first 10 entries |
| *"Show everything you remember"* | Returns first 10 entries |
| *"What do you know about me?"* | Returns first 10 entries |

---

## 5. Storage details

**File location:** `apps/orchestrator/data/user_memory.json`

**Format:**
```json
{
  "wife birthday": {
    "value": "March 5",
    "saved_at": "2026-06-27T10:30:00.123456"
  },
  "parking spot": {
    "value": "B-42",
    "saved_at": "2026-06-27T11:00:00.654321"
  }
}
```

**Key normalisation:** All keys are lowercased before storage. *"Wife Birthday"* and *"wife birthday"* refer to the same entry.

**Persistence:** Memories survive:
- App restarts
- OS reboots
- Session disconnects
- Browser refreshes

They do NOT sync across devices. The file lives on the machine running the orchestrator.

**Backup:** To back up your memories, copy `apps/orchestrator/data/user_memory.json` to a safe location.

---

## 6. Limitations

| Limitation | Detail |
|---|---|
| **No encryption** | The JSON file is plain text — do not store highly sensitive data like full card numbers or passwords in a production environment |
| **No expiry** | Memories do not auto-delete; use "forget X" to remove outdated entries |
| **10-entry list cap** | The list command shows first 10 entries; recall by specific key to access any entry |
| **Single device** | Memories are not synced to cloud or other devices |
| **Intent matching** | Very short or unusual phrasings may not trigger the right intent; rephrase if a command is not recognised |

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "I'm not sure how to handle that memory request" | Phrasing did not match any intent pattern | Try: *"remember X is Y"* / *"what is X"* / *"forget X"* |
| "I don't have anything stored about X" | No entry matching that key | Check with "list all memories" to see what keys exist |
| Memory not persisting after restart | Orchestrator data directory is read-only | Check permissions on `apps/orchestrator/data/` |
| Wrong value recalled | Partial/keyword match returned similar key | Use the exact key you stored: *"what is wife birthday"* |

---

## 8. Privacy notes

- Memory data stays entirely on your local machine — nothing is sent to external services
- The JSON file is **not** committed to Git (it is in `apps/orchestrator/data/` which should be in `.gitignore`)
- Do not store highly sensitive credentials (bank PINs, passwords) in plain JSON — use a dedicated password manager for those
- To wipe all memories: delete `apps/orchestrator/data/user_memory.json`
