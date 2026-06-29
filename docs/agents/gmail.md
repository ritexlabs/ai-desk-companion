# Gmail — MCP Gateway Tool

> **Gateway tool** — served by the MCP Gateway (`apps/mcp-gateway/`, port 8788), namespace `google`. Tool name: `google__get_emails`. Shares the Google OAuth token with Google Calendar.

Check unread emails and important messages by voice — without opening your inbox.

**Navigation:** [← All tools](../agents.md) | [Architecture](../architecture.md) | [MCP Gateway](../mcp-gateway.md) | [Setup](../setup.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data flow](#3-data-flow)
4. [Prerequisites](#4-prerequisites)
5. [Part A — Google Cloud project and Gmail API](#part-a--google-cloud-project-and-gmail-api)
6. [Part B — Get an access token with Gmail scope](#part-b--get-an-access-token-with-gmail-scope)
7. [Part C — Configure in the app](#part-c--configure-in-the-app)
8. [Part D — Test it](#part-d--test-it)
9. [Voice commands](#9-voice-commands)
10. [Troubleshooting](#10-troubleshooting)
11. [Security notes](#11-security-notes)

---

## 1. Overview

The Gmail agent lets you:

- **Check unread emails** — *"Do I have any unread emails?"*
- **Read email subjects** — *"What emails do I have?"*
- **Check important messages** — *"Any urgent emails?"*

One credential is required: a **Google OAuth 2.0 access token** with the Gmail read scope. The setup takes about 5–10 minutes and is free.

> **Shared token with Google Calendar:** if you already set up the [Google Calendar agent](calendar.md), you use the same access token here — just make sure it includes the Gmail scope (see [Part B](#part-b--get-an-access-token-with-gmail-scope)).

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Your Machine (localhost)                     │
│                                                                  │
│  ┌─────────────┐      ┌──────────────────┐                      │
│  │  Robo UI    │◄────►│   Orchestrator   │                      │
│  │  (React)    │  WS  │  (FastAPI :8787) │                      │
│  └─────────────┘      └────────┬─────────┘                      │
│                                │  Gmail Agent                   │
│                                │  - routes intent by keywords   │
│                                │  - fetches message list        │
│                                │  - reads subjects only         │
└────────────────────────────────│────────────────────────────────┘
                                 │  HTTPS (Bearer token)
                    ┌────────────▼───────────────┐
                    │       Gmail API v1          │
                    │   gmail.googleapis.com      │
                    │                             │
                    │  /users/me/messages         │  ← list unread
                    │  /users/me/messages/{id}    │  ← fetch subject
                    └─────────────────────────────┘
```

Only message **subjects** are fetched — the agent never reads email body content. Your token is used server-side only.

---

## 3. Data flow

```
You say: "Do I have any unread emails?"
         │
         ▼
   Robo UI (STT) ──► Orchestrator ──► Gmail Agent
                                            │
                       Detects: unread query (default)
                                            │
                    GET /users/me/messages
                         ?q=is:unread&labelIds=INBOX
                         &maxResults=5
                                            │
                    Fetch subject of top 3 messages
                                            │
                    "5 unread emails —
                     'Project update', 'Invoice #1042',
                     'Team lunch reminder' and 2 more."
                                            │
                         Orchestrator ──► Robo speaks the result
```

---

## 4. Prerequisites

| Requirement | Notes |
|-------------|-------|
| A Google account | The one your Gmail inbox lives on |
| App running (`python3 start.py`) | Orchestrator must be up |
| Internet connection | Required to reach the Gmail API |

---

## Part A — Google Cloud project and Gmail API

If you already completed the [Google Calendar setup](calendar.md#part-a--create-a-google-cloud-project), your project exists — skip to [A2](#a2-enable-the-gmail-api) to just enable the Gmail API.

### A1. Create a Google Cloud project

1. Go to **[console.cloud.google.com](https://console.cloud.google.com)**
2. Sign in with your Google account
3. Click the project dropdown → **New Project**
4. Name it (e.g. `Robo Desk Companion`) → **Create**
5. Make sure the new project is selected

### A2. Enable the Gmail API

1. Go to **APIs & Services → Library**
2. Search for `Gmail API`
3. Click it → click **Enable**

### A3. Create OAuth credentials (skip if done for Calendar)

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. If prompted, configure the consent screen first:
   - **External** → **Create**
   - Fill in **App name** (e.g. `Robo`) and your email → **Save and Continue**
   - Skip Scopes → Skip Test users → **Back to Dashboard**
4. Back in Create OAuth client ID:
   - **Application type**: `Web application`
   - Under **Authorized redirect URIs**, add:
     ```
     https://developers.google.com/oauthplayground
     ```
5. Click **Create** → copy **Client ID** and **Client Secret**

---

## Part B — Get an access token with Gmail scope

You will use the [Google OAuth Playground](https://developers.google.com/oauthplayground) to generate a token.

> **Already have a Calendar token?** You need a new token that includes the Gmail scope too. The easiest approach is to authorize **both** scopes in one go — that single token works for both agents.

### B1. Configure the Playground

1. Go to **[developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)**
2. Click the **gear icon** (⚙) top right → **Use your own OAuth credentials**
3. Enter your **Client ID** and **Client Secret** → close the panel

### B2. Authorize Gmail (and optionally Calendar) scope

1. In the left panel, find **Gmail API v1**
2. Tick the scope:
   ```
   https://www.googleapis.com/auth/gmail.readonly
   ```
3. If you also use the Calendar agent, tick at the same time under **Google Calendar API v3**:
   ```
   https://www.googleapis.com/auth/calendar.readonly
   ```
4. Click **Authorize APIs** → sign in → **Allow**

### B3. Get the access token

1. Click **Exchange authorization code for tokens**
2. Copy the **Access token** (starts with `ya29.`)

> Tokens expire after 1 hour. To regenerate without re-authorizing, copy the **Refresh token** as well — you can click **Refresh access token** in the Playground next time.

---

## Part C — Configure in the app

### C1. Configure via Settings UI (recommended)

1. Start the app: `python3 start.py`
2. Click the **⚙ gear icon** → **Agents** tab
3. Expand **Gmail**
4. Paste your **Access token** into the token field
5. Click **Test** — you should see: *"Connected — N unread"* or *"Connected — inbox clear"*
6. Toggle the switch to **enable** the agent

### C2. Configure via `.env` (alternative)

Open `apps/orchestrator/.env`:

```dotenv
# ── Google (Calendar + Gmail share one token) ─────────────────────
GOOGLE_ACCESS_TOKEN=ya29.your-token-here
```

> **Security:** Never commit `.env`. It is already in `.gitignore`.

Restart the app after editing `.env`:

```bash
python3 start.py
```

---

## Part D — Test it

### D1. Test unread count

Say to Robo:

> *"Hey Robo, do I have any unread emails?"*

Expected with unread:

> *"5 unread emails — 'Project update', 'Invoice #1042', 'Team lunch reminder' and 2 more."*

Expected when clear:

> *"No unread emails. Your inbox is clear!"*

### D2. Test important emails

Say:

> *"Hey Robo, any urgent emails?"*

Expected:

> *"2 important emails — 'Action required: invoice overdue', 'Meeting rescheduled'."*

---

## 9. Voice commands

| What you say | What happens |
|---|---|
| *"Do I have any unread emails?"* | Reads unread count + top 3 subjects |
| *"Any emails?"* | Same as above |
| *"What is in my inbox?"* | Same as above |
| *"Who sent me emails today?"* | Same as above (subjects include sender when available) |
| *"Any urgent emails?"* | Reads important and unread emails |
| *"Any important emails?"* | Same as above |
| *"Any starred emails?"* | Same as above |
| *"Any flagged messages?"* | Same as above |

**Intent routing:** if your speech contains `urgent`, `important`, `starred`, or `flagged` — important unread emails are fetched. Any other phrasing returns the general unread count.

---

## 10. Troubleshooting

### "Not connected to Google"

- Open Settings → Agents → Gmail and paste your access token
- Or add `GOOGLE_ACCESS_TOKEN=ya29...` to `.env` and restart

### "Google access token expired"

Access tokens expire after 1 hour. To get a new one:

1. Go to [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)
2. If the session is still active, click **Refresh access token** (requires the Refresh token to be saved)
3. Or repeat [Part B](#part-b--get-an-access-token-with-gmail-scope) to re-authorize and get a fresh token
4. Paste the new token in Settings → Agents → Gmail

### "Gmail API error 403"

- The Gmail API was not enabled for your project — go to Cloud Console → APIs & Services → Library → enable **Gmail API**
- Or your Google account is not added as a test user — go to OAuth consent screen → Test users → add your email

### "Gmail API error 401"

The token is invalid or was generated without the correct scope. Regenerate the token making sure `gmail.readonly` is ticked during the OAuth Playground authorization step.

### Emails not showing even though I have unread messages

- Confirm you authorized the token with your correct Google account (the one with the emails)
- The agent searches the **INBOX** label only — emails in All Mail, Spam, or other labels are excluded
- Try the Settings → Test button to see the raw response

---

## 11. Security notes

| What | How it is protected |
|------|-------------------|
| `GOOGLE_ACCESS_TOKEN` | Stored in `.env` or browser `localStorage`; never logged or included in responses |
| API calls | Made server-side by the orchestrator over HTTPS — token not visible in browser network tabs |
| Scope | `gmail.readonly` — read-only; the agent cannot send, delete, or modify emails |
| Content | Only message **subjects** are fetched — body content, attachments, and recipients are never read |
| Token lifetime | 1 hour; short expiry limits exposure if the token is ever leaked |

> The agent only reads subject lines — it cannot access the body of your emails.
