# Weather — MCP Gateway Tool

> **Gateway tool** — served by the MCP Gateway (`apps/mcp-gateway/`, port 8788), namespace `weather`. Tool name: `weather__get_current_weather`.

Get current weather and forecasts for any city by voice — works out of the box with no API key, or with a free account for richer data.

**Navigation:** [← All tools](../agents.md) | [Architecture](../architecture.md) | [MCP Gateway](../mcp-gateway.md) | [Setup](../setup.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data flow](#3-data-flow)
4. [Prerequisites](#4-prerequisites)
5. [Part A — Choose a weather provider](#part-a--choose-a-weather-provider)
6. [Part B — Get an API key (OpenWeatherMap or WeatherAPI)](#part-b--get-an-api-key-openweathermap-or-weatherapi)
7. [Part C — Configure in the app](#part-c--configure-in-the-app)
8. [Part D — Test it](#part-d--test-it)
9. [Voice commands](#9-voice-commands)
10. [Troubleshooting](#10-troubleshooting)
11. [Security notes](#11-security-notes)

---

## 1. Overview

The Weather agent lets you:

- **Check current conditions** — *"What is the weather in London?"*
- **Get temperature and feels-like** — *"How hot is it in Tokyo right now?"*
- **Check humidity and wind** — *"What is the humidity in Mumbai?"*
- **Ask about any city** — city names are extracted naturally from your speech
- **Set a default city** — so *"What is the weather?"* always shows your home city

Three providers are supported:

| Provider | API key | Cost | Data quality |
|----------|---------|------|-------------|
| **Open-Meteo** | None — free forever | Free | Good (WMO standard) |
| **OpenWeatherMap** | Required | Free tier (1000 req/day) | Very good |
| **WeatherAPI** | Required | Free tier (1M req/month) | Excellent (includes feels-like) |

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
│                                │  Weather Agent                 │
│                                │  - extracts city from speech   │
│                                │  - selects provider            │
│                                │  - formats response            │
└────────────────────────────────│────────────────────────────────┘
                                 │  HTTPS
              ┌──────────────────┼───────────────────┐
              ▼                  ▼                   ▼
   ┌─────────────────┐  ┌──────────────────┐  ┌──────────────┐
   │   Open-Meteo    │  │ OpenWeatherMap   │  │  WeatherAPI  │
   │ (no key needed) │  │  api.openweather │  │  weatherapi  │
   │   open-meteo.com│  │  map.org         │  │  .com        │
   └─────────────────┘  └──────────────────┘  └──────────────┘
```

---

## 3. Data flow

```
You say: "What is the weather in Bengaluru?"
         │
         ▼
   Robo UI (STT) ──► Orchestrator ──► Weather Agent
                                            │
                              Extracts city: "Bengaluru"
                                            │
                              No API key? → Open-Meteo
                              OWM key?   → OpenWeatherMap
                              WAPI key?  → WeatherAPI
                                            │
                              GET request to provider API
                                            │
                              Formats: "In Bengaluru, India:
                               partly cloudy, 28°C, feels like
                               31°C. Humidity 72%, wind 14 km/h."
                                            │
                         Orchestrator ──► Robo speaks the result
```

---

## 4. Prerequisites

| Requirement | Notes |
|-------------|-------|
| App running (`python3 start.py`) | Orchestrator must be up |
| Internet connection | Required to fetch weather data |
| API key | **Optional** — Open-Meteo works without any key |

---

## Part A — Choose a weather provider

### Option A1 — Open-Meteo (zero setup, recommended to start)

Open-Meteo is a free, open-source weather API that requires **no account and no API key**. The Weather agent uses it automatically when no API key is configured.

- Coverage: worldwide
- Data: current temperature, humidity, wind speed, WMO weather condition
- Limitation: no feels-like temperature, no hourly forecast in the current integration

**If you just want to try the agent, skip to [Part C](#part-c--configure-in-the-app).** Open-Meteo will be used automatically.

---

### Option A2 — OpenWeatherMap (free, recommended for daily use)

- 1,000 API calls/day on the free tier (well above typical usage)
- Adds feels-like temperature on top of Open-Meteo data
- Requires a free account — takes about 2 minutes to set up

Continue to [Part B — OpenWeatherMap](#b1-sign-up-for-openweathermap).

---

### Option A3 — WeatherAPI (free, richest data)

- 1,000,000 API calls/month on the free tier
- Includes feels-like, UV index, air quality, and more
- Requires a free account

Continue to [Part B — WeatherAPI](#b2-sign-up-for-weatherapi).

---

## Part B — Get an API key (OpenWeatherMap or WeatherAPI)

Skip this part entirely if you are using Open-Meteo.

### B1. Sign up for OpenWeatherMap

1. Go to **[openweathermap.org](https://openweathermap.org/api)**
2. Click **Sign In** → **Create an Account**
3. Fill in your email and a password → click **Create Account**
4. Verify your email (check your inbox for a confirmation link)
5. After sign-in, click your username (top right) → **My API Keys**
6. You will see a **Default** key already created — copy it

   > New keys activate within 10 minutes of account creation. If you get a `401` error right after signing up, wait 10 minutes and try again.

7. Your key looks like: `a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4`
8. This is your `WEATHER_API_KEY`. The provider is `openweathermap`.

---

### B2. Sign up for WeatherAPI

1. Go to **[weatherapi.com](https://www.weatherapi.com)**
2. Click **Sign Up** (top right)
3. Fill in your details → click **Sign Up**
4. Verify your email
5. After sign-in you land on the **Dashboard** — your API key is shown at the top
6. Copy the key

   > WeatherAPI keys are active immediately.

7. Your key looks like: `a1b2c3d4e5f6a1b2`
8. This is your `WEATHER_API_KEY`. The provider is `weatherapi`.

---

## Part C — Configure in the app

You can configure the Weather agent via the Settings UI or by editing `.env` directly.

### C1. Configure via Settings UI (recommended)

1. Start the app: `python3 start.py`
2. Click the **⚙ gear icon** → **Agents** tab
3. Expand **Weather**
4. Fill in:
   - **API Key** — paste your key from Part B (leave blank to use Open-Meteo)
   - **Provider** — select `openweathermap` or `weatherapi` to match your key
   - **Default City** — the city used when you say *"What is the weather?"* without naming one (e.g. `Bengaluru`)
5. Click **Test** — you should see a live weather reading for your default city
6. Toggle the switch to **enable** the agent

### C2. Configure via `.env` (alternative)

Open `apps/orchestrator/.env` (create it from `.env.example` if it does not exist):

```dotenv
# ── Weather ───────────────────────────────────────────────────────
WEATHER_API_KEY=your-key-here          # leave blank to use Open-Meteo (free, no key)
WEATHER_PROVIDER=openweathermap        # openweathermap | weatherapi (ignored if no key)
WEATHER_DEFAULT_CITY=Bengaluru         # used when no city is mentioned in the voice command
```

> **Security:** Never commit `.env`. It is already in `.gitignore`.

Restart the app after editing `.env`:

```bash
python3 start.py
```

---

## Part D — Test it

### D1. Basic test

Say to Robo:

> *"Hey Robo, what is the weather in London?"*

Expected response:

> *"In London, GB: overcast clouds, 14°C, feels like 12°C. Humidity 82%, wind 20 km/h."*

### D2. Test your default city

Say:

> *"Hey Robo, what is the weather?"*

Robo should use the default city you configured and return current conditions.

### D3. Test a city in India

Say:

> *"Hey Robo, what is the temperature in Mumbai?"*

> *"In Mumbai, IN: haze, 32°C, feels like 38°C. Humidity 78%, wind 18 km/h."*

### D4. Test via Settings UI

1. Go to Settings → Agents → Weather
2. Click **Test**
3. You should see a live weather card for your default city

---

## 9. Voice commands

| What you say | What happens |
|---|---|
| *"What is the weather in [city]?"* | Current conditions for that city |
| *"What is the temperature in [city]?"* | Temperature and feels-like |
| *"What is the humidity in [city]?"* | Humidity percentage |
| *"How windy is it in [city]?"* | Wind speed in km/h |
| *"What is the weather?"* | Conditions for your default city |
| *"Will it rain in [city]?"* | Current conditions including precipitation desc |
| *"How hot is it in [city] right now?"* | Temperature reading |

City names are extracted naturally from your speech. You can say the city name in any position — *"London weather"*, *"weather in London"*, and *"what is the weather for London"* all work.

**Automatic India preference:** When a city name exists in multiple countries (e.g. "Bangalore"), the agent prefers the Indian result. This can be overridden by being specific: *"Bangalore, US"*.

---

## 10. Troubleshooting

### "Could not fetch weather for [city]"

1. Check your internet connection
2. If using an API key, confirm it is correct in Settings → Weather
3. Try a different city spelling (e.g. `Bengaluru` vs `Bangalore`)
4. Test the API directly:

   **OpenWeatherMap:**
   ```bash
   curl "https://api.openweathermap.org/data/2.5/weather?q=London&appid=YOUR_KEY&units=metric"
   ```

   **Open-Meteo (no key needed):**
   ```bash
   curl "https://geocoding-api.open-meteo.com/v1/search?name=London&count=1"
   ```

### "Invalid API key"

- OpenWeatherMap keys activate up to 10 minutes after account creation — wait and retry
- Double-check you copied the full key with no trailing spaces
- Confirm the **Provider** setting matches your key (openweathermap vs weatherapi)

### "City not found"

- Try a more specific name: `Mumbai, India` instead of `Mumbai`
- Use the English spelling of the city name
- For Indian cities, both `Bengaluru` and `Bangalore` are accepted

### Weather is showing for the wrong city

When a city name is ambiguous (e.g. `Springfield`), the agent picks the most prominent result. Be more specific: *"weather in Springfield, Illinois"*.

### Temperature shows in wrong units

The agent always returns Celsius. This is fixed in the current version — unit selection is on the roadmap.

---

## 11. Security notes

| What | How it is protected |
|------|-------------------|
| `WEATHER_API_KEY` | Stored in `.env` on the server or in browser `localStorage`; never logged or displayed in responses |
| API requests | Made server-side by the orchestrator over HTTPS — your key is not exposed in browser network logs |
| Open-Meteo | No key at all — completely anonymous requests |
| Default city | Stored in browser `localStorage` — not sensitive |

> The Weather agent makes outbound HTTPS requests only to the configured provider. No data is sent anywhere else.
