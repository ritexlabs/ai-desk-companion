from __future__ import annotations

import os
import platform
from datetime import datetime
from typing import Any

import psutil

from app.servers.base import BaseMCPServer


def _local_now() -> datetime:
    return datetime.now().astimezone()


def _gb(b: int) -> str:
    return f'{b / (1024 ** 3):.1f} GB'


def _collect() -> dict:
    now     = _local_now()
    os_name = platform.system()
    if os_name == 'Darwin':
        os_name = 'macOS'

    cpu_pct  = psutil.cpu_percent(interval=0.2)
    per_core = psutil.cpu_percent(interval=None, percpu=True)
    mem      = psutil.virtual_memory()
    swap     = psutil.swap_memory()
    disk     = psutil.disk_usage(os.path.abspath(os.sep))
    battery  = psutil.sensors_battery()

    bat_info = None
    if battery:
        status   = 'charging' if battery.power_plugged else 'discharging'
        bat_info = f'{battery.percent:.0f}% ({status})'

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
        'now':       now,
        'tz_name':   now.strftime('%Z') or 'local',
        'os_name':   os_name,
        'machine':   platform.machine(),
        'cores':     os.cpu_count() or 0,
        'cpu_pct':   cpu_pct,
        'per_core':  per_core,
        'mem_total': mem.total,
        'mem_used':  mem.used,
        'mem_avail': mem.available,
        'mem_pct':   mem.percent,
        'swap_used': swap.used,
        'swap_total':swap.total,
        'disk_total':disk.total,
        'disk_used': disk.used,
        'disk_pct':  disk.percent,
        'bat_info':  bat_info,
        'top_procs': top_procs,
    }


class SystemServer(BaseMCPServer):
    namespace = 'system'

    async def connect(self) -> None:
        pass

    async def disconnect(self) -> None:
        pass

    async def list_tools(self) -> list[dict]:
        return [
            {
                'name': 'get_system_info',
                'description': (
                    'Get the current time, date, day of the week, timezone, '
                    'or OS/hardware/CPU/memory/disk info.'
                ),
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'query': {
                            'type': 'string',
                            'description': 'System query, e.g. "what time is it", "current date", "CPU usage", "memory"',
                        },
                    },
                    'required': ['query'],
                },
            }
        ]

    async def call_tool(self, tool_name: str, arguments: dict, credentials: dict) -> Any:
        m = _collect()
        lines = [
            f"Time: {m['now'].strftime('%I:%M %p')} ({m['tz_name']})",
            f"Date: {m['now'].strftime('%A, %B %d, %Y')}",
            f"OS: {m['os_name']} ({m['machine']})",
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
        return '\n'.join(lines)
