#!/usr/bin/env python3
"""
Personal AI Agent — Unified Dev Launcher
────────────────────────────────────
Self-contained: creates its own Python virtualenv and installs all
dependencies on first run. Nothing is installed globally.

Usage
  macOS / Linux : python3 start.py          # start the app
  Windows       : python  start.py

Flags
  --no-browser        don't open a browser automatically
  --browser chrome    open in Chrome with autoplay flags (default)
  --browser safari    open in Safari (avoids Chrome voice API issues on macOS)
  --no-color          disable ANSI colours
  --clean             remove venv / node_modules / build artefacts (keeps source + .env)
"""

from __future__ import annotations

import atexit
import os
import sys
import subprocess
import shutil
import socket
import signal
import threading
import time
import webbrowser
from pathlib import Path

# ── Enable ANSI colours on Windows 10+ ──────────────────────────────────────
if sys.platform == 'win32':
    try:
        import ctypes
        ctypes.windll.kernel32.SetConsoleMode(
            ctypes.windll.kernel32.GetStdHandle(-11), 7
        )
    except Exception:
        pass

# ── CLI flags ────────────────────────────────────────────────────────────────
_argv        = sys.argv[1:]
args         = set(_argv)
OPEN_BROWSER = '--no-browser' not in args
USE_COLOR    = '--no-color'   not in args and sys.stdout.isatty()
DO_CLEAN     = '--clean'      in args

# --browser chrome|safari  (default: chrome)
BROWSER_CHOICE = 'chrome'
if '--browser' in _argv:
    _bi = _argv.index('--browser')
    if _bi + 1 < len(_argv):
        BROWSER_CHOICE = _argv[_bi + 1].lower()

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
SYS_TAG  = dim(   '[ ** ]') + ' '

def log(msg: str)  -> None: print(f'  {msg}',              flush=True)
def ok(msg: str)   -> None: print(f'  {green("✓")} {msg}', flush=True)
def warn(msg: str) -> None: print(f'  {yellow("⚠")} {msg}',flush=True)
def err(msg: str)  -> None: print(f'  {red("✗")} {msg}',   flush=True)
def step(msg: str) -> None: print(f'\n  {bold(cyan("›"))} {bold(msg)}', flush=True)
def hr()           -> None: print(dim('  ' + '─' * 60),    flush=True)

# ── Paths ────────────────────────────────────────────────────────────────────
IS_WIN       = sys.platform == 'win32'
ROOT         = Path(__file__).parent.resolve()
ORCHESTRATOR = ROOT / 'apps' / 'orchestrator'
MCP_GATEWAY  = ROOT / 'apps' / 'mcp-gateway'
DESKTOP      = ROOT / 'apps' / 'desktop'
VENV         = ORCHESTRATOR / '.venv'
BIN          = VENV / ('Scripts' if IS_WIN else 'bin')
VENV_PY      = BIN / ('python.exe' if IS_WIN else 'python')
VENV_PIP     = BIN / ('pip.exe'    if IS_WIN else 'pip')
VENV_UV      = BIN / ('uvicorn.exe' if IS_WIN else 'uvicorn')
GW_VENV      = MCP_GATEWAY / '.venv'
GW_BIN       = GW_VENV / ('Scripts' if IS_WIN else 'bin')
GW_PY        = GW_BIN / ('python.exe' if IS_WIN else 'python')

DESKTOP_PORT = 5173
BACKEND_PORT = 8787
GATEWAY_PORT = 8788
DESKTOP_URL  = f'http://localhost:{DESKTOP_PORT}'

# ── Banner ────────────────────────────────────────────────────────────────────
def banner() -> None:
    lines = [
        '',
        cyan(bold('  ┌─────────────────────────────────────────────────────┐')),
        cyan(bold('  │') + bold('       🤖  Personal AI Agent  —  Dev Launcher         ') + cyan(bold('│'))),
        cyan(bold('  │') + dim( ' Gateway :8788  ·  Orch :8787  ·  UI :5173  ·  WS   ') + cyan(bold('│'))),
        cyan(bold('  └─────────────────────────────────────────────────────┘')),
        '',
    ]
    print('\n'.join(lines))

# ── Prerequisite checks ───────────────────────────────────────────────────────
def find_python() -> str | None:
    """Find Python 3.10+ — prefers exact minor versions, falls back gracefully."""
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
                cmd + ['-c', 'import sys; assert sys.version_info >= (3, 10); print(sys.version)'],
                capture_output=True, text=True, timeout=5,
            )
            if r.returncode == 0:
                return exe if len(cmd) == 1 else cmd[0]
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
    return None


def find_npm() -> str | None:
    """Find npm or pnpm."""
    for candidate in (['pnpm', 'npm.cmd', 'npm'] if IS_WIN else ['pnpm', 'npm']):
        found = shutil.which(candidate)
        if found:
            return found
    return None


def check_prereqs() -> tuple[str, str]:
    step('Checking prerequisites')

    py_exe = find_python()
    if not py_exe:
        err('Python 3.10 or higher is required but was not found in PATH.')
        log(dim('  Install from https://python.org/downloads'))
        sys.exit(1)

    r = subprocess.run(
        [py_exe, '-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'],
        capture_output=True, text=True,
    )
    ok(f'Python {r.stdout.strip()}  {dim(shutil.which(py_exe) or py_exe)}')

    npm_exe = find_npm()
    if not npm_exe:
        err('Node.js / npm is required but was not found in PATH.')
        log(dim('  Install from https://nodejs.org'))
        sys.exit(1)

    r = subprocess.run([npm_exe, '--version'], capture_output=True, text=True)
    pkg = 'pnpm' if 'pnpm' in Path(npm_exe).name else 'npm'
    ok(f'{pkg} {r.stdout.strip()}  {dim(npm_exe)}')

    return py_exe, npm_exe

# ── Setup ─────────────────────────────────────────────────────────────────────
def setup_orchestrator(py_exe: str) -> None:
    if not VENV_PY.exists():
        step('Creating Python virtual environment')
        subprocess.run([py_exe, '-m', 'venv', str(VENV)], check=True)
        ok(f'Virtual environment created at  {dim(str(VENV))}')
    else:
        ok(f'Virtual environment ready  {dim(str(VENV))}')

    # Check if uvicorn is importable via our venv's Python.
    # We always use "python -m pip" and "python -m uvicorn" so that our venv's
    # own python binary is used (the script wrappers in .venv/bin/ may have
    # stale shebangs pointing to an unrelated path on the developer's machine).
    r = subprocess.run(
        [str(VENV_PY), '-c', 'import uvicorn'],
        capture_output=True,
    )
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

    # Auto-create .env from .env.example on first run so the app starts cleanly
    env_file    = ORCHESTRATOR / '.env'
    env_example = ORCHESTRATOR / '.env.example'
    if not env_file.exists() and env_example.exists():
        import shutil as _sh
        _sh.copy(env_example, env_file)
        ok(f'.env created from .env.example — add your API keys to  {dim(str(env_file))}')


def setup_desktop(npm_exe: str) -> None:
    node_modules = DESKTOP / 'node_modules'
    if not node_modules.exists():
        step('Installing desktop UI dependencies')
        subprocess.run([npm_exe, 'install'], cwd=str(DESKTOP), check=True)
        ok('Desktop dependencies installed')
    else:
        ok(f'Desktop dependencies ready  {dim(str(node_modules))}')


def setup_gateway(py_exe: str) -> None:
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

    env_file    = MCP_GATEWAY / '.env'
    env_example = MCP_GATEWAY / '.env.example'
    if not env_file.exists() and env_example.exists():
        import shutil as _sh
        _sh.copy(env_example, env_file)
        ok(f'.env created from .env.example — {dim(str(env_file))}')

# ── Port helpers ──────────────────────────────────────────────────────────────
def port_in_use(port: int) -> bool:
    try:
        with socket.create_connection(('localhost', port), timeout=0.5):
            return True
    except OSError:
        return False


def wait_for_port(port: int, timeout: int = 60, label: str = '') -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if port_in_use(port):
            return True
        time.sleep(0.6)
    return False

# ── Process registry ──────────────────────────────────────────────────────────
_procs:         list[subprocess.Popen] = []
_lock           = threading.Lock()
_shutdown_done  = False           # guard so cleanup runs at most once


def _stream(proc: subprocess.Popen, tag: str) -> None:
    """Relay a process's stdout+stderr to the terminal with a coloured tag."""
    try:
        assert proc.stdout is not None
        for raw in iter(proc.stdout.readline, b''):
            line = raw.decode(errors='replace').rstrip('\n\r')
            if line:
                print(f'  {tag}{dim(line)}', flush=True)
    except Exception:
        pass


def launch(cmd: list[str], cwd: Path, tag: str, env: dict | None = None) -> subprocess.Popen:
    merged_env = {**os.environ, **(env or {})}
    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=merged_env,
        # Own process group on Unix so we can kill the whole tree via killpg.
        # atexit/_kill_children handles cleanup when the parent dies unexpectedly.
        **(dict(start_new_session=True) if not IS_WIN else {}),
    )
    with _lock:
        _procs.append(proc)
    threading.Thread(target=_stream, args=(proc, tag), daemon=True).start()
    return proc


def start_gateway() -> subprocess.Popen:
    step('Starting MCP Gateway  ' + dim(f'→  http://localhost:{GATEWAY_PORT}'))
    return launch(
        [str(GW_PY), '-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0',
         '--port', str(GATEWAY_PORT), '--reload', '--log-level', 'warning'],
        cwd=MCP_GATEWAY,
        tag=GW_TAG,
        env={'PYTHONUNBUFFERED': '1'},
    )


def start_orchestrator() -> subprocess.Popen:
    step('Starting orchestrator  ' + dim(f'→  ws://localhost:{BACKEND_PORT}/ws'))
    env = {'PYTHONUNBUFFERED': '1'}
    # Add .env to the process environment (uvicorn will load it via pydantic-settings)
    return launch(
        [str(VENV_PY), '-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0',
         '--port', str(BACKEND_PORT), '--reload', '--log-level', 'warning'],
        cwd=ORCHESTRATOR,
        tag=ORCH_TAG,
        env=env,
    )


def start_desktop(npm_exe: str) -> subprocess.Popen:
    step('Starting desktop UI  ' + dim(f'→  {DESKTOP_URL}'))
    return launch(
        [npm_exe, 'run', 'dev'],
        cwd=DESKTOP,
        tag=UI_TAG,
    )

# ── Port / process cleanup ────────────────────────────────────────────────────

def _kill_port(port: int) -> None:
    """Kill whatever process is holding a port (best-effort, cross-platform)."""
    try:
        if IS_WIN:
            r = subprocess.run(['netstat', '-ano'], capture_output=True, text=True)
            for line in r.stdout.splitlines():
                if f':{port} ' in line and 'LISTENING' in line:
                    pid = line.strip().split()[-1]
                    subprocess.run(['taskkill', '/F', '/PID', pid], capture_output=True)
        else:
            r = subprocess.run(['lsof', '-ti', f':{port}'], capture_output=True, text=True)
            for pid_str in r.stdout.strip().splitlines():
                try:
                    os.kill(int(pid_str), signal.SIGKILL)
                except Exception:
                    pass
    except Exception:
        pass


def _free_ports() -> None:
    """Kill any stale processes occupying our ports, then wait for them to release."""
    freed: list[int] = []
    for port in (GATEWAY_PORT, BACKEND_PORT, DESKTOP_PORT):
        if port_in_use(port):
            _kill_port(port)
            freed.append(port)
    if freed:
        time.sleep(0.6)
        for port in freed:
            if not port_in_use(port):
                ok(f'Freed stale process on port {port}')
            else:
                warn(f'Port {port} still in use — proceeding anyway')


def _kill_children() -> None:
    """Kill all tracked child processes. Called both by shutdown() and atexit."""
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


# Register with atexit so closing the terminal / unexpected exits also cleans up
atexit.register(_kill_children)


# ── Shutdown ──────────────────────────────────────────────────────────────────
def shutdown(signum=None, frame=None) -> None:
    print(f'\n\n  {yellow("⏹")}  {bold("Shutting down…")}', flush=True)
    _kill_children()
    print(f'  {green("✓")}  Stopped all services.\n', flush=True)
    sys.exit(0)


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    banner()

    # Prereqs
    py_exe, npm_exe = check_prereqs()
    hr()

    # Setup
    step('Setting up services')
    setup_gateway(py_exe)
    setup_orchestrator(py_exe)
    setup_desktop(npm_exe)
    hr()

    # Kill any stale processes from a previous run before starting fresh
    _free_ports()

    # Register signal handlers
    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Launch gateway first — orchestrator health-checks it on boot
    gw_proc   = start_gateway()
    gw_ready  = wait_for_port(GATEWAY_PORT, timeout=20, label='MCP Gateway')
    if gw_ready:
        ok(f'MCP Gateway ready    {cyan(f"http://localhost:{GATEWAY_PORT}")}')
    else:
        warn('MCP Gateway did not start in time — orchestrator will retry tool calls.')

    # Launch remaining processes
    orch_proc = start_orchestrator()
    ui_proc   = start_desktop(npm_exe)

    # Wait for both services to be reachable
    step('Waiting for services to be ready')

    orch_ready = wait_for_port(BACKEND_PORT, timeout=30, label='Orchestrator')
    if orch_ready:
        ok(f'Orchestrator ready   {cyan(f"http://localhost:{BACKEND_PORT}")}')
    else:
        warn(f'Orchestrator did not start in time — check output above.')

    ui_ready = wait_for_port(DESKTOP_PORT, timeout=60, label='Desktop UI')
    if ui_ready:
        ok(f'Desktop UI ready     {cyan(DESKTOP_URL)}')
    else:
        warn(f'Desktop UI did not start in time — check output above.')

    hr()
    browser_label = 'Safari' if BROWSER_CHOICE == 'safari' else 'Chrome'
    print(f'\n  {bold(green("✦  Personal AI Agent is running"))}\n')
    print(f'  {bold("UI")}             {cyan(DESKTOP_URL)}  {dim(f"→ {browser_label}")}')
    print(f'  {bold("Orchestrator")}   {cyan(f"http://localhost:{BACKEND_PORT}")}')
    print(f'  {bold("MCP Gateway")}    {cyan(f"http://localhost:{GATEWAY_PORT}")}')
    print(f'  {bold("WebSocket")}      {cyan(f"ws://localhost:{BACKEND_PORT}/ws")}')
    print(f'\n  {dim("Press Ctrl+C to stop all services.")}\n')
    hr()
    print()

    # Open browser
    if OPEN_BROWSER and ui_ready:
        time.sleep(0.5)
        if BROWSER_CHOICE == 'safari':
            ok(f'Opening Safari  {dim("(use --browser chrome to switch)")}')
            _launch_safari(DESKTOP_URL)
        else:
            ok(f'Opening Chrome  {dim("(use --browser safari to switch)")}')
            _launch_chrome(DESKTOP_URL)

    # Keep alive — relay output until a process exits or the user hits Ctrl+C
    try:
        while True:
            if gw_proc.poll() is not None:
                print(f'\n  {yellow("⚠")}  MCP Gateway exited (code {gw_proc.returncode}).',
                      flush=True)
                break
            if orch_proc.poll() is not None:
                print(f'\n  {yellow("⚠")}  Orchestrator exited (code {orch_proc.returncode}).',
                      flush=True)
                break
            if ui_proc.poll() is not None:
                print(f'\n  {yellow("⚠")}  Desktop UI exited (code {ui_proc.returncode}).',
                      flush=True)
                break
            time.sleep(1)
    except KeyboardInterrupt:
        pass

    shutdown()


# ── Browser helpers ───────────────────────────────────────────────────────────

def _launch_safari(url: str) -> None:
    """Open url in Safari. Works on macOS; falls back to system browser elsewhere."""
    if sys.platform == 'darwin':
        try:
            subprocess.Popen(['open', '-a', 'Safari', url])
            return
        except Exception:
            pass
    webbrowser.open(url)


def _find_chrome() -> list[str] | None:
    """Return the path to Chrome/Chromium/Edge, or None."""
    if sys.platform == 'darwin':
        for c in [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        ]:
            if os.path.exists(c):
                return [c]
    elif sys.platform == 'win32':
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
    """Open url in Chrome with autoplay unrestricted; fall back to system browser."""
    flags = [
        '--autoplay-policy=no-user-gesture-required',   # lets TTS audio play on wake word
        f'--app={url}',                                  # app window: no address bar
    ]
    chrome = _find_chrome()
    if chrome:
        try:
            subprocess.Popen(chrome + flags)
            return
        except Exception:
            pass
    webbrowser.open(url)   # fallback — autoplay may still be blocked


# ── Clean ─────────────────────────────────────────────────────────────────────

def clean() -> None:
    """Remove all installed packages and build artefacts (keeps source + .env)."""
    import shutil as _sh
    print()
    print(f'  {bold(cyan("Personal AI Agent — Clean"))}')
    print(f'  {dim("Removes: .venv  node_modules  dist  caches")}')
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
    ]
    for t in targets:
        if t.exists():
            if t.is_dir():
                _sh.rmtree(t, ignore_errors=True)
            else:
                t.unlink(missing_ok=True)
            ok(f'Removed  {t.relative_to(ROOT)}')
        else:
            log(f'  {dim("–  not found: " + str(t.relative_to(ROOT)))}')

    for cache in ROOT.rglob('__pycache__'):
        _sh.rmtree(cache, ignore_errors=True)
    for pyc in ROOT.rglob('*.pyc'):
        pyc.unlink(missing_ok=True)
    ok('Removed Python cache files')

    print()
    ok('Clean complete. Run  python3 start.py  to reinstall and start.')
    print()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    if DO_CLEAN:
        clean()
    else:
        main()
