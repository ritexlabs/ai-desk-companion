from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class GatewayClient:
    """
    HTTP client for the MCP Gateway at apps/mcp-gateway (port 8788).

    Orchestrator calls this to list available tools and invoke them.
    credentials is a flat dict of all session tokens forwarded per-call
    so the gateway can inject only what each server needs.
    """

    def __init__(self, base_url: str, timeout: float = 30.0) -> None:
        self._base = base_url.rstrip('/')
        self._timeout = timeout

    async def health(self) -> dict:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f'{self._base}/health')
            r.raise_for_status()
            return r.json()

    async def list_tools(self) -> list[dict]:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                r = await client.get(f'{self._base}/tools')
                r.raise_for_status()
                return r.json()
        except Exception as exc:
            logger.warning('Gateway list_tools failed: %s', exc)
            return []

    async def call_tool(
        self,
        tool_name: str,
        arguments: dict,
        credentials: dict,
    ) -> Any:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            r = await client.post(
                f'{self._base}/tools/{tool_name}',
                json={'arguments': arguments, 'credentials': credentials},
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
