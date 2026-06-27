# Briefing Skill

One command to get a full morning summary — weather, calendar, news, and smart home status fetched in parallel from all connected agents.

**Navigation:** [← All Agents](../agents.md) | [Architecture](../architecture.md) | [Setup](../setup.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [How it works](#2-how-it-works)
3. [Prerequisites](#3-prerequisites)
4. [Voice commands](#4-voice-commands)
5. [What is included](#5-what-is-included)
6. [Customising the briefing](#6-customising-the-briefing)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Overview

The Briefing skill is your personal dashboard read-out. Instead of asking each agent separately, one voice command queries all connected agents at the same time and stitches the results into a single spoken response.

**Always active** — the skill itself needs no setup. The richness of the briefing depends only on which agents you have configured.

```
"Give me my morning briefing."
       ↓
Weather: 28°C sunny, light breeze | Calendar: Stand-up at 10 AM, 1:1 at 3 PM |
News: 3 top headlines | Home: All lights off, AC 24°C
```

---

## 2. How it works

```
Your voice command
       │
       ▼
 LLM Orchestrator
  "User wants a summary of everything → call briefing tool"
       │
       ▼
 BriefingAgent
  Checks which of these agents are enabled in the current session:
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ Weather  │  │ Calendar │  │  News    │  │SmartHome │
  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
       │              │              │              │
       └──────────────┴──────────────┴──────────────┘
                  asyncio.gather() — all parallel
                              │
                              ▼
                    Merge non-empty results
                    "Weather: … | Calendar: … | News: … | Home: …"
                              │
                              ▼
                 LLM synthesises into natural spoken response
```

Agents not connected or not configured are silently skipped — the briefing adapts to whatever is available.

---

## 3. Prerequisites

The Briefing skill itself needs nothing. To get a useful briefing, configure at least one of:

| Agent | What it adds to the briefing | Setup |
|---|---|---|
| **Weather** | Current conditions, temperature | [Weather setup →](weather.md) |
| **Google Calendar** | Today's meetings and events | [Calendar setup →](calendar.md) |
| **News** | Top 3 headlines | [News setup →](news.md) |
| **Smart Home** | Device status summary | [Smart Home setup →](smarthome.md) |

Even with just one agent configured, the briefing is useful. Add more over time to enrich it.

---

## 4. Voice commands

The LLM routes to the briefing skill automatically for summary-type requests:

| What you say | Effect |
|---|---|
| *"Give me my morning briefing"* | Full summary from all connected agents |
| *"What's my daily briefing?"* | Full summary |
| *"Morning summary please"* | Full summary |
| *"What's happening today?"* | Full summary (if phrased as overview) |
| *"Give me a dashboard summary"* | Full summary |
| *"Status of everything"* | Full summary |

**Tip:** If the LLM is not routing to the briefing skill, be more explicit: *"Give me my morning briefing"* is more reliable than *"what's up?"*

---

## 5. What is included

Each connected agent is queried with a focused prompt:

| Agent | Query sent | What you hear |
|---|---|---|
| **Weather** | *"Give me a one-sentence current weather summary."* | Temperature, conditions, brief forecast |
| **Calendar** | *"What events or meetings do I have scheduled today?"* | Count and names of today's events |
| **News** | *"Give me exactly 3 top news headlines right now."* | Three headline titles |
| **Smart Home** | *"Give me a brief status summary of my home devices."* | Lights on/off, climate state, device count |

Each section is capped at 300 characters to keep the full briefing speakable (under ~90 seconds).

---

## 6. Customising the briefing

The Briefing skill queries agents in a fixed order (Weather → Calendar → News → Smart Home). To change the order or queries, edit the `_AGENT_QUERIES` dict in:

```
apps/orchestrator/app/agents/briefing.py
```

```python
_AGENT_QUERIES: dict[str, str] = {
    'weather':   'Give me a one-sentence current weather summary.',
    'calendar':  'What events or meetings do I have scheduled today?',
    'news':      'Give me exactly 3 top news headlines right now.',
    'smarthome': 'Give me a brief status summary of my home devices.',
}
```

To add another agent (e.g. email) to the briefing, add it to this dict with a suitable query and the agent's ID.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "No agents connected for a briefing" | None of the 4 briefing agents are enabled | Configure at least Weather, Calendar, News, or Smart Home in Settings → Agents |
| Missing section (e.g. no weather) | Weather agent not configured or returning an error | Configure the Weather agent — see [weather.md](weather.md) |
| "Could not reach any agents" | All queries failed simultaneously | Check that agent credentials are valid; check internet connection |
| LLM does not route to briefing | Phrasing too short or ambiguous | Say *"Give me my morning briefing"* explicitly |
| Briefing is very long | Multiple agents returning verbose data | Nothing to fix — the LLM synthesises into a concise spoken form |
