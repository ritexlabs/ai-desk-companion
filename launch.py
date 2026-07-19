#!/usr/bin/env python3
"""
AI Desk Companion — Cross-platform launcher
Works identically on macOS, Linux, and Windows.

Usage
  python3 launch.py setup           # first-time install after cloning (run once)
  python3 launch.py                 # same as 'start'
  python3 launch.py start           # start all services
  python3 launch.py stop            # stop all running services
  python3 launch.py status          # show service status
  python3 launch.py restart         # stop then start
  python3 launch.py clean           # remove venv / node_modules / build artefacts

Flags (start / restart only)
  --no-browser          don't open a browser automatically
  --browser chrome      open in Chrome with autoplay flags (default)
  --browser safari      open in Safari (avoids Chrome voice API issues on macOS)
  --no-color            disable ANSI colours
"""

from __future__ import annotations

import argparse
import atexit
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

# ── Enable ANSI colours on Windows 10+ ───────────────────────────────────────
if sys.platform == 'win32':
    try:
        import ctypes
        ctypes.windll.kernel32.SetConsoleMode(
            ctypes.windll.kernel32.GetStdHandle(-11), 7
        )
    except Exception:
        pass

# ── Argument parsing ──────────────────────────────────────────────────────────
_parser = argparse.ArgumentParser(
    prog='launch.py',
    description='AI Desk Companion — cross-platform launcher',
    formatter_class=argparse.RawDescriptionHelpFormatter,
    epilog=(
        'Examples:\n'
        '  python3 launch.py setup             # first-time install (run once after clone)\n'
        '  python3 launch.py                   # start all services\n'
        '  python3 launch.py start             # start all services\n'
        '  python3 launch.py stop              # stop all services\n'
        '  python3 launch.py status            # check service status\n'
        '  python3 launch.py restart           # stop then start\n'
        '  python3 launch.py clean             # wipe venv / node_modules\n'
        '  python3 launch.py start --no-browser\n'
        '  python3 launch.py start --browser safari\n'
    ),
)
_parser.add_argument(
    'command',
    nargs='?',
    default='start',
    choices=['setup', 'start', 'stop', 'status', 'restart', 'clean'],
    metavar='COMMAND',
    help='setup | start | stop | status | restart | clean  (default: start)',
)
_parser.add_argument('--no-browser', action='store_true',
                     help='Skip auto-opening the browser (start/restart only)')
_parser.add_argument('--browser', choices=['chrome', 'safari'], default='chrome',
                     metavar='BROWSER',
                     help='Browser to open: chrome (default) or safari')
_parser.add_argument('--no-color', action='store_true',
                     help='Disable ANSI colour output')
_args = _parser.parse_args()

COMMAND      = _args.command
OPEN_BROWSER = not _args.no_browser
BROWSER      = _args.browser
USE_COLOR    = not _args.no_color and sys.stdout.isatty()

# ── Colour helpers ────────────────────────────────────────────────────────────
def _c(code: str, text: str) -> str:
    return f'\033[{code}m{text}\033[0m' if USE_COLOR else text

def bold(t: str)    -> str: return _c('1',  t)
def cyan(t: str)    -> str: return _c('96', t)
def green(t: str)   -> str: return _c('92', t)
def yellow(t: str)  -> str: return _c('93', t)
def red(t: str)     -> str: return _c('91', t)
def dim(t: str)     -> str: return _c('2',  t)
def magenta(t: str) -> str: return _c('95', t)

ORCH_TAG = cyan(  '[ORCH]') + ' '
GW_TAG   = yellow('[GW  ]') + ' '
UI_TAG   = magenta('[ UI ]') + ' '
HA_TAG   = green( '[ HA ]') + ' '

def log(msg: str)  -> None: print(f'  {msg}',               flush=True)
def ok(msg: str)   -> None: print(f'  {green("✓")} {msg}',  flush=True)
def warn(msg: str) -> None: print(f'  {yellow("⚠")} {msg}', flush=True)
def err(msg: str)  -> None: print(f'  {red("✗")} {msg}',    flush=True)
def step(msg: str) -> None: print(f'\n  {bold(cyan("›"))} {bold(msg)}', flush=True)
def hr()           -> None: print(dim('  ' + '─' * 60),     flush=True)

# ── Paths ─────────────────────────────────────────────────────────────────────
IS_WIN       = sys.platform == 'win32'
ROOT         = Path(__file__).parent.resolve()
ORCHESTRATOR = ROOT / 'apps' / 'orchestrator'
MCP_GATEWAY  = ROOT / 'apps' / 'mcp-gateway'
DESKTOP      = ROOT / 'apps' / 'desktop'
SMARTHOME    = ROOT / 'apps' / 'smarthome'
PID_FILE     = ROOT / '.pids'

DESKTOP_PORT = 5173
BACKEND_PORT = 8787
GATEWAY_PORT = 8788
HA_PORT      = 8123

VENV         = ORCHESTRATOR / '.venv'
BIN          = VENV / ('Scripts' if IS_WIN else 'bin')
VENV_PY      = BIN / ('python.exe' if IS_WIN else 'python')

GW_VENV      = MCP_GATEWAY / '.venv'
GW_BIN       = GW_VENV / ('Scripts' if IS_WIN else 'bin')
GW_PY        = GW_BIN / ('python.exe' if IS_WIN else 'python')

DESKTOP_URL  = f'http://localhost:{DESKTOP_PORT}'

# ── PID file ──────────────────────────────────────────────────────────────────
def _write_pids(pids: dict[str, int]) -> None:
    PID_FILE.write_text(json.dumps(pids))

def _read_pids() -> dict[str, int]:
    if PID_FILE.exists():
        try:
            return json.loads(PID_FILE.read_text())
        except Exception:
            pass
    return {}

def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, OSError):
        return False

def _kill_pid(pid: int) -> None:
    try:
        if IS_WIN:
            subprocess.run(['taskkill', '/F', '/T', '/PID', str(pid)],
                           capture_output=True)
        else:
            try:
                pgid = os.getpgid(pid)
                os.killpg(pgid, signal.SIGTERM)
            except Exception:
                os.kill(pid, signal.SIGTERM)
    except Exception:
        pass

def _force_kill_pid(pid: int) -> None:
    try:
        if IS_WIN:
            subprocess.run(['taskkill', '/F', '/T', '/PID', str(pid)],
                           capture_output=True)
        else:
            try:
                pgid = os.getpgid(pid)
                os.killpg(pgid, signal.SIGKILL)
            except Exception:
                os.kill(pid, signal.SIGKILL)
    except Exception:
        pass

# ── Port helpers ──────────────────────────────────────────────────────────────
def _port_in_use(port: int) -> bool:
    try:
        with socket.create_connection(('localhost', port), timeout=0.5):
            return True
    except OSError:
        return False

def _wait_for_port(port: int, timeout: int = 60) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _port_in_use(port):
            return True
        time.sleep(0.6)
    return False

def _kill_port(port: int) -> None:
    try:
        if IS_WIN:
            r = subprocess.run(['netstat', '-ano'], capture_output=True, text=True)
            for line in r.stdout.splitlines():
                if f':{port} ' in line and 'LISTENING' in line:
                    pid = line.strip().split()[-1]
                    subprocess.run(['taskkill', '/F', '/PID', pid],
                                   capture_output=True)
        else:
            r = subprocess.run(['lsof', '-ti', f':{port}'],
                               capture_output=True, text=True)
            for pid_str in r.stdout.strip().splitlines():
                try:
                    os.kill(int(pid_str), signal.SIGKILL)
                except Exception:
                    pass
    except Exception:
        pass

def _free_ports() -> None:
    freed: list[int] = []
    for port in (GATEWAY_PORT, BACKEND_PORT, DESKTOP_PORT):
        if _port_in_use(port):
            _kill_port(port)
            freed.append(port)
    if freed:
        time.sleep(0.8)
        for port in freed:
            if not _port_in_use(port):
                ok(f'Freed stale process on port {port}')
            else:
                warn(f'Port {port} still in use — proceeding anyway')

# ── Banner ────────────────────────────────────────────────────────────────────
def _banner() -> None:
    lines = [
        '',
        cyan(bold('  ┌──────────────────────────────────────────────────────┐')),
        cyan(bold('  │') + bold('        🤖  AI Desk Companion  —  Launcher            ') + cyan(bold('│'))),
        cyan(bold('  │') + dim( '  Gateway :8788  ·  Orch :8787  ·  UI :5173          ') + cyan(bold('│'))),
        cyan(bold('  └──────────────────────────────────────────────────────┘')),
        '',
    ]
    print('\n'.join(lines))

# ── Prerequisite checks ───────────────────────────────────────────────────────
def _find_python() -> str | None:
    candidates = [
        ['python3.13'], ['python3.12'], ['python3.11'], ['python3.10'],
        ['python3'], ['python'],
    ]
    if IS_WIN:
        candidates = [
            ['py', '-3.13'], ['py', '-3.12'], ['py', '-3.11'], ['py', '-3.10'],
            ['py', '-3'], ['python3'], ['python'],
        ] + candidates
    for cmd in candidates:
        exe = shutil.which(cmd[0])
        if not exe:
            continue
        try:
            r = subprocess.run(
                cmd + ['-c',
                       'import sys; assert sys.version_info >= (3,10); print(sys.version)'],
                capture_output=True, text=True, timeout=5,
            )
            if r.returncode == 0:
                return exe if len(cmd) == 1 else cmd[0]
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
    return None

def _find_npm() -> str | None:
    for c in (['pnpm', 'npm.cmd', 'npm'] if IS_WIN else ['pnpm', 'npm']):
        found = shutil.which(c)
        if found:
            return found
    return None

def _check_prereqs() -> tuple[str, str]:
    step('Checking prerequisites')
    py_exe = _find_python()
    if not py_exe:
        err('Python 3.10+ is required but was not found in PATH.')
        log(dim('  Install from https://python.org/downloads'))
        sys.exit(1)
    r = subprocess.run(
        [py_exe, '-c',
         'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'],
        capture_output=True, text=True,
    )
    ok(f'Python {r.stdout.strip()}  {dim(shutil.which(py_exe) or py_exe)}')

    npm_exe = _find_npm()
    if not npm_exe:
        err('Node.js / npm is required but was not found in PATH.')
        log(dim('  Install from https://nodejs.org'))
        sys.exit(1)
    r = subprocess.run([npm_exe, '--version'], capture_output=True, text=True)
    pkg = 'pnpm' if 'pnpm' in Path(npm_exe).name else 'npm'
    ok(f'{pkg} {r.stdout.strip()}  {dim(npm_exe)}')
    return py_exe, npm_exe

# ── Setup ─────────────────────────────────────────────────────────────────────
def _setup_gateway(py_exe: str) -> None:
    if not GW_PY.exists():
        step('Creating MCP Gateway virtual environment')
        subprocess.run([py_exe, '-m', 'venv', str(GW_VENV)], check=True)
        ok(f'Gateway venv created at  {dim(str(GW_VENV))}')
    else:
        ok(f'Gateway venv ready  {dim(str(GW_VENV))}')
    r = subprocess.run([str(GW_PY), '-c', 'import fastapi'], capture_output=True)
    if r.returncode != 0:
        step('Installing MCP Gateway dependencies')
        subprocess.run(
            [str(GW_PY), '-m', 'pip', 'install',
             '-r', str(MCP_GATEWAY / 'requirements.txt'), '-q'],
            check=True,
        )
        ok('Gateway dependencies installed')
    else:
        ok('Gateway dependencies ready')
    env_file = MCP_GATEWAY / '.env'
    if not env_file.exists() and (MCP_GATEWAY / '.env.sample').exists():
        shutil.copy(MCP_GATEWAY / '.env.sample', env_file)
        ok(f'.env created from .env.sample — {dim(str(env_file))}')

def _setup_orchestrator(py_exe: str) -> None:
    if not VENV_PY.exists():
        step('Creating orchestrator virtual environment')
        subprocess.run([py_exe, '-m', 'venv', str(VENV)], check=True)
        ok(f'Venv created at  {dim(str(VENV))}')
    else:
        ok(f'Orchestrator venv ready  {dim(str(VENV))}')
    r = subprocess.run([str(VENV_PY), '-c', 'import uvicorn'], capture_output=True)
    if r.returncode != 0:
        step('Installing orchestrator dependencies')
        subprocess.run(
            [str(VENV_PY), '-m', 'pip', 'install',
             '-r', str(ORCHESTRATOR / 'requirements.txt'), '-q'],
            check=True,
        )
        ok('Orchestrator dependencies installed')
    else:
        ok('Orchestrator dependencies ready')
    env_file = ORCHESTRATOR / '.env'
    if not env_file.exists() and (ORCHESTRATOR / '.env.sample').exists():
        shutil.copy(ORCHESTRATOR / '.env.sample', env_file)
        ok(f'.env created from .env.sample — add your API keys to  {dim(str(env_file))}')

def _setup_desktop(npm_exe: str) -> None:
    node_modules = DESKTOP / 'node_modules'
    if not node_modules.exists():
        step('Installing desktop UI dependencies')
        subprocess.run([npm_exe, 'install'], cwd=str(DESKTOP), check=True)
        ok('Desktop dependencies installed')
    else:
        ok(f'Desktop dependencies ready  {dim(str(node_modules))}')

# ── Process launch ────────────────────────────────────────────────────────────
_procs: list[subprocess.Popen] = []
_lock  = threading.Lock()
_shutdown_done = False

def _stream(proc: subprocess.Popen, tag: str) -> None:
    try:
        assert proc.stdout is not None
        for raw in iter(proc.stdout.readline, b''):
            line = raw.decode(errors='replace').rstrip('\n\r')
            if line:
                print(f'  {tag}{dim(line)}', flush=True)
    except Exception:
        pass

def _launch(cmd: list[str], cwd: Path, tag: str,
            env: dict | None = None) -> subprocess.Popen:
    merged = {**os.environ, **(env or {})}
    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=merged,
        **(dict(start_new_session=True) if not IS_WIN else {}),
    )
    with _lock:
        _procs.append(proc)
    threading.Thread(target=_stream, args=(proc, tag), daemon=True).start()
    return proc

def _start_gateway() -> subprocess.Popen:
    step('Starting MCP Gateway  ' + dim(f'→  http://localhost:{GATEWAY_PORT}'))
    return _launch(
        [str(GW_PY), '-m', 'uvicorn', 'src.main:app',
         '--host', '0.0.0.0', '--port', str(GATEWAY_PORT),
         '--reload', '--log-level', 'warning'],
        cwd=MCP_GATEWAY, tag=GW_TAG,
        env={'PYTHONUNBUFFERED': '1'},
    )

def _start_orchestrator() -> subprocess.Popen:
    step('Starting orchestrator  ' + dim(f'→  ws://localhost:{BACKEND_PORT}/ws'))
    return _launch(
        [str(VENV_PY), '-m', 'uvicorn', 'app.main:app',
         '--host', '0.0.0.0', '--port', str(BACKEND_PORT),
         '--reload', '--log-level', 'warning'],
        cwd=ORCHESTRATOR, tag=ORCH_TAG,
        env={'PYTHONUNBUFFERED': '1'},
    )

def _start_desktop(npm_exe: str) -> subprocess.Popen:
    step('Starting desktop UI  ' + dim(f'→  {DESKTOP_URL}'))
    return _launch([npm_exe, 'run', 'dev'], cwd=DESKTOP, tag=UI_TAG)

# ── Smart Home Docker helpers ─────────────────────────────────────────────────

def _smarthome_enabled() -> bool:
    return (SMARTHOME / 'docker-compose.yml').exists()

def _smarthome_mode() -> str:
    """Returns 'local' or 'remote'. Defaults to 'local' when mode file is absent."""
    try:
        return (SMARTHOME / '.mode').read_text().strip()
    except OSError:
        return 'local'

def _docker_compose_available() -> bool:
    try:
        r = subprocess.run(['docker', 'compose', 'version'],
                           capture_output=True, timeout=5)
        return r.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False

def _smarthome_running() -> bool:
    try:
        r = subprocess.run(
            ['docker', 'compose', 'ps', '--status', 'running', '-q'],
            cwd=str(SMARTHOME), capture_output=True, text=True, timeout=5,
        )
        return bool(r.stdout.strip())
    except Exception:
        return False

def _start_smarthome() -> None:
    step(f'Smart Home  {dim("│")}  Local Docker  {dim("→")}  {cyan(f"http://localhost:{HA_PORT}")}')
    r = subprocess.run(
        ['docker', 'compose', 'up', '-d', '--remove-orphans'],
        cwd=str(SMARTHOME), capture_output=True, text=True,
    )
    if r.returncode == 0:
        ok(f'Home Assistant  {dim("[local docker]")}  {cyan(f"http://localhost:{HA_PORT}")}  {dim("(30–60 s on first boot)")}')
    else:
        warn(f'Home Assistant failed to start: {(r.stderr or r.stdout).strip()[:120]}')

def _stop_smarthome() -> None:
    subprocess.run(
        ['docker', 'compose', 'down'],
        cwd=str(SMARTHOME), capture_output=True,
    )


# ── Shutdown helpers ──────────────────────────────────────────────────────────
def _kill_all_children() -> None:
    global _shutdown_done
    if _shutdown_done:
        return
    _shutdown_done = True
    with _lock:
        for proc in _procs:
            try:
                if IS_WIN:
                    proc.terminate()
                else:
                    os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except Exception:
                pass
    time.sleep(0.8)
    with _lock:
        for proc in _procs:
            try:
                proc.kill()
            except Exception:
                pass

atexit.register(_kill_all_children)

def _on_signal(signum=None, frame=None) -> None:
    print(f'\n\n  {yellow("⏹")}  {bold("Shutting down…")}', flush=True)
    _kill_all_children()
    if _smarthome_enabled() and _docker_compose_available():
        _stop_smarthome()
        ok('Stopped Home Assistant')
    PID_FILE.unlink(missing_ok=True)
    print(f'  {green("✓")}  All services stopped.\n', flush=True)
    sys.exit(0)

# ── Browser helpers ───────────────────────────────────────────────────────────
def _launch_safari(url: str) -> None:
    if sys.platform == 'darwin':
        try:
            subprocess.Popen(['open', '-a', 'Safari', url])
            return
        except Exception:
            pass
    webbrowser.open(url)

def _find_chrome() -> list[str] | None:
    if sys.platform == 'darwin':
        for c in [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        ]:
            if os.path.exists(c):
                return [c]
    elif IS_WIN:
        for c in [
            r'C:\Program Files\Google\Chrome\Application\chrome.exe',
            r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
            os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
            r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        ]:
            if os.path.exists(c):
                return [c]
    else:
        for name in ('google-chrome', 'chromium-browser', 'chromium', 'microsoft-edge'):
            p = shutil.which(name)
            if p:
                return [p]
    return None

def _launch_chrome(url: str) -> None:
    flags = [
        '--autoplay-policy=no-user-gesture-required',
        f'--app={url}',
    ]
    chrome = _find_chrome()
    if chrome:
        try:
            subprocess.Popen(chrome + flags)
            return
        except Exception:
            pass
    webbrowser.open(url)

# ── Commands ──────────────────────────────────────────────────────────────────

def cmd_setup() -> None:
    """Install all dependencies and create .env files. Run once after cloning."""
    print()
    print(f'  {bold(cyan("AI Desk Companion — First-time Setup"))}')
    print(f'  {dim("Creates virtual environments, installs dependencies, and prepares .env files.")}')
    print()

    py_exe, npm_exe = _check_prereqs()
    hr()

    step('Installing MCP Gateway')
    _setup_gateway(py_exe)

    step('Installing Orchestrator')
    _setup_orchestrator(py_exe)

    step('Installing Desktop UI')
    _setup_desktop(npm_exe)

    hr()
    print()
    ok('Setup complete — all dependencies installed.')
    print()

    # Remind the user about .env files
    orch_env = ORCHESTRATOR / '.env'
    gw_env   = MCP_GATEWAY  / '.env'
    needs_env: list[str] = []
    if orch_env.exists():
        needs_env.append(f'  {dim("·")} {cyan(str(orch_env.relative_to(ROOT)))}  ← add your API keys here')
    if gw_env.exists():
        needs_env.append(f'  {dim("·")} {cyan(str(gw_env.relative_to(ROOT)))}  ← add gateway keys here (if any)')

    if needs_env:
        print(f'  {yellow("Next steps:")}')
        for line in needs_env:
            print(line)
        print(f'\n  Then run  {bold(cyan("python3 launch.py start"))}  to launch the app.')
    else:
        print(f'  Run  {bold(cyan("python3 launch.py start"))}  to launch the app.')
    print()


def cmd_start() -> None:
    _banner()
    py_exe, npm_exe = _check_prereqs()
    hr()

    step('Setting up services')
    _setup_gateway(py_exe)
    _setup_orchestrator(py_exe)
    _setup_desktop(npm_exe)
    hr()

    _free_ports()

    signal.signal(signal.SIGINT,  _on_signal)
    signal.signal(signal.SIGTERM, _on_signal)

    # Start Home Assistant Docker before the gateway (SmartHome pre-warm needs it up)
    ha_mode    = _smarthome_mode()
    ha_active  = _smarthome_enabled() and ha_mode != 'remote' and _docker_compose_available()
    if ha_active:
        _start_smarthome()
    elif _smarthome_enabled() and ha_mode == 'remote':
        ok(f'Home Assistant  {dim("[self-hosted]")}  configure endpoint in Settings → Smart Home')
    elif _smarthome_enabled():
        warn('Home Assistant  [local docker]  Docker not found — start Docker Desktop and retry.')

    # Launch gateway first — orchestrator health-checks it on boot
    gw_proc = _start_gateway()
    if _wait_for_port(GATEWAY_PORT, timeout=20):
        ok(f'MCP Gateway ready    {cyan(f"http://localhost:{GATEWAY_PORT}")}')
    else:
        warn('MCP Gateway did not start in time — orchestrator will retry.')

    orch_proc = _start_orchestrator()
    ui_proc   = _start_desktop(npm_exe)

    step('Waiting for services to be ready')
    if _wait_for_port(BACKEND_PORT, timeout=30):
        ok(f'Orchestrator ready   {cyan(f"http://localhost:{BACKEND_PORT}")}')
    else:
        warn('Orchestrator did not start in time — check output above.')
    if _wait_for_port(DESKTOP_PORT, timeout=60):
        ok(f'Desktop UI ready     {cyan(DESKTOP_URL)}')
    else:
        warn('Desktop UI did not start in time — check output above.')

    # Save PIDs so stop/status can find the processes
    _write_pids({
        'gateway':      gw_proc.pid,
        'orchestrator': orch_proc.pid,
        'desktop':      ui_proc.pid,
    })

    hr()
    print(f'\n  {bold(green("✦  AI Desk Companion is running"))}\n')
    print(f'  {bold("UI")}             {cyan(DESKTOP_URL)}')
    print(f'  {bold("Orchestrator")}   {cyan(f"http://localhost:{BACKEND_PORT}")}')
    print(f'  {bold("MCP Gateway")}    {cyan(f"http://localhost:{GATEWAY_PORT}")}')
    print(f'  {bold("WebSocket")}      {cyan(f"ws://localhost:{BACKEND_PORT}/ws")}')
    if ha_active:
        print(f'  {bold("Home Assistant")} {cyan(f"http://localhost:{HA_PORT}")}  {dim("(local-only, no internet)")}')
    print(f'\n  {dim("Press Ctrl+C  or run  python3 launch.py stop  to stop all services.")}\n')
    hr()
    print()

    if OPEN_BROWSER and _port_in_use(DESKTOP_PORT):
        time.sleep(0.5)
        if BROWSER == 'safari':
            ok(f'Opening Safari  {dim("(use --browser chrome to switch)")}')
            _launch_safari(DESKTOP_URL)
        else:
            ok(f'Opening Chrome  {dim("(use --browser safari to switch)")}')
            _launch_chrome(DESKTOP_URL)

    try:
        while True:
            if gw_proc.poll() is not None:
                warn(f'MCP Gateway exited (code {gw_proc.returncode}).')
                break
            if orch_proc.poll() is not None:
                warn(f'Orchestrator exited (code {orch_proc.returncode}).')
                break
            if ui_proc.poll() is not None:
                warn(f'Desktop UI exited (code {ui_proc.returncode}).')
                break
            time.sleep(1)
    except KeyboardInterrupt:
        pass

    _on_signal()


def cmd_stop() -> None:
    print()
    print(f'  {bold(cyan("Stopping AI Desk Companion…"))}')
    print()

    pids = _read_pids()
    stopped_any = False

    services = [
        ('gateway',      'MCP Gateway',   GATEWAY_PORT),
        ('orchestrator', 'Orchestrator',  BACKEND_PORT),
        ('desktop',      'Desktop UI',    DESKTOP_PORT),
    ]

    for key, label, port in services:
        pid = pids.get(key)
        if pid and _pid_alive(pid):
            _kill_pid(pid)
            time.sleep(0.5)
            if _pid_alive(pid):
                _force_kill_pid(pid)
            ok(f'Stopped {label}  {dim(f"(PID {pid})")}')
            stopped_any = True
        elif _port_in_use(port):
            # Port is occupied but no PID on record — kill by port
            _kill_port(port)
            ok(f'Stopped {label}  {dim(f"(port {port})")}')
            stopped_any = True
        else:
            log(f'{dim("–  " + label + " was not running")}')

    if _smarthome_enabled() and _docker_compose_available():
        if _smarthome_running():
            _stop_smarthome()
            ok('Stopped Home Assistant')
            stopped_any = True
        else:
            log(dim('–  Home Assistant was not running'))

    PID_FILE.unlink(missing_ok=True)

    if stopped_any:
        time.sleep(0.5)
        print()
        ok('All services stopped.')
    else:
        print()
        log(dim('Nothing was running.'))
    print()


def cmd_status() -> None:
    print()
    print(f'  {bold(cyan("AI Desk Companion — Service Status"))}')
    print()

    pids = _read_pids()
    services = [
        ('gateway',      'MCP Gateway',   GATEWAY_PORT, f'http://localhost:{GATEWAY_PORT}'),
        ('orchestrator', 'Orchestrator',  BACKEND_PORT, f'http://localhost:{BACKEND_PORT}'),
        ('desktop',      'Desktop UI',    DESKTOP_PORT, DESKTOP_URL),
    ]

    all_up = True
    for key, label, port, url in services:
        pid      = pids.get(key)
        port_up  = _port_in_use(port)
        proc_up  = _pid_alive(pid) if pid else False

        if port_up:
            pid_info = f'  {dim(f"PID {pid}")}' if pid else ''
            print(f'  {green("●")}  {bold(label):<20} {cyan(url)}{pid_info}')
        else:
            all_up = False
            pid_note = f'  {dim(f"PID {pid} (not responding)")}' if pid and proc_up else ''
            print(f'  {red("○")}  {bold(label):<20} {dim("not running")}{pid_note}')

    if _smarthome_enabled() and _docker_compose_available():
        ha_url = f'http://localhost:{HA_PORT}'
        if _smarthome_running():
            print(f'  {green("●")}  {bold("Home Assistant"):<20} {cyan(ha_url)}  {dim("(local-only)")}')
        else:
            all_up = False
            print(f'  {red("○")}  {bold("Home Assistant"):<20} {dim("not running")}')

    print()
    if all_up:
        ok(f'All services online.  Open {cyan(DESKTOP_URL)} to use the app.')
    else:
        log(dim('Run  python3 launch.py start  to start all services.'))
    print()


def cmd_restart() -> None:
    cmd_stop()
    time.sleep(1)
    # Reset shutdown guard so start can run cleanly
    global _shutdown_done
    _shutdown_done = False
    _procs.clear()
    cmd_start()


def cmd_clean() -> None:
    print()
    print(f'  {bold(cyan("AI Desk Companion — Clean"))}')
    print(f'  {dim("Removes: .venv  node_modules  dist  caches  .pids")}')
    print(f'  {dim("Keeps:   source code, .env, personal config")}')
    print()

    targets = [
        ORCHESTRATOR / '.venv',
        MCP_GATEWAY  / '.venv',
        DESKTOP      / 'node_modules',
        DESKTOP      / 'dist',
        DESKTOP      / '.vite',
        ROOT         / 'node_modules',
        DESKTOP      / 'tsconfig.tsbuildinfo',
        PID_FILE,
    ]
    for t in targets:
        if t.exists():
            shutil.rmtree(t, ignore_errors=True) if t.is_dir() else t.unlink(missing_ok=True)
            ok(f'Removed  {t.relative_to(ROOT)}')
        else:
            log(f'  {dim("–  " + str(t.relative_to(ROOT)) + " not found")}')

    for cache in ROOT.rglob('__pycache__'):
        shutil.rmtree(cache, ignore_errors=True)
    for pyc in ROOT.rglob('*.pyc'):
        pyc.unlink(missing_ok=True)
    ok('Removed Python cache files')

    print()
    ok('Clean complete.  Run  python3 launch.py  to reinstall and start.')
    print()


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == '__main__':
    {
        'setup':   cmd_setup,
        'start':   cmd_start,
        'stop':    cmd_stop,
        'status':  cmd_status,
        'restart': cmd_restart,
        'clean':   cmd_clean,
    }[COMMAND]()
