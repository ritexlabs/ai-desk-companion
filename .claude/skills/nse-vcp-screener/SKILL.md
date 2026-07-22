---
name: nse-vcp-screener
description: "Screen NSE stocks for Mark Minervini's Volatility Contraction Pattern (VCP). Use when identifying Stage 2 uptrend setups with tightening price ranges and declining volume before potential breakouts, adapted for Indian market liquidity and Nifty index benchmarking."
---

# NSE VCP Screener

Screen Indian stocks from Nifty indices for Mark Minervini's Volatility Contraction Pattern (VCP) — Stage 2 uptrends with tightening price ranges and declining volume before potential breakouts. All criteria are adapted for Indian market characteristics.

## Execution

```bash
python3 scripts/screen_vcp.py --universe nifty500
```

Arguments:
- `--universe`: `nifty50` | `nifty200` | `nifty500` (default: `nifty500`)
- `--lookback-days`: pattern detection window (default: 120)
- `--min-score`: minimum composite score to include in output (default: 60)
- `--contraction-threshold`: max % range per contraction (default: 40, India-adjusted)
- `--volume-ratio`: minimum volume decline ratio across contractions (default: 0.7)

## Scoring Framework (0–100 Composite)

| Component | Weight | What it measures |
|-----------|--------|-----------------|
| Trend Template | 25% | Stage 2 uptrend confirmation |
| Contraction Quality | 25% | Price range narrowing across contractions |
| Volume Pattern | 20% | Volume declining through each contraction |
| Pivot Proximity | 15% | Distance from the pivot/breakout point |
| Relative Strength | 15% | Outperformance vs Nifty 50 benchmark |

## India-Specific Adjustments vs Minervini's Original

| Criterion | US Original | India Adaptation |
|-----------|------------|-----------------|
| Volatility range | 8–35% | 10–40% (wider for Indian mid/small caps) |
| Benchmark | S&P 500 | Nifty 50 |
| Min liquidity | Not specified | ₹1 crore average daily volume |
| Circuit filter | Not applicable | Exclude stocks hitting upper circuits repeatedly |

## VCP Pattern Rules

A valid VCP requires:
1. Stock is in a Stage 2 uptrend (above 150 DMA, 150 DMA above 200 DMA)
2. At least 2 contractions (3 preferred), each with a smaller % decline than prior
3. Volume declines meaningfully through each contraction
4. Pivot point is the high of the most recent tight base
5. Breakout must occur on above-average volume (1.5x+)

## Trend Template Checklist

- Price > 50 DMA > 150 DMA > 200 DMA
- 200 DMA trending upward for at least 1 month
- 52-week high within 25% of current price
- Price at least 30% above 52-week low

## Output Format

Results generate both JSON (structured data) and Markdown (readable report) with:
- Composite score (0–100)
- Contraction structure (number, % range per contraction)
- Volume pattern (ratio across contractions)
- Pivot level (exact price)
- Relative strength rank vs Nifty 50

## Interpreting Results

- Score 80–100: High-quality VCP setup, prioritise for watchlist
- Score 60–79: Moderate setup, monitor for volume confirmation
- Score below 60: Not a clean VCP, skip or re-check after more base-building

## Reference Files

- `references/vcp_methodology.md` — Full VCP pattern rules and contraction counting
- `references/scoring_system.md` — Detailed scoring formula per component
- `scripts/calculators/trend_template_calculator.py`
- `scripts/calculators/vcp_pattern_calculator.py`
- `scripts/calculators/volume_pattern_calculator.py`
- `scripts/calculators/pivot_proximity_calculator.py`
- `scripts/calculators/relative_strength_calculator.py`
