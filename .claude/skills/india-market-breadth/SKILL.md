---
name: india-market-breadth
description: "Evaluate internal NSE/BSE market health through advance/decline ratios, stocks above 200 DMA, new highs/lows, sector participation, and Nifty divergence. Produces a 0–100 composite breadth score mapped to equity exposure recommendations. Use when assessing whether a market rally or decline is broad-based or narrow."
---

# India Market Breadth Analyzer

Systematically evaluate Indian market (NSE/BSE) breadth health to determine whether a rally or decline is broad-based. Produces a composite 0–100 score mapped to actionable equity exposure levels.

## Five Weighted Components

| Component | Weight | What it Measures |
|-----------|--------|-----------------|
| Advance/Decline Ratio | 25% | Directly measures rally breadth |
| Stocks Above 200 DMA | 25% | Long-term trend confirmation |
| New Highs vs Lows | 20% | Momentum breadth indicator |
| Sector Participation | 15% | Diversification across 13 major sectors |
| Nifty Divergence | 15% | Index-vs-breadth alignment check |

## Data Collection

| Component | Source |
|-----------|--------|
| NSE A/D data | Web search for daily advance/decline counts |
| Stocks above 200 DMA | Groww/Zerodha MCP screeners or web search |
| New highs/lows | Groww `fetch_market_movers_and_trending_stocks_funds` with `YEARLY_HIGH`/`YEARLY_LOW` |
| Sector performance | `get_ltp` for 13 Nifty sector indices |
| Nifty 50 level | Broker MCP live price |

## 13 Sectors to Track

- Nifty Bank
- Nifty IT
- Nifty Pharma
- Nifty Auto
- Nifty FMCG
- Nifty Metal
- Nifty Realty
- Nifty Energy
- Nifty Infra
- Nifty PSU Bank
- Nifty Private Bank
- Nifty Financial Services
- Nifty Smallcap 100 (proxy for broader breadth)

## Health Zones and Equity Exposure Map

| Score | Zone | Equity Exposure | Posture |
|-------|------|-----------------|---------|
| 80–100 | Strong | 90–100% | Deploy capital; broad participation confirmed |
| 60–79 | Healthy | 75–90% | Normal allocation; monitor trends |
| 40–59 | Neutral | 60–75% | Cautious; focus on strong sectors only |
| 20–39 | Weakening | 40–60% | Defensive; shift to large-caps and cash |
| 0–19 | Critical | 25–40% | Maximum defence; high cash allocation |

## Critical Risk Signal: Breadth Divergence

When the Nifty 50 makes a new high but breadth indicators do not confirm, the rally is narrowing. This is the most actionable single breadth warning.

**Historical Indian examples:**
- October 2021: Midcap weakness preceded a 15% correction
- January 2008: Breadth divergence foreshadowed the financial crisis decline

Rule: When breadth score drops >15 points in 2 weeks while Nifty holds/rises → reduce equity exposure by 1 zone.

## Workflow

1. Collect all 5 data points (run broker MCP calls and web searches in parallel).
2. Score each component on its 0–100 sub-scale.
3. Apply weights to calculate composite score.
4. Map score to health zone and equity exposure level.
5. Check for Nifty divergence (component 5).
6. Produce report using `assets/breadth_report_template.md`.
7. Review monthly or whenever composite score swings >15 points.

## India-Specific Adjustments

- F&O expiry Thursdays distort daily breadth — note when analysis falls on expiry.
- Budget (February 1) and RBI policy announcement days generate event-driven noise — flag and adjust interpretation.
- FII/DII flows often create cap-tier divergences (large-caps vs mid/small-caps) — track separately.
- SEBI regulations on small-cap funds periodically affect retail breadth participation.

## Reference Files
- `references/breadth_methodology.md` — Detailed scoring formula for each component
- `assets/breadth_report_template.md` — Standard report output format
