# MCP Gateway

The MCP Gateway (`apps/mcp-gateway/`) is a local FastAPI service on port 8788 that exposes all external integrations as namespaced tools. It is called by the orchestrator (Bearer-authenticated) and by the desktop UI for a small set of auth-exempt admin/OAuth endpoints.

---

## Directory layout

```
apps/mcp-gateway/
├── src/
│   ├── main.py               FastAPI app — CORS, auth middleware, routers, /tools REST, /mcp StreamableHTTP
│   ├── config/
│   │   └── settings.py       GatewaySettings (pydantic-settings, reads apps/mcp-gateway/.env)
│   ├── tools/
│   │   ├── base.py           BaseTool ABC (namespace, list_tools, call_tool, startup, shutdown)
│   │   ├── registry.py       ToolRegistry — register, startup, shutdown, list, route
│   │   ├── weather.py        Open-Meteo / OWM / WeatherAPI (namespace: weather)
│   │   ├── stocks.py         yfinance (namespace: stocks)
│   │   ├── news.py           GNews API (namespace: news)
│   │   ├── github.py         GitHub REST API (namespace: github)
│   │   ├── google.py         Google Calendar + Gmail (namespace: google)
│   │   ├── system.py         psutil — CPU, RAM, disk, battery (namespace: system)
│   │   ├── portfolio.py      INDmoney MCP — portfolio data (namespace: indmoney)
│   │   ├── smarthome.py      Home Assistant via hass-mcp Docker (namespace: smarthome)
│   │   └── whatsapp.py       Meta WhatsApp Cloud API (namespace: whatsapp)
│   ├── routers/
│   │   ├── portfolio.py      /auth/indmoney (OAuth PKCE), /api/portfolio/status, /api/portfolio/data
│   │   ├── system.py         /api/system/config
│   │   ├── tunnel.py         /api/tunnel/start, /api/tunnel/stop, /api/tunnel/status
│   │   └── whatsapp.py       /api/whatsapp/status, /webhook/whatsapp
│   └── utils/
│       ├── errors.py         ToolNotFoundError, ToolAuthError, sanitize_error
│       └── logger.py         configure_logging, get_logger
├── .env.sample               Template — copy to .env and fill in credentials
├── requirements.txt
└── pytest.ini
```

---

## REST API

| Endpoint | Auth | Description |
|---|---|---|
| `GET /health` | — | `{ status, version, auth, mcp_protocol, tools }` |
| `GET /tools` | Bearer | All namespaced tools with descriptions and inputSchema |
| `POST /tools/{tool_name}` | Bearer | `{ arguments: {...} }` → `{ ok: true, result: ... }` |
| `GET /mcp` | Bearer | MCP StreamableHTTP protocol endpoint |
| `POST /mcp` | Bearer | MCP StreamableHTTP protocol endpoint |
| **Session credential endpoints** | | |
| `PUT /session/smarthome` | Bearer | Update HA endpoint + token in-memory |
| `PUT /session/weather` | Bearer | Update weather API key, city, provider in-memory |
| `PUT /session/github` | Bearer | Update GitHub token in-memory |
| `PUT /session/news` | Bearer | Update news API key + country in-memory |
| `PUT /session/whatsapp` | Bearer | Update WhatsApp phone ID, token, contacts in-memory |
| `PUT /session/portfolio` | Bearer | Update INDmoney credentials in-memory |
| **Portfolio OAuth** | | |
| `GET /api/portfolio/data` | — | Portfolio summary using stored OAuth token |
| `GET /api/portfolio/status` | — | INDmoney connection status + token freshness |
| `GET /auth/indmoney` | — | Start INDmoney OAuth PKCE flow (opens browser redirect) |
| `GET /auth/indmoney/callback` | — | OAuth code exchange, saves token to .env |
| `DELETE /auth/indmoney/token` | Bearer | Remove stored INDmoney token |
| **Other** | | |
| `GET /api/system/config` | — | Enabled/disabled metrics list |
| `GET /api/tunnel/status` | — | Cloudflare tunnel status |
| `POST /api/tunnel/start` | — | Start Cloudflare tunnel |
| `POST /api/tunnel/stop` | — | Stop Cloudflare tunnel |
| `GET /api/whatsapp/status` | — | WhatsApp connection status |
| `GET /webhook/whatsapp` | — | Meta webhook verification handshake |
| `POST /webhook/whatsapp` | — | Receive incoming WhatsApp messages |

Auth-exempt endpoints (no Bearer token required) are listed in `_AUTH_EXEMPT` in `main.py`.

### Session credential push

The `PUT /session/*` endpoints allow the orchestrator to inject per-session credentials into the gateway at runtime, without editing `.env`. Each endpoint mutates `GatewaySettings` fields in-memory:

```python
# Example: PUT /session/github
settings.github_token = body.token.strip()
```

All `PUT /session/*` endpoints require the Bearer token — they are **not** in `_AUTH_EXEMPT`. The orchestrator calls these automatically during `boot_sequence` using values from the WebSocket `start_session` → `agent_config` payload. `.env` values remain as fallbacks when no session push has occurred.

---

## Tool namespacing

Every tool is exposed as `<namespace>__<tool_name>`:

| Namespace | Example tool | File |
|---|---|---|
| `weather` | `weather__get_current_weather` | `tools/weather.py` |
| `stocks` | `stocks__get_quote` | `tools/stocks.py` |
| `news` | `news__get_news` | `tools/news.py` |
| `github` | `github__get_summary` | `tools/github.py` |
| `google` | `google__get_calendar_events`, `google__get_emails` | `tools/google.py` |
| `system` | `system__get_system_info` | `tools/system.py` |
| `indmoney` | `indmoney__query_portfolio` | `tools/portfolio.py` |
| `smarthome` | `smarthome__get_states`, `smarthome__call_service` | `tools/smarthome.py` |
| `whatsapp` | `whatsapp__send_message`, `whatsapp__get_chat` | `tools/whatsapp.py` |

The `ToolRegistry` applies the prefix automatically — tool implementations use bare names internally.

---

## Credentials

Credentials reach the gateway via two paths:

1. **Session push (runtime)** — orchestrator calls `PUT /session/<agent>` during `boot_sequence`. The gateway mutates `GatewaySettings` fields in-memory. No `.env` write occurs. This is the primary path for credentials entered in the UI.

2. **`.env` file (startup defaults)** — `GatewaySettings` reads `apps/mcp-gateway/.env` at process start. These values are used as initial defaults and as fallbacks between sessions.

Each tool reads from `settings` directly — credentials are **never forwarded per-call** from the orchestrator.

| Tool | Credential keys in `GatewaySettings` |
|---|---|
| `weather` | `weather_api_key`, `weather_provider`, `weather_default_city` |
| `stocks` | `stock_default_market` |
| `news` | `news_api_key`, `news_default_country` |
| `github` | `github_token` |
| `google` | `google_access_token`, `google_refresh_token`, `google_client_id`, `google_client_secret` |
| `system` | _(none — reads local psutil)_ |
| `indmoney` | `indmoney_oauth_token` (set by the OAuth flow), `indmoney_client_id`, `indmoney_client_secret` |
| `smarthome` | `myhome_mcp_endpoint`, `myhome_mcp_token` |
| `whatsapp` | `whatsapp_phone_number_id`, `whatsapp_access_token`, `whatsapp_app_secret`, `whatsapp_webhook_verify_token` |

The orchestrator sends only a shared `GATEWAY_API_TOKEN` Bearer token — not individual integration credentials.

---

## BaseTool ABC — adding a new tool

Every tool file implements `BaseTool`:

```python
# apps/mcp-gateway/src/tools/base.py
from abc import ABC, abstractmethod
from typing import Any

class BaseTool(ABC):
    namespace: str  # e.g. 'weather', 'github'

    @abstractmethod
    async def list_tools(self) -> list[dict]:
        """Return descriptors — names must NOT include the namespace prefix."""

    @abstractmethod
    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        """Invoke a tool by its bare name (without namespace prefix)."""

    async def startup(self) -> None:
        """Called once at gateway startup. Override to open connections."""

    async def shutdown(self) -> None:
        """Called once at gateway shutdown. Override to close connections."""
```

### Minimal example — adding a new tool

**Step 1 — Create `apps/mcp-gateway/src/tools/myservice.py`:**

```python
from __future__ import annotations
from typing import Any
import httpx
from src.tools.base import BaseTool
from src.config.settings import settings

class MyServiceTool(BaseTool):
    namespace = 'myservice'

    async def list_tools(self) -> list[dict]:
        return [
            {
                'name':        'get_data',
                'description': 'Fetch data from MyService.',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'query': {'type': 'string', 'description': 'What to look up'},
                    },
                    'required': ['query'],
                },
            },
        ]

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        api_key = settings.myservice_api_key
        if not api_key:
            raise RuntimeError('MyService API key not configured. Add MYSERVICE_API_KEY to apps/mcp-gateway/.env')

        if tool_name == 'get_data':
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    'https://api.myservice.com/data',
                    headers={'Authorization': f'Bearer {api_key}'},
                    params={'q': arguments.get('query', '')},
                )
                r.raise_for_status()
                return r.json()

        raise ValueError(f'Unknown tool: {tool_name}')
```

**Step 2 — Add the credential field to `apps/mcp-gateway/src/config/settings.py`:**

```python
myservice_api_key: str = ''
```

**Step 3 — Register in `apps/mcp-gateway/src/main.py` → `_register_tools()`:**

```python
from src.tools.myservice import MyServiceTool
registry.register(MyServiceTool())
```

**Step 4 — Add the key to `apps/mcp-gateway/.env.sample`** (placeholder only, no real value):

```bash
# MYSERVICE_API_KEY=
```

No orchestrator changes are needed — the gateway reads its own `.env` and the LLM discovers the tool automatically from its description.

---

## Error handling

Raise the right Python exception from `call_tool()` — the gateway translates them:

| Exception | HTTP status | When |
|---|---|---|
| `ToolAuthError` | 401 | Missing or invalid credentials |
| `ToolNotFoundError` | 404 | Unknown tool name |
| `RuntimeError` | 503 | Upstream failure; the error `.args[0]` string is surfaced to the LLM |
| Any other `Exception` | 503 | Unexpected error |

Return plain values from `call_tool()` — `str`, `dict`, or `list`. The gateway wraps them in `{ "ok": true, "result": ... }`.

Gateway tool errors propagate through the orchestrator to the LLM as a tool error string — the LLM converts this into a user-facing message. Preserve the detail string so the LLM can give the user a meaningful response.

---

## Bearer auth

The orchestrator sends `Authorization: Bearer <GATEWAY_API_TOKEN>` on every tool call. The token must match `GATEWAY_API_TOKEN` in `apps/mcp-gateway/.env`.

Leave `GATEWAY_API_TOKEN=` blank to disable auth entirely (local dev only). Auth-exempt paths (OAuth callbacks, webhooks, portfolio status/data, system config, tunnel status) never require the Bearer header.

---

## MCP StreamableHTTP protocol

The `/mcp` endpoint exposes all registered tools to any MCP-compatible client (e.g. Claude Desktop). It uses the `mcp` Python library's `StreamableHTTPSessionManager` in stateless mode. If the `mcp` package is not installed the endpoint is disabled and the service falls back to REST-only mode.

---

## Portfolio OAuth (INDmoney)

INDmoney uses PKCE + Dynamic Client Registration (RFC 7591). The flow:

1. Desktop UI opens `http://localhost:8788/auth/indmoney` (auth-exempt, no token needed).
2. Gateway auto-registers a fresh OAuth client with `https://mcp.indmoney.com/register`.
3. User logs in on INDmoney's site; callback arrives at `/auth/indmoney/callback`.
4. Gateway exchanges the code for tokens and writes them to `INDMONEY_OAUTH_TOKEN` in `.env`.
5. Future calls to `/api/portfolio/data` and `indmoney__query_portfolio` use the stored token; no client-side token is ever needed.

The INDmoney MCP endpoint is hardcoded to `https://mcp.indmoney.com/mcp` — no user-controlled URL is accepted (SSRF prevention).
