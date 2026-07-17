from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime
from pathlib import Path

_DATA_DIR   = Path(__file__).parents[2] / 'data'
_NOTES_FILE = _DATA_DIR / 'notes.json'

_pending_alerts: list[dict] = []


# ── Storage helpers ───────────────────────────────────────────────────────────

def _load() -> list[dict]:
    try:
        if _NOTES_FILE.exists():
            return json.loads(_NOTES_FILE.read_text())
    except Exception:
        pass
    return []


def _save(items: list[dict]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _NOTES_FILE.write_text(json.dumps(items, indent=2, ensure_ascii=False))


# ── Public CRUD ───────────────────────────────────────────────────────────────

def create_item(
    type: str,
    title: str,
    body: str = '',
    due_at: int | None = None,
    repeat: str | None = None,
    repeat_time: str | None = None,
    repeat_days: list[int] | None = None,
) -> dict:
    item: dict = {
        'id':              uuid.uuid4().hex,
        'type':            type,
        'title':           title.strip(),
        'body':            body.strip(),
        'created_at':      int(datetime.now().timestamp()),
        'due_at':          due_at,
        'repeat':          repeat,
        'repeat_time':     repeat_time,
        'repeat_days':     repeat_days,
        'completed':       False,
        'fired':           False,
        'snoozed_until':   None,
        'last_fired_date': None,
    }
    items = _load()
    items.insert(0, item)
    _save(items)
    return item


def list_items(
    type: str | None = None,
    include_completed: bool = True,
) -> list[dict]:
    items = _load()
    if type:
        items = [i for i in items if i.get('type') == type]
    if not include_completed:
        items = [i for i in items if not i.get('completed')]
    return items


def get_item(item_id: str) -> dict | None:
    return next((i for i in _load() if i['id'] == item_id), None)


def update_item(item_id: str, **kwargs) -> dict | None:
    items = _load()
    for item in items:
        if item['id'] == item_id:
            item.update({k: v for k, v in kwargs.items() if k != 'id'})
            _save(items)
            return item
    return None


def delete_item(item_id: str) -> bool:
    items = _load()
    new   = [i for i in items if i['id'] != item_id]
    if len(new) == len(items):
        return False
    _save(new)
    return True


def complete_item(item_id: str) -> dict | None:
    return update_item(item_id, completed=True, fired=True)


def snooze_item(item_id: str, minutes: int = 10) -> bool:
    until = int(datetime.now().timestamp()) + minutes * 60
    # Reset fired so the scheduler re-triggers when the snooze window expires
    result = update_item(item_id, snoozed_until=until, fired=False)
    return result is not None


def pop_pending_alerts() -> list[dict]:
    alerts = list(_pending_alerts)
    _pending_alerts.clear()
    return alerts


# ── Scheduler ─────────────────────────────────────────────────────────────────

def _check_due_items() -> None:
    now    = datetime.now()
    now_ts = int(now.timestamp())
    items  = _load()
    changed = False

    for item in items:
        if item.get('completed') or item.get('type') == 'note':
            continue

        snoozed = item.get('snoozed_until')
        if snoozed and now_ts < int(snoozed):
            continue

        if item.get('snoozed_until') and now_ts >= int(item['snoozed_until']):
            item['snoozed_until'] = None
            changed = True

        should_fire = False

        if item['type'] in ('reminder', 'task'):
            due_at = item.get('due_at')
            if due_at and not item.get('fired') and now_ts >= int(due_at):
                should_fire  = True
                item['fired'] = True
                changed      = True

        elif item['type'] == 'alarm':
            # One-time alarm: fires once when due_at is reached (same logic as reminder)
            if item.get('repeat') == 'onetime':
                due_at = item.get('due_at')
                if due_at and not item.get('fired') and now_ts >= int(due_at):
                    should_fire   = True
                    item['fired'] = True
                    changed       = True
                continue

            rt = (item.get('repeat_time') or '').strip()
            if rt and ':' in rt:
                try:
                    h, m = map(int, rt.split(':'))
                    target = now.replace(hour=h, minute=m, second=0, microsecond=0)
                    diff   = abs((now - target).total_seconds())
                    today  = now.strftime('%Y-%m-%d')
                    last   = item.get('last_fired_date', '')

                    if diff <= 60 and last != today:
                        repeat = item.get('repeat', 'daily')
                        fire_today = False
                        if repeat == 'daily':
                            fire_today = True
                        elif repeat == 'weekdays':
                            fire_today = now.weekday() < 5
                        elif repeat == 'weekly':
                            days = item.get('repeat_days') or [now.weekday()]
                            fire_today = now.weekday() in days
                        elif repeat == 'monthly':
                            days = item.get('repeat_days') or [now.day]
                            fire_today = now.day in days

                        if fire_today:
                            should_fire            = True
                            item['last_fired_date'] = today
                            changed                = True
                except ValueError:
                    pass

        if should_fire:
            _pending_alerts.append({
                'id':       item['id'],
                'type':     item['type'],
                'title':    item['title'],
                'body':     item.get('body', ''),
                'repeat':   item.get('repeat'),
                'fired_at': now_ts,
            })

    if changed:
        _save(items)


async def scheduler_loop() -> None:
    while True:
        await asyncio.sleep(30)
        try:
            _check_due_items()
        except Exception:
            pass
