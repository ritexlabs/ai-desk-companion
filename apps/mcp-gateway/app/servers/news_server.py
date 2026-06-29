from __future__ import annotations

import re
from typing import Any

import httpx

from app.servers.base import BaseMCPServer

_GNEWS_BASE = 'https://gnews.io/api/v4'

COUNTRY_LABELS: dict[str, str] = {
    'ae': 'UAE',          'ar': 'Argentina',    'at': 'Austria',
    'au': 'Australia',    'be': 'Belgium',      'br': 'Brazil',
    'ca': 'Canada',       'cn': 'China',        'de': 'Germany',
    'eg': 'Egypt',        'fr': 'France',       'gb': 'United Kingdom',
    'hk': 'Hong Kong',    'id': 'Indonesia',    'il': 'Israel',
    'in': 'India',        'it': 'Italy',        'jp': 'Japan',
    'kr': 'South Korea',  'mx': 'Mexico',       'my': 'Malaysia',
    'ng': 'Nigeria',      'nl': 'Netherlands',  'nz': 'New Zealand',
    'ph': 'Philippines',  'pl': 'Poland',       'pt': 'Portugal',
    'ru': 'Russia',       'sa': 'Saudi Arabia', 'se': 'Sweden',
    'sg': 'Singapore',    'th': 'Thailand',     'tr': 'Turkey',
    'tw': 'Taiwan',       'ua': 'Ukraine',      'us': 'United States',
    'za': 'South Africa',
}

_QUESTION_RE = re.compile(
    r'^(?:'
    r"what(?:'s| is| are)(?: the| today's| today)?\s+(?:latest\s+)?|"
    r'(?:latest|breaking|top|recent|current)\s+(?:news|headlines?|stories?)\s+(?:about|on|from|in|for|regarding)?\s*|'
    r'(?:show|get|give|fetch)\s+(?:me\s+)?(?:the\s+)?(?:latest\s+|top\s+|breaking\s+)?(?:news|headlines?)\s+(?:about|on|from|in|for)?\s*|'
    r'(?:any\s+)?news\s+(?:about|on|from|in|for|regarding)?\s*'
    r')',
    re.I,
)

_GENERIC_QUERIES = frozenset({
    'news', 'latest news', 'headlines', 'top news', 'breaking news',
    'latest', 'top stories', 'current events', "what's happening",
    'what is happening', "today's news", 'today', 'whats happening',
})


def _extract_topic(text: str) -> str:
    t = _QUESTION_RE.sub('', text.strip()).strip().rstrip('?.!,')
    return t if t.lower() not in _GENERIC_QUERIES else ''


class NewsServer(BaseMCPServer):
    namespace = 'news'

    async def connect(self) -> None:
        pass

    async def disconnect(self) -> None:
        pass

    async def list_tools(self) -> list[dict]:
        return [
            {
                'name': 'get_news',
                'description': (
                    'Get latest news headlines, breaking news, or top stories '
                    'by country or topic using GNews API.'
                ),
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'query': {
                            'type': 'string',
                            'description': 'News query, e.g. "top India news today" or "news about cricket"',
                        },
                    },
                    'required': ['query'],
                },
            }
        ]

    async def call_tool(self, tool_name: str, arguments: dict, credentials: dict) -> Any:
        api_key = credentials.get('news_api_key', '').strip()
        if not api_key:
            return (
                'News agent is not configured. '
                'Please add your GNews API key in Settings → Agents → News Agent.'
            )

        country = credentials.get('news_default_country', 'in').lower().strip()
        query   = arguments.get('query', '')
        topic   = _extract_topic(query)

        location_label = COUNTRY_LABELS.get(country, country.upper())

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                if topic:
                    params: dict = {
                        'token':   api_key,
                        'q':       topic,
                        'lang':    'en',
                        'country': country,
                        'max':     '5',
                        'sortby':  'publishedAt',
                    }
                    resp    = await client.get(f'{_GNEWS_BASE}/search', params=params)
                    header  = f"Latest news about '{topic}'"
                else:
                    params = {
                        'token':   api_key,
                        'lang':    'en',
                        'country': country,
                        'max':     '5',
                    }
                    resp   = await client.get(f'{_GNEWS_BASE}/top-headlines', params=params)
                    header = f'Top headlines from {location_label}'

                resp.raise_for_status()
                articles = resp.json().get('articles', [])

            if not articles:
                subject = f"about '{topic}'" if topic else f'from {location_label}'
                return f'No news found {subject}. Try adjusting your search or location in settings.'

            lines = [header + ':']
            for i, art in enumerate(articles[:5], 1):
                title  = (art.get('title') or 'Untitled').split(' - ')[0].strip()
                source = ((art.get('source') or {}).get('name') or '').strip()
                date   = (art.get('publishedAt') or '')[:10]
                desc   = (art.get('description') or '').strip()
                meta   = ' · '.join(x for x in [source, date] if x)
                lines.append(f'{i}. {title}' + (f' ({meta})' if meta else ''))
                if desc and i <= 3:
                    short = desc[:110] + '…' if len(desc) > 110 else desc
                    lines.append(f'   {short}')

            return '\n'.join(lines)

        except httpx.HTTPStatusError as exc:
            return f'GNews API error {exc.response.status_code}: {exc.response.text[:120]}'
        except Exception as exc:
            return f'Could not fetch news: {str(exc)[:80]}'
