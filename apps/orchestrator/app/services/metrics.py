"""In-memory metrics store.

All mutations are single-attribute increments / list appends, which are
atomic under the GIL, so no explicit locking is needed for the simple
counters used here.
"""
from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field


@dataclass
class _AgentStats:
    calls:       int   = 0
    total_ms:    float = 0.0
    error_count: int   = 0

    @property
    def avg_ms(self) -> float:
        return round(self.total_ms / self.calls, 1) if self.calls else 0.0


class MetricsService:
    def __init__(self) -> None:
        self._t0 = time.monotonic()

        # session / command counters
        self.sessions_started   = 0
        self.commands_processed = 0

        # voice counters
        self.tts_calls = 0
        self.stt_calls = 0

        # websocket message counters
        self.ws_messages_in  = 0
        self.ws_messages_out = 0

        # per-agent stats
        self._agents: dict[str, _AgentStats] = defaultdict(_AgentStats)

    # ── recorders ─────────────────────────────────────────────────────

    def record_session(self) -> None:
        self.sessions_started += 1

    def record_command(self) -> None:
        self.commands_processed += 1

    def record_agent_call(self, agent_id: str, duration_ms: float, error: bool = False) -> None:
        s = self._agents[agent_id]
        s.calls    += 1
        s.total_ms += duration_ms
        if error:
            s.error_count += 1

    def record_tts(self) -> None:
        self.tts_calls += 1

    def record_stt(self) -> None:
        self.stt_calls += 1

    def record_ws_in(self)  -> None: self.ws_messages_in  += 1
    def record_ws_out(self) -> None: self.ws_messages_out += 1

    # ── snapshot ───────────────────────────────────────────────────────

    def snapshot(self) -> dict:
        return {
            'uptime_sec':          int(time.monotonic() - self._t0),
            'sessions_started':    self.sessions_started,
            'commands_processed':  self.commands_processed,
            'tts_calls':           self.tts_calls,
            'stt_calls':           self.stt_calls,
            'ws_messages_in':      self.ws_messages_in,
            'ws_messages_out':     self.ws_messages_out,
            'agents': {
                agent_id: {
                    'calls':       s.calls,
                    'avg_ms':      s.avg_ms,
                    'error_count': s.error_count,
                }
                for agent_id, s in self._agents.items()
            },
        }


metrics_service = MetricsService()
