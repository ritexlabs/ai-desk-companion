---
name: fii-dii-flow-tracker
description: "Monitor and analyse Foreign Institutional Investor (FII) and Domestic Institutional Investor (DII) trading flows in Indian equity markets. Correlates flows with Nifty 50, classifies flow regimes, and provides actionable market interpretation. Use when user asks about institutional buy/sell data, flow trends, or market impact of FII/DII activity."
---

# FII/DII Flow Tracker

Monitor Foreign Institutional Investor (FII) and Domestic Institutional Investor (DII) trading flows in Indian equity markets, correlating them with Nifty 50 performance to classify the current institutional regime.

## Activate When User Asks About

- Daily/weekly/monthly institutional buy/sell data
- Flow trend analysis and market correlation
- Net buyer/seller classification for FII or DII
- Sector-wise institutional allocation
- FII impact on INR movement
- Historical flow patterns during market events

## 8-Step Core Workflow

### Step 1: Current Flow Data Retrieval
Search NSDL, NSE, MoneyControl, CDSL, and Trendlyne for today's FII/DII cash market figures:
- Gross buys (₹ Cr)
- Gross sells (₹ Cr)
- Net position (₹ Cr)

### Step 2: Historical Trend Gathering
Collect:
- Trailing 10-day flow data
- Month-to-date (MTD) totals
- Year-to-date (YTD) totals

### Step 3: Nifty Price Correlation
Retrieve Nifty 50 LTP and 30-day historical candle data via broker MCPs (Groww/Zerodha Kite) for correlation study.

### Step 4: Pattern Analysis
- Classify daily flows (positive/negative vs prior day)
- Calculate 10-day rolling average net flow
- Compute MTD and YTD totals
- Assess FII:DII ratio (net buyer alignment)

### Step 5: Regime Classification

| Regime | Condition | Market Implication |
|--------|-----------|-------------------|
| FII Net Buyer | FII consistently net positive | Bullish — foreign capital inflow |
| FII Net Seller | FII consistently net negative | Caution — foreign capital outflow |
| DII Absorption | DII offsetting FII selling | Market supported domestically |
| Dual Buying | Both FII and DII net buyers | Strong bullish signal |
| Dual Selling | Both FII and DII net sellers | High risk-off environment |
| Transition Phase | Flows switching direction | Inflection — monitor closely |

### Step 6: Nifty Correlation Assessment
- Map institutional flows against Nifty movement
- Identify lead-lag relationships
- Flag divergences (e.g., FII selling but Nifty rising = DII support)

### Step 7: Sector Analysis (Optional)
Examine sector-specific FII/DII positioning for:
- Banking and Financials
- IT
- FMCG
- Commodities (Metals, Oil & Gas)

### Step 8: Report Generation
Structure findings using the template: `assets/flow_report_template.md`

## Critical Metrics

| Metric | Purpose |
|--------|---------|
| Daily Net Flow | Direction of capital movement |
| FII:DII Ratio | Institutional alignment indicator |
| Absorption Rate | DII's offset capacity during FII selling |
| Flow-Nifty Correlation | Predictive signal strength |

## Significance Thresholds (Daily Net Flow)

| Level | Amount |
|-------|--------|
| Minor | < ₹1,000 Cr |
| Moderate | ₹1,000–2,000 Cr |
| Significant | ₹2,000–5,000 Cr |
| Major | > ₹5,000 Cr |

## Key Notes

- Data releases after market hours (provisional 6–7 PM IST, final next morning)
- All figures in Indian Rupee crores (₹ Cr)
- Derivative market FII data serves as a leading indicator vs cash market
- Always include disclaimer: institutional flows alone insufficient for investment decisions

## Reference Files

- `references/flow_analysis_methodology.md` — How to calculate and interpret flow metrics
- `references/flow_interpretation_guide.md` — Historical regime patterns and market outcomes
- `assets/flow_report_template.md` — Standard report output format
