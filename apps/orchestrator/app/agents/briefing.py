from __future__ import annotations

import asyncio

from app.agents.base import AssistantAgent
from app.models.agent_message import AgentMessage
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus


class BriefingAgent(AssistantAgent):
    id = 'briefing'
    name = 'Briefing'
    config_key = None
    tool_meta = {
        'description': (
            'Compile a full morning briefing or status dashboard — '
            'weather, calendar, news, and smart home — all in one response. '
            'Use when the user asks for a briefing, morning summary, dashboard, '
            'or "what\'s happening today".'
        ),
        'query_hint': 'Type of briefing, e.g. "morning briefing" or "full status summary"',
    }

    async def initialize(self) -> None:
        return None

    async def health(self) -> AgentHealth:
        return AgentHealth(name=self.name, status=AgentStatus.ONLINE)

    async def shutdown(self) -> None:
        return None

    async def handle(self, request: AgentRequest) -> AgentResponse:
        from app.dependencies import agent_manager

        enabled = set(agent_manager.enabled_agents)

        tasks = [
            ('Weather',  self._call('weather__get_current_weather',   {'query': 'current weather'})),
            ('Calendar', self._call('google__get_calendar_events',     {'query': 'events today'})),
            ('News',     self._call('news__get_news',                  {'query': 'top 3 headlines'})),
        ]

        if 'smarthome' in enabled:
            tasks.append(
                ('Home', self._call('smarthome__system_overview', {}))
            )

        labels, coros = zip(*tasks)
        results = await asyncio.gather(*coros, return_exceptions=True)

        parts = []
        for label, result in zip(labels, results):
            text = result if isinstance(result, str) else ''
            if text and 'not configured' not in text.lower() and 'error' not in text.lower():
                parts.append(f'{label}: {text[:300]}')

        if not parts:
            return AgentResponse(
                agent=self.id,
                text=(
                    'No services are connected for a briefing. '
                    'Enable Weather, Calendar, News, or Smart Home in Settings.'
                ),
            )
        return AgentResponse(agent=self.id, text=' | '.join(parts))

    async def _call(self, tool_name: str, arguments: dict) -> str:
        from app.dependencies import agent_manager
        try:
            return await agent_manager.call_agent_from_agent(
                AgentMessage(source_agent=self.id, tool_name=tool_name, arguments=arguments)
            )
        except Exception:
            return ''
