from __future__ import annotations

import asyncio

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus


_AGENT_QUERIES: dict[str, str] = {
    'weather':   'Give me a one-sentence current weather summary.',
    'calendar':  'What events or meetings do I have scheduled today?',
    'news':      'Give me exactly 3 top news headlines right now.',
    'smarthome': 'Give me a brief status summary of my home devices.',
}

_AGENT_LABELS: dict[str, str] = {
    'weather':   'Weather',
    'calendar':  'Calendar',
    'news':      'News',
    'smarthome': 'Home',
}


class BriefingAgent(AssistantAgent):
    id = 'briefing'
    name = 'Briefing'
    config_key = None
    tool_meta = {
        'description': (
            'Compile a full morning briefing or status dashboard by querying all connected '
            'agents in parallel — weather, calendar, news, and smart home. '
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

        enabled  = set(agent_manager._session_enabled_agents)
        targets  = [(aid, q) for aid, q in _AGENT_QUERIES.items() if aid in enabled]

        if not targets:
            return AgentResponse(
                agent=self.id,
                text=(
                    'No agents are connected for a briefing. '
                    'Enable Weather, Calendar, News, or Smart Home in Settings to get a full summary.'
                ),
            )

        results = await asyncio.gather(*[
            self._query(aid, q, request.context) for aid, q in targets
        ])

        parts = [f'{label}: {text}' for label, text in results if text]
        if not parts:
            return AgentResponse(
                agent=self.id,
                text='Could not reach any agents for a briefing right now. Please try again.',
            )
        return AgentResponse(agent=self.id, text=' | '.join(parts))

    async def _query(self, agent_id: str, query: str, context: dict) -> tuple[str, str]:
        from app.dependencies import agent_manager

        label = _AGENT_LABELS.get(agent_id, agent_id.title())
        try:
            resp = await agent_manager.handle(
                agent_id,
                AgentRequest(text=query, context=context),
            )
            text = resp.text.strip()
            if not text or 'error' in text.lower() or 'not configured' in text.lower():
                return label, ''
            return label, text[:300]
        except Exception:
            return label, ''
