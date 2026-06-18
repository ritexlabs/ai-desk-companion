from __future__ import annotations

from datetime import datetime


def local_now() -> datetime:
    """Current time in the local system timezone (timezone-aware)."""
    return datetime.now().astimezone()


def local_today_range() -> tuple[str, str]:
    """
    ISO-format start (00:00:00) and end (23:59:59) of *today* in the local timezone.
    Used for Google Calendar API queries so day boundaries match the user's clock,
    not UTC.
    """
    now   = local_now()
    start = now.replace(hour=0,  minute=0,  second=0,  microsecond=0)
    end   = now.replace(hour=23, minute=59, second=59, microsecond=0)
    return start.isoformat(), end.isoformat()


def utc_now_iso() -> str:
    """Current UTC time as ISO string — for 'next event after now' queries."""
    from datetime import timezone
    return datetime.now(timezone.utc).isoformat()
