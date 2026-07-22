---
name: india-stock-analysis
description: "Analyse NSE/BSE listed stocks using broker MCP tools (Groww or Zerodha Kite) and web search. Covers four analysis types: basic stock info, fundamental analysis, technical analysis, and comprehensive investment report. All figures in INR with India-specific metrics (promoter holding, FII/DII, fiscal year Apr–Mar, T+1 settlement)."
---

# India Stock Analysis Skill

Analyse Indian stocks listed on NSE and BSE using broker MCP tools and web search. All analysis is denominated in INR and follows Indian fiscal year conventions (April–March). No API keys required.

## Data Sources

Use whichever broker MCP is connected. Both provide equivalent data for stock analysis.

### Option A: Groww MCP (if connected)
- `fetch_stocks_fundamental_data` — Financials, ratios, shareholding, mutual fund holdings
- `fetch_historical_candle_data` — OHLCV price history
- `get_historical_technical_indicators` — RSI, MACD, Bollinger, SMA, EMA, SuperTrend, VWAP, ADX, and more
- `get_ltp` — Live/last traded price and open interest
- `get_quotes_and_depth` — Real-time bid/ask and market depth
- `curate_symbols` — Resolve stock symbols and exchange
- `fetch_market_movers_and_trending_stocks_funds` — Market movers, gainers, losers
- `fetch_fundamentals_screener` — Screen stocks by fundamental criteria
- `fetch_technical_screener` — Screen stocks by technical signals
- `search_stock_and_others_symbol` — Search for stocks, indices, and companies
- `resolve_market_time_and_calendar` — Current market time, trading days, holidays

### Option B: Zerodha Kite MCP (if connected)
- `get_ltp` — Last traded price for instruments
- `get_quotes` — Real-time market quotes with depth
- `get_ohlc` — OHLC data for instruments
- `get_historical_data` — Historical OHLCV candle data
- `search_instruments` — Search and resolve trading instruments
- `get_holdings` — User's portfolio holdings
- `get_positions` — Current trading positions
- `get_margins` — Account margin details
- `get_profile` — User profile information

### Supplementary
- Web search for news, analyst reports, sector developments, and regulatory updates
- yfinance (free, no API key) as fallback for historical data

## Workflow

When a user requests stock analysis, determine which analysis type is needed and follow the corresponding workflow. Default to **Comprehensive Investment Report** if no type is specified.

### Analysis Type 1: Basic Stock Information

Use for quick overview, current price, or summary.

**Steps:**
1. Resolve symbol via `curate_symbols` or `search_stock_and_others_symbol`.
2. Fetch current price via `get_ltp`.
3. Fetch key fundamental stats via `fetch_stocks_fundamental_data` (view=`stats_only`): `marketCap`, `peRatio`, `pbRatio`, `roe`, `epsTtm`, `dividendYieldInPercent`, `industryPe`, `bookValue`, `debtToEquity`, `faceValue`.
4. Fetch recent price history (1 year, daily interval) for 52-week high/low and YTD.
5. Web search for recent news (last 30 days).

**Output format:**
```
## [Company Name] ([Exchange]: [Symbol])

**Current Price:** Rs.[LTP] ([+/-change] / [+/-change%])
**Market Cap:** Rs.[value] Cr

### Key Metrics
| Metric | Value |
|--------|-------|
| PE Ratio | [value] |
| Industry PE | [value] |
...

### 52-Week Range
- High: Rs.[value] ([date])
- Low: Rs.[value] ([date])

### Recent News
- [headline] — [source, date]
```

### Analysis Type 2: Fundamental Analysis

Use for business quality, financials, valuation, or investment merit questions.

**Steps:**
1. Resolve symbol.
2. Fetch full fundamental data (`view='all'`): include all major ratios, return metrics, and financial statements (`['*']`).
3. Fetch shareholding (`view='shareholders_and_mutual_funds'`): promoter holding, FII/DII breakdown, pledge %, top MF holders.
4. Web search for analyst reports, management commentary, sector outlook.

**Analysis framework:**

**a. Business Quality:** Moat, management, market position, governance.

**b. Financial Health:**
- Revenue and profit trends (3–5 year)
- Margin analysis (operating, net, EBITDA)
- Cash flow quality (operating vs reported profit)
- Balance sheet (debt, current ratio, interest coverage)

**c. Shareholding Pattern (India-Specific):**
| Promoter Holding | Interpretation |
|-----------------|----------------|
| >70% | Very high control, limited free float |
| 50–70% | Strong confidence |
| 30–50% | Moderate, watch for changes |
| <30% | Low — governance concern |

Promoter pledge:
- 0%: Best case | 1–10%: Acceptable | 10–20%: Monitor | >20%: Red flag | >50%: Serious concern

FII/DII trend: increasing FII = positive signal.

**d. Valuation:** PE vs Industry PE and Sector PE, PB vs Sector PB, PEG, EV/EBITDA, earnings yield vs 10Y G-Sec (~7%).

**e. Growth:** Revenue growth, EPS trend, order book, capex, ROIC.

**f. Risk Factors:** Company-specific, sector/regulatory, promoter-related, macro.

Assign fundamental score 1–10.

### Analysis Type 3: Technical Analysis

Use for chart patterns, entry/exit levels, or trading signals.

**Steps:**
1. Resolve symbol and check market time via `resolve_market_time_and_calendar`.
2. Fetch price history: daily (6 months), weekly (2 years), intraday if needed.
3. Fetch technical indicators via `get_historical_technical_indicators`:
   - Trend: `sma` (20, 50, 200), `ema` (20), `supertrend`
   - Momentum: `rsi` (14), `macd` (12,26,9), `stochastic`, `williams_r`, `adx`
   - Volatility: `bollinger` (20, 2 std), `atr`, `keltner`
   - Volume: `vwap`, `obv`, `mfi`
   - Reversal: `parabolic_sar`
   - Levels: `pivot_points`

**Analysis sections:**
- Trend (primary + secondary, DMA alignment, golden/death cross)
- Support and Resistance table
- Momentum (RSI, MACD, Stochastic, ADX)
- Volatility (Bollinger, ATR, Keltner)
- Volume (OBV, MFI, VWAP)
- Pattern Recognition
- Trading levels table
- Outlook: short-term (1–2 weeks), medium-term (1–3 months)

### Analysis Type 4: Comprehensive Investment Report

Combines all of the above plus:
- Peer comparison table (3–5 peers, same 4–6 metrics)
- Analyst recommendations and target prices (web search)
- Upcoming catalysts: earnings, AGM, corporate actions (near/medium/long term)
- Valuation: relative, historical PE band, sector premium/discount
- Risk matrix (probability × impact)
- Investment recommendation: Strong Buy / Buy / Hold / Sell / Strong Sell
- Standard investment disclaimer

## India-Specific Conventions

- **Currency**: INR (Rs.), Cr (Crore = 10 million), L (Lakh = 100,000)
- **Fiscal Year**: April–March. Reference as FY24 (April 2023–March 2024)
- **Market Hours**: 9:15 AM–3:30 PM IST, Mon–Fri
- **Settlement**: T+1
- **Index Membership**: Nifty 50, Nifty Next 50, Nifty 100, Nifty 500, Nifty Midcap 100, Nifty Smallcap 100
- **Dual Listing**: Most stocks on both NSE and BSE. Prefer NSE for liquidity.
- **Circuit Limits**: Mention if relevant to analysis.

## Reference Files

- `references/fundamental-analysis.md`
- `references/financial-metrics.md`
- `assets/report-template.md`
