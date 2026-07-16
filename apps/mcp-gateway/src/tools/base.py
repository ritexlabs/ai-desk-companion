from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BaseTool(ABC):
    """
    Abstract base for all gateway tool implementations.

    Tools own their credentials via src.config.settings — no credentials are
    forwarded per-call from the orchestrator.  The namespace prefix is applied
    by ToolRegistry when listing/routing, so tool names here must NOT include it.
    """

    namespace: str  # e.g. 'weather', 'github'

    @abstractmethod
    async def list_tools(self) -> list[dict]:
        """
        Return tool descriptors for this namespace.
        Each dict: {name, description, inputSchema}.
        Names must NOT include the namespace prefix.
        """

    @abstractmethod
    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        """Invoke a tool by its bare name (without namespace prefix)."""

    async def startup(self) -> None:
        """Called once at gateway startup. Override to open connections."""

    async def shutdown(self) -> None:
        """Called once at gateway shutdown. Override to close connections."""
