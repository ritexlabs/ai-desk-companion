# Adding a New Agent

Practical reference for adding agents and tools to AI Desk Companion. Read the relevant case fully before touching any files.

---

## Decision Tree

| The new capability... | Path to take |
|---|---|
| Runs entirely inside the orchestrator process (no outbound HTTP to an external API) | **Case B — Local Agent** |
| Calls an external service or API (weather, stocks, GitHub, home automation, etc.) | **Case A — Gateway Tool** |

If in doubt: local agents handle arithmetic, memory, note-taking, and similar self-contained tasks. Gateway tools handle anything that requires an API key or a remote HTTP call.

---

## Case A — New Gateway Tool (3 steps)

Gateway tools live in `apps/mcp-gateway/src/tools/`. They implement the `BaseTool` ABC, read credentials from `GatewaySettings`, and are registered at startup inside `_register_tools()`.

#### Step 1 — Create the tool file

Create `apps/mcp-gateway/src/tools/<name>.py`. The minimal skeleton mirrors the shape used by `WeatherTool`:

```python
from __future__ import annotations

from typing import Any

from src.config.settings import settings
from src.tools.base import BaseTool


class MyTool(BaseTool):
    namespace = 'mytool'   # prefix applied to all tool names: mytool__tool_name

    async def list_tools(self) -> list[dict]:
        return [
            {
                'name': 'do_something',          # bare name — no namespace prefix here
                'description': 'What this tool does and when to use it.',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'query': {
                            'type': 'string',
                            'description': 'The user query.',
                        },
                    },
                    'required': ['query'],
                },
            }
        ]

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        api_key = settings.mytool_api_key.strip()   # read from GatewaySettings
        query   = arguments.get('query', '')
        # ... call the external API and return a plain string or dict
        return f'Result for: {query}'

    async def startup(self) -> None:
        # Optional — open persistent connections or validate credentials.
        pass

    async def shutdown(self) -> None:
        # Optional — close connections.
        pass
```

Key constraints from `BaseTool`:
- `namespace` is a plain class attribute (`str`), not a property.
- Tool names in `list_tools()` must **not** include the namespace prefix — the registry adds it automatically.
- `call_tool()` receives the bare name (e.g. `'do_something'`), not the prefixed name.
- Raise `RuntimeError(detail_string)` for user-facing errors; the orchestrator forwards the detail string to the LLM.

#### Step 2 — Add credentials to settings and the sample file

Add fields to `apps/mcp-gateway/src/config/settings.py` inside `GatewaySettings`:

```python
# ── My Tool ───────────────────────────────────────────────────────────────────
mytool_api_key:      str = ''
mytool_default_city: str = 'Bengaluru'   # optional default with a sensible value
```

Add matching placeholder lines to `apps/mcp-gateway/.env.sample` (commented out, following the existing style):

```
# ── My Tool ───────────────────────────────────────────────────────────────────
# MYTOOL_API_KEY=
# MYTOOL_DEFAULT_CITY=Bengaluru
```

`GatewaySettings` uses `pydantic-settings` with `env_file='.env'`. The field name `mytool_api_key` maps automatically to the env var `MYTOOL_API_KEY`.

#### Step 3 — Register in main.py

Open `apps/mcp-gateway/src/main.py` and add two lines inside `_register_tools()`:

```python
def _register_tools() -> None:
    from src.tools.weather   import WeatherTool
    # ... existing imports ...
    from src.tools.mytool    import MyTool        # add this

    registry.register(WeatherTool())
    # ... existing registrations ...
    registry.register(MyTool())                   # add this
```

That is all that is required on the gateway side. The REST endpoint `/tools/mytool__do_something` and the MCP protocol listing are automatic.

---

## Case B — New Local Agent (8 steps)

Local agents live in `apps/orchestrator/app/agents/`. They extend `AssistantAgent`, appear in the router, and are wired into both the boot sequence and the frontend catalogue.

#### Step 1 — Create the agent class

Create `apps/orchestrator/app/agents/<name>.py`. Use `CalculatorAgent` as the reference for a minimal implementation:

```python
from __future__ import annotations

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus


class MyAgent(AssistantAgent):
    id         = 'myagent'    # unique snake_case identifier — used everywhere
    name       = 'My Agent'   # human-readable name
    config_key = None         # set to a string key if this agent needs UI credentials
    tool_meta  = {
        'description': (
            'What the agent does, written for the LLM tool-calling loop. '
            'Include the kinds of queries it handles.'
        ),
        'query_hint': 'Example query, e.g. "do something with foo"',
    }

    async def initialize(self) -> None:
        return None

    async def health(self) -> AgentHealth:
        return AgentHealth(name=self.name, status=AgentStatus.ONLINE)

    async def shutdown(self) -> None:
        return None

    async def handle(self, request: AgentRequest) -> AgentResponse:
        query = request.text.strip()
        # ... implement the agent logic ...
        return AgentResponse(agent=self.id, text='Response text.')
```

`config_key` is the key inside the `agent_config` dict forwarded from the UI. Leave it `None` for agents that need no external credentials.

`tool_meta` is the LLM tool definition. Set it to `None` only if the agent should never be called by the LLM tool-calling loop (the only example in this repo is `GeneralAIAgent`, which handles the fallback path directly).

#### Step 2 — Register in registry.py

Open `apps/orchestrator/app/agents/registry.py` and add the import and list entry:

```python
from app.agents.myagent import MyAgent   # add this

AGENTS: list = [
    WebSearchAgent,
    CalculatorAgent,
    MemoryAgent,
    BriefingAgent,
    NotesAgent,
    GeneralAIAgent,
    MyAgent,                              # add this
]
```

`AGENTS` is consumed by the agent manager at startup to instantiate and register every agent.

#### Step 3 — Add keyword routing

Open `apps/orchestrator/app/services/router.py`. Add to both places:

**1. `AGENT_DESCRIPTIONS` dict** (used by the LLM classifier):

```python
AGENT_DESCRIPTIONS: dict[str, str] = {
    # ... existing entries ...
    'myagent': 'Brief description matching what the user would say to trigger this agent',
}
```

**2. `_keyword_route()` function** (fallback when LLM is unavailable):

```python
def _keyword_route(text: str) -> RouteResult:
    t  = text.lower()
    tn = _norm(t)

    # ... existing keyword blocks ...

    if _has(t, 'keyword1', 'keyword2', 'multi word phrase'):
        return RouteResult(agent='myagent', confidence=0.9, reason='keyword:myagent')

    return RouteResult(agent='general', confidence=0.6, reason='keyword:fallback')
```

Add the new block above the final `general` fallback return. Use `_has()` for word-boundary matching; pass multi-word strings as quoted phrases (they are matched as substrings, not word boundaries).

#### Step 4 — Add to AGENT_LABELS in session.py

Open `apps/orchestrator/app/services/session.py` and add the agent to `AGENT_LABELS`:

```python
AGENT_LABELS: dict[str, str] = {
    'websearch':  'Web Search',
    'calculator': 'Calculator',
    'memory':     'Memory',
    'briefing':   'Briefing',
    'notes':      'Notes & Reminders',
    'general':    'General AI',
    'myagent':    'My Agent',    # add this
}
```

`AGENT_LABELS` drives human-readable boot messages for built-in (locally-run) agents.

#### Step 5 — Add to AGENT_BOOT_QUERY in session.py

In the same file, add an entry to `AGENT_BOOT_QUERY`:

```python
AGENT_BOOT_QUERY: dict[str, str] = {
    'websearch':  '',
    'calculator': '',
    'memory':     '',
    'briefing':   '',
    'notes':      '',
    'general':    '',
    'myagent':    '',    # add this — '' skips the boot test call
}
```

The value controls what happens during the boot sequence:
- `''` — skip the test call; the agent is shown as online without a sample query.
- `'__boot__'` — triggers the agent's own boot summary method.
- Any other non-empty string — sent as a live test query to the agent during boot.

Most simple agents use `''`. Use `'__boot__'` only if the agent implements a meaningful startup summary (the `briefing` agent is the canonical example, though it uses `''` because briefing is triggered on demand).

> `_GW_BOOT_CALLS` in the same file is for gateway-backed agents only (weather, stock, news, etc.). Local agents never appear in that dict.

#### Step 6 — Add to AGENT_CATALOGUE in useOrchestratorRuntime.ts

Open `apps/desktop/src/hooks/useOrchestratorRuntime.ts` and add an entry to `AGENT_CATALOGUE`:

```typescript
const AGENT_CATALOGUE: AgentDefinition[] = [
  // ... existing entries ...
  // ── Built-in skills (always enabled) ──────────────────────────────────────
  { id: 'myagent', label: 'My Agent', description: 'One-sentence description shown in the UI.', example: 'Example query the user would say.', status: 'offline', color: 'from-indigo-400 to-violet-500' },
];
```

The `color` field is a Tailwind gradient class used on the agent card. Pick a colour not already in heavy use. `status` must be `'offline'` — the runtime updates it at boot time.

#### Step 7 — Add a palette entry in agentPalette.ts

Open `apps/desktop/src/lib/agentPalette.ts` and add an `AgentPaletteEntry` to `AGENT_PALETTE`:

```typescript
export const AGENT_PALETTE: Record<string, AgentPaletteEntry> = {
  // ... existing entries ...
  myagent: { text: 'text-indigo-400', bg: 'bg-indigo-400/10', border: 'border-indigo-400/25', ring: 'ring-indigo-400/30', glowRgba: 'rgba(129,140,248,0.35)', neonRgba: 'rgba(129,140,248,0.7)' },
};
```

The `AgentPaletteEntry` shape (from the source):

```typescript
export interface AgentPaletteEntry {
  text:     string;   // Tailwind text colour class
  bg:       string;   // Tailwind background class with opacity
  border:   string;   // Tailwind border class with opacity
  ring:     string;   // Tailwind ring class with opacity
  glowRgba: string;   // CSS rgba() for drop-shadow glow at ~35% opacity
  neonRgba: string;   // CSS rgba() for bright neon highlight at ~70% opacity
}
```

The `glowRgba` and `neonRgba` values must be the raw RGB components of the chosen colour. For `indigo-400` (`#818cf8`) that is `rgba(129,140,248,…)`.

#### Step 8 — Register in AgentsSettings.tsx

Open `apps/desktop/src/components/settings/AgentsSettings.tsx`.

**Add the agent ID to the correct group constant** (lines 53–55):

```typescript
// Local/built-in agents with no credential form:
const ALWAYS_ON_IDS = ['websearch', 'calculator', 'memory', 'briefing', 'myagent'] as const;

// Gateway agents that need a credential form:
const GATEWAY_IDS   = ['system', 'weather', 'google', 'github', 'stock', 'news', 'portfolio', 'whatsapp', 'socialmedia'] as const;

// Smart-device agents:
const DEVICE_IDS    = ['smarthome'] as const;
```

Use `ALWAYS_ON_IDS` for agents that need no credentials and are always enabled. Use `GATEWAY_IDS` (plus a credential form component) for agents that require user-provided tokens.

**Add an entry to `AGENT_META`:**

```typescript
const AGENT_META: Record<string, AgentMeta> = {
  // ... existing entries ...
  myagent: { Icon: Sparkles, label: 'My Agent', tagline: 'Short tagline shown under the name' },
};
```

Pick a `LucideIcon` already imported at the top of the file, or add a new import from `lucide-react`. Refer to the existing imports in lines 3–9 of `AgentsSettings.tsx` to see what is already available.

If the agent is in `GATEWAY_IDS`, you also need to add a case to `getState()` and `getToggle()` in the same file, and create a credential form component under `apps/desktop/src/components/settings/`. Follow the pattern of `WeatherSettings.tsx` or `GithubSettings.tsx` as the simplest examples.

---

## Credential Handling Note

- Gateway tools read credentials exclusively from `apps/mcp-gateway/.env` via `GatewaySettings`. Access them as `settings.<field_name>` inside the tool.
- The orchestrator never receives raw credentials. When a user provides tokens in the Settings UI, the orchestrator sends them to the gateway via a `PUT /session/<name>` call (e.g. `PUT /session/github`). The gateway stores them in-memory for the duration of that session.
- New credential fields must always be added to both `apps/mcp-gateway/src/config/settings.py` (as a typed field with a sensible default) and `apps/mcp-gateway/.env.sample` (as a commented-out placeholder). Never add defaults that contain real values.
- If the gateway tool needs a per-session credential endpoint (like `PUT /session/mytool`), add a `Pydantic` request model and `@app.put('/session/mytool')` route to `apps/mcp-gateway/src/main.py`, following the pattern of `update_github_session()`.

---

## Test Checklist

**Run the backend tests:**

```bash
cd apps/orchestrator
.venv/bin/python3 -m pytest tests/ -v
```

**Generate a test stub for a new agent module:**

`scripts/gen_tests.py` scans `apps/orchestrator/app/agents/` and creates a stub for any `.py` that lacks a corresponding test file in `apps/orchestrator/tests/test_agents/`.

```bash
# Preview what would be created (no files written):
python3 scripts/gen_tests.py --dry-run

# Create stubs for all untested modules (safe — never overwrites existing files):
python3 scripts/gen_tests.py

# Show a coverage table:
python3 scripts/gen_tests.py --list
```

New stubs are created at `apps/orchestrator/tests/test_agents/test_<name>.py`. The generated file contains class skeletons and `TODO` placeholders — replace the placeholders with real assertions before considering the agent done.

**Run the full suite:**

```bash
./scripts/test.sh --backend     # pytest only
./scripts/test.sh               # backend + frontend
./scripts/test.sh --coverage    # with HTML report
```
