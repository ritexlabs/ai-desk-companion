from __future__ import annotations

import os
import platform

import psutil

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus
from app.services.clock import local_now


def _gb(bytes_val: int) -> str:
    return f'{bytes_val / (1024 ** 3):.1f} GB'


def _collect_metrics() -> dict:
    """Gather all live system metrics in one shot."""
    now     = local_now()
    os_name = platform.system()
    if os_name == 'Darwin':
        os_name = 'macOS'
    machine  = platform.machine()
    cores    = os.cpu_count() or 0
    py_ver   = platform.python_version()
    tz_name  = now.strftime('%Z') or 'local'

    # CPU — interval=0.2 gives a real sample (not 0.0 from a cold call)
    cpu_pct = psutil.cpu_percent(interval=0.2)
    per_core = psutil.cpu_percent(interval=None, percpu=True)

    # Memory
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()

    # Disk (root/system drive — cross-platform)
    _disk_path = os.path.abspath(os.sep)
    disk = psutil.disk_usage(_disk_path)

    # Battery (optional — may not exist on desktops)
    battery = psutil.sensors_battery()
    bat_info = None
    if battery:
        status = 'charging' if battery.power_plugged else 'discharging'
        bat_info = f'{battery.percent:.0f}% ({status})'

    # Top 3 CPU-eating processes
    try:
        procs = sorted(
            psutil.process_iter(['name', 'cpu_percent', 'memory_percent']),
            key=lambda p: p.info.get('cpu_percent') or 0,
            reverse=True,
        )[:3]
        top_procs = [
            f"{p.info['name']} ({p.info.get('cpu_percent', 0):.1f}% CPU, "
            f"{p.info.get('memory_percent', 0):.1f}% RAM)"
            for p in procs
            if (p.info.get('cpu_percent') or 0) > 0
        ]
    except Exception:
        top_procs = []

    return {
        'now': now,
        'tz_name': tz_name,
        'os_name': os_name,
        'machine': machine,
        'cores': cores,
        'py_ver': py_ver,
        'cpu_pct': cpu_pct,
        'per_core': per_core,
        'mem_total': mem.total,
        'mem_used': mem.used,
        'mem_avail': mem.available,
        'mem_pct': mem.percent,
        'swap_used': swap.used,
        'swap_total': swap.total,
        'disk_total': disk.total,
        'disk_used': disk.used,
        'disk_pct': disk.percent,
        'bat_info': bat_info,
        'top_procs': top_procs,
    }


class SystemAgent(AssistantAgent):
    id = 'system'
    name = 'System'

    async def initialize(self) -> None:
        return None

    async def health(self) -> AgentHealth:
        return AgentHealth(name=self.name, status=AgentStatus.ONLINE)

    async def shutdown(self) -> None:
        return None

    async def handle(self, request: AgentRequest) -> AgentResponse:
        m = _collect_metrics()

        is_boot = request.text.strip() == '__boot__'
        if is_boot:
            return AgentResponse(
                agent=self.id,
                text=f"CPU {m['cpu_pct']}%, RAM {m['mem_pct']}%, disk {m['disk_pct']}% — healthy.",
            )

        # Full live data — the LLM orchestrator selects what's relevant to the query
        lines = [
            f"Time: {m['now'].strftime('%I:%M %p')} ({m['tz_name']})",
            f"Date: {m['now'].strftime('%A, %B %d, %Y')}",
            f"OS: {m['os_name']} ({m['machine']})",
            f"Python: {m['py_ver']}",
            f"CPU usage: {m['cpu_pct']}% overall across {m['cores']} cores",
        ]

        if m['per_core']:
            core_str = '  '.join(f'Core {i+1}: {p}%' for i, p in enumerate(m['per_core']))
            lines.append(f"Per-core: {core_str}")

        lines += [
            f"RAM: {_gb(m['mem_used'])} used / {_gb(m['mem_total'])} total ({m['mem_pct']}% used, {_gb(m['mem_avail'])} available)",
            f"Swap: {_gb(m['swap_used'])} used / {_gb(m['swap_total'])} total",
            f"Disk: {_gb(m['disk_used'])} used / {_gb(m['disk_total'])} total ({m['disk_pct']}% used)",
        ]

        if m['bat_info']:
            lines.append(f"Battery: {m['bat_info']}")

        if m['top_procs']:
            lines.append(f"Top processes: {', '.join(m['top_procs'])}")

        return AgentResponse(agent=self.id, text='\n'.join(lines))
