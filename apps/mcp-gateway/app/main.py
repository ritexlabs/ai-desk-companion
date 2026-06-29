from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.aggregator import aggregator
from app.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info('MCP Gateway starting on port %d', settings.gateway_port)
    _register_servers()
    await aggregator.startup()
    yield
    await aggregator.shutdown()
    logger.info('MCP Gateway shut down')


def _register_servers() -> None:
    from app.servers.indmoney_mcp_adapter import INDmoneyServer
    from app.servers.github_server import GitHubServer
    from app.servers.google_server import GoogleServer
    from app.servers.weather_server import WeatherServer
    from app.servers.news_server import NewsServer
    from app.servers.system_server import SystemServer
    from app.servers.stocks_server import StocksServer
    aggregator.register(INDmoneyServer())
    aggregator.register(GitHubServer())
    aggregator.register(GoogleServer())
    aggregator.register(WeatherServer())
    aggregator.register(NewsServer())
    aggregator.register(SystemServer())
    aggregator.register(StocksServer())


app = FastAPI(title='MCP Gateway', version='0.1.0', lifespan=lifespan)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get('/health')
async def health():
    return {
        'status': 'ok',
        'servers': aggregator.server_statuses(),
    }


# ── Tools ─────────────────────────────────────────────────────────────────────

@app.get('/tools')
async def list_tools():
    """List all tools available across all connected MCP servers."""
    return await aggregator.list_tools()


class ToolCallRequest(BaseModel):
    arguments: dict = {}
    credentials: dict = {}


@app.post('/tools/{tool_name:path}')
async def call_tool(tool_name: str, body: ToolCallRequest) -> Any:
    """Invoke a namespaced tool by name."""
    try:
        result = await aggregator.call_tool(tool_name, body.arguments, body.credentials)
        return {'ok': True, 'result': result}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)[:300])
