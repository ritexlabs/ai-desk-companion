from __future__ import annotations

import os
import re
import subprocess
import sys

import psutil
from fastapi import APIRouter

router = APIRouter(prefix='/api', tags=['system'])


def _temp_linux_windows() -> float | None:
    """psutil sensors — works on Linux and Windows, not macOS."""
    try:
        temps = psutil.sensors_temperatures()
        if not temps:
            return None
        for key in ('coretemp', 'k10temp', 'cpu_thermal', 'acpitz', 'cpu-thermal'):
            if key in temps and temps[key]:
                return round(temps[key][0].current, 1)
        first = next(iter(temps.values()))
        if first:
            return round(first[0].current, 1)
    except Exception:
        pass
    return None


def _temp_osx_cpu_temp() -> float | None:
    """brew install osx-cpu-temp  (works on Intel Macs, may work on Apple Silicon)."""
    try:
        out = subprocess.check_output(
            ['osx-cpu-temp'], timeout=1, text=True, stderr=subprocess.DEVNULL
        ).strip()
        return round(float(out.replace('°C', '').replace('C', '').strip()), 1)
    except Exception:
        return None


def _temp_battery_ioreg() -> tuple[float, str] | None:
    """
    Read battery temperature from AppleSmartBattery via ioreg (no root needed on macOS).
    Returns (temp_celsius, 'battery') or None.
    The raw value is in units of 1/100 °C.
    """
    try:
        out = subprocess.check_output(
            ['ioreg', '-r', '-c', 'AppleSmartBattery', '-w0'],
            timeout=2, text=True, stderr=subprocess.DEVNULL,
        )
        # Prefer VirtualTemperature (PMU-derived system temp) over raw battery cell temp
        for field in ('VirtualTemperature', 'Temperature'):
            m = re.search(rf'"{field}"\s*=\s*(\d+)', out)
            if m:
                raw = int(m.group(1))
                temp_c = round(raw / 100.0, 1)
                if 0 < temp_c < 80:      # sanity: realistic system temp range
                    return temp_c, 'battery'
    except Exception:
        pass
    return None


def _get_temp() -> tuple[float | None, str]:
    """
    Try every available temperature source in priority order.
    Returns (temp_celsius_or_None, source_label).
    source_label: 'cpu' | 'battery' | 'none'
    """
    # 1. Native psutil (Linux / Windows)
    t = _temp_linux_windows()
    if t is not None:
        return t, 'cpu'

    # 2. osx-cpu-temp CLI (macOS Intel, brew-installed)
    t = _temp_osx_cpu_temp()
    if t is not None:
        return t, 'cpu'

    # 3. Battery / PMU temperature via ioreg (macOS, no root needed)
    if sys.platform == 'darwin':
        result = _temp_battery_ioreg()
        if result is not None:
            return result  # already (temp, 'battery')

    return None, 'none'


@router.get('/system')
async def system_stats() -> dict:
    """Live CPU, memory, disk and temperature snapshot."""
    temp_c, temp_source = _get_temp()
    return {
        'cpu_pct':     round(psutil.cpu_percent(interval=0.1), 1),
        'mem_pct':     round(psutil.virtual_memory().percent, 1),
        'disk_pct':    round(psutil.disk_usage(os.path.abspath(os.sep)).percent, 1),
        'cpu_temp_c':  temp_c,
        'temp_source': temp_source,   # 'cpu' | 'battery' | 'none'
    }
