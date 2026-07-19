from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.dependencies import gateway_client

router = APIRouter(prefix='/api/smarthome', tags=['smarthome'])

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
