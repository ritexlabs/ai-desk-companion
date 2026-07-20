from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.dependencies import gateway_client

router = APIRouter(prefix='/api/smarthome', tags=['smarthome'])

# Resolve apps/smarthome/ relative to this file's location inside the orchestrator package
_SMARTHOME_DIR = Path(__file__).parents[4] / 'smarthome'
_MODE_FILE     = _SMARTHOME_DIR / '.mode'


def _read_mode() -> str:
    try:
        return _MODE_FILE.read_text().strip()
    except OSError:
        return 'local'


def _write_mode(mode: str) -> None:
    _MODE_FILE.parent.mkdir(parents=True, exist_ok=True)
    _MODE_FILE.write_text(mode)

_DASHBOARD_DOMAINS = {
    'light', 'switch', 'climate', 'cover', 'media_player',
    'fan', 'lock', 'vacuum', 'input_boolean', 'scene', 'automation', 'script',
    'sensor', 'binary_sensor',
}


class CallServiceRequest(BaseModel):
    endpoint: str = ''   # ignored — gateway uses its own credentials
    token:    str = ''   # ignored — gateway uses its own credentials
    domain:   str
    service:  str
    data:     dict = {}


@router.get('/ping')
async def ping(
    endpoint: str = Query('', description='Ignored — credentials are in gateway .env'),
    token:    str = Query('', description='Ignored — credentials are in gateway .env'),
):
    """Verify connectivity to Home Assistant via the MCP Gateway."""
    try:
        raw = await gateway_client.call_tool('smarthome__system_overview', {})
        if isinstance(raw, dict):
            return {'ok': True, 'location_name': raw.get('location_name', 'Home'), 'detail': raw}
        return {'ok': True, 'location_name': 'Home', 'detail': str(raw)[:200]}
    except PermissionError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e)[:200])


@router.get('/states')
async def get_states(
    endpoint: str = Query('', description='Ignored — credentials are in gateway .env'),
    token:    str = Query('', description='Ignored — credentials are in gateway .env'),
):
    """Fetch all entity states from Home Assistant via the MCP Gateway."""
    try:
        raw      = await gateway_client.call_tool('smarthome__list_entities', {'detailed': True, 'limit': 500})
        entities = raw if isinstance(raw, list) else []

        grouped: dict[str, list[dict]] = {}
        for e in entities:
            if not isinstance(e, dict):
                continue
            entity_id = e.get('entity_id', '')
            domain    = entity_id.split('.')[0] if '.' in entity_id else ''
            if domain not in _DASHBOARD_DOMAINS:
                continue
            grouped.setdefault(domain, []).append({
                'entity_id':    entity_id,
                'state':        e.get('state'),
                'attributes':   e.get('attributes', {}),
                'last_changed': e.get('last_changed'),
                'last_updated': e.get('last_updated'),
            })

        return {'domains': grouped, 'total': sum(len(v) for v in grouped.values())}

    except PermissionError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'Cannot reach Home Assistant: {str(e)[:120]}')


@router.post('/call')
async def call_service(body: CallServiceRequest):
    """Call a Home Assistant service via the MCP Gateway."""
    try:
        result = await gateway_client.call_tool('smarthome__call_service', {
            'domain':  body.domain,
            'service': body.service,
            'data':    body.data,
        })
        return {'ok': True, 'result': result}
    except PermissionError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'Service call failed: {str(e)[:120]}')


# ── Docker container control ──────────────────────────────────────────────────

@router.get('/docker/mode')
async def docker_mode():
    """Return the persisted smarthome mode (local / remote)."""
    return {'mode': _read_mode()}


@router.post('/docker/start')
async def docker_start():
    """Start the local HA Docker container and persist mode=local."""
    if not (_SMARTHOME_DIR / 'docker-compose.yml').exists():
        raise HTTPException(status_code=404, detail='docker-compose.yml not found in apps/smarthome/')
    _write_mode('local')
    try:
        r = await asyncio.to_thread(
            subprocess.run,
            ['docker', 'compose', 'up', '-d', '--remove-orphans'],
            cwd=str(_SMARTHOME_DIR),
            capture_output=True, text=True, timeout=60,
        )
        if r.returncode == 0:
            return {'ok': True, 'message': 'Home Assistant starting'}
        raise HTTPException(status_code=503, detail=(r.stderr or r.stdout).strip()[:300])
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=503, detail='docker compose timed out')
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail='Docker not found — is Docker Desktop running?')


async def _bg_docker_stop() -> None:
    """Background task: stop the HA container after the response has been sent."""
    try:
        await asyncio.to_thread(
            subprocess.run,
            ['docker', 'compose', 'stop'],
            cwd=str(_SMARTHOME_DIR),
            capture_output=True, timeout=60,
        )
    except Exception:
        pass  # best-effort; mode file is already written


@router.post('/docker/stop')
async def docker_stop():
    """Persist mode=remote immediately and stop the container in the background.

    Returns instantly so the UI can switch without waiting for Docker.
    """
    if not (_SMARTHOME_DIR / 'docker-compose.yml').exists():
        raise HTTPException(status_code=404, detail='docker-compose.yml not found in apps/smarthome/')
    _write_mode('remote')
    asyncio.create_task(_bg_docker_stop())
    return {'ok': True, 'message': 'Switching to self-hosted — container stopping in background'}
