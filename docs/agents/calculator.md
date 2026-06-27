# Calculator Skill

Precise arithmetic, percentages, tips, unit-conversion formulas, and mathematical functions — evaluated locally without sending numbers to any external API.

**Navigation:** [← All Agents](../agents.md) | [Architecture](../architecture.md) | [Setup](../setup.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [How it works](#2-how-it-works)
3. [Prerequisites](#3-prerequisites)
4. [Voice commands](#4-voice-commands)
5. [Supported operations](#5-supported-operations)
6. [Limitations](#6-limitations)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Overview

The Calculator skill gives the AI precise numerical answers rather than approximations from training data. LLMs are notoriously unreliable for arithmetic — the Calculator skill fixes this by evaluating expressions with Python's math engine, then returning the exact result.

**Always active** — requires no setup, no API key, and no toggle in Settings.

Use it for:
- **Quick arithmetic** — *"What is 1847 divided by 7?"*
- **Tip and tax calculations** — *"What is 18% tip on 850?"*
- **Percentage of a number** — *"What is 15% of 2499?"*
- **Unit conversion formulas** — *"How many km is 42 miles?"*
- **Scientific functions** — *"What is sqrt of 1764?"*, *"sin of 30 degrees?"*

---

## 2. How it works

```
Your voice command
       │
       ▼
 LLM Orchestrator
  "This is a calculation → call calculator tool"
       │
       ▼
 CalculatorAgent
  1. Pattern match: percentage / tip shortcuts
  2. Strip natural-language prefix ("what is", "calculate")
  3. Normalise: ^ → **, × → *, ÷ /, commas stripped
  4. Parse into AST (Abstract Syntax Tree)
  5. Walk AST — only safe nodes allowed
  6. Return exact result
       │
       ▼
 LLM wraps result in natural language
 "18% tip on ₹850 is ₹153, total ₹1003."
```

**Safety:** Expressions are parsed with Python's `ast` module — no `eval()` is used. Only numeric literals, arithmetic operators, and a whitelist of math functions are permitted. Arbitrary code execution is impossible.

---

## 3. Prerequisites

None. The skill uses only Python standard library (`ast`, `math`, `operator`). No installation needed.

---

## 4. Voice commands

| What you say | What is computed |
|---|---|
| *"What is 18% tip on 850?"* | `18% tip on 850 → tip: 153, total: 1003` |
| *"What is 15% of 2499?"* | `15% of 2499 → 374.85` |
| *"Calculate 1847 divided by 7"* | `1847 / 7 → 263.857…` |
| *"What is 2 to the power 10?"* | `2 ** 10 → 1024` |
| *"Square root of 1764"* | `sqrt(1764) → 42` |
| *"What is sin of 30 degrees?"* | `sin(radians(30)) → 0.5` |
| *"How many km is 42 miles?"* | `42 * 1.60934 → 67.59` |
| *"Factorial of 12"* | `factorial(12) → 479001600` |
| *"What is pi times 5 squared?"* | `pi * 5**2 → 78.5398` |
| *"Log base 10 of 1000"* | `log(1000) → 3` |

---

## 5. Supported operations

### Arithmetic operators

| Operator | Syntax | Example |
|---|---|---|
| Addition | `+` | `100 + 50` |
| Subtraction | `-` | `200 - 75.5` |
| Multiplication | `*` or `×` | `12 * 9` |
| Division | `/` or `÷` | `100 / 7` |
| Floor division | `//` | `17 // 5` |
| Modulo (remainder) | `%` | `17 % 5` |
| Exponentiation | `**` or `^` | `2 ^ 8` |
| Negation | `-x` | `-42` |

### Built-in functions

| Function | What it does |
|---|---|
| `sqrt(x)` | Square root |
| `abs(x)` | Absolute value |
| `round(x)` | Round to nearest integer |
| `floor(x)` | Round down |
| `ceil(x)` | Round up |
| `log(x)` | Base-10 logarithm |
| `ln(x)` | Natural logarithm |
| `log2(x)` | Base-2 logarithm |
| `sin(x)` | Sine (input in radians) |
| `cos(x)` | Cosine (input in radians) |
| `tan(x)` | Tangent (input in radians) |
| `degrees(x)` | Convert radians → degrees |
| `radians(x)` | Convert degrees → radians |
| `factorial(x)` | Factorial (integer only) |
| `max(a, b)` | Larger of two values |
| `min(a, b)` | Smaller of two values |
| `pow(x, n)` | Power (`pow(2, 8)` = 256) |

### Constants

| Name | Value |
|---|---|
| `pi` | 3.14159265… |
| `e` | 2.71828182… |
| `tau` | 6.28318530… (2π) |
| `inf` | Infinity |

---

## 6. Limitations

| Limitation | Detail |
|---|---|
| **No symbolic algebra** | Cannot solve equations like `x² + 3x = 10` |
| **No live currency rates** | Conversions like "dollars to rupees" need a live rate — combine with Web Search |
| **Integer factorial only** | `factorial(12.5)` will error; input must be a whole number |
| **No units** | `42km` will not parse; strip units and use formulas (`42 * 1.60934`) |
| **Trig uses radians** | Use `sin(radians(30))` for degree inputs |

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot evaluate "..."` | Unsupported syntax or typo | Rephrase as a plain math expression |
| `Error: division by zero` | Dividing by 0 | Check your numbers |
| Result is unexpectedly float | Integer result shown as decimal | Expected — `round()` can coerce if needed |
| LLM estimates instead of calling calculator | Phrasing did not signal math | Add "calculate", "what is exactly", or use explicit numbers |
