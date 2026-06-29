# MCP Gateway Migration Plan

**Status:** Planning  
**Date:** 2026-06-29  
**Goal:** Replace per-agent keyword routing with a local MCP gateway that aggregates all tool sources, allowing the LLM to select and call tools directly.

---

## 1. Why Migrate

### Current architecture problems

| Problem | Impact |
|---|---|
| Keyword routing in each agent (`re.search(r'\b(holding\|stock)\b', t)`) | Breaks on phrasing variations; unmaintainable as agents grow |
| Each agent carries its own HTTP client / vendor SDK | API changes require edits to agent code, not just config |
| No tool discovery | LLM cannot use new tools without a code deploy |
| Per-agent auth plumbing repeated 8× | Token refresh, error handling duplicated everywhere |
| `mcp` SDK needed in orchestrator only because of INDmoney | Dependency creep; orchestrator mixes concerns |

### Target architecture benefits

| Benefit | How |
|---|---|
| LLM picks the right tool naturally from descriptions | All tools exposed in one list; no regex routing |
| API changes isolated to MCP server layer | Orchestrator never changes when a service updates |
| New tools available instantly | Gateway refreshes tool list from each server on startup |
| Unified auth layer | Gateway injects credentials; orchestrator holds one token per user |
| Standard protocol | Every service speaks MCP; mix remote + local servers freely |

---

## 2. Target Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Desktop UI  (React / Vite :5173)                       │
│  Voice → WebSocket → Orchestrator                       │
└────────────────────┬────────────────────────────────────┘
                     │ WebSocket (existing)
┌────────────────────▼────────────────────────────────────┐
│  Orchestrator  (FastAPI :8787)                          │
│  • Receives user query                                  │
│  • Calls GET /tools on gateway → unified tool list      │
│  • Passes query + tools to LLM                          │
│  • LLM returns tool_name + arguments                    │
│  • Calls POST /tools/{name} on gateway                  │
│  • Streams response back to UI                          │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP (localhost :8788)
┌────────────────────▼────────────────────────────────────┐
│  Local MCP Gateway  (FastAPI :8788)  ← NEW SERVICE      │
│  • Aggregates tools from all MCP servers                │
│  • Routes calls to the right server                     │
│  • Injects per-service credentials from request context │
│  • Health endpoint for orchestrator readiness check     │
└──────┬──────────────┬──────────────────────────────────────┘
       │ stdio        │ Streamable HTTP (remote, official)
┌──────▼──────┐ ┌─────▼───────────────────────────────────┐
│ Local MCP   │ │ Official Remote MCP Servers              │
│ Servers     │ │                                          │
│ (we build)  │ │ • github/github-mcp-server (Go binary)  │
│             │ │   → repos, issues, PRs, code search      │
│ • weather   │ │                                          │
│ • news      │ │ • gmailmcp.googleapis.com/mcp/v1         │
│ • stocks    │ │   → read, send, search email             │
│ • smarthome │ │                                          │
│ • system    │ │ • calendarmcp.googleapis.com/mcp/v1      │
│ • whatsapp  │ │   → list, create, update events          │
└─────────────┘ │                                          │
                │ • mcp.indmoney.com/mcp                   │
                │   → portfolio, holdings, MF, P&L         │
                └─────────────────────────────────────────┘
```

---

## 3. MCP Server Inventory

### 3a. Official MCP servers (use as-is)

| Service | Server | Transport | Auth |
|---|---|---|---|
| **INDmoney** | `https://mcp.indmoney.com/mcp` | Streamable HTTP | Bearer token |
| **Gmail** | `https://gmailmcp.googleapis.com/mcp/v1` | Streamable HTTP | Google OAuth access token |
| **Google Calendar** | `https://calendarmcp.googleapis.com/mcp/v1` | Streamable HTTP | Google OAuth access token |
| **GitHub** | `github/github-mcp-server` (official Go binary) | stdio | `GITHUB_PERSONAL_ACCESS_TOKEN` env var |

**GitHub setup:**  
Download from `https://github.com/github/github-mcp-server/releases` or run via Docker:
```bash
docker run -i --rm \
  -e GITHUB_PERSONAL_ACCESS_TOKEN=<token> \
  ghcr.io/github/github-mcp-server stdio
```
The gateway spawns it as a stdio subprocess.

**Google MCP servers:**  
Both Gmail and Google Calendar MCP endpoints use the same Google OAuth access token the user already connects via Settings. The gateway injects the token as `Authorization: Bearer <access_token>` on every request — no separate OAuth flow needed.

### 3b. Custom MCP servers (we build)

No official MCP server exists for these services. We build lightweight Python MCP servers using the `mcp` SDK.

| Service | Location | Wraps | Tools exposed |
|---|---|---|---|
| **Weather** | `apps/mcp-servers/weather/` | OpenWeatherMap / WeatherAPI | `get_current_weather`, `get_forecast` |
| **News** | `apps/mcp-servers/news/` | NewsAPI | `get_top_headlines`, `search_news` |
| **Stocks** | `apps/mcp-servers/stocks/` | yfinance | `get_quote`, `get_history`, `get_market_summary` |
| **Smart Home** | `apps/mcp-servers/smarthome/` | Home Assistant REST API | `list_entities`, `control_device`, `get_state`, `run_scene` |
| **System** | `apps/mcp-servers/system/` | psutil | `get_cpu`, `get_memory`, `get_disk`, `get_processes` |
| **WhatsApp** | `apps/mcp-servers/whatsapp/` | WhatsApp Business API | `send_message`, `list_contacts` |

Each custom server:
- Uses `mcp` Python SDK (stdio transport by default, HTTP optional)
- Receives credentials via environment variables injected by the gateway at spawn time
- Has its own `requirements.txt`
- Can be tested independently with `mcp dev server.py`

---

## 4. Local MCP Gateway Design

### 4a. Directory structure

```
apps/
  mcp-gateway/              ← NEW
    app/
      main.py               gateway FastAPI app
      config.py             settings (gateway port, server configs)
      aggregator.py         connects to all MCP servers, merges tool lists
      servers/
        github_server.py    manages GitHub MCP subprocess
        indmoney_server.py  manages INDmoney HTTP connection
        local_server.py     base class for our custom stdio servers
    requirements.txt
    .env.example

  mcp-servers/              ← NEW
    weather/
      server.py
      requirements.txt
    news/
      server.py
      requirements.txt
    stocks/
      server.py
      requirements.txt
    google/
      server.py
      requirements.txt
    smarthome/
      server.py
      requirements.txt
    system/
      server.py
      requirements.txt
    whatsapp/
      server.py
      requirements.txt
```

### 4b. Gateway API

```
GET  /health                → { status: "ok", servers: [...] }
GET  /tools                 → [ { name, description, inputSchema, server } ]
POST /tools/{tool_name}     → tool result
     Body: { arguments: {...}, credentials: { github_token, google_access_token, ... } }
```

### 4c. Credential injection

The orchestrator sends all user credentials in every `/tools/{name}` call body under `credentials`. The gateway looks at which server owns the tool and injects only the relevant credential as an env var (for stdio servers) or HTTP header (for remote servers).

This keeps credential management out of the gateway's persistent state — it never stores tokens.

### 4d. Tool namespacing

Each tool is prefixed with its server name to avoid collisions:

| Raw tool name | Gateway-exposed name |
|---|---|
| `get_current_weather` | `weather__get_current_weather` |
| `list_events` (Google) | `google__list_events` |
| `get_holdings` (INDmoney) | `indmoney__get_holdings` |
| `list_repos` (GitHub) | `github__list_repos` |

The LLM sees the namespaced names and descriptions. The gateway strips the prefix before forwarding to the server.

---

## 5. Orchestrator Refactor

### 5a. What changes

| Current | Target |
|---|---|
| 8 agent classes with keyword routing | 1 `MCPGatewayAgent` |
| `registered_agents` list per-session | Gateway determines available tools |
| `agent_config` blob sent to orchestrator | `credentials` blob sent per tool call |
| Agents boot individually with `__boot__` | Gateway health check replaces boot |
| `AGENT_PILL_META` maps agent IDs → icons | Tool server names map → icons |

### 5b. New orchestrator flow

```python
# On session start
tools = await gateway_client.list_tools()   # GET /tools

# On each user query
response = await llm.complete(
    system=SYSTEM_PROMPT,
    tools=tools,           # all tools from all servers
    messages=[*history, user_message],
)

if response.tool_calls:
    for call in response.tool_calls:
        result = await gateway_client.call_tool(
            name=call.name,
            arguments=call.arguments,
            credentials=session_credentials,
        )
        # append result to context, re-prompt LLM
```

### 5c. What is removed from orchestrator

- `app/agents/portfolio.py`, `weather.py`, `github.py`, `google_*.py`, `smarthome.py`, `stocks.py`, `news.py`, `system.py`
- `app/services/indmoney_mcp.py` (logic moves to gateway)
- Per-agent boot queries
- Keyword routing logic

---

## 6. Auto-start Strategy

`start.py` already manages orchestrator + desktop processes. The gateway becomes a third managed process.

### 6a. Start order

```
1. MCP Gateway starts (port 8788)
2. Orchestrator starts (port 8787) — waits for gateway health before accepting sessions
3. Desktop UI starts (port 5173)
```

### 6b. Changes to `start.py`

```python
MCP_GATEWAY      = ROOT / 'apps' / 'mcp-gateway'
GATEWAY_PORT     = 8788
GATEWAY_TAG      = yellow('[GW  ]') + ' '

def setup_gateway(py_exe: str) -> None:
    gw_venv = MCP_GATEWAY / '.venv'
    if not (gw_venv / 'bin' / 'python').exists():
        subprocess.run([py_exe, '-m', 'venv', str(gw_venv)], check=True)
        subprocess.run([str(gw_venv / 'bin' / 'pip'), 'install',
                        '-r', str(MCP_GATEWAY / 'requirements.txt'), '-q'], check=True)

def start_gateway(py_exe: str) -> subprocess.Popen:
    step('Starting MCP Gateway  ' + dim(f'→  http://localhost:{GATEWAY_PORT}'))
    gw_venv_uv = MCP_GATEWAY / '.venv' / 'bin' / 'uvicorn'
    return launch(
        [str(gw_venv_uv), 'app.main:app',
         '--host', '0.0.0.0', '--port', str(GATEWAY_PORT), '--reload'],
        cwd=MCP_GATEWAY,
        tag=GATEWAY_TAG,
        env={'PYTHONUNBUFFERED': '1'},
    )
```

### 6c. GitHub MCP binary auto-download

`start.py` checks for the GitHub MCP binary on first run and downloads it from the official releases page. The binary is stored at `apps/mcp-gateway/bins/github-mcp-server` (gitignored).

---

## 7. Frontend Changes

### 7a. Agent status display

Currently each agent has a pill in the ONLINE AGENTS card. With the gateway, the concept shifts from "agents" to "servers":

- Replace `AGENT_PILL_META` agent IDs with server IDs (`weather`, `google`, `github`, `indmoney`, `smarthome`, `stocks`, `news`, `system`, `whatsapp`)
- Gateway reports which servers are reachable via WebSocket `server_status_changed` events
- Offline servers show as degraded; gateway itself offline = all degraded

### 7b. Settings page

- Remove per-agent credential fields that move to the gateway's `.env`
- Keep user-facing fields: Google OAuth connect button, GitHub token, HA token, API keys
- Settings now call `POST /gateway/credentials` to update the running gateway without restart

### 7c. Portfolio card

The "My Networth" card remains, driven by the `indmoney` server being online (same logic, different source event).

---

## 8. Migration Phases

### Phase 1 — Gateway scaffold (Week 1)
- [ ] Create `apps/mcp-gateway/` with FastAPI app, `/health` and stub `/tools`
- [ ] Add gateway to `start.py` (start order, health wait)
- [ ] Wire orchestrator to call `/tools` instead of booting agents
- [ ] Confirm gateway starts and orchestrator connects

### Phase 2 — Remote MCP servers (Week 1-2)
- [ ] Connect gateway to INDmoney (`https://mcp.indmoney.com/mcp`)
- [ ] Integrate GitHub official binary as stdio subprocess
- [ ] Expose both tool lists through `/tools` with namespacing
- [ ] Remove `PortfolioAgent` and `GithubAgent` from orchestrator

### Phase 3 — Remaining MCP servers (Week 2-3)

**3a — Connect official remote servers (quick wins):**
- [ ] Gmail MCP (`gmailmcp.googleapis.com/mcp/v1`) — reuse existing Google OAuth token
- [ ] Google Calendar MCP (`calendarmcp.googleapis.com/mcp/v1`) — same token
- [ ] Remove `GoogleCalendarAgent` and `GoogleEmailAgent` from orchestrator

**3b — Build custom MCP servers (one per sprint):**
- [ ] `weather` server
- [ ] `news` server
- [ ] `stocks` server
- [ ] `smarthome` server (reuse HA REST logic)
- [ ] `system` server (psutil)
- [ ] `whatsapp` server

Remove corresponding agents from orchestrator after each one.

### Phase 4 — LLM tool selection (Week 3-4)
- [ ] Replace per-agent routing in orchestrator with LLM tool-call loop
- [ ] Add tool result formatting and multi-turn tool use
- [ ] Remove all remaining agent keyword routing code
- [ ] Tune system prompt for tool selection

### Phase 5 — Frontend update (Week 4)
- [ ] Update agent pill display to use server IDs from gateway
- [ ] Update settings to configure gateway credentials
- [ ] Confirm portfolio card still works via gateway status events

### Phase 6 — Cleanup & docs (Week 4-5)
- [ ] Delete `apps/orchestrator/app/agents/` (all replaced by gateway)
- [ ] Delete `apps/orchestrator/app/services/indmoney_mcp.py`
- [ ] Update `docs/architecture.md`, `docs/agents.md`
- [ ] Add `docs/mcp-servers/` guide for adding future servers

---

## 9. Adding a New Service After Migration

Once the gateway is live, adding a new service (e.g. Spotify, Notion) is:

1. Check if an official MCP server exists for the service.
2. If yes: add connection config to `apps/mcp-gateway/app/config.py`.
3. If no: scaffold `apps/mcp-servers/<name>/server.py` using the existing servers as template.
4. Register the server in `apps/mcp-gateway/app/aggregator.py`.
5. Restart gateway — tools are immediately available to the LLM.
6. No changes to orchestrator, no changes to frontend routing.

This is the key payoff: the orchestrator and frontend become stable after Phase 4 and never need to change for new service integrations.

---

## 10. Open Questions Before Starting

1. **GitHub MCP binary distribution** — ship binary in repo or download at startup? Binary is ~20 MB. Recommend startup download with SHA256 verification.
2. **Credential refresh** — Google and INDmoney tokens expire. The gateway will need to call back to the orchestrator (or frontend) to trigger refresh. Define the callback protocol.
3. **Multi-turn tool use** — if the LLM needs to call 3 tools to answer one question (e.g. get weather + calendar + stocks for a morning briefing), should it loop in the orchestrator or the gateway? Recommend orchestrator loop, gateway stays stateless.
4. **Voice latency** — gateway adds one extra HTTP hop. Measure p95 latency per tool call to confirm it stays under 200 ms for local tools.
5. **Gateway port conflict** — port 8788 should be reserved. Add to `_free_ports()` in `start.py`.
