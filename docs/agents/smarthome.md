# Smart Home Agent

Control lights, switches, fans, locks, thermostats, and scenes in your Home Assistant setup — all by voice.

**Navigation:** [← All Agents](../agents.md) | [Architecture](../architecture.md) | [Setup](../setup.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data flow](#3-data-flow)
4. [Prerequisites](#4-prerequisites)
5. [Part A — Home Assistant setup](#part-a--home-assistant-setup)
6. [Part B — Get a Long-Lived Access Token](#part-b--get-a-long-lived-access-token)
7. [Part C — Configure in the app](#part-c--configure-in-the-app)
8. [Part D — Test it](#part-d--test-it)
9. [What it controls](#9-what-it-controls)
10. [Voice commands](#10-voice-commands)
11. [Troubleshooting](#11-troubleshooting)
12. [Security notes](#12-security-notes)

---

## 1. Overview

The Smart Home agent lets you control your entire Home Assistant setup by voice:

- **Lights** — *"Turn on the living room lights"*, *"Set bedroom brightness to 30%"*, *"Make the lights red"*
- **Switches and plugs** — *"Turn off the kitchen switch"*
- **Fans** — *"Toggle the fan"*
- **Locks** — *"Lock the front door"*
- **Thermostats** — *"Set thermostat to 22 degrees"*
- **Scenes** — *"Activate the movie scene"*
- **Status** — *"How many devices are active?"*

Two credentials are required: your **Home Assistant URL** and a **Long-Lived Access Token**. Both are obtained from your Home Assistant instance.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Your Machine (localhost)                     │
│                                                                  │
│  ┌─────────────┐      ┌──────────────────┐                      │
│  │  Robo UI    │◄────►│   Orchestrator   │                      │
│  │  (React)    │  WS  │  (FastAPI :8787) │                      │
│  └─────────────┘      └────────┬─────────┘                      │
│                                │  Smart Home Agent              │
│                                │  - extracts intent + device    │
│                                │  - dispatches service calls    │
│                                │                                │
│                       ┌────────▼─────────┐                      │
│                       │  hass-mcp client │                      │
│                       │  (MCP bridge)    │                      │
│                       └────────┬─────────┘                      │
└────────────────────────────────│────────────────────────────────┘
                                 │  HTTP (Long-Lived Token)
                    ┌────────────▼───────────────┐
                    │     Home Assistant          │
                    │  homeassistant.local:8123   │
                    │  (or your HA URL)           │
                    │                             │
                    │  lights, switches, fans,    │
                    │  locks, climate, scenes,    │
                    │  automations, sensors       │
                    └─────────────────────────────┘
```

The agent connects to your Home Assistant instance directly over your local network (or remotely via your HA URL). The Long-Lived Access Token is used server-side only.

---

## 3. Data flow

### Controlling a device

```
You say: "Turn on the living room lights"
         │
         ▼
   Robo UI (STT) ──► Orchestrator ──► Smart Home Agent
                                            │
                      Action: "on"
                      Domain hint: "light"
                      Name: "living room"
                                            │
                    list_entities(domain="light",
                                  search_query="living room")
                                            │
                    Found: light.living_room_main
                                            │
                    call_service(domain="light",
                                 service="turn_on",
                                 entity_id="light.living_room_main")
                                            │
                    "Living Room Main turned on."
```

### Setting brightness or color

```
You say: "Set the bedroom lights to 40% blue"
         │
         ▼
   Smart Home Agent
         │
         ├─ Extracts: brightness_pct=40, rgb_color=[0,0,255]
         │
         ├─ Finds: light.bedroom
         │
         └─ call_service(light.turn_on, {entity_id, brightness_pct:40, rgb_color:[0,0,255]})

   "Bedroom set to 40% brightness and blue color."
```

---

## 4. Prerequisites

| Requirement | Notes |
|-------------|-------|
| Home Assistant running | On your local network or accessible via URL |
| Docker (for hass-mcp) | Required to run the MCP bridge container |
| Home Assistant URL | e.g. `http://homeassistant.local:8123` or your external URL |
| Long-Lived Access Token | Created in your Home Assistant profile — steps below |

### Install Docker

If Docker is not installed on your machine:

**macOS:**
```bash
brew install --cask docker
```
Or download from [docker.com](https://www.docker.com/products/docker-desktop).

After installing, open Docker Desktop and make sure it is running (whale icon in the menu bar).

---

## Part A — Home Assistant setup

If Home Assistant is already running and accessible, skip to [Part B](#part-b--get-a-long-lived-access-token).

### A1. Verify Home Assistant is accessible

Open a browser and go to your Home Assistant URL:

```
http://homeassistant.local:8123
```

Or use the IP address of your HA server:

```
http://192.168.1.100:8123
```

You should see the Home Assistant login screen. If you cannot reach it, check that Home Assistant is running on your network.

### A2. Note your URL

Write down the URL you used above — this is your `MYHOME_MCP_ENDPOINT`. You will enter it in the app settings.

---

## Part B — Get a Long-Lived Access Token

A Long-Lived Access Token (LLAT) lets the agent authenticate with Home Assistant without needing your password.

### B1. Open your profile

1. Sign in to Home Assistant at your URL
2. Click your **username** or profile picture in the **bottom-left** corner of the sidebar
3. You are now on the **Profile** page

### B2. Create the token

1. Scroll to the very bottom of the Profile page
2. Find the section: **Long-lived access tokens**
3. Click **Create Token**
4. Enter a name: e.g. `Robo Desk Companion`
5. Click **OK**
6. A long token string is shown — **copy it immediately**

   > The token is shown **only once**. If you close this dialog without copying, you must delete it and create a new one.

The token looks like:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI4Y...
```

---

## Part C — Configure in the app

### C1. Configure via Settings UI (recommended)

1. Start the app: `python3 launch.py`
2. Click the **⚙ gear icon** → **Agents** tab
3. Expand **Smart Home**
4. Fill in:
   - **Home Assistant URL** — e.g. `http://homeassistant.local:8123`
   - **Access Token** — paste the Long-Lived Access Token from Part B
5. Click **Test Connection** — you should see: *"[Your Home Name] — N devices, M active"*
6. Toggle the switch to **enable** the agent

### C2. Configure via `.env` (alternative)

```dotenv
# ── Smart Home ────────────────────────────────────────────────────
MYHOME_MCP_ENDPOINT=http://homeassistant.local:8123
MYHOME_MCP_TOKEN=eyJhbGci...your-long-token...
```

> **Security:** Never commit `.env`. It is already in `.gitignore`.

Restart the app after editing `.env`:

```bash
python3 launch.py
```

---

## Part D — Test it

### D1. Startup check

When the agent comes online, it fetches an overview of your home. Watch the terminal:

```
Smart Home agent boot: Home — 42 devices, 8 active.
```

### D2. Test a light

Say to Robo:

> *"Hey Robo, turn on the lights"*

Expected:

> *"All lights turned on."*

Or for a specific light:

> *"Hey Robo, turn on the kitchen lights"*

Expected:

> *"Kitchen turned on."*

### D3. Test brightness

Say:

> *"Hey Robo, set the bedroom lights to 20%"*

Expected:

> *"Bedroom set to 20% brightness."*

### D4. Test a scene

Say:

> *"Hey Robo, activate the movie scene"*

Expected:

> *"Scene 'Movie' activated."*

### D5. Test the thermostat

Say:

> *"Hey Robo, set the thermostat to 22 degrees"*

Expected:

> *"Living Room Thermostat set to 22°."*

---

## 9. What it controls

| Domain | Supported actions | Example voice command |
|--------|------------------|----------------------|
| **Lights** | Turn on/off, toggle, set brightness (%), set color | *"Turn on the lights"*, *"Set kitchen to 50% warm"* |
| **Switches / Plugs** | Turn on/off, toggle | *"Turn off the kitchen plug"* |
| **Fans** | Turn on/off, toggle | *"Turn on the fan"* |
| **Covers** (blinds/curtains) | Open, close | *"Close the blinds"*, *"Open the curtains"* |
| **Locks** | Lock, unlock | *"Lock the front door"*, *"Unlock the back door"* |
| **Climate** (thermostats, AC) | Set temperature, read current state | *"Set thermostat to 24 degrees"*, *"What is the AC temperature?"* |
| **Scenes** | Activate | *"Activate the morning scene"* |
| **Status** | Overview of all devices | *"How many lights are on?"*, *"Smart home status"* |

### Supported light colors

`red`, `green`, `blue`, `yellow`, `orange`, `pink`, `purple`, `white`, `warm`, `cool`, `cyan`, `magenta`, `teal`

---

## 10. Voice commands

| What you say | What happens |
|---|---|
| *"Turn on the lights"* | Turns on all lights |
| *"Turn off the [room] lights"* | Turns off lights in that room |
| *"Set [room] brightness to [%]"* | Adjusts light brightness |
| *"Make the lights [color]"* | Changes light color |
| *"Toggle the fan"* | Flips fan on/off |
| *"Turn off the kitchen switch"* | Controls a named switch |
| *"Lock the front door"* | Locks that door lock |
| *"Unlock the back door"* | Unlocks that door lock |
| *"Close the blinds"* | Closes window covers |
| *"Set thermostat to [N] degrees"* | Sets climate target temperature |
| *"What is the AC temperature?"* | Reads current and target temperature |
| *"Activate the [name] scene"* | Triggers a Home Assistant scene |
| *"Smart home status"* | Reads home overview (devices, active count) |
| *"How many devices are on?"* | Same as above |

**Device name matching:** exact and partial friendly-name matching is used. If you say *"bedroom"*, the agent finds the entity whose name contains "bedroom". If multiple matches exist, the first is used.

---

## 11. Troubleshooting

### "Smart Home is not configured"

```
Smart Home is not configured. Add your Home Assistant URL and token in Settings → Agents → Smart Home.
```

- Open Settings → Agents → Smart Home and enter the URL + token
- Or add `MYHOME_MCP_ENDPOINT` and `MYHOME_MCP_TOKEN` to `.env` and restart

### Cannot reach Home Assistant

1. Confirm Home Assistant is running — open the URL in a browser
2. Check if the URL uses `http` or `https` — match exactly
3. If using `homeassistant.local`, confirm your machine is on the same network as HA
4. If using an IP address, confirm it has not changed (assign a static IP in your router)

### "I couldn't find a device matching '[name]'"

```
I couldn't find a device matching 'bedroom fan'. Try using its exact name.
```

- Check the device's **friendly name** in Home Assistant: Settings → Devices & Services → Entities
- Try a shorter part of the name: *"fan"* instead of *"bedroom ceiling fan"*
- If no name match works, the agent falls back to controlling all devices of that type (e.g. all fans)

### Token rejected (401)

```
Could not control device: 401 Unauthorized
```

- The Long-Lived Token has been deleted or expired
- Go to your HA Profile → Long-lived access tokens → delete the old token → create a new one
- Update the token in Settings → Agents → Smart Home

### "No climate devices found"

Home Assistant must have climate entities configured. These are created by thermostat/AC integrations (e.g. Nest, Ecobee, generic_thermostat). If you don't have a climate entity, this command won't work.

### Docker not running

The Smart Home agent uses the `voska/hass-mcp` container as a bridge. Make sure Docker is running:

```bash
docker info
# Should print Docker system info — if it errors, start Docker Desktop
```

---

## 12. Security notes

| What | How it is protected |
|------|-------------------|
| `MYHOME_MCP_TOKEN` | Stored in `.env` or browser `localStorage`; never logged or shown in responses |
| API calls | Made server-side to your Home Assistant URL — token not visible in browser network tabs |
| Network | Connects to your local HA instance; if your HA URL is only accessible on your LAN, it is not reachable from the internet |
| Token scope | Long-Lived Tokens in HA have full access — create a dedicated token with a descriptive name so you can revoke it independently if needed |

> If your Home Assistant is exposed to the internet (e.g. via Nabu Casa or port forwarding), make sure your HA instance uses HTTPS and strong login credentials.
