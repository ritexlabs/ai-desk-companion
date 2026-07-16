from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class GatewayClient:
    """
    HTTP client for the MCP Gateway (default: apps/mcp-gateway, port 8788).

    The gateway owns all tool credentials in its own .env — this client
    does NOT forward credentials per-call.  It authenticates with a single
    Bearer token (GATEWAY_API_TOKEN) that matches the gateway's configuration.

    To point at an external gateway, change GATEWAY_URL and GATEWAY_API_TOKEN
    in the orchestrator .env — no other code changes needed.
    """

    def __init__(self, base_url: str, api_token: str = '', timeout: float = 30.0) -> None:
        self._base    = base_url.rstrip('/')
        self._token   = api_token
        self._timeout = timeout

    def _headers(self) -> dict:
        if self._token:
            return {'Authorization': f'Bearer {self._token}'}
        return {}

    async def health(self) -> dict:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f'{self._base}/health', headers=self._headers())
            r.raise_for_status()
            return r.json()

    async def list_tools(self) -> list[dict]:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                r = await client.get(f'{self._base}/tools', headers=self._headers())
                r.raise_for_status()
                return r.json()
        except Exception as exc:
            logger.warning('Gateway list_tools failed: %s', exc)
            return []

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            r = await client.post(
                f'{self._base}/tools/{tool_name}',
                json={'arguments': arguments},
                headers=self._headers(),
            )
            if r.status_code == 401:
                raise PermissionError(r.json().get('detail', 'Unauthorized'))
            if r.status_code == 404:
                raise ValueError(r.json().get('detail', f'Unknown tool: {tool_name}'))
            if not r.is_success:
                try:
                    detail = r.json().get('detail', r.text[:300])
                except Exception:
                    detail = r.text[:300]
                raise RuntimeError(detail)
            return r.json().get('result')
