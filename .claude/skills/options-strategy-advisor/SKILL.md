---
name: options-strategy-advisor
description: "Indian NSE F&O options strategy analysis. Use when advising on strategy selection (17 strategies: straddle, condor, spreads, etc.), Black-Scholes pricing, Greeks, margin calculation, P/L simulation, or risk management for Nifty/Bank Nifty/stock options. Uses Groww MCP or Zerodha Kite MCP for live data."
---

# Options Strategy Advisor — Indian F&O Markets (NSE)

Comprehensive options strategy analysis for Indian F&O on NSE. Covers strategy selection, live data retrieval, margin estimation, P/L simulation, Greeks analysis, and risk management — adapted for Indian F&O characteristics.

## Indian F&O Market Facts

### Exercise Style
European-style only. Options can only be exercised at expiry, not before. Black-Scholes applies directly without early-exercise adjustments.

### Expiry Schedule
| Underlying | Expiry Day | Expiry Type |
|------------|-----------|-------------|
| NIFTY | Thursday | Weekly + Monthly |
| BANK NIFTY | Wednesday | Weekly + Monthly |
| FINNIFTY | Tuesday | Weekly + Monthly |
| SENSEX (BSE) | Friday | Weekly + Monthly |
| Stock Options | Last Thursday | Monthly only |

Monthly expiry = last Thursday of month (or preceding trading day if holiday). Weekly expiries only for index options, not individual stocks.

### Lot Sizes
Always verify via `fno_mcx_contracts_search_tool` before calculating margin — lot sizes are periodically revised.
- NIFTY: ~75 (confirm)
- BANK NIFTY: ~15 (confirm)
- FINNIFTY: ~25 (confirm)

### Margin Requirements
SEBI mandates: SPAN + Exposure + Peak margin. Use `calculate_fno_margin` for exact figures.

### Transaction Costs
- STT: 0.0625% of intrinsic value on ITM option exercise at expiry (can erode profits significantly)
- Futures STT: 0.0125% on sell side
- Plus: brokerage, exchange charges, GST, SEBI fee, stamp duty

### F&O Ban
When MWPL exceeds 95% for a stock: no new positions, only closing allowed. Lifted when MWPL drops below 80%. Always check before recommending stock options.

## Broker MCP Tools

### Groww MCP (if connected)
| Tool | Purpose |
|------|---------|
| `get_ltp` (segment=FNO) | Live option/futures prices and OI |
| `get_quotes_and_depth` (segment=FNO) | Bid/ask spreads and market depth |
| `fno_mcx_contracts_search_tool` | Search F&O contracts, lot sizes, expiries |
| `fetch_historical_candle_data` (segment=FNO) | Historical option price data |
| `get_open_interest_analysis` | OI structure, PCR, support/resistance |
| `get_greeks_for_fno_contract` | Live Greeks for specific contracts |
| `get_greeks_for_fno_symbol` | Greeks for all contracts of an underlying |
| `get_atm_straddle_chart` | ATM straddle premium analysis |
| `get_payoff_chart_steps` | Payoff diagram generation |
| `calculate_fno_margin` | Margin requirement calculation |
| `get_available_margin_details` | User's available margin |

### Zerodha Kite MCP (if connected)
| Tool | Purpose |
|------|---------|
| `get_ltp` | Last traded price for F&O |
| `get_quotes` | Real-time quotes with depth |
| `get_historical_data` | Historical F&O candles |
| `search_instruments` | Search contracts by name/expiry |
| `get_margins` | Account margins |
| `get_positions` | Current F&O positions |
| `place_order` / `modify_order` / `cancel_order` | Order management |
| `place_gtt_order` / `get_gtts` | GTT orders |

## 17 Supported Strategies

### Income
1. **Covered Call** — Long futures + Short OTM Call
2. **Cash-Secured Put** — Short OTM Put with margin set aside

### Protection
3. **Protective Put** — Long underlying + Long Put
4. **Collar** — Long underlying + Long Put + Short Call

### Directional
5. **Bull Call Spread** — Long lower-strike Call + Short higher-strike Call
6. **Bear Put Spread** — Long higher-strike Put + Short lower-strike Put
7. **Bull Put Spread** — Short higher-strike Put + Long lower-strike Put
8. **Bear Call Spread** — Short lower-strike Call + Long higher-strike Call

### Volatility
9. **Long Straddle** — Long ATM Call + Long ATM Put
10. **Short Straddle** — Short ATM Call + Short ATM Put
11. **Long Strangle** — Long OTM Call + Long OTM Put
12. **Short Strangle** — Short OTM Call + Short OTM Put

### Range-Bound
13. **Iron Condor** — Bull Put Spread + Bear Call Spread
14. **Iron Butterfly** — Short ATM straddle + Long OTM wings

### Advanced
15. **Calendar Spread** — Short near-expiry + Long far-expiry (same strike)
16. **Diagonal Spread** — Calendar spread with different strikes
17. **Ratio Spread** — Buy N / Sell M options (N ≠ M); creates naked leg risk

## Strategy Selection Guide

| Market View | Strategy |
|------------|---------|
| Strong bullish | Long Call or Bull Call Spread |
| Mildly bullish | Bull Put Spread or Covered Call |
| Strong bearish | Long Put or Bear Put Spread |
| Mildly bearish | Bear Call Spread |
| Tight range | Short Straddle or Iron Butterfly |
| Wider range | Short Strangle or Iron Condor |
| Big move expected | Long Straddle or Long Strangle |
| Pre-event (Budget, RBI, earnings) | Long Straddle or Long Strangle |
| Time decay play | Calendar or Diagonal Spread |

## Workflow

### Step 1: Gather Input
- Underlying (NIFTY, BANKNIFTY, FINNIFTY, or stock)
- Market view (bullish/bearish/neutral/volatile/range-bound)
- Expiry preference (weekly/monthly)
- Risk tolerance and capital available
- Objective (income, hedge, speculation, volatility)

### Step 2: Fetch Live Data
1. `resolve_market_time_and_calendar()` — confirm market open, days to expiry
2. `fno_mcx_contracts_search_tool()` — get exact trading symbols
3. `get_ltp()` — live option prices
4. `get_greeks_for_fno_contract()` — Delta, Gamma, Theta, Vega
5. `get_open_interest_analysis()` — OI structure, PCR
6. `get_atm_straddle_chart()` — volatility assessment

### Step 3: Calculate Margin
For every sell leg:
```
calculate_fno_margin(trading_symbol=..., num_lots=1, transaction_type="SELL", product="NRML")
get_available_margin_details()
```

### Step 4: Simulate P/L
Use `scripts/black_scholes.py` or manual calculation across underlying price range (+/- 5%):
- **Breakeven** = Strike ± Net Premium
- **Max Profit** = Net Premium Received (credit) or Strike Width − Net Debit
- **Max Loss** = Net Premium Paid (debit) or Strike Width − Net Credit

### Step 5: Generate ASCII P/L Diagram
X-axis = underlying price at expiry, Y-axis = P/L per lot. Mark breakeven, max profit, max loss zones.

### Step 6: Risk Management Guidance
- Position sizing: lots based on capital + risk tolerance
- Stop-loss: exit if loss exceeds 2× premium received
- Adjustment triggers: when and how to roll/adjust
- Expiry management: roll, close, or let expire guidance
- STT warning for ITM options at expiry
- Peak margin monitoring

### Step 7: Report Format
```
=== OPTIONS STRATEGY REPORT ===
Underlying: [symbol] @ [price]
Strategy: [name]
Expiry: [date] ([days] days)

--- LEGS ---
[BUY/SELL] [qty] [CALL/PUT] @ Strike [X] for [premium]

--- KEY METRICS ---
Net Premium: [debit/credit]
Max Profit: [amount] at [price]
Max Loss: [amount] at [price]
Breakeven: [price(s)]
Risk-Reward: [ratio]

--- GREEKS (NET) ---
Delta: | Gamma: | Theta: | Vega:

--- MARGIN ---
Total Required: | Available: | Utilisation:

--- P/L DIAGRAM ---
[ASCII chart]

--- RISK MANAGEMENT ---
Stop Loss: | Adjustment: | Expiry Action: | STT Impact:
```

## India VIX Guidance

| VIX Level | Environment | Preferred Strategies |
|-----------|------------|---------------------|
| > 20 | High volatility | Long straddle, long strangle |
| 15–20 | Normal | Directional or range-bound |
| < 15 | Low volatility | Short straddle, short strangle, iron condor |

## OI Analysis
- High Call OI at strike → resistance (call writers defending)
- High Put OI at strike → support (put writers defending)
- PCR > 1.2 → bullish | PCR < 0.8 → bearish | 0.8–1.2 → neutral

## Physical Settlement Warning
Stock options that expire ITM are physically settled — requires full delivery margin. Plan exits before expiry for stock options. Index options are cash-settled.

## Scripts
- `scripts/black_scholes.py` — Black-Scholes pricing and Greeks calculation

## Reference Files
- `references/indian_fno_guide.md` — Complete F&O market guide
