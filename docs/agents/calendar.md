# Google Calendar Agent

Check today's schedule, find your next meeting, and stay on top of upcoming events — all by voice.

**Navigation:** [← All Agents](../agents.md) | [Architecture](../architecture.md) | [Setup](../setup.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data flow](#3-data-flow)
4. [Prerequisites](#4-prerequisites)
5. [Part A — Create a Google Cloud project](#part-a--create-a-google-cloud-project)
6. [Part B — Create OAuth credentials](#part-b--create-oauth-credentials)
7. [Part C — Get an access token](#part-c--get-an-access-token)
8. [Part D — Configure in the app](#part-d--configure-in-the-app)
9. [Part E — Test it](#part-e--test-it)
10. [Voice commands](#10-voice-commands)
11. [Troubleshooting](#11-troubleshooting)
12. [Security notes](#12-security-notes)

---

## 1. Overview

The Google Calendar agent lets you:

- **Ask about today's schedule** — *"What meetings do I have today?"*
- **Find your next event** — *"When is my next appointment?"*
- **Check the week** — *"What is on my calendar this week?"*

One credential is required: a **Google OAuth 2.0 access token** with the Calendar read scope. The setup takes about 5–10 minutes and is free.

> If you also use the [Gmail agent](gmail.md), they share the **same access token** — you only need to go through this OAuth setup once.

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
│                                │  Calendar Agent                │
│                                │  - resolves intent             │
│                                │  - fetches events              │
│                                │  - formats spoken summary      │
└────────────────────────────────│────────────────────────────────┘
                                 │  HTTPS (Bearer token)
                    ┌────────────▼───────────────┐
                    │   Google Calendar API v3    │
                    │   googleapis.com/calendar   │
                    │                             │
                    │   /calendars/primary/events │
                    └─────────────────────────────┘
```

Only your primary Google Calendar is read. The token is passed server-side — it is never exposed in browser network logs.

---

## 3. Data flow

```
You say: "What meetings do I have today?"
         │
         ▼
   Robo UI (STT) ──► Orchestrator ──► Calendar Agent
                                            │
                           Detects keyword: "today"
                                            │
                    GET /calendars/primary/events
                         ?timeMin=<today 00:00>
                         &timeMax=<today 23:59>
                         &singleEvents=true
                         &maxResults=10
                                            │
                              Google returns event list
                                            │
                    "3 events for Tuesday, June 24:
                     1. Team standup — 9:30 AM
                     2. Lunch with Sara — 1:00 PM
                     3. Sprint review — 4:00 PM"
                                            │
                         Orchestrator ──► Robo speaks the result
```

---

## 4. Prerequisites

| Requirement | Notes |
|-------------|-------|
| A Google account | The one your calendar lives on |
| App running (`python3 start.py`) | Orchestrator must be up |
| Internet connection | Required to reach the Google API |

---

## Part A — Create a Google Cloud project

You need a Google Cloud project to obtain OAuth credentials. If you already have one, skip to [Part B](#part-b--create-oauth-credentials).

1. Go to **[console.cloud.google.com](https://console.cloud.google.com)**
2. Sign in with your Google account
3. Click the project dropdown at the top → **New Project**
4. Fill in:
   - **Project name**: e.g. `Robo Desk Companion`
   - **Location**: leave as default
5. Click **Create** and wait a few seconds for it to be ready
6. Make sure the new project is selected in the dropdown at the top

### A1. Enable the Google Calendar API

1. In the left sidebar, go to **APIs & Services → Library**
2. Search for `Google Calendar API`
3. Click it → click **Enable**

---

## Part B — Create OAuth credentials

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. If prompted, click **Configure consent screen** first:
   - Choose **External** → **Create**
   - Fill in **App name** (e.g. `Robo`) and your email → **Save and Continue**
   - Skip Scopes → Skip Test users → **Back to Dashboard**
4. Back in Create OAuth client ID:
   - **Application type**: `Web application`
   - **Name**: e.g. `Robo OAuth`
   - Under **Authorized redirect URIs**, click **Add URI** and enter:
     ```
     https://developers.google.com/oauthplayground
     ```
5. Click **Create**
6. A dialog shows your **Client ID** and **Client Secret** — copy both and keep them safe

---

## Part C — Get an access token

You will use the [Google OAuth Playground](https://developers.google.com/oauthplayground) to exchange your credentials for an access token. This is a free Google tool designed for exactly this purpose.

### C1. Configure the Playground with your credentials

1. Go to **[developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)**
2. Click the **gear icon** (⚙) in the top right
3. Tick **Use your own OAuth credentials**
4. Enter your **Client ID** and **Client Secret** from Part B → close the panel

### C2. Authorize the Calendar scope

1. In the left panel, find **Google Calendar API v3**
2. Tick the scope:
   ```
   https://www.googleapis.com/auth/calendar.readonly
   ```
3. Click **Authorize APIs** (blue button)
4. A Google sign-in screen appears — sign in with your Google account
5. Click **Allow** when prompted

### C3. Exchange for tokens

1. You are returned to the Playground with an **Authorization code**
2. Click **Exchange authorization code for tokens** (blue button)
3. You receive an **Access token** and a **Refresh token**
4. Copy the **Access token** — it starts with `ya29.`

> **Access tokens expire after 1 hour.** For automatic renewal, also copy the **Refresh token** and your **Client ID / Client Secret** — the app can use these to refresh automatically (see [Part D](#part-d--configure-in-the-app)).

---

## Part D — Configure in the app

### D1. Configure via Settings UI (recommended)

1. Start the app: `python3 start.py`
2. Click the **⚙ gear icon** → **Agents** tab
3. Expand **Google Calendar**
4. Paste your **Access token** into the token field
5. Click **Test** — you should see: *"Connected — N events today"* (or *"no events today"*)
6. Toggle the switch to **enable** the agent

### D2. Configure via `.env` (alternative)

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

## Part E — Test it

### E1. Test today's events

Say to Robo:

> *"Hey Robo, what meetings do I have today?"*

Expected with events:

> *"3 events for Tuesday, June 24: 1. Team standup — 9:30 AM, 2. Lunch — 1:00 PM, 3. Sprint review — 4:00 PM."*

Expected with no events:

> *"No events on your calendar for today (Tuesday, June 24)."*

### E2. Test next event

Say:

> *"Hey Robo, when is my next appointment?"*

Expected:

> *"Next event: 'Team standup' at 9:30 AM."*

### E3. Test via Settings UI

1. Go to Settings → Agents → Google Calendar
2. Click **Test**
3. You should see a live event count for today

---

## 10. Voice commands

| What you say | What happens |
|---|---|
| *"What meetings do I have today?"* | Lists all events for today with times |
| *"What is on my calendar today?"* | Same as above |
| *"What is my schedule today?"* | Same as above |
| *"What is on my calendar this week?"* | Lists today's events (week view on roadmap) |
| *"When is my next appointment?"* | Returns the very next upcoming event |
| *"When is my next meeting?"* | Same as above |
| *"Do I have anything coming up?"* | Returns the next upcoming event |

**Intent routing:** if your speech contains `today`, `schedule`, `upcoming`, `this week`, or `week` — today's full schedule is returned. Anything else returns just the next event.

---

## 11. Troubleshooting

### "Not connected to Google"

```
Not connected to Google. Go to Settings → Agents → Google to connect your account.
```

- Open Settings → Agents → Google Calendar and paste your access token
- Or add `GOOGLE_ACCESS_TOKEN=ya29...` to `.env` and restart

### "Google access token expired"

```
Google access token expired. Please reconnect in Settings → Agents → Google.
```

Access tokens expire after 1 hour. Regenerate one:

1. Go back to [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)
2. The Playground may still have your session — click **Refresh access token** if you saved the refresh token
3. Or repeat [Part C](#part-c--get-an-access-token) to get a new access token
4. Paste the new token in Settings → Agents → Google Calendar

### "Google Calendar API error 403"

The Calendar API was not enabled, or your OAuth consent screen has not been verified.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Library
2. Confirm **Google Calendar API** is enabled
3. If your app is in "Testing" mode, add your Google account as a test user:
   - APIs & Services → OAuth consent screen → Test users → Add Users → add your email

### No events showing but I have meetings

- Confirm you signed in with the correct Google account during the OAuth Playground step
- The agent reads your **primary** calendar only — events on other calendars (e.g. shared team calendars) are not shown in the current version

---

## 12. Security notes

| What | How it is protected |
|------|-------------------|
| `GOOGLE_ACCESS_TOKEN` | Stored in `.env` or browser `localStorage`; never logged or shown in responses |
| API calls | Made server-side by the orchestrator over HTTPS — token not visible in browser network tabs |
| Scope | `calendar.readonly` — read-only access; the agent cannot create, modify, or delete events |
| Token lifetime | 1 hour; short expiry limits exposure if the token is ever leaked |

> The agent requests only `calendar.readonly` — it cannot modify your calendar in any way.
