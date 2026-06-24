from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.hass_mcp import get_hass_client

router = APIRouter(prefix='/api/smarthome', tags=['smarthome'])

_DASHBOARD_DOMAINS = {
    'light', 'switch', 'climate', 'cover', 'media_player',
    'fan', 'lock', 'vacuum', 'input_boolean', 'scene', 'automation', 'script',
    'sensor', 'binary_sensor',
}


class CallServiceRequest(BaseModel):
    endpoint: str
    token:    str
    domain:   str
    service:  str
    data:     dict = {}


@router.get('/ping')
async def ping(
    endpoint: str = Query(..., description='Home Assistant base URL'),
    token:    str = Query(..., description='Long-lived access token'),
):
    """Verify connectivity to Home Assistant via MCP — returns location_name."""
    try:
        client   = get_hass_client(endpoint, token)
        overview = await client.call_tool('system_overview')
        if isinstance(overview, dict):
            return {'ok': True, 'location_name': overview.get('location_name', 'Home'), 'detail': overview}
        return {'ok': True, 'location_name': 'Home', 'detail': str(overview)[:200]}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e)[:200])


@router.get('/states')
async def get_states(
    endpoint: str = Query(..., description='Home Assistant base URL'),
    token:    str = Query(..., description='Long-lived access token'),
):
    """Fetch all entity states from Home Assistant via a single MCP call, grouped by domain."""
    try:
        client  = get_hass_client(endpoint, token)
        # Single call — avoids parallel writes that corrupt the Docker stdin pipe
        raw     = await client.call_tool('list_entities', {'detailed': True, 'limit': 500})
        entities: list = raw if isinstance(raw, list) else []

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

    except Exception as e:
        raise HTTPException(status_code=503, detail=f'Cannot reach Home Assistant: {str(e)[:120]}')


@router.post('/call')
async def call_service(body: CallServiceRequest):
    """Call a Home Assistant service via MCP (e.g. light/turn_on)."""
    try:
        client = get_hass_client(body.endpoint, body.token)
        result = await client.call_tool('call_service_tool', {
            'domain':  body.domain,
            'service': body.service,
            'data':    body.data,
        })
        return {'ok': True, 'result': result}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'Service call failed: {str(e)[:120]}')
