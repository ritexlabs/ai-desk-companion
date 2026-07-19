# Agents & Gateway Tools

Robo handles voice commands through two layers: **local agents** running inside the orchestrator, and **gateway tools** served by the MCP Gateway.

**Navigation:** [← Home](../README.md) | [Architecture](architecture.md) | [Setup](setup.md) | [API](api.md)

---

## Gateway tools

These tools are served by the **MCP Gateway** (`apps/mcp-gateway/`, port 8788). The gateway aggregates them into a single tool list exposed to the LLM. No per-agent boot messages — the gateway reports all tools as online or degraded in a single health check.

| Tool | Namespace | Credentials needed | Detailed guide |
|---|---|---|---|
| **Weather** | `weather` | Optional — works free without any key | [Full guide →](agents/weather.md) |
| **Google Calendar** | `google` | Google OAuth access token (`calendar.readonly`) | [Full guide →](agents/calendar.md) |
| **Gmail** | `google` | Google OAuth access token (`gmail.readonly`) | [Full guide →](agents/gmail.md) |
| **GitHub** | `github` | Personal Access Token (`repo`, `workflow`, `notifications`) | [Full guide →](agents/github.md) |
| **Stock Market** | `stocks` | None — uses Yahoo Finance (free) | [Full guide →](agents/stock.md) |
| **News** | `news` | GNews API key (free, 100 req/day) | [Full guide →](agents/news.md) |
| **Portfolio** | `indmoney` | INDmoney account (OAuth — no API key needed) | [Full guide →](agents/portfolio.md) |
| **System** | `system` | None — reads local psutil data | [Full guide →](agents/system.md) |

---

## Local agents

These agents run directly inside the orchestrator. They appear individually in the boot roster.

| Agent | Boot check | Credentials needed | Detailed guide |
|---|---|---|---|
| **Smart Home** | Yes (`__boot__`) | Home Assistant URL + Long-Lived Access Token | [Full guide →](agents/smarthome.md) |
| **WhatsApp** | Yes (`__boot__`) | Meta app credentials + Cloudflare Tunnel | [Full guide →](agents/whatsapp.md) |

---

## Built-in skills

Always active — no credentials, no toggle. Exposed as tools to the LLM alongside all configured agents.

| Skill | What it does | Detailed guide |
|---|---|---|
| **Web Search** | Live DuckDuckGo search for current facts and recent events | [Full guide →](agents/websearch.md) |
| **Calculator** | Precise arithmetic, percentages, tips, unit formulas, trig | [Full guide →](agents/calculator.md) |
| **Memory** | Store and recall personal notes, preferences, and reminders | [Full guide →](agents/memory.md) |
| **Briefing** | One-command morning summary — calls gateway tools in parallel | [Full guide →](agents/briefing.md) |

---

## How intent routing works

### Tier 1 — LLM tool calling (when an LLM is configured)

On every turn the orchestrator:

1. Calls `GET /tools` on the MCP Gateway to get the current namespaced tool list.
2. Merges local agent tools (smarthome, websearch, etc.) with gateway tools.
3. Sends the full tool list to the LLM alongside the user message.
4. The LLM returns a `tool_call` with the selected tool name and arguments.
5. If the tool name contains `__` it is routed to the gateway (`POST /tools/{name}`).
   Otherwise it is dispatched to the local agent.
6. The result is sent back to the LLM for synthesis into a spoken response.

### Tier 2 — Keyword fallback (when no LLM is configured)

| Keywords / phrases | Routes to |
|---|---|
| weather, temperature, rain, forecast, humidity, wind | Weather (gateway) |
| calendar, meeting, schedule, appointment, event | Google Calendar (gateway) |
| email, mail, inbox, unread, sender | Gmail (gateway) |
| what time, current time, what day, today | System (gateway) |
| system, cpu, battery, memory, ram, uptime | System (gateway) |
| stock, share, nifty, sensex, s&p, rsi | Stock Market (gateway) |
| github, repo, pull request, pr, issue, commit | GitHub (gateway) |
| news, headline, breaking news, latest news | News (gateway) |
| portfolio, holdings, invested, mutual fund, sip | Portfolio (gateway) |
| light, switch, fan, lock, thermostat, smart home, turn on/off | Smart Home (local) |
| whatsapp, message, send whatsapp | WhatsApp (local) |
| _(anything else)_ | General AI (local) |

---

## System info tool

No configuration required. Reads CPU, memory, battery, temperature, disk, and OS data locally using `psutil` — no internet connection needed.

- Zero credentials, zero setup — always online when the gateway is running
- Voice commands: *"What is my CPU usage?"*, *"How much battery do I have?"*, *"What time is it?"*

---

## Weather tool

Works out of the box with no API key (Open-Meteo, free). Add an OpenWeatherMap or WeatherAPI key for richer data.

- No key needed: uses Open-Meteo (free, worldwide, no account)
- Optional: OpenWeatherMap free tier (1000 req/day) or WeatherAPI free tier (1M req/month)
- Set a default city so *"What is the weather?"* always shows your home city

---

## Google Calendar tool

Check today's schedule and upcoming meetings by voice.

- Requires a Google OAuth 2.0 access token with scope `calendar.readonly`
- Same token as Gmail — authorize both scopes together to avoid doing setup twice

---

## Gmail tool

Check unread emails and important messages by voice.

- Requires a Google OAuth 2.0 access token with scope `gmail.readonly`
- Shares the same token as Google Calendar

---

## GitHub tool

Monitor pull requests, CI/CD workflows, notifications, and assigned issues by voice.

- Requires a GitHub Personal Access Token with scopes: `repo`, `workflow`, `notifications`
- Voice commands: *"Any PRs to review?"*, *"Did any GitHub actions fail?"*, *"Any notifications?"*

---

## Stock Market tool

Live prices, RSI, moving averages — for Indian and US markets, no API key needed.

- No API key — uses Yahoo Finance (`yfinance`)
- Indian market: built-in aliases for Nifty 50, Sensex, Bank Nifty, and 30+ large-cap NSE stocks

---

## News tool

Top headlines from 50+ countries — powered by GNews.

- Requires a GNews API key — free tier: 100 requests/day, no credit card
- Signup at gnews.io takes about 1 minute

---

## Smart Home agent

Voice control for your Home Assistant setup — lights, locks, climate, scenes.

- Requires Home Assistant URL + a Long-Lived Access Token
- Docker must be running — uses the `voska/hass-mcp` MCP bridge container

---

## WhatsApp agent

Send and receive WhatsApp messages by voice using the Meta Cloud API.

- Requires a Meta Developer account + a WhatsApp app (free)
- Requires `cloudflared` for the webhook tunnel

---

## Portfolio tool

Connect to your INDmoney account to query equity holdings, mutual funds, P&L, and transactions by voice.

- No API key or developer portal needed — click **Connect with INDmoney** and sign in
- Uses OAuth 2.0 + PKCE with Dynamic Client Registration (RFC 7591)

---

## Built-in Skills

### Web Search

Searches the live web via DuckDuckGo Instant Answer API.

- No API key or account — completely free
- Voice commands: *"What is the current gold price?"*, *"Who is the CEO of Apple?"*

### Calculator

Evaluates math expressions using Python's AST evaluator — no `eval()`.

- Supports: arithmetic, percentages, tips, trig, logarithms, factorials, pi, e
- Voice commands: *"What is 18% tip on 850?"*, *"Square root of 1764"*

### Memory

Persists key-value notes to `apps/orchestrator/data/user_memory.json` — survives restarts.

- Three intents: **remember** (store), **recall** (retrieve), **forget** (delete)
- Voice commands: *"Remember wife anniversary is June 15"*, *"What is my anniversary?"*

### Briefing

Queries weather, calendar, news, and smart home in parallel via the gateway and merges results.

- Skips services not configured — adapts to whatever is connected
- Voice commands: *"Give me my morning briefing"*, *"What's happening today?"*

---

## Credentials security model

| Where stored | Scope | Notes |
|---|---|---|
| Browser `localStorage` | Client-side, sandboxed to origin | Never written to disk |
| WebSocket session payload | In-memory, discarded after session | Not persisted server-side |
| Orchestrator `.env` | Server-side only, never committed | Used as fallback defaults |

Keys entered in the UI are not written to any server file. The orchestrator uses them only for the active session, forwarding them per tool call to the gateway.

## Graceful degradation

Every gateway tool returns a clear message when credentials are missing or the upstream is unavailable. All other tools continue working. Credentials can be added at any time without restarting the app.
