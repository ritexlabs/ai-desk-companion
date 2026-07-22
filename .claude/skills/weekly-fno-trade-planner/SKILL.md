---
name: weekly-fno-trade-planner
description: "End-to-end weekly F&O trade planning for Indian markets. Combines macro scan, sector screening, technical confirmation, and institutional flows to identify one high-conviction directional trade per week. Includes immediate entry assessment for overnight gaps, GTT stop-loss placement, and daily position management rules."
---

# Weekly F&O Trade Planner

Complete weekly trading workflow for Indian F&O markets — from macro thesis to live execution to position management. Identifies one high-conviction directional trade per week using Groww MCP or Zerodha Kite MCP.

## Six-Phase Framework

---

### Phase 1: News & Macro Scan

**Goal:** Identify the dominant market narrative for the week.

1. Fetch latest news via India News Tracker or web search.
2. Identify macro events: RBI calendar, earnings, geopolitical risks, global cues (Fed, crude, DXY).
3. Rate macro conviction on a 1–5 scale:
   - 1–2: Noise, no strong narrative
   - 3: Moderate conviction — proceed cautiously
   - 4–5: Strong narrative — proceed with full framework

**Stop if macro conviction < 3.** Wait for a clearer week.

---

### Phase 2: Sector & Instrument Identification

**Goal:** Narrow to ONE instrument with high F&O liquidity and a clear setup.

1. Check market movers via broker MCP (`fetch_market_movers_and_trending_stocks_funds` or `get_ltp` for indices).
2. Examine FII/DII flows (use FII/DII Flow Tracker if needed).
3. Screen sectors using the macro narrative from Phase 1.
4. Narrow to ONE instrument (prefer index: NIFTY, BANKNIFTY, or FINNIFTY for weekly plays — stock F&O for monthly only).

**Criteria for instrument selection:**
- High F&O liquidity (Nifty/BankNifty preferred)
- Clear technical setup (defined support/resistance)
- Aligns with macro narrative
- Not under F&O ban

---

### Phase 3: Direction & Technical Confirmation

**Goal:** Confirm direction with data, not opinion.

1. Fetch price data via broker MCP:
   - Daily candles (6 months) for trend
   - 5-minute candles (last 3 days) for entry precision

2. Run technical indicators:
   - Trend: SMA 20, SMA 50, EMA 20, SuperTrend
   - Momentum: RSI(14), MACD(12,26,9)
   - Levels: Pivot points (daily, weekly), key swing highs/lows

3. Check open interest positioning:
   - `get_open_interest_analysis(symbol=..., view="all")` (Groww) or equivalent
   - PCR interpretation: >1.2 = bullish; <0.8 = bearish
   - Identify max pain and high-OI strikes as support/resistance

4. **Only proceed if technical picture confirms macro direction.**

---

### Phase 4: Strategy & Entry Plan

**Goal:** Define the trade completely before entering.

1. **Select option strategy** based on conviction and IV environment:
   - India VIX <15: Sell premium (short straddle/strangle, iron condor)
   - India VIX 15–20: Directional debit spread (bull call/bear put)
   - India VIX >20: Long options or spreads; avoid naked short

2. **Choose expiry:** Prefer next-week expiry (not current week unless high conviction and tight time stop).

3. **Strike selection:**
   - Directional: 1 strike OTM from current price
   - Spreads: Width based on expected move (ATR × days to expiry)

4. **Position sizing:**
   - Risk maximum 40% of F&O capital per trade
   - Define max loss upfront (net premium for debit, strike width minus credit for spreads)

5. **Define entry, stop, and target:**
   - Entry: Specific price or on confirmation of level breach
   - Stop-loss: Level that invalidates the thesis (not just premium level)
   - Target: Logical resistance/support or 2:1 reward-to-risk minimum

---

### Phase 4.5: Gap Probability & Immediate Entry ⚡

**Use when analysing after market hours or before next-day open.**

Assess overnight gap likelihood using:
- GIFT Nifty futures (live)
- SGX Nifty (if available)
- US market direction (Dow, Nasdaq futures)
- Asian market openings
- Crude oil and DXY direction

If gap probability >60% in your trade direction: **recommend entering before market close rather than next morning.** Specify: "Enter today before 3:15 PM at [price] to avoid gap risk."

---

### Phase 5: Execution

1. Verify live prices and bid-ask spread via broker MCP.
2. Confirm margin availability via `calculate_fno_margin` / `get_margins`.
3. **Present trade summary to user and get explicit confirmation before placing any order.**
4. Place order(s) via broker MCP.
5. **Immediately after fill: set GTT stop-loss and profit target orders.**

GTT rules:
- Stop-loss GTT: triggered if underlying reaches stop level
- Profit target GTT: triggered at target level
- Never leave a position without a GTT stop — this is mandatory

---

### Phase 6: Position Management (Daily Monitoring)

**Daily check-in rules:**

| Situation | Action |
|-----------|--------|
| Position up >30% from entry | Tighten stop to cost price (no-loss stop) |
| Position up >50% from entry | Book half, trail stop on remaining |
| Position at profit target | Book at least 50% unless conviction is very high |
| Thesis invalidated by news/price | Exit immediately, regardless of P/L |
| Option decaying with no movement | Re-evaluate by Wednesday for weekly expiry |
| Friday for weekly expiry | Exit unless very high conviction — gamma risk extreme |

**Mandatory exit triggers:**
- Underlying crosses stop-loss level
- Macro thesis reverses (contradicting news, unexpected RBI action)
- Loss exceeds 40% of capital allocated
- 2 consecutive days of unfavourable movement with no recovery

## Key Risk Rules

- Maximum 40% F&O capital at risk per trade
- Always use GTT stop-loss immediately after entry
- No averaging down on losing positions
- Exit weekly options before Friday unless very high conviction (gamma risk)
- Maximum 2 open positions simultaneously
- Cancel orphaned GTTs after every exit (prevent accidental triggers)

## Tools

Works with:
- **Groww MCP**: `get_ltp`, `get_open_interest_analysis`, `calculate_fno_margin`, `place_fno_order`, `get_payoff_chart_steps`, `resolve_market_time_and_calendar`
- **Zerodha Kite MCP**: `get_ltp`, `get_quotes`, `get_margins`, `place_order`, `place_gtt_order`
- **Fallback**: Web search + yfinance for data when broker MCP is unavailable
