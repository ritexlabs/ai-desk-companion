from __future__ import annotations
import hashlib
import time
from dataclasses import dataclass

@dataclass
class _Entry:
    value: str
    expires_at: float

# Per-agent cache TTLs in seconds
_TTL: dict[str, float] = {
    'weather':   300.0,   # 5 min — conditions change slowly
    'stock':      60.0,   # 1 min — market data changes frequently
    'news':      900.0,   # 15 min — headlines are relatively stable
    'github':    120.0,   # 2 min
    'calendar':   30.0,   # 30 sec — schedule is user-editable
    'email':      30.0,   # 30 sec
    'system':     10.0,   # 10 sec — CPU/RAM fluctuates
    'smarthome':  15.0,   # 15 sec — device state changes
    'portfolio': 120.0,   # 2 min
    'whatsapp':   20.0,   # 20 sec
}
_DEFAULT_TTL = 60.0


class AgentResponseCache:
    def __init__(self) -> None:
        self._store: dict[str, _Entry] = {}

    def _key(self, agent_id: str, query: str) -> str:
        h = hashlib.md5(query.lower().strip().encode()).hexdigest()[:10]
        return f'{agent_id}:{h}'

    def get(self, agent_id: str, query: str) -> str | None:
        k = self._key(agent_id, query)
        e = self._store.get(k)
        if e and time.monotonic() < e.expires_at:
            return e.value
        if e:
            del self._store[k]
        return None

    def set(self, agent_id: str, query: str, value: str) -> None:
        ttl = _TTL.get(agent_id, _DEFAULT_TTL)
        self._store[self._key(agent_id, query)] = _Entry(value, time.monotonic() + ttl)

    def invalidate(self, agent_id: str) -> None:
        prefix = f'{agent_id}:'
        for k in [k for k in self._store if k.startswith(prefix)]:
            del self._store[k]

    def clear(self) -> None:
        self._store.clear()


agent_cache = AgentResponseCache()
