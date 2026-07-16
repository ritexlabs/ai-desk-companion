from __future__ import annotations

import os
import platform
import subprocess
import time
from datetime import datetime
from typing import Any

import psutil

from src.config.settings import settings
from src.tools.base import BaseTool

# ── I/O deltas (cached between calls for rate calculation) ───────────────────
_prev_net:  tuple[float, tuple[int, int]] | None = None
_prev_disk: tuple[float, tuple[int, int]] | None = None


def _local_now() -> datetime:
    return datetime.now().astimezone()


def _gb(b: int) -> str:
    return f'{b / (1024 ** 3):.1f} GB'


def _mb(b: int) -> str:
    return f'{b / (1024 ** 2):.1f} MB'


def _rate_mb(b_per_s: float) -> str:
    return f'{b_per_s / (1024 ** 2):.2f} MB/s'


def _cpu_temp() -> str | None:
    if platform.system() == 'Darwin':
        try:
            out = subprocess.check_output(
                ['osx-cpu-temp'], timeout=3, stderr=subprocess.DEVNULL
            ).decode().strip()
            return out
        except (FileNotFoundError, subprocess.SubprocessError, OSError):
            return None
    try:
        temps = psutil.sensors_temperatures()
        if not temps:
            return None
        for name, entries in temps.items():
            for entry in entries:
                if entry.current > 0:
                    return f'{entry.current:.1f}°C ({entry.label or name})'
    except (AttributeError, Exception):
        pass
    return None


def _net_io() -> str | None:
    global _prev_net
    try:
        counters = psutil.net_io_counters()
        now = time.monotonic()
        if _prev_net is not None:
            dt, (prev_sent, prev_recv) = _prev_net
            elapsed = now - dt
            if elapsed > 0:
                sent_rate = (counters.bytes_sent - prev_sent) / elapsed
                recv_rate = (counters.bytes_recv - prev_recv) / elapsed
                _prev_net = (now, (counters.bytes_sent, counters.bytes_recv))
                return f'↑ {_rate_mb(sent_rate)}  ↓ {_rate_mb(recv_rate)}'
        _prev_net = (now, (counters.bytes_sent, counters.bytes_recv))
        return f'↑ {_mb(counters.bytes_sent)} sent total  ↓ {_mb(counters.bytes_recv)} recv total'
    except Exception:
        return None


def _disk_io() -> str | None:
    global _prev_disk
    try:
        counters = psutil.disk_io_counters()
        if counters is None:
            return None
        now = time.monotonic()
        if _prev_disk is not None:
            dt, (prev_r, prev_w) = _prev_disk
            elapsed = now - dt
            if elapsed > 0:
                read_rate  = (counters.read_bytes  - prev_r) / elapsed
                write_rate = (counters.write_bytes - prev_w) / elapsed
                _prev_disk = (now, (counters.read_bytes, counters.write_bytes))
                return f'R {_rate_mb(read_rate)}  W {_rate_mb(write_rate)}'
        _prev_disk = (now, (counters.read_bytes, counters.write_bytes))
        return f'R {_mb(counters.read_bytes)}  W {_mb(counters.write_bytes)} (totals)'
    except Exception:
        return None


def _battery() -> str | None:
    bat = psutil.sensors_battery()
    if bat is None:
        return None
    status = 'charging' if bat.power_plugged else 'discharging'
    pct = f'{bat.percent:.0f}%'
    time_left = ''
    if not bat.power_plugged and bat.secsleft not in (
        psutil.POWER_TIME_UNLIMITED, psutil.POWER_TIME_UNKNOWN
    ):
        h, rem = divmod(int(bat.secsleft), 3600)
        m = rem // 60
        time_left = f', {h}h {m}m remaining' if h else f', {m}m remaining'
    return f'{pct} ({status}{time_left})'


def _uptime() -> str:
    secs = int(time.time() - psutil.boot_time())
    days, rem = divmod(secs, 86400)
    hours, rem2 = divmod(rem, 3600)
    mins = rem2 // 60
    if days:
        return f'{days}d {hours}h {mins}m'
    if hours:
        return f'{hours}h {mins}m'
    return f'{mins}m'


def _load_avg() -> str | None:
    try:
        la = psutil.getloadavg()
        return f'{la[0]:.2f}  {la[1]:.2f}  {la[2]:.2f} (1m / 5m / 15m)'
    except (AttributeError, OSError):
        return None


def _cpu_freq() -> str | None:
    try:
        freq = psutil.cpu_freq()
        if freq is None:
            return None
        if freq.max:
            return f'{freq.current:.0f} MHz (max {freq.max:.0f} MHz)'
        return f'{freq.current:.0f} MHz'
    except Exception:
        return None


def _top_processes() -> list[dict]:
    try:
        procs = sorted(
            psutil.process_iter(['name', 'cpu_percent', 'memory_info', 'pid']),
            key=lambda p: p.info.get('cpu_percent') or 0,
            reverse=True,
        )[:5]
        result = []
        for p in procs:
            mem_info = p.info.get('memory_info')
            result.append({
                'name':   p.info.get('name', ''),
                'cpu':    round(p.info.get('cpu_percent', 0), 1),
                'mem_mb': round(mem_info.rss / (1024 ** 2), 1) if mem_info else 0,
                'pid':    p.info.get('pid', 0),
            })
        return result
    except Exception:
        return []


def fetch_system_stats(disabled: frozenset[str]) -> dict:
    now     = _local_now()
    os_name = platform.system()
    if os_name == 'Darwin':
        os_name = 'macOS'

    cpu_pct  = psutil.cpu_percent(interval=0.2)
    per_core = psutil.cpu_percent(interval=None, percpu=True)
    mem      = psutil.virtual_memory()
    swap     = psutil.swap_memory()
    disk     = psutil.disk_usage(os.path.abspath(os.sep))

    return {
        'now':          now,
        'tz_name':      now.strftime('%Z') or 'local',
        'os_name':      os_name,
        'machine':      platform.machine(),
        'cores':        os.cpu_count() or 0,
        'cpu_pct':      cpu_pct,
        'per_core':     per_core,
        'mem_total':    mem.total,
        'mem_used':     mem.used,
        'mem_avail':    mem.available,
        'mem_pct':      mem.percent,
        'swap_used':    swap.used,
        'swap_total':   swap.total,
        'disk_total':   disk.total,
        'disk_used':    disk.used,
        'disk_pct':     disk.percent,
        'uptime':       _uptime(),
        'battery':      _battery()          if 'battery'       not in disabled else None,
        'temperature':  _cpu_temp()         if 'temperature'   not in disabled else None,
        'net_io':       _net_io()           if 'net_io'        not in disabled else None,
        'disk_io':      _disk_io()          if 'disk_io'       not in disabled else None,
        'load_avg':     _load_avg()         if 'load_avg'      not in disabled else None,
        'cpu_freq':     _cpu_freq()         if 'cpu_freq'      not in disabled else None,
        'top_processes':_top_processes()    if 'top_processes' not in disabled else [],
    }


class SystemTool(BaseTool):
    namespace = 'system'

    async def list_tools(self) -> list[dict]:
        return [
            {
                'name': 'get_system_info',
                'description': (
                    'Get the current time, date, day of the week, timezone, '
                    'or OS/hardware/CPU/memory/disk/network/temperature info.'
                ),
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'query': {
                            'type': 'string',
                            'description': (
                                'System query, e.g. "what time is it", "current date", '
                                '"CPU usage", "memory", "top processes", "network speed"'
                            ),
                        },
                    },
                    'required': ['query'],
                },
            }
        ]

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        disabled = frozenset(
            m.strip()
            for m in settings.system_disabled_metrics.split(',')
            if m.strip()
        )
        m = fetch_system_stats(disabled)

        lines = [
            f"Time: {m['now'].strftime('%I:%M %p')} ({m['tz_name']})",
            f"Date: {m['now'].strftime('%A, %B %d, %Y')}",
            f"OS: {m['os_name']} ({m['machine']})",
            f"Uptime: {m['uptime']}",
            f"CPU usage: {m['cpu_pct']}% overall across {m['cores']} cores",
        ]
        if m['per_core']:
            core_str = '  '.join(f'Core {i+1}: {p}%' for i, p in enumerate(m['per_core']))
            lines.append(f"Per-core: {core_str}")
        if m.get('cpu_freq'):
            lines.append(f"CPU frequency: {m['cpu_freq']}")
        if m.get('temperature'):
            lines.append(f"CPU temperature: {m['temperature']}")
        if m.get('load_avg'):
            lines.append(f"Load average: {m['load_avg']}")
        lines += [
            f"RAM: {_gb(m['mem_used'])} used / {_gb(m['mem_total'])} total ({m['mem_pct']}% used, {_gb(m['mem_avail'])} available)",
            f"Swap: {_gb(m['swap_used'])} used / {_gb(m['swap_total'])} total",
            f"Disk: {_gb(m['disk_used'])} used / {_gb(m['disk_total'])} total ({m['disk_pct']}% used)",
        ]
        if m.get('net_io'):
            lines.append(f"Network I/O: {m['net_io']}")
        if m.get('disk_io'):
            lines.append(f"Disk I/O: {m['disk_io']}")
        if m.get('battery'):
            lines.append(f"Battery: {m['battery']}")
        if m.get('top_processes'):
            procs_str = ', '.join(
                f"{p['name']} (PID {p['pid']}: {p['cpu']}% CPU, {p['mem_mb']} MB)"
                for p in m['top_processes']
            )
            lines.append(f"Top processes: {procs_str}")
        return '\n'.join(lines)
