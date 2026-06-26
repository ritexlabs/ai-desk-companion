from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.services.tunnel import tunnel_service

router = APIRouter(prefix='/api/tunnel', tags=['tunnel'])


class StartRequest(BaseModel):
    provider:      str  # 'cloudflare'
    custom_domain: str = ''   # optional domain override from UI


@router.post('/start')
async def start_tunnel(body: StartRequest) -> dict:
    """Start a Cloudflare tunnel.

    CLOUDFLARE_DOMAIN from .env is used as a fallback when the UI domain field is empty.
    """
    if body.provider != 'cloudflare':
        raise HTTPException(status_code=400, detail='Only the cloudflare provider is supported')

    domain = (body.custom_domain or settings.cloudflare_domain).strip()

    try:
        await tunnel_service.start(provider='cloudflare', port=8787, domain=domain)
        return _snapshot()
    except RuntimeError as e:
        msg = str(e)
        if 'already in progress' in msg:
            return _snapshot()
        raise HTTPException(status_code=503, detail=msg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:200])


@router.get('/status')
async def tunnel_status() -> dict:
    """Current tunnel state. Includes env_domain so the UI can pre-fill the field."""
    return _snapshot()


@router.post('/stop')
async def stop_tunnel() -> dict:
    """Terminate the active tunnel process."""
    await tunnel_service.stop()
    return {'ok': True, **_snapshot()}


def _snapshot() -> dict:
    snap = tunnel_service.snapshot()
    snap['env_domain'] = settings.cloudflare_domain
    return snap
