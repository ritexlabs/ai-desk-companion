from __future__ import annotations

import re
from typing import Any

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus
from app.services.hass_mcp import get_hass_client

# ── Patterns ──────────────────────────────────────────────────────────────────

_ON_RE     = re.compile(r'\b(turn\s+on|switch\s+on|enable|activate|open|start)\b', re.I)
_OFF_RE    = re.compile(r'\b(turn\s+off|switch\s+off|disable|deactivate|close|stop|shut\s+off)\b', re.I)
_TOGGLE_RE = re.compile(r'\btoggle\b', re.I)
_BRIGHT_RE = re.compile(r'\b(\d{1,3})\s*(?:percent|%|brightness)\b', re.I)
_TEMP_RE   = re.compile(r'\b(\d{2,3})\s*(?:degrees?|°|celsius|fahrenheit)?\b', re.I)
_COLOR_RE  = re.compile(
    r'\b(red|green|blue|yellow|orange|pink|purple|white|warm|cool|cyan|magenta|teal)\b', re.I
)

_COLOR_MAP: dict[str, list[int]] = {
    'red':     [255, 0,   0],
    'green':   [0,   255, 0],
    'blue':    [0,   0,   255],
    'yellow':  [255, 255, 0],
    'orange':  [255, 127, 0],
    'pink':    [255, 105, 180],
    'purple':  [128, 0,   128],
    'white':   [255, 255, 255],
    'warm':    [255, 200, 120],
    'cool':    [200, 220, 255],
    'cyan':    [0,   255, 255],
    'magenta': [255, 0,   255],
    'teal':    [0,   128, 128],
}

# Keywords that imply a specific domain
_DOMAIN_HINTS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\b(light|lights?|lamp|bulb|illuminat)\b', re.I), 'light'),
    (re.compile(r'\b(switch|plug|outlet|socket)\b', re.I),        'switch'),
    (re.compile(r'\b(fan)\b', re.I),                              'fan'),
    (re.compile(r'\b(cover|blind|curtain|shutter|shade)\b', re.I),'cover'),
    (re.compile(r'\b(lock|door\s*lock)\b', re.I),                 'lock'),
    (re.compile(r'\b(thermostat|climate|ac|air\s*con|heat)\b', re.I), 'climate'),
    (re.compile(r'\b(scene)\b', re.I),                            'scene'),
    (re.compile(r'\b(automation|routine)\b', re.I),               'automation'),
]

_STOP_WORDS = re.compile(
    r'\b(the|my|please|can you|could you|i want|i need|turn|switch|set|make|change|'
    r'all|every|light|lights|lamp|bulb|switch|fan|cover|lock|scene|automation)\b',
    re.I,
)


class SmartHomeAgent(AssistantAgent):
    id   = 'smarthome'
    name = 'Smart Home'

    async def initialize(self) -> None:
        return None

    async def health(self) -> AgentHealth:
        return AgentHealth(name=self.name, status=AgentStatus.ONLINE)

    async def shutdown(self) -> None:
        return None

    # ── Credentials ───────────────────────────────────────────────────

    def _creds(self, request: AgentRequest) -> tuple[str, str]:
        cfg      = (request.context or {}).get('agent_config', {})
        endpoint = (cfg.get('endpoint') or '').rstrip('/')
        token    = (cfg.get('token')    or '').strip()
        return endpoint, token

    # ── Entry point ───────────────────────────────────────────────────

    async def handle(self, request: AgentRequest) -> AgentResponse:
        endpoint, token = self._creds(request)

        if not endpoint or not token:
            return AgentResponse(
                agent=self.id,
                text=(
                    'Smart Home is not configured. '
                    'Add your Home Assistant URL and token in Settings → Agents → Smart Home.'
                ),
            )

        client = get_hass_client(endpoint, token)

        if request.text.strip() == '__boot__':
            return await self._boot(client)

        return await self._dispatch(request.text, client)

    # ── Boot ──────────────────────────────────────────────────────────

    async def _boot(self, client) -> AgentResponse:
        try:
            overview = await client.call_tool('system_overview')
            if isinstance(overview, dict):
                location = overview.get('location_name', 'Home')
                total    = overview.get('total_entities', '?')
                active   = overview.get('active_entities', overview.get('on_entities', '?'))
                return AgentResponse(agent=self.id, text=f'{location} — {total} devices, {active} active.')
            if isinstance(overview, str):
                return AgentResponse(agent=self.id, text=overview.split('.')[0] + '.')
            return AgentResponse(agent=self.id, text='Smart Home connected.')
        except Exception as e:
            return AgentResponse(agent=self.id, text=f'Smart Home connected. ({str(e)[:60]})')

    # ── Top-level dispatch ────────────────────────────────────────────

    async def _dispatch(self, text: str, client) -> AgentResponse:
        t = text.lower()

        # Status / overview
        if re.search(r'\b(list|show|what|status|how many|all devices|which|overview|summary)\b', t):
            return await self._summary(client)

        # Brightness or color — call light service directly
        if _BRIGHT_RE.search(text) or _COLOR_RE.search(text):
            return await self._set_light_attrs(text, client)

        # Climate temperature
        if re.search(r'\b(thermostat|temperature|ac|air\s*con|heat|cool|climate)\b', t):
            return await self._climate(text, client)

        # Scene / automation
        if re.search(r'\b(scene|automation|routine|mode)\b', t):
            return await self._scene(text, client)

        # Turn on / off / toggle
        action = (
            'toggle' if _TOGGLE_RE.search(t) else
            'on'     if _ON_RE.search(t)     else
            'off'    if _OFF_RE.search(t)    else
            None
        )
        if action:
            return await self._control(text, action, client)

        return await self._summary(client)

    # ── Summary ───────────────────────────────────────────────────────

    async def _summary(self, client) -> AgentResponse:
        try:
            data = await client.call_tool('system_overview')
            if isinstance(data, dict):
                parts = [f'{k.replace("_", " ")}: {v}' for k, v in data.items()
                         if isinstance(v, (int, str)) and k not in ('context',)]
                return AgentResponse(agent=self.id, text='Home status — ' + ', '.join(parts[:8]) + '.')
            return AgentResponse(agent=self.id, text=str(data)[:300])
        except Exception as e:
            return AgentResponse(agent=self.id, text=f'Could not fetch home status: {str(e)[:80]}')

    # ── Control (on / off / toggle) ───────────────────────────────────
    #
    # Strategy:
    #   1. Detect domain from keyword hints in the command
    #   2. Extract a device name (strip all control words)
    #   3. If a specific name remains → search for that entity, control it
    #   4. If no specific name → broadcast service to the whole domain
    #      (e.g. "turn on lights" → light.turn_on with no entity_id → all lights)

    async def _control(self, text: str, action: str, client) -> AgentResponse:
        domain = self._infer_domain(text)
        name   = self._extract_name(text)

        if name and domain:
            return await self._control_named(name, domain, action, client)
        if name:
            return await self._control_named(name, domain, action, client)
        if domain:
            return await self._control_domain(domain, action, client)

        # No domain or name clue — try all controllable domains
        return AgentResponse(
            agent=self.id,
            text="I'm not sure which device you mean. Try 'turn on the lights' or 'turn off kitchen switch'.",
        )

    def _infer_domain(self, text: str) -> str | None:
        for pattern, domain in _DOMAIN_HINTS:
            if pattern.search(text):
                return domain
        return None

    def _extract_name(self, text: str) -> str:
        cleaned = _ON_RE.sub('', _OFF_RE.sub('', _TOGGLE_RE.sub('', text)))
        cleaned = _STOP_WORDS.sub('', cleaned)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        return cleaned

    async def _control_domain(self, domain: str, action: str, client) -> AgentResponse:
        """Broadcast a service call to an entire domain — no entity_id required."""
        service_map = {
            'on':     {'light': 'turn_on', 'switch': 'turn_on', 'fan': 'turn_on',
                       'cover': 'open_cover', 'lock': 'unlock'},
            'off':    {'light': 'turn_off', 'switch': 'turn_off', 'fan': 'turn_off',
                       'cover': 'close_cover', 'lock': 'lock'},
            'toggle': {'light': 'toggle', 'switch': 'toggle', 'fan': 'toggle'},
        }
        service = service_map.get(action, {}).get(domain)
        if not service:
            return AgentResponse(agent=self.id, text=f"I don't know how to {action} {domain} devices.")
        try:
            await client.call_tool('call_service_tool', {'domain': domain, 'service': service, 'data': {}})
            verb = {'on': 'turned on', 'off': 'turned off', 'toggle': 'toggled'}[action]
            label = {'light': 'lights', 'switch': 'switches', 'fan': 'fans',
                     'cover': 'covers', 'lock': 'locks'}.get(domain, f'{domain} devices')
            return AgentResponse(agent=self.id, text=f'All {label} {verb}.')
        except Exception as e:
            return AgentResponse(agent=self.id, text=f'Could not {action} {domain}: {str(e)[:80]}')

    async def _control_named(self, name: str, domain: str | None, action: str, client) -> AgentResponse:
        """Find a specific entity by name and control it."""
        try:
            kwargs: dict[str, Any] = {'search_query': name, 'detailed': True, 'limit': 5}
            if domain:
                kwargs['domain'] = domain
            entities = await client.call_tool('list_entities', kwargs)
            entity   = self._pick(entities, name)

            if not entity and domain:
                # Retry without domain restriction
                entities = await client.call_tool('list_entities', {'search_query': name, 'detailed': True, 'limit': 5})
                entity   = self._pick(entities, name)

            if not entity:
                # Fall back to domain-wide broadcast if we at least know the domain
                if domain:
                    return await self._control_domain(domain, action, client)
                return AgentResponse(
                    agent=self.id,
                    text=f"I couldn't find a device matching '{name}'. Try using its exact name.",
                )

            eid    = entity.get('entity_id', '')
            fname  = entity.get('attributes', {}).get('friendly_name', eid)
            dev_domain = eid.split('.')[0]

            service_map = {
                'on':     {'light': 'turn_on', 'switch': 'turn_on', 'fan': 'turn_on',
                           'cover': 'open_cover', 'lock': 'unlock', 'climate': 'turn_on'},
                'off':    {'light': 'turn_off', 'switch': 'turn_off', 'fan': 'turn_off',
                           'cover': 'close_cover', 'lock': 'lock', 'climate': 'turn_off'},
                'toggle': {'light': 'toggle', 'switch': 'toggle', 'fan': 'toggle'},
            }
            service = service_map.get(action, {}).get(dev_domain, f'turn_{action}' if action in ('on', 'off') else None)
            if not service:
                return AgentResponse(agent=self.id, text=f"I can't {action} {fname}.")

            await client.call_tool('call_service_tool', {
                'domain':  dev_domain,
                'service': service,
                'data':    {'entity_id': eid},
            })
            verb = {'on': 'turned on', 'off': 'turned off', 'toggle': 'toggled'}.get(action, action)
            return AgentResponse(agent=self.id, text=f'{fname} {verb}.')

        except Exception as e:
            return AgentResponse(agent=self.id, text=f'Could not control device: {str(e)[:80]}')

    def _pick(self, entities: Any, query: str) -> dict | None:
        if not entities:
            return None
        if isinstance(entities, dict):
            return entities
        if not isinstance(entities, list):
            return None
        if len(entities) == 1:
            return entities[0]
        q = query.lower()
        # Exact friendly-name match first
        for e in entities:
            fname = e.get('attributes', {}).get('friendly_name', '').lower()
            if q == fname:
                return e
        # Partial match
        for e in entities:
            fname = e.get('attributes', {}).get('friendly_name', '').lower()
            if q in fname or fname in q:
                return e
        return entities[0]

    # ── Light brightness / color ──────────────────────────────────────

    async def _set_light_attrs(self, text: str, client) -> AgentResponse:
        name = re.sub(r'\b(brightness|percent|%|color|colour|set|to|at|make|change|light|lights?)\b', '', text, flags=re.I)
        name = _BRIGHT_RE.sub('', _COLOR_RE.sub('', name)).strip()

        try:
            if name:
                raw    = await client.call_tool('list_entities', {'domain': 'light', 'search_query': name, 'detailed': True, 'limit': 5})
                entity = self._pick(raw, name)
            else:
                entity = None

            data: dict = {}
            parts: list[str] = []

            bright_m = _BRIGHT_RE.search(text)
            if bright_m:
                data['brightness_pct'] = int(bright_m.group(1))
                parts.append(f'{bright_m.group(1)}% brightness')

            color_m = _COLOR_RE.search(text)
            if color_m:
                rgb = _COLOR_MAP.get(color_m.group(1).lower())
                if rgb:
                    data['rgb_color'] = rgb
                    parts.append(f'{color_m.group(1)} color')

            if entity:
                eid   = entity.get('entity_id', '')
                fname = entity.get('attributes', {}).get('friendly_name', eid)
                data['entity_id'] = eid
            else:
                fname = 'lights'  # broadcast to all lights

            await client.call_tool('call_service_tool', {'domain': 'light', 'service': 'turn_on', 'data': data})
            desc = ' and '.join(parts) if parts else 'settings updated'
            return AgentResponse(agent=self.id, text=f'{fname} set to {desc}.')
        except Exception as e:
            return AgentResponse(agent=self.id, text=f'Could not adjust light: {str(e)[:80]}')

    # ── Climate ───────────────────────────────────────────────────────

    async def _climate(self, text: str, client) -> AgentResponse:
        name = re.sub(r'\b(thermostat|temperature|ac|air\s*con|heat|cool|climate|set|to)\b', '', text, flags=re.I).strip()
        try:
            entities = await client.call_tool('list_entities', {'domain': 'climate', 'detailed': True, 'limit': 5})
            entity   = self._pick(entities, name) if name else (entities[0] if isinstance(entities, list) and entities else None)
            if not entity:
                return AgentResponse(agent=self.id, text='No climate devices found.')

            eid    = entity.get('entity_id', '')
            fname  = entity.get('attributes', {}).get('friendly_name', eid)
            temp_m = _TEMP_RE.search(text)

            if temp_m:
                temp = float(temp_m.group(1))
                await client.call_tool('call_service_tool', {
                    'domain':  'climate',
                    'service': 'set_temperature',
                    'data':    {'entity_id': eid, 'temperature': temp},
                })
                return AgentResponse(agent=self.id, text=f'{fname} set to {temp}°.')

            state = entity.get('state', 'unknown')
            attrs = entity.get('attributes', {})
            cur   = attrs.get('current_temperature', '?')
            tgt   = attrs.get('temperature', '?')
            return AgentResponse(agent=self.id, text=f'{fname} is {state}. Current: {cur}°, target: {tgt}°.')
        except Exception as e:
            return AgentResponse(agent=self.id, text=f'Could not reach climate device: {str(e)[:80]}')

    # ── Scene ─────────────────────────────────────────────────────────

    async def _scene(self, text: str, client) -> AgentResponse:
        name = re.sub(r'\b(scene|automation|routine|mode|activate|run|trigger|turn\s+on)\b', '', text, flags=re.I).strip()
        try:
            kwargs: dict[str, Any] = {'domain': 'scene', 'detailed': True, 'limit': 5}
            if name:
                kwargs['search_query'] = name
            entities = await client.call_tool('list_entities', kwargs)
            entity   = self._pick(entities, name) if name else (entities[0] if isinstance(entities, list) and entities else None)
            if not entity:
                return AgentResponse(agent=self.id, text=f"Scene '{name}' not found.")
            eid   = entity.get('entity_id', '')
            fname = entity.get('attributes', {}).get('friendly_name', eid)
            await client.call_tool('call_service_tool', {'domain': 'scene', 'service': 'turn_on', 'data': {'entity_id': eid}})
            return AgentResponse(agent=self.id, text=f'Scene "{fname}" activated.')
        except Exception as e:
            return AgentResponse(agent=self.id, text=f'Could not activate scene: {str(e)[:80]}')
