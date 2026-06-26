# System Agent

Monitor your machine's health in real time — CPU, memory, disk, battery, temperature, and running processes — all by voice.

**Navigation:** [← All Agents](../agents.md) | [Architecture](../architecture.md) | [Setup](../setup.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [What it measures](#3-what-it-measures)
4. [Prerequisites](#4-prerequisites)
5. [Part A — Enable the agent](#part-a--enable-the-agent)
6. [Voice commands](#6-voice-commands)
7. [Troubleshooting](#7-troubleshooting)
8. [Security notes](#8-security-notes)

---

## 1. Overview

The System agent lets you:

- **Check resource usage** by voice — *"What is my CPU usage?"*
- **Monitor disk and memory** — *"How much RAM do I have left?"*
- **Read the battery** — *"What is my battery level?"*
- **Ask the time or date** — *"What time is it?"*, *"What day is it today?"*
- **See top processes** — *"What is using the most CPU right now?"*

No account, no API key, and no internet connection is needed. All data is read directly from your machine using the Python `psutil` library and standard OS APIs.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Your Machine (localhost)                   │
│                                                               │
│  ┌─────────────┐      ┌──────────────────┐                   │
│  │  Robo UI    │◄────►│   Orchestrator   │                   │
│  │  (React)    │  WS  │  (FastAPI :8787) │                   │
│  └─────────────┘      └────────┬─────────┘                   │
│                                │  System Agent               │
│                                │                             │
│                       ┌────────▼─────────┐                   │
│                       │  psutil + OS APIs│                   │
│                       │  platform module │                   │
│                       └────────┬─────────┘                   │
│                                │                             │
│           ┌────────────────────┼────────────────────┐        │
│           ▼                    ▼                    ▼        │
│      CPU / cores          Memory / swap        Disk usage    │
│      Temperature          Battery status       Processes     │
│      Time / date          OS / Python info                   │
└──────────────────────────────────────────────────────────────┘
```

Everything stays on your machine. No data is sent to any external service.

---

## 3. What it measures

| Metric | Detail |
|--------|--------|
| **CPU usage** | Overall percentage + per-core breakdown |
| **Memory** | Used, available, total, swap |
| **Disk** | Used, total, percentage (root drive) |
| **Battery** | Percentage + charging / discharging status |
| **Temperature** | CPU or battery sensor (platform-dependent — see below) |
| **Top processes** | Top 3 processes by CPU consumption |
| **OS info** | Operating system, architecture, Python version |
| **Time & date** | Local time, timezone, full date |

### Temperature reading by platform

| Platform | Source | Notes |
|----------|--------|-------|
| macOS (Apple Silicon / Intel) | `ioreg` — AppleSmartBattery | No root required; reads PMU-derived system temp |
| macOS (Intel, Homebrew) | `osx-cpu-temp` CLI | Install: `brew install osx-cpu-temp` for direct CPU reading |
| Linux | `psutil.sensors_temperatures()` | Works out of the box on most distros |
| Windows | `psutil.sensors_temperatures()` | Requires WMI support |

> If no temperature sensor is found, the temperature field is simply omitted from the response — the agent still works fully.

---

## 4. Prerequisites

| Requirement | Notes |
|-------------|-------|
| App running (`python3 start.py`) | That is all — no other setup needed |
| `psutil` Python package | Installed automatically by `pip install -r requirements.txt` |

No credentials, no account, no API key.

---

## Part A — Enable the agent

The System agent is **enabled by default**. You do not need to configure anything.

### A1. Confirm it is running

1. Start the app: `python3 start.py`
2. The agent roster in the sidebar should show **System** with a green dot
3. Say *"Hey Robo, what is my CPU usage?"* — Robo reads your current CPU load

### A2. Optional — enable temperature via Homebrew (macOS only)

For a direct CPU temperature reading on macOS instead of the battery sensor reading:

```bash
brew install osx-cpu-temp
```

Verify it works:

```bash
osx-cpu-temp
# 42.0°C
```

The agent detects this tool automatically — no configuration needed.

---

## 6. Voice commands

| What you say | What happens |
|---|---|
| *"What is my CPU usage?"* | Reads overall CPU % and per-core breakdown |
| *"How much memory do I have?"* | Reads RAM used, available, and total |
| *"How much disk space do I have?"* | Reads disk used and total on root drive |
| *"What is my battery level?"* | Reads battery % and charging status |
| *"What temperature is my CPU?"* | Reads CPU or system temperature |
| *"What processes are running?"* | Lists top 3 CPU-consuming processes |
| *"What time is it?"* | Reads current local time and timezone |
| *"What is today's date?"* | Reads the full date (e.g. Tuesday, June 24, 2026) |
| *"What operating system am I running?"* | Reads OS name and architecture |
| *"What is my system status?"* | Full summary: CPU, RAM, disk, battery |

---

## 7. Troubleshooting

### Temperature not showing

The agent omits temperature when no compatible sensor is found.

**On macOS:**
- Try installing `osx-cpu-temp`: `brew install osx-cpu-temp`
- Check if `ioreg` works: `ioreg -r -c AppleSmartBattery -w0 | grep -i temperature`
- If the value is `0` or missing, your hardware does not expose a readable sensor

**On Linux:**
```bash
cat /sys/class/thermal/thermal_zone*/temp
```
If empty, your kernel may not expose thermal zones — this is hardware-dependent.

### Battery not showing

On desktop machines with no battery, the battery field is simply omitted. This is expected.

### CPU usage always shows 0%

The agent takes a 200 ms CPU sample (`interval=0.2`). If you are calling it in rapid succession the OS may not update the counter fast enough. This is normal — the next call will show an accurate reading.

### "System agent is offline" in roster

1. Check the orchestrator is running: open `http://localhost:8787` in a browser — you should see JSON
2. Restart the app: `python3 start.py`
3. Check for Python errors in the terminal output

---

## 8. Security notes

| What | How it is protected |
|------|-------------------|
| All metrics | Read locally via `psutil` and OS APIs — never sent to any external server |
| Process names | Listed in the LLM context only for the duration of the request — not stored or logged |
| No credentials | The System agent requires no API keys, tokens, or accounts |

> The System agent is the only agent that is always available even with no internet connection and no credentials configured.
