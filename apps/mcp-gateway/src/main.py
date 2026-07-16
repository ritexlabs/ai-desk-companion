from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

from src.config.settings import settings
from src.routers.portfolio import router as portfolio_router
from src.routers.system import router as system_router
from src.routers.tunnel import router as tunnel_router
from src.routers.whatsapp import router as whatsapp_router
from src.tools.registry import registry
from src.utils.errors import ToolAuthError, ToolNotFoundError, sanitize_error
from src.utils.logger import configure_logging, get_logger

configure_logging()
logger = get_logger(__name__)

# ── MCP protocol server (optional — degrades to REST-only if unavailable) ─────

_mcp_session_manager = None

def _setup_mcp_server() -> None:
    global _mcp_session_manager
    try:
        from mcp.server import Server
        from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
        from mcp.types import TextContent, Tool

        mcp_server = Server('mcp-gateway')

        @mcp_server.list_tools()
        async def _list_tools():
            tools = await registry.list_tools()
            return [
                Tool(
                    name=t['name'],
                    description=t.get('description', ''),
                    inputSchema=t.get('inputSchema', {}),
                )
                for t in tools
            ]

        @mcp_server.call_tool()
        async def _call_tool(name: str, arguments: dict):
            result = await registry.call_tool(name, arguments or {})
            text   = result if isinstance(result, str) else json.dumps(result)
            return [TextContent(type='text', text=text)]

        _mcp_session_manager = StreamableHTTPSessionManager(mcp_server, stateless=True)
        logger.info('MCP StreamableHTTP protocol enabled at /mcp')
    except Exception as exc:
        logger.warning('MCP server unavailable — REST-only mode: %s', exc)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio as _asyncio
    logger.info('MCP Gateway starting on port %d', settings.gateway_port)
    _register_tools()
    _setup_mcp_server()
    await registry.startup()

    # Auto-start Cloudflare tunnel when CLOUDFLARE_TUNNEL_NAME or WHATSAPP_WEBHOOK_DOMAIN is set
    if (settings.cloudflare_tunnel_name or '').strip() or (settings.whatsapp_webhook_domain or '').strip():
        from src.services import tunnel as _tunnel
        from functools import partial

        def _start():
            try:
                result = _tunnel.start(settings.gateway_port)
                logger.info('Cloudflare tunnel started: %s', result.get('url') or result.get('mode'))
            except Exception as exc:
                logger.warning('Cloudflare tunnel auto-start failed: %s', exc)

        loop = _asyncio.get_event_loop()
        loop.run_in_executor(None, _start)

    if _mcp_session_manager is not None:
        async with _mcp_session_manager.run():
            logger.info('MCP Gateway ready')
            yield
    else:
        logger.info('MCP Gateway ready (REST-only)')
        yield

    await registry.shutdown()
    logger.info('MCP Gateway stopped')


def _register_tools() -> None:
    from src.tools.weather    import WeatherTool
    from src.tools.stocks     import StocksTool
    from src.tools.news       import NewsTool
    from src.tools.github     import GitHubTool
    from src.tools.google     import GoogleTool
    from src.tools.system     import SystemTool
    from src.tools.portfolio  import PortfolioTool
    from src.tools.smarthome  import SmartHomeTool
    from src.tools.whatsapp   import WhatsAppTool

    registry.register(WeatherTool())
    registry.register(StocksTool())
    registry.register(NewsTool())
    registry.register(GitHubTool())
    registry.register(GoogleTool())
    registry.register(SystemTool())
    registry.register(PortfolioTool())
    registry.register(SmartHomeTool())
    registry.register(WhatsAppTool())


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title='MCP Gateway',
    version='2.0.0',
    description='Secure, modular MCP tool gateway for AI Desk Companion',
    lifespan=lifespan,
    docs_url='/docs',
    redoc_url=None,
)

# ── CORS ──────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:5173', 'http://localhost:4173', 'http://localhost:8787', 'tauri://localhost'],
    allow_credentials=True,
    allow_methods=['GET', 'POST', 'DELETE'],
    allow_headers=['Authorization', 'Content-Type'],
)

# ── Security headers ──────────────────────────────────────────────────────────

class _SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options']        = 'DENY'
        response.headers['X-XSS-Protection']       = '1; mode=block'
        response.headers['Cache-Control']           = 'no-store'
        return response

app.add_middleware(_SecurityHeadersMiddleware)

# ── Bearer auth ───────────────────────────────────────────────────────────────

_AUTH_EXEMPT = {
    '/health', '/docs', '/openapi.json',
    '/webhook/whatsapp',
    '/api/tunnel/status', '/api/tunnel/start', '/api/tunnel/stop',
    '/api/whatsapp/status',
    '/api/system/config',
    '/auth/indmoney', '/auth/indmoney/callback',
    '/api/portfolio/status',
    '/api/portfolio/data',
}


class _BearerAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.auth_enabled():
            return await call_next(request)
        if request.url.path in _AUTH_EXEMPT:
            return await call_next(request)

        auth = request.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return JSONResponse({'detail': 'Authorization header required'}, status_code=401)
        if auth[7:] != settings.gateway_api_token:
            return JSONResponse({'detail': 'Invalid token'}, status_code=401)

        return await call_next(request)

app.add_middleware(_BearerAuthMiddleware)

app.include_router(portfolio_router)
app.include_router(system_router)
app.include_router(tunnel_router)
app.include_router(whatsapp_router)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get('/health')
async def health():
    return {
        'status': 'ok',
        'version': '2.0.0',
        'auth': settings.auth_enabled(),
        'mcp_protocol': _mcp_session_manager is not None,
        'tools': registry.status(),
    }


# ── Tools — REST interface ────────────────────────────────────────────────────

@app.get('/tools')
async def list_tools():
    """List all tools available across all registered tool namespaces."""
    return await registry.list_tools()


class ToolCallRequest(BaseModel):
    arguments: dict = {}


@app.post('/tools/{tool_name:path}')
async def call_tool(tool_name: str, body: ToolCallRequest) -> Any:
    """Invoke a namespaced tool by name (e.g. weather__get_current_weather)."""
    try:
        result = await registry.call_tool(tool_name, body.arguments)
        return {'ok': True, 'result': result}
    except ToolNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ToolAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    except Exception as exc:
        logger.warning('Tool call failed (%s): %s', tool_name, exc)
        raise HTTPException(status_code=503, detail=sanitize_error(exc, max_len=300))


# ── WhatsApp webhook ──────────────────────────────────────────────────────────

@app.get('/webhook/whatsapp')
async def wa_verify_webhook(
    request: Request,
) -> Any:
    """Meta webhook verification handshake (GET). Exempt from Bearer auth."""
    from fastapi.responses import PlainTextResponse
    params    = request.query_params
    mode      = params.get('hub.mode')
    token     = params.get('hub.verify_token')
    challenge = params.get('hub.challenge', '')
    expected  = settings.whatsapp_webhook_verify_token
    if mode == 'subscribe' and expected and token == expected:
        return PlainTextResponse(challenge)
    return JSONResponse({'detail': 'Forbidden'}, status_code=403)


@app.post('/webhook/whatsapp')
async def wa_receive_webhook(request: Request) -> dict:
    """Receive incoming WhatsApp messages from Meta (POST). Exempt from Bearer auth.

    Also accepts relay calls from the orchestrator with the X-Hub-Signature-256
    header forwarded so signature validation still works end-to-end.
    Always returns 200 for valid requests — non-200 causes Meta to retry.
    """
    import json as _json
    from src.tools.whatsapp import push_incoming, update_delivery, verify_meta_signature

    body = await request.body()
    sig  = request.headers.get('x-hub-signature-256')
    if not verify_meta_signature(body, sig, settings.whatsapp_app_secret):
        return JSONResponse({'detail': 'Forbidden'}, status_code=403)

    try:
        data = _json.loads(body)
        for entry in data.get('entry', []):
            for change in entry.get('changes', []):
                value    = change.get('value', {})
                contacts = {
                    c['wa_id']: c.get('profile', {}).get('name', c['wa_id'])
                    for c in value.get('contacts', [])
                }
                # Incoming messages
                for msg in value.get('messages', []):
                    msg_type    = msg.get('type', '')
                    sender_id   = msg.get('from', '')
                    sender_name = contacts.get(sender_id, sender_id)
                    wamid       = msg.get('id', '')
                    timestamp   = int(msg.get('timestamp', 0))
                    if msg_type == 'text':
                        body_text = msg.get('text', {}).get('body', '')
                    elif msg_type in ('image', 'audio', 'video', 'document', 'sticker'):
                        body_text = f'[{msg_type.capitalize()}]'
                    elif msg_type == 'location':
                        loc = msg.get('location', {})
                        body_text = f'[Location {loc.get("latitude", "")},{loc.get("longitude", "")}]'
                    else:
                        body_text = f'[{msg_type}]' if msg_type else ''
                    if sender_id and body_text:
                        push_incoming(sender_id, sender_name, body_text, timestamp, wamid)
                # Delivery status updates
                for stat in value.get('statuses', []):
                    wamid      = stat.get('id', '')
                    new_status = stat.get('status', '')
                    errors     = stat.get('errors', [])
                    err_code   = errors[0].get('code') if errors else None
                    if wamid and new_status:
                        update_delivery(wamid, new_status, err_code)
    except Exception as exc:
        logger.warning('WhatsApp webhook parse error: %s', exc)
    return {'status': 'ok'}


# ── MCP protocol endpoint — StreamableHTTP ────────────────────────────────────

@app.api_route('/mcp', methods=['GET', 'POST', 'DELETE'])
async def handle_mcp(request: Request):
    """MCP StreamableHTTP endpoint. Accepts connections from any MCP client."""
    if _mcp_session_manager is None:
        raise HTTPException(status_code=503, detail='MCP protocol not available')
    return await _mcp_session_manager.handle_request(request)
