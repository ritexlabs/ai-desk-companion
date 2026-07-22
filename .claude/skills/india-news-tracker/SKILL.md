---
name: india-news-tracker
description: "Aggregate and analyse Indian stock market news from regulatory bodies, financial media, and market data sources. Covers 7 operating modes: daily briefing, stock-specific news, sector roundups, earnings tracking, corporate actions, bulk/block deals, and regulatory updates. Scores news impact (1–10) and sentiment for actionable market intelligence."
---

# India News Tracker

Aggregate and analyse Indian stock market news from official and financial media sources to provide actionable market intelligence with impact scoring and sentiment classification.

## News Source Tiers

| Tier | Sources |
|------|---------|
| Tier 1 (Official) | BSE, NSE, SEBI, RBI |
| Tier 2 (Financial Media) | MoneyControl, Economic Times, LiveMint, Business Standard |
| Tier 3 (Supplementary) | NDTV Profit, Screener.in |
| Tier 4 (Sentiment) | X/Twitter, Reddit (r/IndiaInvestments, r/NSEIndia) |

## 7 Operating Modes

### Mode 1: Daily Market Briefing
Produce a structured daily summary covering:
- Pre-market: GIFT Nifty, global cues (Dow, Nasdaq, SGX), Asian markets
- Key events today: RBI calendar, earnings, corporate actions
- Top 5 market-moving headlines with impact score
- Sectoral outlook for the day

### Mode 2: Stock-Specific News
For a named stock:
1. Resolve NSE symbol
2. Fetch recent headlines (last 7–30 days)
3. Classify each by event type
4. Score impact (1–10) and assign sentiment
5. Cross-reference with price/volume action via broker MCP

### Mode 3: Sector Roundup
For a named sector:
1. Identify relevant NSE sectoral index
2. Fetch sector-wide news
3. Aggregate sentiment across news items
4. Map to specific stocks most affected

### Mode 4: Earnings Tracking
- Track earnings calendar (results dates, analyst estimates)
- Summarise actual vs expected (revenue, PAT, margin)
- Note management guidance and key commentary
- Flag earnings surprises (beat/miss >10%)

### Mode 5: Corporate Actions
Track and interpret:
- Dividends (ex-date, amount, yield impact)
- Bonus/split announcements (ratio, record date)
- Rights issues (price, ratio, timeline)
- Buybacks (price, quantity, open offer implications)
- Mergers and acquisitions

### Mode 6: Bulk/Block Deal Analysis
From BSE/NSE bulk/block deal data:
- Identify buyer/seller (institution or promoter)
- Quantity and price vs market price (premium/discount)
- Interpret: insider accumulation, institutional entry/exit, promoter stake change

### Mode 7: Regulatory Updates
Monitor:
- SEBI circulars and orders
- RBI policy and regulatory changes
- Ministry of Finance and company affairs notifications
- Exchange notifications (F&O lot size changes, margin revisions, ban list)

## Quality Framework

Each news item must receive:

| Field | Values |
|-------|--------|
| Event Classification | Earnings, M&A, Regulatory, Macro, Commodity, FII/DII, Promoter, Dividend, Buyback, Result, Rating, Management, Other |
| Impact Score | 1–10 (1 = minor, 10 = market-moving) |
| Sentiment | Bullish / Bearish / Neutral / Ambiguous |
| Confidence | Confirmed / Unverified / Rumour |

Impact scoring guide:
- 8–10: Structural change, major regulatory action, large surprise earnings
- 5–7: Significant but expected, inline earnings, sector policy change
- 2–4: Minor update, routine filing, small dividend
- 1: Inconsequential

## Integration with Broker MCP

After collecting news, cross-reference with live price and volume:
```
get_ltp(symbol) → compare price action with news date
fetch_historical_candle_data(symbol, last_5_days) → volume confirmation
```

Volume >2× average on news day = market is pricing in the news. Low volume = market is ignoring it.

## Output Requirements

Every briefing must include:
- Source attribution (publication + URL or filing reference)
- Timestamp in IST
- NSE trading symbol where applicable
- Market context (how news relates to current price/trend)
- Distinction between confirmed announcements and unverified reports

## Reference Files
- `references/news_source_guide.md` — Credibility and access guide per source
- `references/sector_mapping.md` — News keywords to NSE sector/stock mapping
- `references/sentiment_patterns.md` — Recurring patterns and their historical market impact
- `scripts/news_fetcher.py` — Automated news collection script
- `assets/daily_briefing_template.md` — Standard daily briefing output format
