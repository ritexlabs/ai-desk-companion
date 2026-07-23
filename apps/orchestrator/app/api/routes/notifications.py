from __future__ import annotations

import asyncio

from fastapi import APIRouter, Query

from app.dependencies import gateway_client

router = APIRouter()

# Maps agent_id → (gateway_tool_name, arguments)
_POLL_MAP: dict[str, tuple[str, dict]] = {
    'email':     ('google__get_emails',          {'query': 'unread'}),
    'calendar':  ('google__get_calendar_events', {'query': 'today'}),
    'github':    ('github__get_notifications',   {}),
    'weather':   ('weather__get_current_weather', {'query': 'current weather'}),
    'news':      ('news__get_news',              {'query': 'top headlines'}),
    'portfolio': ('indmoney__query_portfolio',   {'query': 'portfolio summary'}),
    'system':    ('system__get_system_info',     {'query': 'cpu memory load'}),
    'smarthome': ('smarthome__system_overview',  {}),
}


@router.get('/api/notifications/poll')
async def notifications_poll(agents: str = Query('')) -> dict:
    """Poll multiple agents concurrently for notification summaries.

    ?agents=email,github,news  — comma-separated agent IDs
    Returns { agent_id: {ok, summary} } for each recognised agent.
    """
    ids = [a.strip() for a in agents.split(',') if a.strip() in _POLL_MAP]
    if not ids:
        return {}

    async def _check(aid: str) -> tuple[str, dict]:
        tool, args = _POLL_MAP[aid]
        try:
            result = await gateway_client.call_tool(tool, args)
            return aid, {'ok': True, 'summary': str(result)}
        except PermissionError:
            return aid, {'ok': False, 'summary': '__auth__'}
        except Exception as exc:
            return aid, {'ok': False, 'summary': str(exc)[:100]}

    pairs = await asyncio.gather(*[_check(a) for a in ids])
    return dict(pairs)
