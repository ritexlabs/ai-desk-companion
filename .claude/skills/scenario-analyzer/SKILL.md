---
name: scenario-analyzer
description: "Build probabilistic 18-month scenarios for Indian market events (RBI policy, elections, commodity shocks, Union Budget, geopolitical events). Maps 1st/2nd/3rd order sector impacts on NSE sectoral indices and identifies positive/negative impact stocks for each scenario."
---

# Scenario Analyzer (India Markets)

Takes a news headline or event and builds probabilistic 18-month scenarios with cascading 1st, 2nd, and 3rd order sector impacts and specific stock recommendations for the Indian market.

## Architecture

```
Skill (Orchestrator)
├── Phase 1: Preparation
│   ├── Headline parsing (keywords, entities, actions, numbers)
│   ├── Event classification
│   └── Load references
├── Phase 2: Analysis
│   ├── Collect related news (past 2 weeks via WebSearch)
│   ├── Build 3 scenarios (Base/Bull/Bear, probabilities sum to 100%)
│   ├── Map 1°/2°/3° sector impacts
│   └── Identify 3–5 positive + 3–5 negative impact stocks
└── Phase 3: Report Generation
    ├── Compile findings
    ├── Assess scenario probability distribution
    └── Save report
```

## Event Classification

| Category | Indian Context Examples |
|----------|------------------------|
| Monetary Policy | RBI rate decision, CRR/SLR change, liquidity measures |
| Fiscal Policy | Union Budget, GST changes, PLI schemes, disinvestment |
| Geopolitical | India-China border, India-Pakistan, Russia-Ukraine, Middle East |
| Commodity | Crude oil shock, gold prices, metal tariffs, food inflation |
| Regulatory | SEBI rules, RBI NPA norms, telecom spectrum, pharma FDA |
| Corporate | Major M&A, earnings surprise, promoter pledging, fraud |
| Global Macro | Fed rate decision, US recession, China slowdown, tariffs |
| Weather/Agriculture | Monsoon forecast, crop damage, food prices |
| Elections/Political | State elections, central govt policy shifts |

## Workflow

### Phase 1: Preparation

1. **Parse the Headline**
   - Extract key entities (companies, sectors, countries, institutions)
   - Identify the action (increase, decrease, ban, approve, delay)
   - Note any numbers (rate changes, ₹ amounts, percentages)
   - Classify the event type

2. **Load References**
   - `references/headline_event_patterns.md`
   - `references/sector_sensitivity_matrix.md`
   - `references/scenario_playbooks.md`

### Phase 2: Analysis

3. **Collect Context**
   - WebSearch for related news from the past 2 weeks
   - Identify pre-existing trends or expectations
   - Note market's initial reaction if available

4. **Build 3 Scenarios**

   For each scenario:
   - **Name**: Descriptive title
   - **Probability**: Must sum to 100% across all 3
   - **Timeline**: 3 phases (0–6 months, 6–12 months, 12–18 months)
   - **Description**: What unfolds in each phase
   - **Key Assumptions**: What must hold true

   Typical structure:
   - **Base Case (40–55%)**: Most likely outcome given current trajectory
   - **Bull Case (20–35%)**: Optimistic with positive catalysts
   - **Bear Case (15–30%)**: Pessimistic with adverse developments

5. **Map Sector Impacts**

   | Order | Definition | Example (RBI Rate Cut) |
   |-------|-----------|----------------------|
   | 1st | Direct, immediate | Banks: NIM compression; Housing: demand boost |
   | 2nd | Indirect, 3–6 months | Auto: loan demand; Real estate: prices |
   | 3rd | Tertiary, 6–18 months | Cement: construction demand; Durables: consumer spending |

   NSE sectoral indices to cover:
   - Nifty Bank, Nifty IT, Nifty Pharma, Nifty Auto, Nifty FMCG
   - Nifty Metal, Nifty Realty, Nifty Energy, Nifty Infra
   - Nifty PSU Bank, Nifty Private Bank, Nifty Financial Services

6. **Identify Stock Impacts**

   Per scenario:
   - 3–5 stocks that benefit most
   - 3–5 stocks that suffer most

   For each stock: NSE ticker, current price (via broker MCP if available), impact channel, magnitude (High/Medium/Low).

### Phase 3: Report Generation

Save as `reports/scenario_analysis_<topic>_YYYYMMDD.md`:

1. Related News (5–10 recent articles with sources)
2. Scenario Overview (3 scenarios with probabilities)
3. Timeline (0–6m, 6–12m, 12–18m phases for base case)
4. Sector Impact Matrix (1°/2°/3° impacts)
5. Positive Impact Stocks (3–5 with rationale)
6. Negative Impact Stocks (3–5 with rationale)
7. Investment Implications (actionable takeaways)
8. Risk to Scenarios (what could shift probabilities)
9. Disclaimer

## Quality Standards

- All probabilities must sum to 100%.
- Every impact claim must have a causal chain (event → mechanism → impact).
- Stock picks must include the impact channel, not just "will benefit."
- Consider second-order effects (e.g., rate cut → weak INR → IT sector benefit).
- Flag confirmation bias in scenario construction.
- Include both sectors that benefit AND those that lose.

## Reference Files

- `references/headline_event_patterns.md` — Historical Indian market event patterns
- `references/sector_sensitivity_matrix.md` — Event type × NSE sector impact matrix
- `references/scenario_playbooks.md` — Scenario construction templates
