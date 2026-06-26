# News Agent

Get top headlines and search for news on any topic — by voice, from 50+ countries.

**Navigation:** [← All Agents](../agents.md) | [Architecture](../architecture.md) | [Setup](../setup.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data flow](#3-data-flow)
4. [Prerequisites](#4-prerequisites)
5. [Part A — Get a GNews API key](#part-a--get-a-gnews-api-key)
6. [Part B — Configure in the app](#part-b--configure-in-the-app)
7. [Part C — Test it](#part-c--test-it)
8. [Supported countries](#8-supported-countries)
9. [Voice commands](#9-voice-commands)
10. [Troubleshooting](#10-troubleshooting)
11. [Security notes](#11-security-notes)

---

## 1. Overview

The News agent lets you:

- **Get top headlines** — *"What are the latest headlines?"*
- **Search by topic** — *"Any news about AI?"*
- **Get local news** — *"Top stories in India today"*
- **Get city/state news** — *"News from Mumbai"*

One credential is required: a **GNews API key** (free tier: 100 requests/day, no credit card needed).

Data returned:
- Up to 5 headlines with source name and publication date
- Short description for the top 3 results
- Filtered by your configured country and optional city/state

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
│                                │  News Agent                    │
│                                │  - extracts topic from speech  │
│                                │  - adds location filter        │
│                                │  - formats spoken summary      │
└────────────────────────────────│────────────────────────────────┘
                                 │  HTTPS
                    ┌────────────▼───────────────┐
                    │        GNews API            │
                    │      gnews.io/api/v4        │
                    │                             │
                    │  /top-headlines             │  ← general news
                    │  /search                   │  ← topic search
                    └─────────────────────────────┘
```

---

## 3. Data flow

```
You say: "Any news about artificial intelligence?"
         │
         ▼
   Robo UI (STT) ──► Orchestrator ──► News Agent
                                            │
                      Extracts topic: "artificial intelligence"
                                            │
                    GET /search
                         ?q=artificial intelligence
                         &country=in
                         &lang=en
                         &sortby=publishedAt
                         &max=5
                                            │
                              GNews returns articles
                                            │
                    "Latest news about 'artificial intelligence':
                     1. OpenAI releases new model (TechCrunch · 2026-06-24)
                        OpenAI has released a new language model that...
                     2. India invests in AI research (The Hindu · 2026-06-24)
                        The government announced funding for...
                     3. AI regulation update (BBC · 2026-06-23)
                        European regulators have..."
```

---

## 4. Prerequisites

| Requirement | Notes |
|-------------|-------|
| A GNews account | Free at [gnews.io](https://gnews.io) — takes 1 minute |
| A GNews API key | Provided immediately on signup |
| App running (`python3 start.py`) | Orchestrator must be up |
| Internet connection | Required to reach the GNews API |

---

## Part A — Get a GNews API key

### A1. Create a free account

1. Go to **[gnews.io](https://gnews.io)**
2. Click **Get Started** or **Sign Up** (top right)
3. Enter your email and choose a password
4. Click **Sign Up** — no credit card required

### A2. Verify your email

1. Check your inbox for a verification email from GNews
2. Click the verification link

### A3. Get your API key

1. Sign in to [gnews.io](https://gnews.io)
2. Click your account name (top right) → **Dashboard**
3. Your API key is shown on the dashboard — copy it

   It looks like: `a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4`

### A4. Free tier limits

| Limit | Value |
|-------|-------|
| Requests per day | 100 |
| Articles per request | Up to 10 |
| Countries | 50+ |
| Topics | Unlimited |

100 requests/day is well above typical voice-assistant usage. If you need more, GNews offers paid plans.

---

## Part B — Configure in the app

### B1. Configure via Settings UI (recommended)

1. Start the app: `python3 start.py`
2. Click the **⚙ gear icon** → **Agents** tab
3. Expand **News**
4. Fill in:
   - **API Key** — paste your GNews key from Part A
   - **Country** — the ISO 3166-1 alpha-2 country code for your default news region (e.g. `in` for India, `us` for United States, `gb` for United Kingdom)
   - **State** *(optional)* — narrows headlines to a state or region (e.g. `Karnataka`)
   - **City** *(optional)* — narrows headlines to a city (e.g. `Bengaluru`)
5. Click **Test** — you should see the headline count for your country
6. Toggle the switch to **enable** the agent

### B2. Configure via `.env` (alternative)

```dotenv
# ── News ──────────────────────────────────────────────────────────
NEWS_API_KEY=your-gnews-key-here
NEWS_DEFAULT_COUNTRY=in         # ISO 3166-1 alpha-2 country code
NEWS_DEFAULT_STATE=              # optional: state / region
NEWS_DEFAULT_CITY=               # optional: city name
```

> **Security:** Never commit `.env`. It is already in `.gitignore`.

Restart the app after editing `.env`:

```bash
python3 start.py
```

---

## Part C — Test it

### C1. Startup check

When the agent comes online, it fetches top headlines for your country. Watch the terminal:

```
News agent boot: 5 articles ready (India).
```

### C2. Test top headlines

Say to Robo:

> *"Hey Robo, what are the latest headlines?"*

Expected:

> *"Top headlines from India:*
> *1. PM Modi visits... (NDTV · 2026-06-24)*
> *2. Stock market surge... (Economic Times · 2026-06-24)*
> *..."*

### C3. Test topic search

Say:

> *"Hey Robo, any news about cricket?"*

Expected:

> *"Latest news about 'cricket':*
> *1. India wins test series (Cricinfo · 2026-06-24)*
>    *India defeated Australia in the 3rd test match...*
> *..."*

### C4. Test city news

Say:

> *"Hey Robo, news from Bengaluru"*

Expected (if city is configured or mentioned):

> *"Top headlines from Bengaluru:*
> *1. Metro extension approved (Deccan Herald · 2026-06-24)..."*

---

## 8. Supported countries

Set `NEWS_DEFAULT_COUNTRY` to any of these ISO codes:

| Code | Country | Code | Country |
|------|---------|------|---------|
| `ae` | UAE | `in` | India |
| `ar` | Argentina | `it` | Italy |
| `au` | Australia | `jp` | Japan |
| `br` | Brazil | `kr` | South Korea |
| `ca` | Canada | `mx` | Mexico |
| `cn` | China | `my` | Malaysia |
| `de` | Germany | `ng` | Nigeria |
| `eg` | Egypt | `nl` | Netherlands |
| `fr` | France | `nz` | New Zealand |
| `gb` | United Kingdom | `ph` | Philippines |
| `hk` | Hong Kong | `ru` | Russia |
| `id` | Indonesia | `sa` | Saudi Arabia |
| `ie` | Ireland | `sg` | Singapore |
| `il` | Israel | `th` | Thailand |
| | | `us` | United States |
| | | `za` | South Africa |

---

## 9. Voice commands

| What you say | What happens |
|---|---|
| *"What are the latest headlines?"* | Top 5 headlines for your configured country |
| *"What is the news today?"* | Same as above |
| *"Top stories"* | Same as above |
| *"Breaking news"* | Same as above |
| *"Any news about [topic]?"* | Searches for articles on that topic |
| *"Latest news on [topic]"* | Same as above |
| *"News from [city/region]"* | Top headlines filtered to that location |
| *"What is happening in [city]?"* | Same as above |

Topic extraction is automatic — common question prefixes like *"what is the"*, *"tell me about"*, *"any news about"* are stripped to isolate the topic.

---

## 10. Troubleshooting

### "News agent is not configured"

```
News agent is not configured. Please add your GNews API key in Settings → Agents → News Agent.
```

- Open Settings → Agents → News and paste your GNews API key
- Or add `NEWS_API_KEY=...` to `.env` and restart

### "GNews API error 401"

The API key is invalid or not yet activated.

1. Confirm you copied the key correctly from the GNews dashboard
2. Try the key directly:
   ```bash
   curl "https://gnews.io/api/v4/top-headlines?token=YOUR_KEY&lang=en&country=in&max=1"
   ```
   You should get a JSON response with `articles`. A `401` means the key is wrong.

### "GNews API error 429"

You have exceeded 100 requests/day on the free tier. The limit resets at midnight UTC. Either wait until tomorrow or upgrade your GNews plan.

### "No news found about '[topic]'"

- The topic may be too narrow or misspelled — try a broader term
- GNews indexes primarily English-language sources; non-English topics may return fewer results
- Try setting a different country code to broaden the search

### Headlines are not relevant to my country

Check that `NEWS_DEFAULT_COUNTRY` is set correctly in Settings or `.env`. The code must be the two-letter ISO 3166-1 alpha-2 code (e.g. `in` not `india`, `gb` not `uk`).

---

## 11. Security notes

| What | How it is protected |
|------|-------------------|
| `NEWS_API_KEY` | Stored in `.env` or browser `localStorage`; never logged or shown in responses |
| API calls | Made server-side by the orchestrator over HTTPS — key not visible in browser network tabs |
| No personal data | News queries do not contain any personal identifiers — only the topic and country filter |
