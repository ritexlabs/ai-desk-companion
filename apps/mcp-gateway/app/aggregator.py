from __future__ import annotations

import logging
from typing import Any

from app.servers.base import BaseMCPServer

logger = logging.getLogger(__name__)


class MCPAggregator:
    """
    Manages all registered MCP server adapters and provides a unified
    tool namespace to the gateway API.

    Tool names are namespaced as  <server.namespace>__<bare_name>,
    e.g. weather__get_current_weather, indmoney__get_networth.
    """

    def __init__(self) -> None:
        self._servers: list[BaseMCPServer] = []

    def register(self, server: BaseMCPServer) -> None:
        self._servers.append(server)

    async def startup(self) -> None:
        """Connect all registered servers. Failures are logged, not raised."""
        for server in self._servers:
            try:
                await server.connect()
                logger.info('MCP server connected: %s', server.namespace)
            except Exception as exc:
                logger.warning('MCP server failed to connect (%s): %s', server.namespace, exc)

    async def shutdown(self) -> None:
        for server in self._servers:
            try:
                await server.disconnect()
            except Exception:
                pass

    async def list_tools(self) -> list[dict]:
        """Return all tools across all connected servers, namespaced."""
        tools: list[dict] = []
        for server in self._servers:
            try:
                bare_tools = await server.list_tools()
                for t in bare_tools:
                    tools.append({
                        **t,
                        'name': f'{server.namespace}__{t["name"]}',
                    })
            except Exception as exc:
                logger.warning('list_tools failed for %s: %s', server.namespace, exc)
        return tools

    async def call_tool(self, namespaced_name: str, arguments: dict, credentials: dict) -> Any:
        """
        Route a namespaced tool call to the correct server.
        Raises ValueError if the namespace is unknown.
        """
        if '__' not in namespaced_name:
            raise ValueError(f'Tool name must be namespaced: {namespaced_name!r}')

        namespace, bare_name = namespaced_name.split('__', 1)

        for server in self._servers:
            if server.namespace == namespace:
                return await server.call_tool(bare_name, arguments, credentials)

        raise ValueError(f'No server registered for namespace: {namespace!r}')

    def server_statuses(self) -> list[dict]:
        """Return a status entry per registered server (for /health)."""
        return [{'id': s.namespace} for s in self._servers]


aggregator = MCPAggregator()
