# Agent Configuration

Robo Wake-Up routes voice commands to specialised agents. This guide explains how to configure each agent and what credentials are required.

---

## How intent routing works

The orchestrator determines which agent should handle each command using a two-tier strategy.

### Tier 1 — LLM classifier (when an LLM is configured)

The same LLM you configure for AI responses is used to classify intent before dispatching to an agent. A compact system prompt describing each enabled agent is sent alongside the user's message; the LLM returns a JSON decision:

```json
{"agent": "calendar", "reason": "user asking about upcoming meetings"}
```

- Temperature is fixed at `0.0` for deterministic, repeatable routing
- Only enabled agents are listed — the LLM cannot route to an agent you haven't turned on
- If the LLM call fails or returns an unknown agent name, the system falls back silently to keyword matching

This approach handles paraphrases, ambiguous phrasing, and voice-to-text variations without any keyword tuning.

### Tier 2 — Keyword fallback (always active)

Used when no LLM is configured, or as a safety net if the LLM path fails:

| Keywords / phrases | Agent |
|--------------------|-------|
| weather, temperature, rain, forecast, humidity, wind | Weather |
| calendar, meeting, meetings, schedule, appointment, event, free slot | Google Calendar |
| email, mail, inbox, unread, sender, message | Gmail |
| what time, what is the time, current time, what day, today… | System |
| system, cpu, battery, memory, ram, health, os, uptime | System |
| stock, share, nifty, sensex, s&p, rsi, moving average… | Stock Market |
| github, repo, pull request, pr, issue, commit, workflow | GitHub |
| news, headline, breaking news, latest news, current events | News |
| light, switch, fan, lock, cover, blind, curtain, thermostat, climate, scene, smart home, home assistant, device, turn on, turn off | Smart Home |
| _(anything else)_ | General AI |

---

## System Agent

**No configuration required.** Reads OS, CPU, battery, and memory data directly from the Python `platform` module and browser vitals.

Example commands:
- "What is my CPU usage?"
- "How much memory is available?"
- "What operating system am I running?"

---

## Weather Agent

**Credential needed:** OpenWeatherMap **or** WeatherAPI key.

### Get an OpenWeatherMap key

1. Go to openweathermap.org/api and create a free account
2. Navigate to **API keys** and copy your default key
3. Free tier includes current weather and 5-day forecast

### Get a WeatherAPI key

1. Go to weatherapi.com and create a free account
2. Copy the API key from your dashboard
3. Free tier includes current weather and forecast

### Configure via Settings UI

1. Gear icon **⚙** → **Agents** tab
2. Expand **Weather**
3. Select provider: `openweathermap` or `weatherapi`
4. Enter your API key
5. Set a default city (used when no location is mentioned)
6. Click **Test** to verify

### Configure via `.env` (server-level default)

```dotenv
WEATHER_API_KEY=your-key-here
WEATHER_PROVIDER=openweathermap   # or weatherapi
WEATHER_DEFAULT_CITY=San Francisco
```

Example commands:
- "What is the weather in London?"
- "Will it rain tomorrow?"
- "What is the humidity right now?"

---

## GitHub Agent

**Credential needed:** GitHub Personal Access Token.

### Create a Personal Access Token

1. Go to github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Give it a name (e.g. "Robo Wake-Up")
4. Select scopes:
   - `repo` — access to repositories, pull requests, issues
   - `workflow` — access to GitHub Actions workflow status
   - `notifications` — access to notifications
5. Click **Generate token** and copy it (starts with `ghp_`)

> The token is shown only once. Copy it immediately.

### Configure via Settings UI

1. Gear icon **⚙** → **Agents** tab
2. Expand **GitHub**
3. Paste your Personal Access Token
4. Click **Test** to verify

### Configure via `.env` (server-level default)

```dotenv
GITHUB_TOKEN=ghp_your-token-here
```

Example commands:
- "Do I have any open pull requests?"
- "What is the status of my GitHub workflows?"
- "Show me my latest GitHub notifications"
- "Are there any issues assigned to me?"

---

## Google Calendar Agent

**Credential needed:** Google OAuth2 access token.

### Set up Google OAuth

1. Go to console.cloud.google.com
2. Create a new project (or select an existing one)
3. Enable the **Google Calendar API**:
   - Search "Google Calendar API" in the API Library
   - Click **Enable**
4. Create OAuth credentials:
   - Go to **APIs & Services → Credentials**
   - Click **Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorised redirect URIs: `http://localhost:5173`
   - Click **Create** and copy the **Client ID** and **Client Secret**
5. Configure the OAuth consent screen if prompted:
   - User type: **External**
   - Add your email as a test user

### Get an access token

For local development, use the Google OAuth Playground:
1. Go to developers.google.com/oauthplayground
2. In the scope selector, find and select **Google Calendar API v3** → `https://www.googleapis.com/auth/calendar.readonly`
3. Click **Authorize APIs** and sign in with your Google account
4. Click **Exchange authorization code for tokens**
5. Copy the **Access token** (`ya29...`)

> Access tokens expire after 1 hour. For long sessions, also copy the **Refresh token** and provide your Client ID/Secret.

### Configure via Settings UI

1. Gear icon **⚙** → **Agents** tab
2. Expand **Google Calendar**
3. Enter the access token (and optionally refresh token + client credentials)
4. Click **Test** to verify

Example commands:
- "What meetings do I have today?"
- "When is my next appointment?"
- "What is on my calendar this week?"

---

## Gmail Agent

**Credential needed:** Google OAuth2 access token with Gmail scope.

### Set up Gmail API access

Follow the same Google OAuth setup as Calendar (above), but enable the **Gmail API** instead (or in addition):

1. In the Google Cloud Console, enable the **Gmail API**
2. In the OAuth Playground, select the Gmail scope:
   - `https://www.googleapis.com/auth/gmail.readonly`
3. Authorize and copy the access token

> If you want both Calendar and Gmail access, select both scopes before authorizing.

### Configure via Settings UI

1. Gear icon **⚙** → **Agents** tab
2. Expand **Gmail**
3. Enter the access token
4. Click **Test** to verify

Example commands:
- "Do I have any unread emails?"
- "Who sent me emails today?"
- "What is in my inbox?"

---

## Stock Market Agent

**No API key required.** Uses Yahoo Finance (via `yfinance`) — free, no account needed.

### What it provides

- Current price, day change and percentage
- RSI(14) — momentum indicator with overbought/oversold signal
- SMA(20) and SMA(50) — trend direction (uptrend / downtrend / consolidating)
- Support and resistance levels from recent price history
- 52-week high/low range

### Indian market support

Indian indices and stocks are supported natively:

| Say | Resolves to |
|-----|-------------|
| Nifty / Nifty 50 | `^NSEI` |
| Sensex | `^BSESN` |
| Bank Nifty | `^NSEBANK` |
| RELIANCE, TCS, INFY, HDFC Bank… | `.NS` suffix added automatically |
| Any NSE ticker (e.g. WIPRO) | `WIPRO.NS` |

### Configure via Settings UI

1. Gear icon **⚙** → **Agents** tab
2. Expand **Stock Market Agent**
3. Set **Default Market**:
   - **India (NSE)** — appends `.NS` to unrecognised tickers (default)
   - **United States** — treats bare tickers as NYSE/NASDAQ symbols

### Configure via `.env` (server-level default)

```dotenv
STOCK_DEFAULT_MARKET=IN    # IN or US
```

### Example commands

```
What is the Nifty 50 price?
How is Sensex doing?
Show me Reliance stock
RSI for TCS
Support and resistance for HDFC Bank
Bank Nifty momentum
INFY analysis
AAPL price
```

### Supported tickers

Any ticker symbol that Yahoo Finance supports works — pass it directly or use a common name:

- **NSE stocks** — `RELIANCE`, `TCS`, `INFY`, `WIPRO`, `SBI`, `ICICI`, `HDFC Bank`, etc.
- **BSE stocks** — append `.BO` suffix (e.g. `RELIANCE.BO`)
- **US stocks** — `AAPL`, `MSFT`, `GOOGL`, `TSLA`, etc.
- **US indices** — `^GSPC` (S&P 500), `^DJI` (Dow Jones), `^IXIC` (NASDAQ)
- **Indian indices** — `^NSEI`, `^BSESN`, `^NSEBANK`, `^CNXIT`

---

## News Agent

**Credential needed:** NewsAPI.org API key (free tier — 100 requests/day).

### Get a NewsAPI key

1. Go to newsapi.org and create a free account
2. Copy the API key from your dashboard

> The free developer plan works from `localhost`. Deploying to a public server requires a paid plan.

### Configure via Settings UI

1. Gear icon **⚙** → **Agents** tab
2. Expand **News Agent**
3. Enter your NewsAPI key
4. Select a **Country** from the dropdown (used for top-headline queries)
5. Optionally enter a **State** or **City** to localise results further
6. Click **Test** to verify

### Configure via `.env` (server-level default)

```dotenv
NEWS_API_KEY=your-newsapi-key
NEWS_DEFAULT_COUNTRY=in    # ISO 3166-1 alpha-2 code — in, us, gb, au, ca, de, fr, jp…
```

### What it provides

- **Generic queries** — top headlines from the configured country/region via `/top-headlines`
- **Topic queries** — searches for articles on a specific subject via `/everything`
- **Boot confirmation** — shows 2 headlines when the agent starts

### Example commands

```
What are the latest news headlines?
What is happening in the world?
Give me today's top stories in India
Any news about the stock market?
Latest news about AI
Headlines from Mumbai
```

---

## General AI Agent

See [llm-setup.md](llm-setup.md) for full setup instructions.

The General AI agent uses the configured LLM to answer open-ended questions, generate text, or handle commands that don't match any other agent.

Example commands:
- "Write me a haiku about coffee"
- "Explain quantum computing in simple terms"
- "What is the capital of Iceland?"

---

## Smart Home Agent

**Credentials needed:** Home Assistant URL and a Long-Lived Access Token.
**Additional prerequisite:** Docker must be installed and running — the agent uses the `voska/hass-mcp` container to communicate with Home Assistant over MCP (Model Context Protocol).

### Prerequisites

- Home Assistant running and reachable on your local network
- Docker Desktop (or Docker Engine) installed and running
- The agent pulls `voska/hass-mcp:latest` automatically on first use — no manual `docker pull` needed

### Get a Home Assistant Long-Lived Access Token

1. Open your Home Assistant web interface
2. Click your username (bottom-left) → **Profile**
3. Scroll to **Long-lived access tokens** at the bottom
4. Click **Create Token**, give it a name (e.g. "Robo"), copy it immediately — it is shown only once

### Configure via Settings UI

1. Gear icon **⚙** → **Agents** tab
2. Expand **Smart Home**
3. Enter your Home Assistant URL (e.g. `http://homeassistant.local:8123` or `http://192.168.1.x:8123`)
4. Paste your Long-Lived Access Token
5. Click **Test Connection** — it should show "Connected to [your home name]"
6. Toggle **Enable** to add it to the active agent roster

### Configure via `.env` (server-level default)

```dotenv
MYHOME_MCP_ENDPOINT=http://homeassistant.local:8123
MYHOME_MCP_TOKEN=eyJhbGciOiJIUzI1NiIsInR5...
```

### What it controls

| Domain | Capabilities |
|--------|-------------|
| Lights | Turn on/off, dim, set brightness %, change color |
| Switches & plugs | Turn on/off |
| Fans | Turn on/off |
| Covers (blinds, curtains, shutters) | Open/close |
| Locks | Lock/unlock |
| Climate / Thermostat | Turn on/off, set temperature |
| Scenes | Activate by name |
| Sensors & binary sensors | Read state (temperature, humidity, motion, etc.) |

### Dashboard

When the Smart Home agent is online, click its pill in the **Online Agents** panel to open a detail popup, then click **Dashboard** to open the full Smart Home Dashboard — an animated live view of all devices with real-time controls.

The dashboard auto-refreshes every 8 seconds and groups devices by type (Lights, Switches, Climate, etc.).

### Example voice commands

```
Turn on the lights
Switch off light 1
Set living room brightness to 50%
Turn the kitchen lights red
What lights are on in my room?
Lock the front door
Set thermostat to 22 degrees
Activate the movie scene
Turn off all fans
```

### How it works (technical)

The agent runs `voska/hass-mcp` as a Docker subprocess over MCP JSON-RPC 2.0. A single long-lived Docker process is shared per (HA URL, token) pair and restarted automatically if it exits. All device control goes through `call_service_tool` — Home Assistant's native service calls — so it works with any HA-compatible device without requiring entity IDs.

---

## Credentials security model

| Where | Storage | Scope |
|-------|---------|-------|
| Settings UI → browser `localStorage` | Client-side only, sandboxed to origin | Per browser / device |
| WebSocket `start_session` payload | In-memory, discarded after session | Per session |
| Orchestrator `.env` | Server-side, never committed to git | Server default |

Keys entered in the UI are never written to any file on disk. The orchestrator uses them only during the active session and does not persist them.

---

## Graceful degradation

If an agent's credential is missing or invalid, it returns a helpful message instead of crashing:

```
"Weather agent is not configured. Please add your API key in Settings → Agents → Weather."
```

The other agents continue working normally. You can add keys at any time without restarting the app.
