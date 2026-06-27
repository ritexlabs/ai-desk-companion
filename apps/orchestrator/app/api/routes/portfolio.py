from __future__ import annotations

import re
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Body, HTTPException, Query

from app.services.indmoney_mcp import get_indmoney_client, clear_client

router = APIRouter(prefix='/api/portfolio', tags=['portfolio'])

_DEFAULT_ENDPOINT      = 'https://mcp.indmoney.com/mcp'
_ISSUER                = 'https://mcp.indmoney.com/'
_AUTHORIZATION_EP      = 'https://mcp.indmoney.com/authorize'
_TOKEN_EP              = 'https://mcp.indmoney.com/token'
_REGISTRATION_EP       = 'https://mcp.indmoney.com/register'

_PROBE_HEADERS = {
    'Accept':               'application/json',
    'MCP-Protocol-Version': '2025-03-26',
    'User-Agent':           'ModelContextProtocol/1.0 ai-desk-companion',
}


async def _fetch_as_metadata(client: httpx.AsyncClient, url: str) -> dict | None:
    """GET url → return parsed JSON if 200, else None."""
    try:
        r = await client.get(url, headers=_PROBE_HEADERS)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None


async def _resolve_auth_server(client: httpx.AsyncClient, auth_server_url: str) -> dict | None:
    """
    Fetch RFC 8414 server metadata from an authorization-server base URL.
    Returns dict with authorization_endpoint + token_endpoint, or None.
    """
    meta = await _fetch_as_metadata(client, f'{auth_server_url}/.well-known/oauth-authorization-server')
    if meta and meta.get('authorization_endpoint') and meta.get('token_endpoint'):
        return meta
    return None


@router.get('/oauth/meta')
async def oauth_meta():
    """Return the known INDmoney OAuth 2.0 endpoints (no discovery needed)."""
    return {
        'authorization_endpoint': _AUTHORIZATION_EP,
        'token_endpoint':         _TOKEN_EP,
        'registration_endpoint':  _REGISTRATION_EP,
        'scopes':                 ['portfolio:read', 'market:read'],
    }


@router.post('/oauth/register')
async def oauth_register(redirect_uri: str = Body(..., embed=True)):
    """
    Dynamic client registration (RFC 7591) against INDmoney's MCP auth server.
    Returns { client_id, client_secret } which the frontend stores locally.
    """
    payload = {
        'client_name':               'AI Desk Companion',
        'redirect_uris':             [redirect_uri],
        'grant_types':               ['authorization_code', 'refresh_token'],
        'response_types':            ['code'],
        'token_endpoint_auth_method': 'client_secret_post',
        'scope':                     'portfolio:read market:read',
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _REGISTRATION_EP,
                json=payload,
                headers={'Content-Type': 'application/json', 'Accept': 'application/json'},
            )
        if not resp.is_success:
            raise HTTPException(status_code=resp.status_code, detail=resp.text[:400])
        data = resp.json()
        return {
            'client_id':     data.get('client_id', ''),
            'client_secret': data.get('client_secret', ''),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)[:200])


@router.get('/ping')
async def ping(
    token:    str = Query(..., description='INDmoney OAuth access token'),
    endpoint: str = Query(_DEFAULT_ENDPOINT, description='MCP server endpoint'),
):
    """Verify connectivity to the INDmoney MCP server with an OAuth access token."""
    clear_client(token, endpoint)
    try:
        client = get_indmoney_client(endpoint, token)
        status = await client.ping()
        return {'ok': True, 'detail': status}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)[:200])
