from __future__ import annotations
import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class AgentNotification:
    agent_id: str
    text: str
    severity: str          # 'info' | 'warning' | 'alert'
    condition_key: str     # stable dedup key; frontend filters by this


BroadcastFn = Callable[[str, dict], Awaitable[None]]

# Poll intervals in seconds per agent
_INTERVALS: dict[str, float] = {
    'weather':   300.0,   # 5 min
    'stock':     120.0,   # 2 min
    'news':      600.0,   # 10 min
    'github':    180.0,   # 3 min
    'calendar':  60.0,    # 1 min
    'email':     60.0,    # 1 min
    'system':    30.0,    # 30 sec
    'smarthome': 60.0,    # 1 min
    'portfolio': 300.0,   # 5 min
    'whatsapp':  45.0,    # 45 sec
}


class NotificationScheduler:
    """Manages per-agent background polling tasks."""

    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task] = {}
        self._broadcast: BroadcastFn | None = None
        self._notifications_enabled: dict[str, bool] = {}

    def configure(
        self,
        enabled_agents: list[str],
        notifications_enabled: dict[str, bool],
        broadcast: BroadcastFn,
    ) -> None:
        self._broadcast = broadcast
        # Build map: agent_id -> bool (only agents in enabled_agents list)
        self._notifications_enabled = {
            agent_id: notifications_enabled.get(agent_id, False)
            for agent_id in enabled_agents
        }

    async def start(self) -> None:
        await self.stop()
        for agent_id, enabled in self._notifications_enabled.items():
            if not enabled:
                continue
            interval = _INTERVALS.get(agent_id, 120.0)
            self._tasks[agent_id] = asyncio.create_task(
                self._poll_loop(agent_id, interval),
                name=f'notif_{agent_id}',
            )

    async def stop(self) -> None:
        for task in self._tasks.values():
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks.values(), return_exceptions=True)
        self._tasks.clear()

    async def _poll_loop(self, agent_id: str, interval: float) -> None:
        # Initial delay of half the interval so we don't hammer all agents at t=0
        await asyncio.sleep(interval / 2)
        while True:
            try:
                notifications = await self._check(agent_id)
                for n in notifications:
                    if self._broadcast:
                        await self._broadcast('agent_notification', {
                            'agent_id':      n.agent_id,
                            'text':          n.text,
                            'severity':      n.severity,
                            'condition_key': n.condition_key,
                        })
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.debug('Notif poll error [%s]: %s', agent_id, exc)
            try:
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break

    async def _check(self, agent_id: str) -> list[AgentNotification]:
        """Evaluate one agent for notification-worthy conditions.

        Each agent's check calls its gateway boot tool and looks for
        threshold breaches. Returns empty list when nothing notable.
        """
        from app.dependencies import gateway_client
        from app.services.session import _GW_BOOT_CALLS, is_agent_error
        import json as _json
        import asyncio as _asyncio

        call = _GW_BOOT_CALLS.get(agent_id)
        if not call:
            return []
        tool_name, args = call
        try:
            raw = await _asyncio.wait_for(
                gateway_client.call_tool(tool_name, args), timeout=8.0
            )
            if not raw:
                return []
            text = _json.dumps(raw) if isinstance(raw, (dict, list)) else str(raw)
            if is_agent_error(text):
                return []
            return self._evaluate(agent_id, text)
        except Exception:
            return []

    def _evaluate(self, agent_id: str, text: str) -> list[AgentNotification]:
        """Rule-based threshold evaluation — returns 0 or 1 notification."""
        import re
        if agent_id == 'system':
            cpu = re.search(r'CPU usage:\s*([\d.]+)%', text)
            if cpu and float(cpu.group(1)) > 85:
                return [AgentNotification(
                    agent_id='system',
                    text=f'CPU at {cpu.group(1)}% — system under heavy load.',
                    severity='warning',
                    condition_key='system_cpu_high',
                )]
        if agent_id == 'weather':
            t = text.lower()
            if any(w in t for w in ('storm', 'thunder', 'heavy rain', 'cyclone', 'flood')):
                return [AgentNotification(
                    agent_id='weather',
                    text='Weather alert: severe conditions reported in your area.',
                    severity='alert',
                    condition_key='weather_severe',
                )]
        if agent_id == 'stock':
            m = re.search(r'\(([+-][\d.]+)%\)', text)
            if m and abs(float(m.group(1))) > 2.0:
                pct = float(m.group(1))
                direction = 'up' if pct > 0 else 'down'
                return [AgentNotification(
                    agent_id='stock',
                    text=f'Market move: Nifty {direction} {abs(pct):.1f}% today.',
                    severity='info',
                    condition_key=f'stock_move_{direction}',
                )]
        if agent_id == 'github':
            m = re.search(r'(\d+) pull request', text)
            if m and int(m.group(1)) > 0:
                return [AgentNotification(
                    agent_id='github',
                    text=f'{m.group(1)} GitHub pull request(s) awaiting your review.',
                    severity='info',
                    condition_key=f'github_prs_{m.group(1)}',
                )]
        return []


notification_scheduler = NotificationScheduler()
