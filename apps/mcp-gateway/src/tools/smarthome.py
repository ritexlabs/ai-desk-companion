from __future__ import annotations

from typing import Any

from src.config.settings import settings
from src.tools.base import BaseTool
from src.tools.hass_mcp import close_all, get_hass_client
from src.utils.errors import ToolAuthError, ToolNotFoundError


class SmartHomeTool(BaseTool):
    """MCP adapter for Home Assistant via the voska/hass-mcp Docker container."""

    namespace = 'smarthome'

    async def list_tools(self) -> list[dict]:
        return [
            {
                'name': 'system_overview',
                'description': (
                    'Get a summary of the Home Assistant instance: location name, '
                    'total entity count, and active entity count. '
                    'Use this for boot checks and "home status" queries.'
                ),
                'inputSchema': {'type': 'object', 'properties': {}, 'required': []},
            },
            {
                'name': 'list_entities',
                'description': (
                    'Search and list Home Assistant entities. '
                    'Use to find the entity_id for a device before controlling it, '
                    'or to list all devices in a domain (e.g. all lights).'
                ),
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'domain':       {'type': 'string', 'description': 'Entity domain filter, e.g. light, switch, climate, cover, lock, fan, scene, automation'},
                        'search_query': {'type': 'string', 'description': 'Fuzzy name search, e.g. "bedroom" or "kitchen light"'},
                        'detailed':     {'type': 'boolean', 'description': 'Include full attributes (default true)'},
                        'limit':        {'type': 'integer', 'description': 'Max entities to return (default 20)'},
                    },
                },
            },
            {
                'name': 'call_service',
                'description': (
                    'Call a Home Assistant service to control a device. '
                    'Examples: light/turn_on, light/turn_off, switch/toggle, '
                    'climate/set_temperature, scene/turn_on, cover/open_cover, lock/unlock. '
                    'Always use list_entities first to get the entity_id.'
                ),
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'domain':    {'type': 'string', 'description': 'Service domain, e.g. light, switch, climate, scene'},
                        'service':   {'type': 'string', 'description': 'Service name, e.g. turn_on, turn_off, toggle, set_temperature'},
                        'data':      {'type': 'object', 'description': 'Service data, e.g. {"entity_id": "light.bedroom", "brightness_pct": 50}'},
                    },
                    'required': ['domain', 'service'],
                },
            },
        ]

    def _require_client(self):
        endpoint = (settings.myhome_mcp_endpoint or '').strip().rstrip('/')
        token    = (settings.myhome_mcp_token    or '').strip()
        if not endpoint or not token:
            raise ToolAuthError(
                'Smart Home not configured. '
                'Add MYHOME_MCP_ENDPOINT and MYHOME_MCP_TOKEN to the gateway .env file.'
            )
        return get_hass_client(endpoint, token)

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        client = self._require_client()

        if tool_name == 'system_overview':
            return await client.call_tool('system_overview')

        if tool_name == 'list_entities':
            args: dict = {'detailed': arguments.get('detailed', True)}
            if 'domain'       in arguments: args['domain']       = arguments['domain']
            if 'search_query' in arguments: args['search_query'] = arguments['search_query']
            args['limit'] = arguments.get('limit', 20)
            return await client.call_tool('list_entities', args)

        if tool_name == 'call_service':
            return await client.call_tool('call_service_tool', {
                'domain':  arguments.get('domain', ''),
                'service': arguments.get('service', ''),
                'data':    arguments.get('data', {}),
            })

        raise ToolNotFoundError(f'Unknown smarthome tool: {tool_name}')

    async def shutdown(self) -> None:
        await close_all()
