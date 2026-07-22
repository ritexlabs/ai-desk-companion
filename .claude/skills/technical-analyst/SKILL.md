---
name: technical-analyst
description: "Technical analysis of Indian market instruments (NSE/BSE stocks, Nifty 50, Bank Nifty, Sensex). Use when analysing weekly price charts, identifying support/resistance, generating probability-weighted scenarios, or producing structured chart reports for Indian equities and indices."
---

# Technical Analyst (India Markets)

Perform systematic technical analysis of weekly price charts for NSE/BSE stocks, indices, and other Indian market instruments. Base all analysis exclusively on technical data visible in the chart — no external news or fundamentals.

## Workflow

### Stage 1: Chart Reception
- Confirm and identify all provided images (timeframe, instrument, exchange).
- Note any chart settings (log/linear scale, candle type, overlays visible).

### Stage 2: Framework Loading
Reference: `references/technical_analysis_framework.md`

### Stage 3: Systematic Analysis — Execute in order

1. **Trend Analysis**
   - Primary trend (weekly): uptrend / downtrend / sideways
   - Secondary trend (daily): direction and strength
   - Position relative to key SMAs (20, 50, 200 DMA)
   - Golden cross / death cross status

2. **Support and Resistance**
   - Key support levels: swing lows, prior resistance turned support, round numbers
   - Key resistance levels: swing highs, prior support turned resistance
   - Present as a table with price and context

3. **Moving Averages**
   - 20, 50, 200 DMA alignment
   - Price position relative to each
   - Slope direction

4. **Volume Analysis**
   - Volume trend relative to price moves
   - Volume on breakout vs pullback days
   - Any notable volume divergences

5. **Chart Patterns**
   - Identify: head and shoulders, double top/bottom, triangles, channels, flags, wedges
   - Pattern completion status and measured move target

6. **Momentum Indicators** (if overlaid on chart)
   - RSI: level, overbought/oversold, divergence
   - MACD: signal line, histogram, zero-line position
   - Any visible momentum divergences

### Stage 4: Scenario Development

Build 2–4 probability-weighted scenarios. Each must include:
- Scenario name and probability (all must sum to 100%)
- Price target range
- Time horizon
- Key assumption that must hold
- Invalidation level (where this scenario breaks down)

Typical structure:
- **Bull case (25–35%):** Breakout continuation or recovery catalyst
- **Base case (40–55%):** Most probable given current chart state
- **Bear case (15–30%):** Support break or trend reversal
- **Extended bear (0–15%):** Only if chart warrants it

### Stage 5: Report Generation

Produce output using `assets/analysis_template.md` structure. Always include:
- Instrument, exchange, timeframe, and chart date
- Trend summary (one sentence)
- Key levels table (support + resistance)
- Pattern identified (or "no pattern")
- Scenario table with probabilities
- Risk-reward for the primary trade idea

### Stage 6: Sequential Processing

If multiple charts are provided, complete each analysis fully before moving to the next. Do not batch or mix data across charts.

## India Market Context

- Trading hours: 9:15 AM–3:30 PM IST, Monday–Friday
- Circuit limits: upper/lower daily move limits apply; note if relevant
- T+1 settlement
- Weekly options expiry: NIFTY on Thursday, BANKNIFTY on Wednesday, FINNIFTY on Tuesday
- All price values in INR

## Quality Standards

- Every scenario must have a specific price target, not a range only.
- Every scenario must have an invalidation level.
- Probabilities must sum to 100%.
- No external news, earnings, or fundamental data in chart-only analysis.
- If a chart is unclear or data is insufficient, state the limitation explicitly.
