# Web Search Skill

Search the live web for current facts, recent events, prices, and anything that may have changed since the AI's training cutoff — with no API key and no account required.

**Navigation:** [← All Agents](../agents.md) | [Architecture](../architecture.md) | [Setup](../setup.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [How it works](#2-how-it-works)
3. [Prerequisites](#3-prerequisites)
4. [Voice commands](#4-voice-commands)
5. [What it returns](#5-what-it-returns)
6. [Limitations](#6-limitations)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Overview

The Web Search skill bridges the gap between the AI's static training knowledge and the live internet. Use it whenever you need:

- **Current prices** — gold, petrol, crypto, stocks that are not in your portfolio
- **Recent news** — specific events the news agent doesn't cover
- **Factual lookups** — population of a city, distance between two places, conversion rates
- **Quick definitions** — technical terms, acronyms, people, places

The skill is **always active** — it requires no setup, no API key, and no toggle in Settings. The LLM orchestrator calls it automatically when your query clearly needs live information.

---

## 2. How it works

```
Your voice command
       │
       ▼
 LLM Orchestrator
  "This needs live data → call websearch tool"
       │
       ▼
 DuckDuckGo Instant Answer API
  https://api.duckduckgo.com/?q=...&format=json
       │
       ▼
 Priority result selection:
  1. Direct answer (e.g. "42 km" for distance questions)
  2. Abstract text from Wikipedia / InfoBox
  3. Related topics (top 3 snippets, 160 chars each)
       │
       ▼
 LLM synthesises into natural spoken response
```

**Provider:** DuckDuckGo Instant Answer API — free, no account, no rate limit (within fair use), GDPR-friendly.

**Timeout:** 8 seconds. If the response takes longer the skill returns a graceful "unavailable" message and the LLM answers from its training data instead.

---

## 3. Prerequisites

None. This skill works immediately when the app starts.

The only requirement is an active internet connection on the machine running the orchestrator.

---

## 4. Voice commands

The orchestrator routes to this skill automatically based on intent. You do not need to say "search" — just ask naturally:

| What you say | What it searches for |
|---|---|
| *"What is the current price of gold?"* | `current gold price` |
| *"When was the Eiffel Tower built?"* | `Eiffel Tower construction date` |
| *"What is the population of Tokyo?"* | `population of Tokyo` |
| *"Who is the CEO of Tesla?"* | `Tesla CEO 2025` |
| *"What is the capital of Iceland?"* | `capital of Iceland` |
| *"Search the web for Python 3.13 release date"* | explicit search trigger |
| *"Look up latest iPhone specs"* | explicit search trigger |
| *"What is the speed of light in km/s?"* | factual lookup |
| *"How far is Mumbai from Delhi?"* | distance query |

**Tip:** Phrase your query as you would type it into a search engine for best results.

---

## 5. What it returns

The DuckDuckGo Instant Answer API has three tiers of results, used in priority order:

| Tier | Example | Coverage |
|---|---|---|
| **Direct answer** | `"42"` for *"answer to life the universe and everything"* | Calculator-style facts |
| **Abstract text** | Wikipedia summary paragraph (up to 450 characters) | Encyclopaedic topics |
| **Related topics** | Top 3 topic snippets (up to 160 chars each) | Broader context |

Response is capped at 600 characters before being handed back to the LLM for synthesis.

---

## 6. Limitations

| Limitation | Detail |
|---|---|
| **No full web crawl** | Returns instant answers and Wikipedia summaries, not a ranked list of web pages |
| **Not suited for real-time events** | Breaking news within the last few minutes may not appear; use the News agent for headlines |
| **No image results** | Voice-only assistant — visual content is not surfaced |
| **Ambiguous queries** | Very short or ambiguous queries may return "no result" — rephrase with more context |
| **Indian regional content** | DuckDuckGo has less coverage for regional Indian languages and hyperlocal queries |

For structured financial data (Nifty 50, individual stocks, RSI) use the **Stock Market agent** instead — it uses Yahoo Finance which is more reliable for market data.

For the latest news headlines use the **News agent** instead — it uses GNews which returns actual article titles.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Web search is unavailable" | No internet or DuckDuckGo unreachable | Check network; try again in 30 seconds |
| "Web search timed out" | Slow connection or DuckDuckGo overloaded | Retry; the 8-second timeout is intentional to keep voice responses fast |
| "No direct result found" | Query too vague or niche | Rephrase with more specific terms |
| LLM answers from training instead of searching | Orchestrator decided training knowledge was sufficient | Add "search the web for…" to force the skill |
