from __future__ import annotations

import asyncio
from functools import partial

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from src.config.settings import settings
from src.services import tunnel as _tunnel

router = APIRouter(prefix='/api/tunnel', tags=['tunnel'])


@router.get('/status')
async def tunnel_status():
    return _tunnel.status(settings.gateway_port)


@router.post('/start')
async def tunnel_start():
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, partial(_tunnel.start, settings.gateway_port))


@router.post('/stop')
async def tunnel_stop():
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _tunnel.stop)


@router.get('/config', response_class=PlainTextResponse)
async def get_tunnel_config():
    from src.services.tunnel import _CFG_FILE
    if not _CFG_FILE.exists():
        return PlainTextResponse('# No config file exists yet. Start a named tunnel to auto-generate.', status_code=200)
    return PlainTextResponse(_CFG_FILE.read_text())


@router.post('/config')
async def save_tunnel_config(body: dict):
    """Save YAML content to the cloudflared config file."""
    from src.services.tunnel import _CFG_DIR, _CFG_FILE
    content = body.get('content', '')
    _CFG_DIR.mkdir(parents=True, exist_ok=True)
    _CFG_FILE.write_text(content)
    return {'ok': True}
