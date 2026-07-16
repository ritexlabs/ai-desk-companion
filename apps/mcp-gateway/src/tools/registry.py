from __future__ import annotations

import logging
from typing import Any

from src.tools.base import BaseTool
from src.utils.errors import ToolNotFoundError

logger = logging.getLogger(__name__)


class ToolRegistry:
    """
    Manages all registered tool implementations and provides a unified,
    namespaced interface to the gateway API.

    Tool names are exposed as  <tool.namespace>__<bare_name>,
    e.g. weather__get_current_weather, indmoney__query_portfolio.
    """

    def __init__(self) -> None:
        self._tools: list[BaseTool] = []

    def register(self, tool: BaseTool) -> None:
        self._tools.append(tool)
        logger.info('Registered tool namespace: %s', tool.namespace)

    async def startup(self) -> None:
        for tool in self._tools:
            try:
                await tool.startup()
                logger.info('Tool started: %s', tool.namespace)
            except Exception as exc:
                logger.warning('Tool startup failed (%s): %s', tool.namespace, exc)

    async def shutdown(self) -> None:
        for tool in self._tools:
            try:
                await tool.shutdown()
            except Exception:
                pass

    async def list_tools(self) -> list[dict]:
        """Return all tools across all registered tools, with namespace prefix."""
        tools: list[dict] = []
        for tool in self._tools:
            try:
                bare_tools = await tool.list_tools()
                for t in bare_tools:
                    tools.append({**t, 'name': f'{tool.namespace}__{t["name"]}'})
            except Exception as exc:
                logger.warning('list_tools failed for %s: %s', tool.namespace, exc)
        return tools

    async def call_tool(self, namespaced_name: str, arguments: dict) -> Any:
        """
        Route a namespaced tool call to the correct implementation.
        Raises ToolNotFoundError if the namespace is not registered.
        """
        if '__' not in namespaced_name:
            raise ToolNotFoundError(f'Tool name must be namespaced: {namespaced_name!r}')

        namespace, bare_name = namespaced_name.split('__', 1)

        for tool in self._tools:
            if tool.namespace == namespace:
                return await tool.call_tool(bare_name, arguments)

        raise ToolNotFoundError(f'No tool registered for namespace: {namespace!r}')

    def namespaces(self) -> list[str]:
        return [t.namespace for t in self._tools]

    def status(self) -> list[dict]:
        return [{'namespace': t.namespace} for t in self._tools]


registry = ToolRegistry()
