# Portfolio Agent

Connect to your INDmoney account via MCP and query your investments by voice.

**Navigation:** [← Agents index](../agents.md) | [Setup guide](../setup.md) | [Architecture](../architecture.md)

---

## What it does

The Portfolio agent connects to the INDmoney MCP server at `https://mcp.indmoney.com/mcp` and lets you:

- Check current equity holdings and their values
- Get portfolio P&L and overall return
- View mutual fund investments and SIP details
- See your watchlist
- Review recent buy/sell transactions

---

## Prerequisites

- An active INDmoney account (login credentials — no API key or developer account needed)

---

## Setup

Open **Settings → Agents → Portfolio** and click **Connect with INDmoney**. That is all.

Behind the scenes, the app:

1. **Registers itself** with INDmoney's MCP auth server via Dynamic Client Registration (RFC 7591). A `client_id` and `client_secret` are issued automatically and saved to your device's local storage.
2. **Opens a sign-in popup** to `https://mcp.indmoney.com/authorize` where you log in with your normal INDmoney credentials.
3. **Exchanges the authorisation code** for an access token and refresh token using PKCE (no password is ever stored).
4. Marks the agent as **Connected** and enables it for the next session.

> Credentials are stored exclusively in browser `localStorage` on your device — never in source files, `.env` files, or sent anywhere except INDmoney's own OAuth endpoints.

### Token refresh

Access tokens expire. Click **Refresh token** in the Portfolio settings to silently obtain a new one using the stored refresh token. The app will also remind you when the token is near expiry.

### Disconnect

Click **Disconnect** to clear all stored tokens and credentials. The agent will return to the idle state and de-register from active sessions.

---

## Voice commands

| Command | What happens |
|---------|-------------|
| *"Show my portfolio holdings"* | Lists equity holdings with quantities and current values |
| *"What is my total portfolio value?"* | Returns invested value vs current value |
| *"What is my P&L?"* | Returns profit/loss breakdown |
| *"List my mutual funds"* | Shows MF holdings and SIP details |
| *"What is on my watchlist?"* | Returns tracked instruments |
| *"Any recent transactions?"* | Shows latest buy/sell activity |
| *"Give me a portfolio summary"* | Full overview — spoken on boot when the agent is enabled |

---

## How it works

### Auth flow (OAuth 2.0 + PKCE)

```
App                         INDmoney MCP Auth Server
 │                                    │
 │── POST /register ─────────────────>│  Dynamic Client Registration (RFC 7591)
 │<─ { client_id, client_secret } ────│
 │                                    │
 │── Open popup: /authorize ─────────>│  PKCE authorisation request
 │   (user signs in interactively)    │
 │<─ redirect: /?code=... ────────────│
 │                                    │
 │── POST /token ─────────────────────│  Code exchange (client_secret_post)
 │<─ { access_token, refresh_token } ─│
```

### MCP queries

Once authenticated, each voice query hits the MCP server:

1. On boot, `initialize` completes the MCP handshake
2. `tools/list` discovers what capabilities INDmoney exposes
3. Each query is keyword-routed to the most relevant tool
4. Results are formatted and spoken back using the **Fable** voice

Because tools are discovered dynamically, the agent adapts if INDmoney adds or changes capabilities without requiring a code update.

### Known endpoints

| Purpose | URL |
|---------|-----|
| OAuth metadata | `https://mcp.indmoney.com/.well-known/oauth-authorization-server` |
| Authorization | `https://mcp.indmoney.com/authorize` |
| Token | `https://mcp.indmoney.com/token` |
| Registration | `https://mcp.indmoney.com/register` |
| MCP server | `https://mcp.indmoney.com/mcp` |
| Scopes | `portfolio:read market:read` |

---

## Advanced — manual OAuth endpoints

If INDmoney changes their endpoint URLs, expand **Advanced — Manual OAuth endpoints** in the Portfolio settings and enter the new `authorization_endpoint` and `token_endpoint` URLs directly. These override auto-discovery.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| "Registration failed" on connect | INDmoney registration endpoint down | Retry; check `https://mcp.indmoney.com/register` is reachable |
| Popup opens then closes without connecting | Popup blocked by browser | Allow popups for this origin in your browser settings |
| `invalid_request` in redirect | Stale `client_id` in storage | Disconnect and reconnect — a fresh registration runs automatically |
| "Token exchange failed" | `client_secret` mismatch | Disconnect, reconnect to re-register and get a fresh secret |
| "Not configured" at boot | Not connected or tokens cleared | Open Settings → Portfolio and connect again |
| "No data found" on a query | Tool not exposed by INDmoney | Some data may require additional INDmoney account permissions |

---

## Security

- `client_id`, `client_secret`, `access_token`, and `refresh_token` are stored in browser `localStorage` only — never committed to git or written to disk
- OAuth uses PKCE (`S256`) — the authorisation code is useless without the per-session code verifier
- No password is ever stored or transmitted by this app
- Revoke access at any time from your INDmoney account's authorised applications page

---

## Environment variable fallback

For headless or server-side use, the orchestrator falls back to `.env` values when no session token is present:

```
# apps/orchestrator/.env
INDMONEY_MCP_ENDPOINT=https://mcp.indmoney.com/mcp
INDMONEY_TOKEN=your_access_token_here
```

UI-configured OAuth tokens always take precedence over `.env` values for an active session.
