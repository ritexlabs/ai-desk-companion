---
name: backtest-expert
description: "Validate Indian market trading strategies using 6-step backtesting workflow with India-specific cost modelling (STT, stamp duty, exchange charges). Covers hypothesis framing, rule codification, initial backtest, stress testing (parameter sensitivity, execution friction, time robustness, walk-forward), and pass/fail scoring. Use when designing or evaluating any NSE/BSE trading strategy."
---

# Backtest Expert — Indian Market Strategy Validation

## Core Philosophy

Find strategies that remain resilient across varied conditions rather than maximising returns on a single parameter set. Overfitting is the primary threat to trading account sustainability.

## 6-Step Backtesting Workflow

### Step 1: State the Hypothesis (1 Sentence Edge)

Before any code, articulate the edge in one sentence.

**Good examples:**
- Stocks gapping >3% on elevated volume after consolidation tend to extend gains 2–5 sessions on NSE
- Nifty 50 constituents reverting to 20 DMA after RSI drops below 30 generate positive expectancy within 5 sessions
- Selling strangles on Bank Nifty near expiry with delta <0.15 captures time decay faster than gamma exposure materialises

**Weak examples:**
- "Chart patterns look favourable"
- "This influencer makes money with it"

Questions to answer first:
- Which behavioural or structural advantage am I exploiting?
- What sustains this edge over time?
- Why would counterparties consistently lose?

---

### Step 2: Codify Rules (No Ambiguity)

Every rule must be binary — a computer executes without human interpretation.

| Category | Definition | Example |
|----------|-----------|---------|
| Universe | Instrument selection | Nifty 200, F&O eligible, ≥₹1 Cr ADV |
| Entry | Precise trigger | Price > 20 EMA AND RSI(14) crosses above 40 AND volume > 1.5× avg |
| Profit Target | Exit for gains | Close 3% above entry OR 1.5 ATR trailing stop |
| Stop Loss | Exit for losses | Close below entry-day low OR 2% fixed |
| Time-based Exit | Max hold | Exit after 10 sessions without target/stop |
| Position Sizing | Capital allocation | 5% per position, 10 concurrent max |
| Trade Filters | When to skip | Avoid F&O ban periods; skip 2 days around earnings |

**India-specific rule requirements:**
- Circuit limits: handle upper/lower movement restrictions
- F&O ban: MWPL at 95% triggers entry restriction
- Settlement: T+1 (updated from T+2 in 2023)
- Pre-open session: orders 9:00–9:08 AM, matching 9:08–9:15 AM
- Corporate actions: adjust for splits, bonuses, dividends, rights

---

### Step 3: Run Initial Backtest

**Minimum standards:**

| Dimension | Minimum | Preferred |
|-----------|---------|-----------|
| Duration | 5 years | 8–10+ years |
| Trade count | 100 | 200+ |
| Market conditions | Bull + bear | 4+ distinct regimes |
| Data integrity | Corp action adjusted | Survivorship-bias-free |

**Market regimes to include:**

| Condition | Examples | Features |
|-----------|---------|---------|
| Uptrend | 2014–2017, 2020–2021 | Widespread buying |
| Downtrend | 2008, March 2020, June 2022 | Rapid declines |
| Range-bound | 2018–2019, early 2023 | Nifty in 10% band |
| High volatility | 2008, 2020, Budget days | India VIX >25 |
| Low volatility | 2017, late 2021 | India VIX <15 |
| Elections | 2014, 2019, 2024 | Uncertainty then rally |
| Monsoon | June–September | Agriculture/FMCG effects |
| Monetary policy | RBI rate cycles | Rate-sensitive sector impacts |
| External shocks | 2018, 2022 crude swings | INR and oil company moves |

**Essential metrics:**
```
Performance:  CAGR, cumulative return, monthly return distribution
Drawdown:     Max drawdown, avg drawdown, recovery duration, Calmar ratio
Risk-adj:     Sharpe (6% risk-free for India), Sortino ratio
Trades:       Win rate, avg win %, avg loss %, profit factor, expectancy
Resilience:   % profitable months, worst month, max consecutive losses
```

---

### Step 4: Stress Test (Primary Focus)

Allocate the majority of effort here — this separates robust from curve-fitted.

#### 4a. Parameter Sensitivity
Adjust each parameter ±20% and verify profitability persists:

| Parameter | Base | -20% | -10% | +10% | +20% |
|-----------|------|------|------|------|------|
| EMA period | 20 | 16 | 18 | 22 | 24 |
| RSI level | 40 | 32 | 36 | 44 | 48 |
| Stop % | 2% | 1.6% | 1.8% | 2.2% | 2.4% |

Key insight: Seek a profitability plateau, not a single peak.

#### 4b. India-Specific Transaction Costs

| Cost | Delivery (CNC) | Intraday (MIS) | Derivatives |
|------|---------------|----------------|-------------|
| Brokerage | ~₹20/order or 0.03% | ~₹20/order | ~₹20/order |
| STT | 0.1% (buy+sell) | 0.025% (sell only) | 0.0125% (sell, options) |
| Exchange fees | 0.00345% (NSE) | 0.00345% | 0.05% (options) |
| GST | 18% on broker+exchange | 18% | 18% |
| Stamp duty | 0.015% (buy) | 0.003% (buy) | 0.003% (buy) |
| SEBI charges | 0.0001% | 0.0001% | 0.0001% |
| **Slippage** | **0.05–0.1% large-cap** | **0.1–0.2% mid-cap** | **0.1–0.3% options** |

**Round-trip cost estimates:**
- Large-cap delivery: ~0.3–0.5%
- Large-cap intraday: ~0.1–0.2%
- Options: ~0.15–0.4%
- Smaller companies delivery: ~0.5–1.0%

#### 4c. Time Robustness
- Split data into consecutive 3-year blocks; verify profitability in each
- Analyse year-by-year; check if one exceptional year carries the strategy
- Remove the best month; verify the strategy remains viable

#### 4d. Statistical Validation
- <30 trades: insufficient confidence
- 100 trades: moderate support
- 200+ trades: robust foundation
- Apply t-test: verify average trade return > 0 with significance

---

### Step 5: Out-of-Sample Validation (Walk-Forward)

#### Walk-Forward Methodology
1. Training period: 5 years for parameter optimisation (e.g., 2015–2019)
2. Testing period: subsequent 1–2 years (e.g., 2020–2021)
3. Roll forward: retrain on next window, test on next out-of-sample period
4. Combine all independent test periods for final evaluation

**Walk-Forward Efficiency:**
```
WFE = Out-of-Sample Return / In-Sample Return
```
- WFE > 50%: Generalises well
- WFE 30–50%: Acceptable, moderate overfitting
- WFE < 30%: Likely curve-fitted — do not deploy

#### Pre-deployment Paper Testing
Minimum requirements:
- 30 completed trades
- 2 consecutive months
- Coverage of at least one high-volatility period (expiry week, earnings, policy event)

---

### Step 6: Evaluate Results

```bash
python3 evaluate_backtest.py \
  --total-trades 150 \
  --win-rate 62 \
  --avg-win-pct 1.8 \
  --avg-loss-pct 1.2 \
  --max-drawdown-pct 15 \
  --years-tested 8 \
  --num-parameters 3 \
  --slippage-tested
```

| Score | Classification | Action |
|-------|---------------|--------|
| 80–100 | Production-ready | Deploy at 25% scale, increase over 50+ live trades |
| 60–79 | Refinement needed | Fix weakest element, re-test |
| 40–59 | Significant concerns | Multiple deficiencies — consider abandoning |
| 0–39 | Non-viable | No meaningful edge — document and move on |

**Pre-launch checklist:**
- [ ] Positive expectancy after full cost modelling
- [ ] Profitable under ±20% parameter perturbations
- [ ] Walk-forward efficiency > 50%
- [ ] Max drawdown within personal risk tolerance
- [ ] 100+ trades tested
- [ ] ≤4 adjustable parameters
- [ ] Transaction costs and slippage included
- [ ] 30+ paper trades completed
- [ ] Trade rules documented for reproducibility
- [ ] Risk framework: position limits, daily loss threshold, circuit breaker

## Warning Signals

| Signal | Problem |
|--------|---------|
| Returns >50% annual without meaningful corrections | Data error or look-ahead bias |
| Win rate >80% | Inadequate cost modelling or fill assumptions |
| Success only at precise parameters | Noise fitting, not edge |
| <50 trades | Insufficient statistical inference |
| Unbroken profitability 5+ years | Survivorship bias |
| Strategy deteriorates after 2020 | Market structure changes |
| >5 adjustable parameters | Curve-fitting risk |
| Costs excluded | Real-world likely unprofitable |
| Only blue-chip index tested | Survivorship bias |

## Reference Files
- `references/methodology.md`
- `references/failed_tests.md`
- `scripts/evaluate_backtest.py`
