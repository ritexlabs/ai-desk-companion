# Agent Configuration

Robo routes voice commands to specialised agents. Each agent has its own setup guide.

**Navigation:** [← Home](../README.md) | [Architecture](architecture.md) | [Setup](setup.md) | [API](api.md)

---

## Agent index

### Configurable agents

These agents connect to external services and require credentials.

| Agent | Credentials needed | Detailed guide |
|-------|-------------------|----------------|
| **System** | None | **[Full guide →](agents/system.md)** |
| **Weather** | Optional — works free without any key | **[Full guide →](agents/weather.md)** |
| **Google Calendar** | Google OAuth token (`calendar.readonly`) | **[Full guide →](agents/calendar.md)** |
| **Gmail** | Google OAuth token (`gmail.readonly`) | **[Full guide →](agents/gmail.md)** |
| **GitHub** | Personal Access Token (`repo`, `workflow`, `notifications`) | **[Full guide →](agents/github.md)** |
| **Stock Market** | None — uses Yahoo Finance (free) | **[Full guide →](agents/stock.md)** |
| **News** | GNews API key (free, 100 req/day) | **[Full guide →](agents/news.md)** |
| **Smart Home** | Home Assistant URL + Long-Lived Access Token | **[Full guide →](agents/smarthome.md)** |
| **WhatsApp** | Meta app credentials + Cloudflare Tunnel | **[Full guide →](agents/whatsapp.md)** |
| **Portfolio** | INDmoney account (OAuth — no API key needed) | **[Full guide →](agents/portfolio.md)** |
| [General AI](#general-ai-agent) | LLM API key | [AI settings →](configuration/ai.md) |

### Built-in skills

These skills are **always active on every session** — no credentials, no setup, no toggle required. They appear in the boot roster and are exposed as tools to the LLM orchestrator alongside all configured agents.

| Skill | What it does | Detailed guide |
|-------|-------------|----------------|
| **Web Search** | Live DuckDuckGo search for current facts and recent events | **[Full guide →](agents/websearch.md)** |
| **Calculator** | Precise arithmetic, percentages, tips, unit formulas, trig | **[Full guide →](agents/calculator.md)** |
| **Memory** | Store and recall personal notes, preferences, and reminders | **[Full guide →](agents/memory.md)** |
| **Briefing** | One-command morning summary from all connected agents | **[Full guide →](agents/briefing.md)** |

---

## How intent routing works

The orchestrator uses a two-tier strategy to decide which agent handles each command.

### Tier 1 — LLM classifier (when an LLM is configured)

The configured LLM classifies intent before dispatching. A compact system prompt listing only enabled agents is sent alongside the user's message; the LLM returns:

```json
{"agent": "calendar", "reason": "user asking about upcoming meetings"}
```

- Temperature fixed at `0.0` for deterministic routing
- Only enabled agents are included — the LLM cannot route to an unconfigured agent
- Falls back silently to keyword matching on failure

### Tier 2 — Keyword fallback (always active)

| Keywords / phrases | Agent |
|--------------------|-------|
| weather, temperature, rain, forecast, humidity, wind | Weather |
| calendar, meeting, schedule, appointment, event, free slot | Google Calendar |
| email, mail, inbox, unread, sender | Gmail |
| what time, current time, what day, today | System |
| system, cpu, battery, memory, ram, uptime | System |
| stock, share, nifty, sensex, s&p, rsi, moving average | Stock Market |
| github, repo, pull request, pr, issue, commit, workflow | GitHub |
| news, headline, breaking news, latest news | News |
| light, switch, fan, lock, thermostat, climate, smart home, turn on, turn off | Smart Home |
| whatsapp, message, send whatsapp, any messages | WhatsApp |
| portfolio, holdings, invested, investment, mutual fund, sip, watchlist | Portfolio |
| _(anything else)_ | General AI |

> **Note on built-in skills:** Web Search, Calculator, Memory, and Briefing are exposed as LLM tools directly — the orchestrator's LLM tier picks them based on intent (e.g. a calculation query → Calculator, a "morning briefing" query → Briefing). There are no keyword fallback rules for skills because the LLM routing is reliable enough and these skills serve open-ended intents that keyword rules cannot cleanly capture.

---

## System Agent

No configuration required. Reads CPU, memory, battery, temperature, disk, and OS data locally using `psutil` — no internet connection needed.

**→ [Full setup guide](agents/system.md)** — covers temperature setup, all voice commands, and troubleshooting.

**Quick summary:**
- Zero credentials, zero setup — always online when the app is running
- Reads: CPU %, per-core breakdown, RAM, swap, disk, battery, top processes, time/date, OS info
- Temperature reading is automatic on Linux; on macOS install `osx-cpu-temp` for direct CPU temp
- Voice commands: *"What is my CPU usage?"*, *"How much battery do I have?"*, *"What time is it?"*

---

## Weather Agent

Works out of the box with no API key (Open-Meteo, free). Add an OpenWeatherMap or WeatherAPI key for richer data including feels-like temperature.

**→ [Full setup guide](agents/weather.md)** — covers all three providers, free account setup, and troubleshooting.

**Quick summary:**
- No key needed: uses Open-Meteo (free, worldwide, no account)
- Optional: OpenWeatherMap free tier (1000 req/day) or WeatherAPI free tier (1M req/month)
- Set a default city so *"What is the weather?"* always shows your home city
- Voice commands: *"What is the weather in London?"*, *"How hot is it in Tokyo?"*, *"Humidity in Mumbai?"*

---

## Google Calendar Agent

Check today's schedule and upcoming meetings by voice using Google Calendar API.

**→ [Full setup guide](agents/calendar.md)** — covers Google Cloud project creation, OAuth credentials, token generation via OAuth Playground, and troubleshooting.

**Quick summary:**
- Requires a Google OAuth 2.0 access token with scope `calendar.readonly`
- Same token as Gmail — authorize both scopes together to avoid doing setup twice
- Reads primary calendar only; tokens expire after 1 hour (regenerate via OAuth Playground)
- Voice commands: *"What meetings do I have today?"*, *"When is my next appointment?"*

---

## Gmail Agent

Check unread emails and important messages by voice.

**→ [Full setup guide](agents/gmail.md)** — covers enabling the Gmail API, getting a token with the right scope, and troubleshooting.

**Quick summary:**
- Requires a Google OAuth 2.0 access token with scope `gmail.readonly`
- Shares the same token as Google Calendar — authorize both scopes in one OAuth Playground session
- Reads subject lines only — email body content is never fetched
- Voice commands: *"Do I have any unread emails?"*, *"Any urgent emails?"*, *"What is in my inbox?"*

---

## GitHub Agent

Monitor pull requests, CI/CD workflows, notifications, and assigned issues by voice.

**→ [Full setup guide](agents/github.md)** — covers Classic and Fine-grained token creation, required scopes, configuration, and troubleshooting.

**Quick summary:**
- Requires a GitHub Personal Access Token with scopes: `repo`, `workflow`, `notifications`
- Classic token: takes 2 minutes, works with all features
- Fine-grained token: optional, restrict to specific repositories for tighter control
- Voice commands: *"Any PRs to review?"*, *"Did any GitHub actions fail?"*, *"Any GitHub notifications?"*, *"Issues assigned to me?"*

---

## Stock Market Agent

Live prices, RSI, moving averages, support/resistance — for Indian and US markets, no API key needed.

**→ [Full setup guide](agents/stock.md)** — covers package installation, Indian stock aliases, default market config, and troubleshooting.

**Quick summary:**
- No API key or account — uses Yahoo Finance via the `yfinance` Python package
- Install once: `pip install yfinance pandas numpy`
- Indian market: built-in aliases for Nifty 50, Sensex, Bank Nifty, and 30+ large-cap NSE stocks
- Returns: price, day change, RSI(14), SMA20/50 with trend, support/resistance, 52-week range
- Voice commands: *"What is the Nifty 50?"*, *"How is Reliance doing?"*, *"RSI for TCS"*, *"AAPL price"*

---

## News Agent

Top headlines and topic search from 50+ countries — powered by GNews.

**→ [Full setup guide](agents/news.md)** — covers GNews signup, API key, country/city config, and troubleshooting.

**Quick summary:**
- Requires a GNews API key — free tier: 100 requests/day, no credit card
- Signup at [gnews.io](https://gnews.io) takes about 1 minute
- Filter by country (ISO code), state, or city for local news
- Voice commands: *"What are the latest headlines?"*, *"Any news about AI?"*, *"News from Mumbai"*

---

## Smart Home Agent

Voice control for your entire Home Assistant setup — lights, locks, climate, scenes, and more.

**→ [Full setup guide](agents/smarthome.md)** — covers Docker setup, HA Long-Lived Token creation, supported devices, and troubleshooting.

**Quick summary:**
- Requires Home Assistant URL + a Long-Lived Access Token (created in your HA profile)
- Docker must be running — the agent uses the `voska/hass-mcp` MCP bridge container
- Controls: lights (brightness + color), switches, fans, covers, locks, thermostats, scenes
- Voice commands: *"Turn on the lights"*, *"Set brightness to 50%"*, *"Lock the front door"*, *"Activate movie scene"*

---

## WhatsApp Agent

Send and receive WhatsApp messages by voice using the Meta Cloud API.

**→ [Full setup guide](agents/whatsapp.md)** — covers Meta Developer account, Cloudflare Tunnel, webhook registration, and testing step by step.

**Quick summary:**
- Requires a Meta Developer account + a WhatsApp app (free)
- Requires `cloudflared` for the webhook tunnel
- No physical WhatsApp Business device needed — Meta provides a free test number
- Voice commands: *"Send WhatsApp to Mom saying hello"*, *"Any WhatsApp messages?"*

---

## Portfolio Agent

Connect to your INDmoney account via MCP to query equity holdings, mutual funds, P&L, and transactions — by voice.

**→ [Full setup guide](agents/portfolio.md)** — covers the OAuth flow, auto-registration, token refresh, and troubleshooting.

**Quick summary:**
- No API key or developer portal needed — click **Connect with INDmoney** and sign in with your normal credentials
- Uses OAuth 2.0 + PKCE with Dynamic Client Registration (RFC 7591) — app auto-registers itself
- MCP server: `https://mcp.indmoney.com/mcp` — tools discovered dynamically at runtime
- Voice: **Fable** voice
- Voice commands: *"Show my portfolio holdings"*, *"What is my total P&L?"*, *"List my mutual funds"*, *"Any recent transactions?"*

---

## Built-in Skills

The four skills below are always active — they require no credentials and are never shown in Settings as togglable agents.

---

### Web Search Skill

Searches the live web via DuckDuckGo Instant Answer API. Fills the gap when the LLM's training data is out of date.

**→ [Full guide](agents/websearch.md)** — covers result tiers, limitations, and troubleshooting.

**Quick summary:**
- No API key or account — completely free
- Uses DuckDuckGo Instant Answers: direct answers → Wikipedia abstract → related topics
- Best for: current prices, factual lookups, recent releases, distances, population data
- Not suited for real-time breaking news (use News agent) or stock prices (use Stock agent)
- Voice commands: *"What is the current gold price?"*, *"Search for Python 3.13 release date"*, *"Who is the CEO of Apple?"*

---

### Calculator Skill

Evaluates math expressions precisely using Python's AST evaluator — no `eval()`, no external calls.

**→ [Full guide](agents/calculator.md)** — covers all supported operators, functions, and constants.

**Quick summary:**
- Always precise — fixes the well-known LLM arithmetic unreliability
- Supports: arithmetic, percentages, tips, trig, logarithms, factorials, floor/ceil, constants (pi, e, tau)
- Shortcut patterns: `18% tip on 850` and `15% of 2499` are parsed directly before AST evaluation
- Voice commands: *"What is 18% tip on 850?"*, *"Square root of 1764"*, *"2 to the power 10"*, *"42 miles in km"*

---

### Memory Skill

Persists key-value notes to `apps/orchestrator/data/user_memory.json` — survives restarts.

**→ [Full guide](agents/memory.md)** — covers storage format, recall search, deletion, and privacy notes.

**Quick summary:**
- Persistent across sessions, restarts, and browser refreshes
- Three intents: **remember** (store), **recall** (retrieve), **forget** (delete)
- Recall uses layered search: exact key → partial key match → keyword scan of keys + values
- All data stays local — nothing sent to external services
- Voice commands: *"Remember wife anniversary is June 15"*, *"What is my anniversary?"*, *"Forget parking spot"*, *"List all memories"*

---

### Briefing Skill

Queries weather, calendar, news, and smart home in parallel and merges results into a single spoken summary.

**→ [Full guide](agents/briefing.md)** — covers included agents, parallel fetch, and customisation.

**Quick summary:**
- Skips agents that are not configured — briefing adapts to whatever is connected
- All agent queries run in parallel via `asyncio.gather()` — fast even with 4 agents
- Each section capped at 300 characters for a speakable response
- Voice commands: *"Give me my morning briefing"*, *"Morning summary"*, *"Dashboard status"*, *"What's happening today?"*

---

## General AI Agent

Handles open-ended questions and anything that does not match a specific agent.

**→ [AI settings guide](configuration/ai.md)** — covers OpenAI, Anthropic, Gemini, and Ollama.

**Voice commands:**
- *"Write me a haiku about coffee"*
- *"Explain quantum computing in simple terms"*
- *"What is the capital of Iceland?"*

---

## Credentials security model

| Where stored | Scope | Notes |
|---|---|---|
| Browser `localStorage` | Client-side, sandboxed to origin | Never written to disk |
| WebSocket session payload | In-memory, discarded after session | Not persisted server-side |
| Orchestrator `.env` | Server-side only, never committed | Used as fallback defaults |

Keys entered in the UI are not written to any server file. The orchestrator uses them only for the active session.

## Graceful degradation

Every agent returns a helpful message when its credentials are missing:

```
"Weather agent is not configured. Please add your API key in Settings → Agents → Weather."
```

All other agents continue working. Credentials can be added at any time without restarting the app.
