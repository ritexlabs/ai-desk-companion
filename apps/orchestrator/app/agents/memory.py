from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus


# Stored at apps/orchestrator/data/user_memory.json — created on first write.
_DATA_DIR    = Path(__file__).parents[2] / 'data'
_MEMORY_FILE = _DATA_DIR / 'user_memory.json'

# ── Regex patterns for intent detection ──────────────────────────────────────

_REMEMBER_RE = re.compile(
    r'^(?:remember|note|save|store|keep|log)\s+(?:that\s+)?(?:my\s+)?'
    r'(.+?)\s+(?:is|are|was|=|:)\s+(.+)',
    re.I,
)
_RECALL_RE = re.compile(
    r'^(?:recall|what\s+(?:is|was|are)\s+(?:my\s+)?|do\s+you\s+remember\s+(?:my\s+)?'
    r'|what\'?s\s+my\s+|what\s+did\s+i\s+(?:say|tell\s+you)\s+about\s+(?:my\s+)?'
    r'|tell\s+me\s+(?:about\s+)?(?:my\s+)?)(.+)',
    re.I,
)
_FORGET_RE = re.compile(r'^(?:forget|delete|remove|clear)\s+(?:my\s+)?(.+)', re.I)
_LIST_RE   = re.compile(r'(?:list|show|what do you know|what have i|all memories?|everything)', re.I)


# ── Storage helpers ───────────────────────────────────────────────────────────

def _load() -> dict:
    try:
        if _MEMORY_FILE.exists():
            return json.loads(_MEMORY_FILE.read_text())
    except Exception:
        pass
    return {}


def _save(data: dict) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _MEMORY_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def _search(data: dict, term: str) -> list[tuple[str, str]]:
    """Return up to 3 entries that match term against keys or values."""
    term = term.strip().lower()
    if term in data:
        return [(term, data[term]['value'])]
    # partial key match
    hits = [(k, v['value']) for k, v in data.items() if term in k or k in term]
    if hits:
        return hits[:3]
    # keyword scan
    for word in (w for w in term.split() if len(w) > 2):
        hits = [(k, v['value']) for k, v in data.items()
                if word in k or word in v['value'].lower()]
        if hits:
            return hits[:3]
    return []


# ── Agent ─────────────────────────────────────────────────────────────────────

class MemoryAgent(AssistantAgent):
    id = 'memory'
    name = 'Memory'
    config_key = None
    tool_meta = {
        'description': (
            'Store and retrieve personal notes, reminders, and preferences. '
            'Use when the user says "remember that...", "save that...", '
            '"what did I say about...", "do you remember my...", or wants to forget something.'
        ),
        'query_hint': (
            'The memory command, e.g. "remember wife birthday is March 5" '
            'or "what is wife birthday" or "forget parking spot"'
        ),
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
            return AgentResponse(agent=self.id, text='Please specify what to remember or recall.')

        text = (
            self._try_remember(query)
            or self._try_forget(query)
            or self._try_recall(query)
            or self._try_list(query)
            or (
                "I'm not sure how to handle that memory request. "
                "Try: \"remember [thing] is [value]\", \"what is [thing]\", or \"forget [thing]\"."
            )
        )
        return AgentResponse(agent=self.id, text=text)

    # ── Intent handlers ───────────────────────────────────────────────────────

    def _try_remember(self, query: str) -> str | None:
        m = _REMEMBER_RE.match(query)
        if not m:
            return None
        key   = m.group(1).strip().lower()
        value = m.group(2).strip()
        data  = _load()
        data[key] = {'value': value, 'saved_at': datetime.now().isoformat()}
        _save(data)
        return f"Got it! I'll remember: {key} is {value}."

    def _try_forget(self, query: str) -> str | None:
        m = _FORGET_RE.match(query)
        if not m:
            return None
        key  = m.group(1).strip().lower()
        data = _load()
        if key in data:
            del data[key]
            _save(data)
            return f'Done, I\'ve forgotten "{key}".'
        # fuzzy delete
        hits = [k for k in data if key in k or k in key]
        if hits:
            for k in hits:
                del data[k]
            _save(data)
            return f'Forgotten: {", ".join(hits)}.'
        return f'I don\'t have anything stored under "{key}".'

    def _try_recall(self, query: str) -> str | None:
        m = _RECALL_RE.match(query)
        if not m:
            return None
        term = m.group(1).strip()
        data = _load()
        if not data:
            return "I haven't stored any memories yet."
        hits = _search(data, term)
        if hits:
            return '; '.join(f'{k}: {v}' for k, v in hits)
        return f'I don\'t have anything stored about "{term}".'

    def _try_list(self, query: str) -> str | None:
        if not _LIST_RE.search(query):
            return None
        data = _load()
        if not data:
            return "I haven't stored any memories yet."
        items = [f'{k}: {v["value"]}' for k, v in list(data.items())[:10]]
        suffix = f' (showing 10 of {len(data)})' if len(data) > 10 else ''
        return f'Here is what I remember{suffix}: {"; ".join(items)}.'
