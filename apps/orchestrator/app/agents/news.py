from __future__ import annotations

import re

import httpx

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus


_QUESTION_RE = re.compile(
    r'^(?:'
    r"what(?:'s| is| are)(?: the| today's| today)?\s+(?:latest\s+)?|"
    r'(?:latest|breaking|top|recent|current)\s+(?:news|headlines?|stories?)\s+(?:about|on|from|in|for|regarding)?\s*|'
    r'(?:show|get|give|fetch)\s+(?:me\s+)?(?:the\s+)?(?:latest\s+|top\s+|breaking\s+)?(?:news|headlines?)\s+(?:about|on|from|in|for)?\s*|'
    r'(?:any\s+)?news\s+(?:about|on|from|in|for|regarding)?\s*'
    r')',
    re.I,
)

COUNTRY_LABELS: dict[str, str] = {
    'ae': 'UAE',          'ar': 'Argentina',    'at': 'Austria',
    'au': 'Australia',    'be': 'Belgium',      'bg': 'Bulgaria',
    'br': 'Brazil',       'ca': 'Canada',       'ch': 'Switzerland',
    'cn': 'China',        'co': 'Colombia',     'cu': 'Cuba',
    'cz': 'Czech Republic','de': 'Germany',     'eg': 'Egypt',
    'fr': 'France',       'gb': 'United Kingdom','gr': 'Greece',
    'hk': 'Hong Kong',    'hu': 'Hungary',      'id': 'Indonesia',
    'ie': 'Ireland',      'il': 'Israel',       'in': 'India',
    'it': 'Italy',        'jp': 'Japan',        'kr': 'South Korea',
    'lt': 'Lithuania',    'lv': 'Latvia',       'ma': 'Morocco',
    'mx': 'Mexico',       'my': 'Malaysia',     'ng': 'Nigeria',
    'nl': 'Netherlands',  'no': 'Norway',       'nz': 'New Zealand',
    'ph': 'Philippines',  'pl': 'Poland',       'pt': 'Portugal',
    'ro': 'Romania',      'rs': 'Serbia',       'ru': 'Russia',
    'sa': 'Saudi Arabia', 'se': 'Sweden',       'sg': 'Singapore',
    'si': 'Slovenia',     'sk': 'Slovakia',     'th': 'Thailand',
    'tr': 'Turkey',       'tw': 'Taiwan',       'ua': 'Ukraine',
    'us': 'United States','ve': 'Venezuela',    'za': 'South Africa',
}

_GENERIC_QUERIES = frozenset({
    'news', 'latest news', 'headlines', 'top news', 'breaking news',
    'latest', 'top stories', 'current events', "what's happening",
    'what is happening', "today's news", 'today', 'whats happening',
})

_GNEWS_BASE = 'https://gnews.io/api/v4'


def _extract_topic(text: str) -> str:
    t = _QUESTION_RE.sub('', text.strip()).strip().rstrip('?.!,')
    return t if t.lower() not in _GENERIC_QUERIES else ''


class NewsAgent(AssistantAgent):
    id = 'news'
    name = 'News'

    async def initialize(self) -> None:
        return None

    async def health(self) -> AgentHealth:
        return AgentHealth(name=self.name, status=AgentStatus.ONLINE)

    async def shutdown(self) -> None:
        return None

    async def handle(self, request: AgentRequest) -> AgentResponse:
        cfg = request.context.get('agent_config', {})
        api_key = (cfg.get('api_key') or '').strip()

        if not api_key:
            return AgentResponse(
                agent=self.id,
                text='News agent is not configured. Please add your GNews API key in Settings → Agents → News Agent.',
            )

        country = (cfg.get('country') or 'in').lower().strip()
        state   = (cfg.get('state')   or '').strip()
        city    = (cfg.get('city')    or '').strip()

        location_label = city or state or COUNTRY_LABELS.get(country, country.upper())
        is_boot = request.text.strip() == '__boot__'

        if is_boot:
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.get(
                        f'{_GNEWS_BASE}/top-headlines',
                        params={'token': api_key, 'lang': 'en', 'country': country, 'max': '5'},
                    )
                    resp.raise_for_status()
                    count = len(resp.json().get('articles', []))
                return AgentResponse(
                    agent=self.id,
                    text=f"{count} articles ready ({location_label}).",
                )
            except Exception as exc:
                return AgentResponse(agent=self.id, text=f'Could not fetch news: {str(exc)[:60]}')

        topic = _extract_topic(request.text)

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                if topic:
                    q_parts = []
                    if city:
                        q_parts.append(city)
                    elif state:
                        q_parts.append(state)
                    q_parts.append(topic)

                    params: dict[str, str] = {
                        'token':   api_key,
                        'q':       ' '.join(q_parts),
                        'lang':    'en',
                        'country': country,
                        'max':     '5',
                        'sortby':  'publishedAt',
                    }
                    endpoint  = 'search'
                    header    = f"Latest news about '{topic}'"
                    max_show  = 5
                    show_desc = True
                    if city or state:
                        header += f' in {city or state}'
                else:
                    params = {
                        'token':   api_key,
                        'lang':    'en',
                        'country': country,
                        'max':     '5',
                    }
                    if city or state:
                        params['q'] = city or state
                        endpoint = 'search'
                    else:
                        endpoint = 'top-headlines'
                    header    = f'Top headlines from {location_label}'
                    max_show  = 5
                    show_desc = True

                resp = await client.get(f'{_GNEWS_BASE}/{endpoint}', params=params)
                resp.raise_for_status()
                data = resp.json()

            articles = data.get('articles', [])
            if not articles:
                subject = f"about '{topic}'" if topic else f'from {location_label}'
                return AgentResponse(
                    agent=self.id,
                    text=f'No news found {subject}. Try adjusting your search or location in settings.',
                )

            lines = [header + ':']
            for i, art in enumerate(articles[:max_show], 1):
                title  = (art.get('title') or 'Untitled').split(' - ')[0].strip()
                source = ((art.get('source') or {}).get('name') or '').strip()
                date   = (art.get('publishedAt') or '')[:10]
                desc   = (art.get('description') or '').strip()

                meta = ' · '.join(x for x in [source, date] if x)
                lines.append(f'{i}. {title}' + (f' ({meta})' if meta else ''))
                if show_desc and desc and i <= 3:
                    short = desc[:110] + '…' if len(desc) > 110 else desc
                    lines.append(f'   {short}')

            return AgentResponse(agent=self.id, text='\n'.join(lines))

        except httpx.HTTPStatusError as exc:
            msg = exc.response.text[:120] if exc.response else str(exc)
            return AgentResponse(agent=self.id, text=f'GNews API error {exc.response.status_code}: {msg}')
        except Exception as exc:
            return AgentResponse(agent=self.id, text=f'Could not fetch news: {str(exc)[:80]}')
