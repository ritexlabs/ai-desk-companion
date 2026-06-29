# Custom MCP Server — Build Guide

Template and conventions for all custom MCP servers in `apps/mcp-servers/`.

---

## Directory layout

```
apps/mcp-servers/<name>/
  server.py          ← entry point
  requirements.txt   ← dependencies (always includes mcp>=1.0.0)
  .env.example       ← env vars the gateway injects at spawn
  README.md          ← tool listing + credential docs
```

---

## Minimal server skeleton

```python
# apps/mcp-servers/weather/server.py
from __future__ import annotations
import os
import mcp.server.stdio
from mcp.server import Server
from mcp.types import Tool, TextContent
import json

app = Server("weather")

@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="get_current_weather",
            description="Get current weather conditions for a city.",
            inputSchema={
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "City name, e.g. 'Mumbai'"},
                },
                "required": ["city"],
            },
        ),
        Tool(
            name="get_forecast",
            description="Get 5-day weather forecast for a city.",
            inputSchema={
                "type": "object",
                "properties": {
                    "city": {"type": "string"},
                    "days": {"type": "integer", "default": 3},
                },
                "required": ["city"],
            },
        ),
    ]

@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    api_key = os.environ.get("WEATHER_API_KEY", "")
    if not api_key:
        return [TextContent(type="text", text="WEATHER_API_KEY not configured.")]

    if name == "get_current_weather":
        # ... call OpenWeatherMap / WeatherAPI
        result = {"city": arguments["city"], "temp": "28°C", "condition": "Sunny"}
        return [TextContent(type="text", text=json.dumps(result))]

    if name == "get_forecast":
        # ...
        pass

    return [TextContent(type="text", text=f"Unknown tool: {name}")]


if __name__ == "__main__":
    mcp.server.stdio.run(app)
```

---

## Environment variables convention

Each server reads credentials ONLY from environment variables, never from files or arguments. The gateway injects them at subprocess spawn time.

**Custom servers (stdio, env-injected):**

| Server | Env var(s) |
|---|---|
| weather | `WEATHER_API_KEY` |
| news | `NEWS_API_KEY` |
| stocks | _(none — yfinance is public)_ |
| smarthome | `HA_URL`, `HA_TOKEN` |
| system | _(none — local psutil)_ |
| whatsapp | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` |

**Official remote servers (HTTP header-injected by gateway):**

| Server | Credential sent as |
|---|---|
| Gmail (`gmailmcp.googleapis.com`) | `Authorization: Bearer <google_access_token>` |
| Google Calendar (`calendarmcp.googleapis.com`) | `Authorization: Bearer <google_access_token>` |
| INDmoney (`mcp.indmoney.com`) | `Authorization: Bearer <indmoney_access_token>` |
| GitHub (Go binary subprocess) | `GITHUB_PERSONAL_ACCESS_TOKEN` env var at spawn |

---

## Testing a server standalone

```bash
# Install dependencies
cd apps/mcp-servers/weather
python -m venv .venv && .venv/bin/pip install -r requirements.txt

# Run with mcp dev inspector
WEATHER_API_KEY=xxx mcp dev server.py

# Or test via stdio directly
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  WEATHER_API_KEY=xxx python server.py
```

---

## Registering with the gateway

In `apps/mcp-gateway/app/aggregator.py`, add:

```python
LocalServer(
    name="weather",
    command=["python", str(SERVERS_DIR / "weather" / "server.py")],
    credential_keys=["WEATHER_API_KEY"],   # injected from request credentials
),
```

The `LocalServer` base class handles:
- Subprocess lifecycle (start, restart on crash, shutdown)
- Stdio MCP session management
- Tool list caching with 5-minute TTL
- Credential injection per tool call

---

## Tool naming rules

1. Use `snake_case` for tool names.
2. Start with a verb: `get_`, `list_`, `create_`, `send_`, `control_`, `search_`.
3. Be specific: `get_current_weather` not `weather`.
4. The gateway adds `<server>__` prefix when exposing to the LLM.

---

## Error handling

Return a `TextContent` with a clear message — never raise unhandled exceptions:

```python
try:
    result = await fetch_data(...)
except PermissionError:
    return [TextContent(type="text", text="Authentication failed. Please reconnect in Settings.")]
except Exception as exc:
    return [TextContent(type="text", text=f"Service temporarily unavailable: {str(exc)[:80]}")]
```

Do not include the words `error`, `not connected`, `could not`, or `expired` in success responses — these trigger the orchestrator's degraded-state detector.
