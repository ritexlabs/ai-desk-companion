from __future__ import annotations

import re
from datetime import datetime, timedelta

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus
from app.services import notes_service as _ns


_ADD_REMINDER_RE = re.compile(
    r'(?:remind(?:er)?|alert|notify).*?(?:me\s+(?:to\s+|about\s+)?)?(.+?)\s+'
    r'(?:at|on|in|by|tomorrow|today)\s+(.+)',
    re.I,
)
_ADD_TASK_RE = re.compile(
    r'(?:add\s+(?:a\s+)?task|create\s+(?:a\s+)?task|to.?do|add\s+todo)\s*:?\s*(.+)',
    re.I,
)
_ADD_NOTE_RE = re.compile(
    r'(?:add\s+(?:a\s+)?note|note(?:\s+down)?|jot(?:\s+down)?|write(?:\s+down)?)\s*:?\s*(.+)',
    re.I,
)
_ADD_ALARM_RE = re.compile(
    r'(?:set\s+(?:an?\s+)?alarm|add\s+(?:an?\s+)?alarm)\s+(?:for\s+)?(.+?)\s+at\s+(\d+(?::\d+)?\s*(?:am|pm)?)',
    re.I,
)
_LIST_RE  = re.compile(r'(?:list|show|what are|what\'?s on)\s+(?:my\s+)?(?:notes?|tasks?|reminders?|alarms?|todos?)', re.I)
_COMPLETE_RE = re.compile(r'(?:complete|done|finish|mark)\s+(?:task\s+)?(?:as\s+done\s+)?(.+)', re.I)
_DELETE_RE = re.compile(r'(?:delete|remove|cancel)\s+(?:my\s+)?(?:note|task|reminder|alarm)?\s*(.+)', re.I)


def _parse_time_offset(text: str) -> int | None:
    """Parse natural-language time expressions → unix timestamp."""
    text = text.strip().lower()
    now  = datetime.now()

    if 'tomorrow' in text:
        base = now + timedelta(days=1)
        m = re.search(r'(\d+)(?::(\d+))?\s*(am|pm)?', text)
        if m:
            h = int(m.group(1))
            mn = int(m.group(2) or 0)
            if m.group(3) == 'pm' and h < 12: h += 12
            if m.group(3) == 'am' and h == 12: h = 0
            return int(base.replace(hour=h, minute=mn, second=0, microsecond=0).timestamp())
        return int((base.replace(hour=9, minute=0, second=0, microsecond=0)).timestamp())

    m = re.search(r'in\s+(\d+)\s+(minute|hour)s?', text)
    if m:
        n = int(m.group(1))
        if 'hour' in m.group(2):
            return int((now + timedelta(hours=n)).timestamp())
        return int((now + timedelta(minutes=n)).timestamp())

    m = re.search(r'(\d+)(?::(\d+))?\s*(am|pm)?', text)
    if m:
        h = int(m.group(1))
        mn = int(m.group(2) or 0)
        period = (m.group(3) or '').lower()
        if period == 'pm' and h < 12: h += 12
        if period == 'am' and h == 12: h = 0
        dt = now.replace(hour=h, minute=mn, second=0, microsecond=0)
        if dt < now:
            dt += timedelta(days=1)
        return int(dt.timestamp())

    return None


def _parse_hhmm(text: str) -> str | None:
    """Parse HH:MM from natural time expression."""
    text = text.strip().lower()
    m = re.search(r'(\d+)(?::(\d+))?\s*(am|pm)?', text)
    if not m:
        return None
    h = int(m.group(1))
    mn = int(m.group(2) or 0)
    period = (m.group(3) or '').lower()
    if period == 'pm' and h < 12: h += 12
    if period == 'am' and h == 12: h = 0
    return f'{h:02d}:{mn:02d}'


class NotesAgent(AssistantAgent):
    id = 'notes'
    name = 'Notes & Reminders'
    config_key = None
    tool_meta = {
        'description': (
            'Manage personal notes, tasks, reminders, and alarms. '
            'Use when user says "add a note", "remind me to", "set an alarm", '
            '"add task", "show my reminders", "complete task", or "delete reminder".'
        ),
        'query_hint': (
            'The notes/reminders command, e.g. "add task buy groceries", '
            '"remind me to take medicine at 8pm", "set alarm for standup at 9am daily", '
            '"show my tasks", "complete task buy groceries", "delete reminder doctor"'
        ),
    }

    async def initialize(self) -> None:
        return None

    async def health(self) -> AgentHealth:
        return AgentHealth(name=self.name, status=AgentStatus.ONLINE)

    async def shutdown(self) -> None:
        return None

    async def handle(self, request: AgentRequest) -> AgentResponse:
        q = request.text.strip()
        if not q:
            return AgentResponse(agent=self.id, text='What would you like to note or be reminded of?')

        text = (
            self._try_add_alarm(q)
            or self._try_add_reminder(q)
            or self._try_add_task(q)
            or self._try_add_note(q)
            or self._try_list(q)
            or self._try_complete(q)
            or self._try_delete(q)
            or (
                "I can help with notes, tasks, reminders, and alarms. "
                "Try: \"add task buy groceries\", \"remind me to call mom at 5pm\", "
                "\"set alarm for medicines at 8am daily\", or \"show my tasks\"."
            )
        )
        return AgentResponse(agent=self.id, text=text)

    def _try_add_alarm(self, q: str) -> str | None:
        m = _ADD_ALARM_RE.match(q)
        if not m:
            return None
        title    = m.group(1).strip()
        time_str = m.group(2).strip()
        hhmm     = _parse_hhmm(time_str)
        repeat   = 'daily'
        if 'weekday' in q.lower(): repeat = 'weekdays'
        elif 'weekly' in q.lower(): repeat = 'weekly'
        if not hhmm:
            return f'Could not understand the time "{time_str}". Please say something like "at 8am".'
        _ns.create_item('alarm', title, repeat=repeat, repeat_time=hhmm)
        return f'Alarm set: "{title}" at {hhmm} every {repeat}.'

    def _try_add_reminder(self, q: str) -> str | None:
        m = _ADD_REMINDER_RE.search(q)
        if not m:
            return None
        title    = m.group(1).strip()
        time_str = m.group(2).strip()
        due_ts   = _parse_time_offset(time_str)
        if not due_ts:
            return f'Could not understand when "{time_str}". Try "at 5pm" or "in 30 minutes".'
        dt = datetime.fromtimestamp(due_ts)
        _ns.create_item('reminder', title, due_at=due_ts)
        return f'Reminder set: "{title}" at {dt.strftime("%I:%M %p, %b %d")}.'

    def _try_add_task(self, q: str) -> str | None:
        m = _ADD_TASK_RE.match(q)
        if not m:
            return None
        title = m.group(1).strip()
        _ns.create_item('task', title)
        return f'Task added: "{title}".'

    def _try_add_note(self, q: str) -> str | None:
        m = _ADD_NOTE_RE.match(q)
        if not m:
            return None
        content = m.group(1).strip()
        title   = content[:60] + ('…' if len(content) > 60 else '')
        body    = content if len(content) > 60 else ''
        _ns.create_item('note', title, body=body)
        return f'Note saved: "{title}".'

    def _try_list(self, q: str) -> str | None:
        if not _LIST_RE.search(q):
            return None
        items = _ns.list_items(include_completed=False)
        if not items:
            return "You don't have any notes, tasks, or reminders yet."
        by_type: dict[str, list] = {}
        for item in items[:10]:
            by_type.setdefault(item['type'], []).append(item['title'])
        parts = []
        for t, titles in by_type.items():
            parts.append(f'{t.title()}s: {", ".join(titles[:3])}{"…" if len(titles) > 3 else ""}')
        return '. '.join(parts) + '.'

    def _try_complete(self, q: str) -> str | None:
        m = _COMPLETE_RE.match(q)
        if not m:
            return None
        keyword = m.group(1).strip().lower()
        items   = _ns.list_items('task', include_completed=False)
        match   = next((i for i in items if keyword in i['title'].lower()), None)
        if not match:
            return f'No open task matching "{keyword}" found.'
        _ns.complete_item(match['id'])
        return f'Task completed: "{match["title"]}".'

    def _try_delete(self, q: str) -> str | None:
        m = _DELETE_RE.match(q)
        if not m:
            return None
        keyword = m.group(1).strip().lower()
        items   = _ns.list_items()
        match   = next((i for i in items if keyword in i['title'].lower()), None)
        if not match:
            return f'No item matching "{keyword}" found.'
        _ns.delete_item(match['id'])
        return f'Deleted: "{match["title"]}".'
