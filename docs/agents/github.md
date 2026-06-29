# GitHub — MCP Gateway Tool

> **Gateway tool** — served by the MCP Gateway (`apps/mcp-gateway/`, port 8788), namespace `github`. Tools: `github__get_summary`, `github__get_pull_requests`, `github__get_notifications`, `github__get_workflow_status`, `github__get_issues`.

Monitor your pull requests, workflow runs, notifications, and assigned issues — all by voice.

**Navigation:** [← All tools](../agents.md) | [Architecture](../architecture.md) | [MCP Gateway](../mcp-gateway.md) | [Setup](../setup.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data flow](#3-data-flow)
4. [Prerequisites](#4-prerequisites)
5. [Part A — Create a Personal Access Token](#part-a--create-a-personal-access-token)
6. [Part B — Configure in the app](#part-b--configure-in-the-app)
7. [Part C — Test it](#part-c--test-it)
8. [Voice commands](#8-voice-commands)
9. [Troubleshooting](#9-troubleshooting)
10. [Security notes](#10-security-notes)

---

## 1. Overview

The GitHub agent lets you:

- **Check pull requests** — *"Do I have any pull requests to review?"*
- **Monitor CI/CD workflows** — *"Did any of my GitHub actions fail?"*
- **Read notifications** — *"Any GitHub notifications?"*
- **See assigned issues** — *"What GitHub issues are assigned to me?"*
- **Get a quick summary** — *"What is my GitHub status?"*

One credential is required: a **GitHub Personal Access Token** (PAT). Creating one is free and takes about 2 minutes.

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
│                                │  GitHub Agent                  │
│                                │  - routes intent by keywords   │
│                                │  - calls GitHub REST API       │
│                                │  - formats spoken summary      │
└────────────────────────────────│────────────────────────────────┘
                                 │  HTTPS (Bearer token)
                    ┌────────────▼───────────────┐
                    │     GitHub REST API v3      │
                    │    api.github.com           │
                    │                             │
                    │  /search/issues             │  ← PRs to review
                    │  /repos/{owner}/{repo}/     │  ← workflow runs
                    │    actions/runs             │
                    │  /notifications             │  ← unread alerts
                    │  /issues                    │  ← assigned issues
                    └─────────────────────────────┘
```

Your Personal Access Token is used only to make API calls server-side — it is never exposed in browser network logs.

---

## 3. Data flow

```
You say: "Do I have any pull requests to review?"
         │
         ▼
   Robo UI (STT) ──► Orchestrator ──► GitHub Agent
                                            │
                           Detects keyword: "pull request"
                                            │
                    GET /search/issues?q=is:pr+is:open+review-requested:@me
                                            │
                              GitHub API responds:
                              { total_count: 2, items: [...] }
                                            │
                    "2 PRs need your review —
                     'Fix login bug', 'Update README'."
                                            │
                         Orchestrator ──► Robo speaks the result
```

---

## 4. Prerequisites

| Requirement | Notes |
|-------------|-------|
| A GitHub account | Free at [github.com](https://github.com) |
| A Personal Access Token | Created in GitHub settings — steps below |
| App running (`python3 start.py`) | Orchestrator must be up |
| Internet connection | Required to reach the GitHub API |

---

## Part A — Create a Personal Access Token

GitHub offers two types of tokens. Use **Classic** if you are new to this — it is simpler and works with all agent features.

### Option A1 — Classic token (recommended)

1. Sign in to **[github.com](https://github.com)**
2. Click your profile picture (top right) → **Settings**
3. Scroll down the left sidebar to **Developer settings** (very bottom)
4. Click **Personal access tokens** → **Tokens (classic)**
5. Click **Generate new token** → **Generate new token (classic)**
6. GitHub may ask for your password — enter it
7. Fill in the form:
   - **Note**: e.g. `Robo desk companion`
   - **Expiration**: choose `90 days` or `No expiration` (no expiration is convenient but slightly less secure)
8. Select the following scopes:

   | Scope | Why it is needed |
   |-------|-----------------|
   | ✅ `repo` | Read pull requests and issues across your repositories |
   | ✅ `workflow` | Read GitHub Actions workflow run status |
   | ✅ `notifications` | Read unread GitHub notifications |

9. Click **Generate token** at the bottom
10. **Copy the token immediately** — it starts with `ghp_` and is shown **only once**

   > If you close this page without copying, you will need to delete the token and create a new one.

---

### Option A2 — Fine-grained token (optional, more restrictive)

Fine-grained tokens let you limit access to specific repositories. Use this if you want tighter control.

1. Go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. Click **Generate new token**
3. Fill in:
   - **Token name**: e.g. `Robo desk companion`
   - **Expiration**: up to 1 year
   - **Resource owner**: your account
   - **Repository access**: select **All repositories** or pick specific ones
4. Under **Permissions**:
   - **Repository permissions**:
     - Pull requests: **Read-only**
     - Actions: **Read-only**
     - Issues: **Read-only**
     - Metadata: **Read-only** (required)
   - **Account permissions**:
     - Notifications: **Read-only**
5. Click **Generate token** → copy it immediately

> Fine-grained tokens do **not** support the `notifications` scope on all account types. If notifications do not work, use the Classic token instead.

---

## Part B — Configure in the app

### B1. Configure via Settings UI (recommended)

1. Start the app: `python3 start.py`
2. Click the **⚙ gear icon** → **Agents** tab
3. Expand **GitHub**
4. Paste your token into the **Personal Access Token** field
5. Click **Test** — you should see: *"Connected — N PRs to review, M notifications"*
6. Toggle the switch to **enable** the agent

### B2. Configure via `.env` (alternative)

Open `apps/orchestrator/.env` (create it from `.env.example` if it does not exist):

```dotenv
# ── GitHub ────────────────────────────────────────────────────────
GITHUB_TOKEN=ghp_your-token-here
```

> **Security:** Never commit `.env`. It is already in `.gitignore`.

Restart the app after editing `.env`:

```bash
python3 start.py
```

---

## Part C — Test it

### C1. Startup check

When the agent comes online, it automatically fetches a quick summary. Watch the terminal — you should see something like:

```
GitHub agent boot: Connected — 2 PRs to review, 5 notifications
```

### C2. Test pull requests

Say to Robo:

> *"Hey Robo, do I have any pull requests to review?"*

Expected:

> *"2 PRs need your review — 'Fix login bug', 'Update README'."*

Or if nothing is pending:

> *"No pull requests awaiting your review. All clear!"*

### C3. Test workflow status

Say:

> *"Hey Robo, did any of my GitHub actions fail?"*

Expected if failures exist:

> *"1 failed workflow — 'CI' in my-repo."*

Expected if all green:

> *"No failed workflow runs in your recent repositories. All green!"*

### C4. Test notifications

Say:

> *"Hey Robo, any GitHub notifications?"*

Expected:

> *"5 unread notifications — 3 mention, 2 review_requested."*

### C5. Test assigned issues

Say:

> *"Hey Robo, what issues are assigned to me on GitHub?"*

Expected:

> *"2 open issues assigned to you — 'Broken login form', 'Update API docs'."*

---

## 8. Voice commands

| What you say | What happens |
|---|---|
| *"Do I have any pull requests to review?"* | Lists open PRs where you are a requested reviewer |
| *"Any PRs waiting for me?"* | Same as above |
| *"Did any GitHub actions fail?"* | Checks recent workflow runs in your last 5 pushed repos |
| *"What is my CI status?"* | Same as above |
| *"Any GitHub notifications?"* | Reads unread notification count grouped by type |
| *"Any GitHub alerts or mentions?"* | Same as above |
| *"What GitHub issues are assigned to me?"* | Lists open issues assigned to you |
| *"Any bugs assigned to me?"* | Same as above |
| *"What is my GitHub status?"* | Summary: PR count + notification count |
| *"GitHub summary"* | Same as above |

**Intent routing:** the agent detects intent by keywords in your speech — `pull request` / `pr` → PRs, `workflow` / `action` / `ci` → CI status, `notification` / `mention` → notifications, `issue` / `bug` → issues. Anything else returns the summary.

---

## 9. Troubleshooting

### "No token configured"

```
No token configured. Go to Settings → Agents → GitHub to add your Personal Access Token.
```

- Open Settings → Agents → GitHub and paste your token
- Or add `GITHUB_TOKEN=ghp_...` to `apps/orchestrator/.env` and restart

### "Token is invalid or expired"

```
Token is invalid or expired. Please update it in Settings → Agents → GitHub.
```

- The token may have expired — go to [github.com/settings/tokens](https://github.com/settings/tokens) and regenerate it
- Make sure you copied the full token (starts with `ghp_`) with no extra spaces
- Verify the token is still listed and not revoked at github.com/settings/tokens

### "Notifications access is blocked — add notifications scope"

```
Notifications access is blocked. Your GitHub token needs the "notifications" scope.
```

- Your token was created without the `notifications` scope
- Go to [github.com/settings/tokens](https://github.com/settings/tokens) → click your token → tick `notifications` → regenerate
- Update the token in the app Settings

### Workflow check returns no results

- The agent checks your 5 most recently pushed repositories only
- If your repos have workflows disabled or no recent runs, nothing is returned — this is expected
- Check Actions manually at github.com to confirm whether failures exist

### "Could not reach GitHub"

- Check your internet connection
- GitHub may be having an outage — check [githubstatus.com](https://www.githubstatus.com)
- The API has rate limits: 5000 requests/hour for authenticated users. Unlikely to be hit in normal use.

### PRs not showing up

- The agent only shows PRs where **you are a requested reviewer** (`review-requested:@me`)
- PRs you authored or are watching but not requested for will not appear
- Check [github.com/pulls](https://github.com/pulls) to confirm the PRs exist under your review queue

---

## 10. Security notes

| What | How it is protected |
|------|-------------------|
| `GITHUB_TOKEN` | Stored in `.env` on the server or browser `localStorage`; never logged or shown in responses |
| API calls | Made server-side by the orchestrator over HTTPS — token is not visible in browser network tabs |
| Token scopes | Only `repo`, `workflow`, `notifications` — no write access needed; the agent only reads data |
| Fine-grained tokens | Supported — restrict to specific repos for tighter control |

> Use the minimum scopes you need. If you only use PR and issue queries, you can omit `notifications` from the token scope and that feature will return a clear error instead of silently failing.
