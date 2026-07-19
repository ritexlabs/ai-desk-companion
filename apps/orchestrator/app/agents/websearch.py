from __future__ import annotations

import httpx

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus


class WebSearchAgent(AssistantAgent):
    id = 'websearch'
    name = 'Web Search'
    config_key = None
    tool_meta = {
        'description': (
            'Search the web for current information, recent events, live facts, prices, '
            'or anything that may have changed after the AI training cutoff. '
            'Use whenever the user asks about current/recent news, "latest", "today", '
            'specific facts you are unsure about, or anything time-sensitive.'
        ),
        'query_hint': 'Concise web search query, e.g. "current gold price India" or "Python 3.13 release date"',
    }

    async def initialize(self) -> None:
        return None

    async def health(self) -> AgentHealth:
        return AgentHealth(name=self.name, status=AgentStatus.ONLINE)

    async def shutdown(self) -> None:
        return None

    async def handle(self, request: AgentRequest) -> AgentResponse:
        query = request.text.strip()
        if not query:
            return AgentResponse(agent=self.id, text='Please provide a search query.')
        return AgentResponse(agent=self.id, text=await self._search(query))

    async def _search(self, query: str) -> str:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(
                    'https://api.duckduckgo.com/',
                    params={
                        'q':              query,
                        'format':         'json',
                        'no_redirect':    '1',
                        'no_html':        '1',
                        'skip_disambig':  '1',
                    },
                    headers={'User-Agent': 'AI-Desk-Companion/1.0'},
                )
            if r.status_code != 200:
                return 'Web search is unavailable right now.'

            data   = r.json()
            parts: list[str] = []

            if data.get('Answer'):
                parts.append(data['Answer'])
            if data.get('AbstractText'):
                src  = data.get('AbstractSource', '')
                text = data['AbstractText'][:450]
                parts.append(f'{text} (Source: {src})' if src else text)
            if not parts:
                for topic in (data.get('RelatedTopics') or [])[:3]:
                    if isinstance(topic, dict) and topic.get('Text'):
                        parts.append(topic['Text'][:160])

            if parts:
                return ' '.join(parts)[:600]
            return f'No direct result found for "{query}". Try rephrasing or ask me to search for something more specific.'

        except httpx.TimeoutException:
            return 'Web search timed out. Please try again.'
        except Exception:
            return 'Web search failed. Check your internet connection.'
