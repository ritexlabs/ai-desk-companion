from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BaseMCPServer(ABC):
    """Abstract base for all MCP server adapters managed by the gateway."""

    namespace: str  # prefix applied to all tool names, e.g. 'weather'

    @abstractmethod
    async def connect(self) -> None:
        """Establish connection to the underlying MCP server."""

    @abstractmethod
    async def disconnect(self) -> None:
        """Tear down the connection gracefully."""

    @abstractmethod
    async def list_tools(self) -> list[dict]:
        """
        Return tools exposed by this server.
        Each dict must have at minimum: name, description, inputSchema.
        Names must NOT include the namespace prefix — the aggregator adds it.
        """

    @abstractmethod
    async def call_tool(self, tool_name: str, arguments: dict, credentials: dict) -> Any:
        """
        Invoke a tool by its bare name (without namespace prefix).
        credentials is a flat dict of all session credentials forwarded from
        the orchestrator; each server extracts only what it needs.
        """
