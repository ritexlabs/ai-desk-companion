from __future__ import annotations

import asyncio
import json
import re

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
    'smarthome': ('smarthome__list_entities',    {'domain': 'switch', 'detailed': False, 'limit': 50}),
}


def _extract_switch_states(raw: str) -> str:
    """Reduce list_entities output to sorted 'entity_id:state' lines.

    Strips timestamps/attributes so only an actual on/off flip triggers a diff.
    """
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            pairs = sorted(
                f"{e['entity_id']}:{e['state']}"
                for e in data
                if isinstance(e, dict) and 'entity_id' in e and 'state' in e
            )
            return '\n'.join(pairs) if pairs else raw[:300]
    except Exception:
        pass
    # Fallback: regex for both single-quoted and double-quoted representations
    pairs = re.findall(r"['\"]entity_id['\"]\s*:\s*['\"]([^'\"]+)['\"][^}]*['\"]state['\"]\s*:\s*['\"]([^'\"]+)['\"]", raw)
    if pairs:
        return '\n'.join(sorted(f"{eid}:{st}" for eid, st in pairs))
    return raw[:300]


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
            summary = _extract_switch_states(str(result)) if aid == 'smarthome' else str(result)
            return aid, {'ok': True, 'summary': summary}
        except PermissionError:
            return aid, {'ok': False, 'summary': '__auth__'}
        except Exception as exc:
            return aid, {'ok': False, 'summary': str(exc)[:100]}

    pairs = await asyncio.gather(*[_check(a) for a in ids])
    return dict(pairs)
