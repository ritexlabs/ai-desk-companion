# MCP Gateway

The MCP Gateway (`apps/mcp-gateway/`) is a local FastAPI service on port 8788 that aggregates all tool-calling sources into a single unified API consumed by the orchestrator.

---

## API

| Endpoint | Description |
|---|---|
| `GET /health` | `{ "status": "ok", "servers": [...] }` |
| `GET /tools` | Full list of namespaced tools with descriptions and input schemas |
| `POST /tools/{tool_name}` | Execute a tool — body: `{ "arguments": {...}, "credentials": {...} }` |

---

## Architecture

```
apps/mcp-gateway/
├── app/
│   ├── main.py               FastAPI app, lifespan startup/shutdown, 3 endpoints
│   ├── config.py             GatewaySettings (port 8788, credential placeholders)
│   ├── aggregator.py         MCPAggregator — registers servers, merges tools, routes calls
│   └── servers/
│       ├── base.py           BaseMCPServer ABC
│       ├── indmoney_mcp_adapter.py  INDmoney (namespace: indmoney) — speaks MCP upstream
│       ├── github_server.py    GitHub REST API (namespace: github)
│       ├── google_server.py    Google Calendar + Gmail (namespace: google)
│       ├── weather_server.py   Open-Meteo / OWM / WeatherAPI (namespace: weather)
│       ├── news_server.py      GNews API (namespace: news)
│       ├── stocks_server.py    yfinance (namespace: stocks)
│       └── system_server.py    psutil (namespace: system)
└── requirements.txt
```

---

## Tool namespacing

Each server declares a `namespace`. The aggregator prefixes every tool name:

```
weather → weather__get_current_weather
github  → github__get_pull_requests
google  → google__get_calendar_events
         google__get_emails
```

The LLM sees namespaced names. The gateway strips the prefix before forwarding to the server.

---

## BaseMCPServer — adding a new gateway server

Every server implements `BaseMCPServer`:

```python
# apps/mcp-gateway/app/servers/base.py
from abc import ABC, abstractmethod
from typing import Any

class BaseMCPServer(ABC):
    namespace: str  # used as tool prefix, e.g. 'weather'

    @abstractmethod
    async def connect(self) -> None: ...

    @abstractmethod
    async def disconnect(self) -> None: ...

    @abstractmethod
    async def list_tools(self) -> list[dict]: ...

    @abstractmethod
    async def call_tool(self, tool_name: str, arguments: dict, credentials: dict) -> Any: ...
```

### Minimal example — adding a new server

**1. Create `apps/mcp-gateway/app/servers/myservice_server.py`:**

```python
from __future__ import annotations
from typing import Any
import httpx
from app.servers.base import BaseMCPServer

class MyServiceServer(BaseMCPServer):
    namespace = 'myservice'

    async def connect(self) -> None:
        pass  # stateless HTTP — no persistent connection needed

    async def disconnect(self) -> None:
        pass

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

    async def call_tool(self, tool_name: str, arguments: dict, credentials: dict) -> Any:
        api_key = credentials.get('myservice_api_key', '')
        if not api_key:
            raise PermissionError('MyService API key not configured. Add it in Settings → Agents.')

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

**2. Register in `apps/mcp-gateway/app/main.py` → `_register_servers()`:**

```python
from app.servers.myservice_server import MyServiceServer
aggregator.register(MyServiceServer())
```

**3. Add the credential key to `apps/orchestrator/app/services/agent_manager.py` → `_session_credentials()`:**

```python
'myservice_api_key': _get('myservice', 'api_key'),
```

**4. Add the env fallback to `_env_agent_defaults()`:**

```python
'myservice': {
    'api_key': settings.myservice_api_key,   # add to config.py too
},
```

**5. Add the frontend credential field** in `apps/desktop/src/hooks/useAgentConfig.ts` and a settings component in `apps/desktop/src/components/settings/`.

No orchestrator routing changes, no keyword rules, no boot query — the LLM discovers the tool automatically from its description.

---

## Credential injection

The orchestrator calls `agent_manager._session_credentials()` which returns a flat dict of all credentials for the current session. This dict is forwarded verbatim in every `POST /tools/{name}` request body under the `credentials` key.

Each server reads only the keys it needs from `credentials`:

```python
api_key = credentials.get('weather_api_key', '')
token   = credentials.get('github_token', '')
```

The gateway never stores credentials between calls.

---

## Error handling

Raise the right Python exception from `call_tool()` — the gateway translates them to HTTP status codes:

| Exception | HTTP status | When to raise |
|---|---|---|
| `PermissionError` | 401 | Missing or invalid credentials |
| `ValueError` | 404 | Unknown tool name |
| Any other `Exception` | 503 | Upstream call failed, timeout, etc. |

Return plain values from `call_tool()` — `str`, `dict`, `list`. The gateway wraps them in `{ "ok": true, "result": ... }`.

---

## Credential fallback order

For every credential key: session value (from UI) → `.env` variable → empty string.

Servers should raise `PermissionError` (not return an error string) when a required credential is missing — the orchestrator surfaces this to the LLM as a tool error, and the LLM tells the user to configure the setting.

---

## Testing a server standalone

```python
import asyncio
from apps.mcp_gateway.app.servers.weather_server import WeatherServer

async def test():
    s = WeatherServer()
    await s.connect()
    tools = await s.list_tools()
    print(tools)
    result = await s.call_tool('get_current_weather', {'query': 'Mumbai'}, {'weather_api_key': ''})
    print(result)

asyncio.run(test())
```

---

## Existing servers — credential keys

| Server | Namespace | Required credential keys |
|---|---|---|
| `INDmoneyServer` | `indmoney` | `indmoney_token` |
| `GitHubServer` | `github` | `github_token` |
| `GoogleServer` | `google` | `google_access_token` |
| `WeatherServer` | `weather` | `weather_api_key` (optional), `weather_provider`, `weather_default_city` |
| `NewsServer` | `news` | `news_api_key`, `news_default_country` |
| `StocksServer` | `stocks` | `stock_default_market` |
| `SystemServer` | `system` | _(none — reads local psutil)_ |
