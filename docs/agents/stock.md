# Stock Market — MCP Gateway Tool

> **Gateway tool** — served by the MCP Gateway (`apps/mcp-gateway/`, port 8788), namespace `stocks`. Tool name: `stocks__get_quote`.

Get live stock prices, technical indicators, and market summaries for Indian and US markets — by voice, with no API key needed.

**Navigation:** [← All tools](../agents.md) | [Architecture](../architecture.md) | [MCP Gateway](../mcp-gateway.md) | [Setup](../setup.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data flow](#3-data-flow)
4. [Prerequisites](#4-prerequisites)
5. [Part A — Install required packages](#part-a--install-required-packages)
6. [Part B — Configure in the app](#part-b--configure-in-the-app)
7. [Part C — Test it](#part-c--test-it)
8. [Indian market support](#8-indian-market-support)
9. [Voice commands](#9-voice-commands)
10. [Troubleshooting](#10-troubleshooting)
11. [Security notes](#11-security-notes)

---

## 1. Overview

The Stock Market agent lets you:

- **Get live prices** — *"What is the Nifty 50 price?"*
- **Check Indian stocks** — *"How is Reliance doing?"*
- **Check US stocks** — *"What is the AAPL price?"*
- **Get technical indicators** — *"RSI for TCS"*, *"SMA for Infosys"*
- **Market summaries** — *"What is the market doing?"*

**No API key required.** The agent uses [yfinance](https://pypi.org/project/yfinance/) which pulls data from Yahoo Finance — completely free, no account needed.

Data returned for each query:
- Current price and day change (amount + %)
- RSI(14) with overbought/oversold label
- 20-day and 50-day simple moving averages with trend direction
- Support and resistance levels (pivot-based, 20-day window)
- 52-week high/low range

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
│                                │  Stock Agent                   │
│                                │  - extracts ticker from speech │
│                                │  - resolves Indian aliases     │
│                                │  - calculates RSI/SMA locally  │
└────────────────────────────────│────────────────────────────────┘
                                 │  HTTPS
                    ┌────────────▼───────────────┐
                    │      Yahoo Finance          │
                    │   (via yfinance library)    │
                    │                             │
                    │  3-month daily OHLCV data   │
                    │  fast_info for 52-week range│
                    └─────────────────────────────┘
```

RSI, SMA, and support/resistance are calculated locally from the downloaded price history — no third-party analytics service is used.

---

## 3. Data flow

```
You say: "What is the Reliance stock price?"
         │
         ▼
   Robo UI (STT) ──► Orchestrator ──► Stock Agent
                                            │
                      Extracts query: "Reliance"
                                            │
                      Resolves alias: "RELIANCE.NS"
                                            │
                    yfinance.Ticker("RELIANCE.NS")
                    .history(period="3mo", interval="1d")
                                            │
                    Downloads 3 months of daily prices
                                            │
                    Calculates locally:
                    - Current price, day change
                    - RSI(14)
                    - SMA(20), SMA(50), trend
                    - Support / resistance
                    - 52-week range
                                            │
                    "Reliance Industries — ₹2,847.50 +₹34.20 (+1.22%)
                     RSI(14): 58.3 (neutral)
                     SMA20: ₹2,801.40  SMA50: ₹2,756.10 — uptrend
                     Support: ~₹2,780.00  Resistance: ~₹2,900.00
                     52-week range: ₹2,220.00 – ₹3,024.90"
```

---

## 4. Prerequisites

| Requirement | Notes |
|-------------|-------|
| Python packages | `yfinance`, `pandas`, `numpy` — install steps below |
| App running (`python3 launch.py`) | Orchestrator must be up |
| Internet connection | Required to download price data from Yahoo Finance |

No API key, no account, no registration.

---

## Part A — Install required packages

The stock agent depends on `yfinance`, `pandas`, and `numpy`. These are not installed by default to keep the base footprint small.

### A1. Install the packages

```bash
cd apps/orchestrator
pip install yfinance pandas numpy
```

Or add them to `requirements.txt` and reinstall:

```bash
pip install -r requirements.txt
```

### A2. Verify the installation

```bash
python3 -c "import yfinance as yf; print(yf.Ticker('^NSEI').fast_info['lastPrice'])"
# Should print a number like 24500.0
```

If this prints a number, you are ready. If it errors, see [Troubleshooting](#10-troubleshooting).

---

## Part B — Configure in the app

### B1. Configure via Settings UI

1. Start the app: `python3 launch.py`
2. Click the **⚙ gear icon** → **Agents** tab
3. Expand **Stock Market**
4. Set **Default Market**:
   - `IN` — for Indian markets (Nifty, NSE stocks in ₹)
   - `US` — for US markets (S&P 500, NYSE/NASDAQ stocks in $)
5. Toggle the switch to **enable** the agent

The default market affects:
- Which index is shown at startup (Nifty 50 / Sensex for IN, S&P 500 / Dow Jones for US)
- Which exchange suffix is appended to unrecognized tickers (`.NS` for IN, none for US)

### B2. Configure via `.env` (alternative)

```dotenv
# ── Stock ─────────────────────────────────────────────────────────
STOCK_DEFAULT_MARKET=IN    # IN or US
```

---

## Part C — Test it

### C1. Startup check

When the agent comes online, it fetches the two benchmark indices for your default market. Watch the terminal:

```
Stock agent boot: Nifty 50: ₹24,812.50 (+0.42%) · Sensex: ₹81,500.00 (+0.38%)
```

### C2. Test an Indian index

Say:

> *"Hey Robo, what is the Nifty 50?"*

Expected:

> *"Nifty 50 — ₹24,812.50 +₹104.20 (+0.42%). RSI(14): 62.1 (neutral). SMA20: ₹24,600.00 SMA50: ₹24,100.00 — uptrend."*

### C3. Test an Indian stock

Say:

> *"Hey Robo, how is TCS doing?"*

Expected:

> *"Tata Consultancy Services — ₹3,920.00 -₹28.50 (-0.72%). RSI(14): 44.2 (neutral). SMA20: ₹3,945.00 SMA50: ₹3,980.00 — downtrend."*

### C4. Test a US stock

Say:

> *"Hey Robo, what is the Apple stock price?"*

Expected:

> *"Apple Inc. — $213.40 +$2.10 (+0.99%). RSI(14): 55.8 (neutral)."*

---

## 8. Indian market support

The agent has built-in aliases for common Indian indices and large-cap NSE stocks. You can say them naturally — no need to know the ticker symbol.

### Indices

| What you say | Ticker resolved |
|---|---|
| Nifty / Nifty 50 / Nifty50 | `^NSEI` |
| Sensex / BSE | `^BSESN` |
| Bank Nifty / Nifty Bank | `^NSEBANK` |
| Nifty IT | `^CNXIT` |
| Nifty Auto | `^CNXAUTO` |
| Nifty Pharma | `^CNXPHARMA` |

### Large-cap NSE stocks (examples)

| What you say | Ticker resolved |
|---|---|
| Reliance | `RELIANCE.NS` |
| TCS | `TCS.NS` |
| Infosys / Infy | `INFY.NS` |
| HDFC Bank | `HDFCBANK.NS` |
| ICICI / ICICI Bank | `ICICIBANK.NS` |
| Wipro | `WIPRO.NS` |
| SBI | `SBIN.NS` |
| Bajaj / Bajaj Finance | `BAJFINANCE.NS` |
| Kotak / Kotak Bank | `KOTAKBANK.NS` |
| Zomato | `ZOMATO.NS` |
| Paytm | `PAYTM.NS` |

For any stock not in the alias list, if `STOCK_DEFAULT_MARKET=IN`, the agent automatically appends `.NS` to make it an NSE ticker. For example, saying *"TITAN stock"* will fetch `TITAN.NS`.

---

## 9. Voice commands

| What you say | What happens |
|---|---|
| *"What is the Nifty 50?"* | Live price + technicals for Nifty 50 |
| *"Sensex price"* | Live price + technicals for Sensex |
| *"How is [company] doing?"* | Full analysis for that stock |
| *"[Company] stock price"* | Same as above |
| *"RSI for [company]"* | Full analysis including RSI reading |
| *"What is the S&P 500?"* | Live price for S&P 500 (US market) |
| *"AAPL price"* | Apple Inc. live price + technicals |
| *"What is the market doing?"* | Summary using default market indices |

Company names are matched case-insensitively. *"reliance"*, *"Reliance"*, and *"RELIANCE"* all resolve to the same ticker.

---

## 10. Troubleshooting

### "Stock agent requires yfinance"

```
Stock agent requires yfinance. Install it: pip install yfinance pandas numpy
```

Run:

```bash
pip install yfinance pandas numpy
```

Then restart the app.

### "Could not find data for '[name]'"

```
Could not find data for 'XYZ'. Try the exact ticker symbol (e.g. RELIANCE.NS, ^NSEI, AAPL).
```

- The stock name was not recognized. Try using the exact NSE/BSE ticker
- For Indian stocks: append `.NS` (e.g. `HDFC.NS`, `BAJAJFINSV.NS`)
- For Indian indices: use `^NSEI`, `^BSESN`
- For US stocks: use the standard ticker (`AAPL`, `MSFT`, `TSLA`)

### Agent shows "Degraded" in the roster

yfinance is not installed. See [Part A](#part-a--install-required-packages).

### Prices seem delayed

Yahoo Finance data is typically delayed by 15 minutes for most exchanges. For real-time institutional-grade data, a paid data provider would be needed — this is a Yahoo Finance limitation, not an agent limitation.

### "Could not fetch data for '[name]' (ticker: ...)"

Yahoo Finance API may be temporarily rate-limited or down. Wait a minute and try again. You can verify by running:

```bash
python3 -c "import yfinance as yf; print(yf.Ticker('RELIANCE.NS').fast_info['lastPrice'])"
```

---

## 11. Security notes

| What | How it is protected |
|------|-------------------|
| No credentials | No API key, token, or account needed — Yahoo Finance is publicly accessible |
| Network requests | Made server-side by the orchestrator over HTTPS to Yahoo Finance servers |
| Data | Price history downloaded to memory only for the duration of the request — not stored to disk |

> The Stock agent is one of the few agents that works with zero configuration beyond the Python packages.
