from __future__ import annotations

import ast
import math
import operator
import re

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus


# ── Safe evaluator ────────────────────────────────────────────────────────────

_SAFE_OPS: dict = {
    ast.Add:      operator.add,
    ast.Sub:      operator.sub,
    ast.Mult:     operator.mul,
    ast.Div:      operator.truediv,
    ast.Pow:      operator.pow,
    ast.Mod:      operator.mod,
    ast.FloorDiv: operator.floordiv,
    ast.USub:     operator.neg,
    ast.UAdd:     operator.pos,
}

_SAFE_NAMES: dict = {
    'pi':  math.pi,
    'e':   math.e,
    'tau': math.tau,
    'inf': math.inf,
}

_SAFE_FUNCS: dict = {
    'sqrt':      math.sqrt,
    'abs':       abs,
    'round':     round,
    'floor':     math.floor,
    'ceil':      math.ceil,
    'log':       math.log10,
    'ln':        math.log,
    'log2':      math.log2,
    'sin':       math.sin,
    'cos':       math.cos,
    'tan':       math.tan,
    'degrees':   math.degrees,
    'radians':   math.radians,
    'factorial': math.factorial,
    'max':       max,
    'min':       min,
    'pow':       pow,
}

_NL_PREFIX = re.compile(
    r'^(?:calculate|compute|what\s+is|what\'?s|evaluate|solve|find|how\s+much\s+(?:is|are))\s+',
    re.I,
)
_PCT_OF = re.compile(r'(\d+(?:\.\d+)?)\s*%\s*(?:of|on)?\s*(\d+(?:\.\d+)?)', re.I)
_TIP    = re.compile(r'(\d+(?:\.\d+)?)\s*%\s*tip\s+on\s+(\d+(?:\.\d+)?)', re.I)


def _eval_node(node: ast.expr) -> float | int:
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise ValueError(f'Unsupported literal: {node.value!r}')
    if isinstance(node, ast.BinOp):
        op = _SAFE_OPS.get(type(node.op))
        if op is None:
            raise ValueError(f'Unsupported operator: {type(node.op).__name__}')
        return op(_eval_node(node.left), _eval_node(node.right))
    if isinstance(node, ast.UnaryOp):
        op = _SAFE_OPS.get(type(node.op))
        if op is None:
            raise ValueError('Unsupported unary operator')
        return op(_eval_node(node.operand))
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ValueError('Only simple function calls are allowed')
        fn = _SAFE_FUNCS.get(node.func.id)
        if fn is None:
            raise ValueError(f'Unknown function "{node.func.id}". Available: {", ".join(_SAFE_FUNCS)}')
        return fn(*(_eval_node(a) for a in node.args))
    if isinstance(node, ast.Name):
        val = _SAFE_NAMES.get(node.id)
        if val is None:
            raise ValueError(f'Unknown name "{node.id}"')
        return val
    raise ValueError(f'Unsupported expression node: {type(node).__name__}')


def _fmt(result: float | int) -> str:
    if isinstance(result, float):
        if result == int(result) and abs(result) < 1e15:
            return str(int(result))
        return f'{result:.10g}'
    return str(result)


def _evaluate(raw: str) -> str:
    expr = (raw.strip()
            .replace('^', '**')
            .replace('×', '*')
            .replace('÷', '/')
            .replace(',', ''))
    try:
        tree = ast.parse(expr, mode='eval')
        return _fmt(_eval_node(tree.body))
    except ZeroDivisionError:
        return 'Error: division by zero.'
    except Exception as exc:
        return f'Cannot evaluate "{raw}": {exc}'


# ── Agent ─────────────────────────────────────────────────────────────────────

class CalculatorAgent(AssistantAgent):
    id = 'calculator'
    name = 'Calculator'
    config_key = None
    tool_meta = {
        'description': (
            'Evaluate mathematical expressions with precision: arithmetic, percentages, '
            'tip calculations, unit-conversion formulas, compound interest, trigonometry. '
            'Use whenever the user asks to calculate, compute, or solve something with numbers.'
        ),
        'query_hint': 'Math expression or word problem, e.g. "15% of 850" or "sqrt(144) + 5^2"',
    }

    async def initialize(self) -> None:
        return None

    async def health(self) -> AgentHealth:
        return AgentHealth(name=self.name, status=AgentStatus.ONLINE)

    async def shutdown(self) -> None:
        return None

    async def handle(self, request: AgentRequest) -> AgentResponse:
        query = request.text.strip()
        if not query:
            return AgentResponse(agent=self.id, text='Please provide an expression to calculate.')

        # ── Natural language shortcuts ────────────────────────────────────────
        tip_m = _TIP.search(query)
        if tip_m:
            pct, base = float(tip_m.group(1)), float(tip_m.group(2))
            tip   = pct * base / 100
            total = base + tip
            return AgentResponse(
                agent=self.id,
                text=f'{pct}% tip on {base} is {_fmt(tip)}, total {_fmt(total)}.',
            )

        pct_m = _PCT_OF.search(query)
        if pct_m:
            pct, base = float(pct_m.group(1)), float(pct_m.group(2))
            result = pct * base / 100
            return AgentResponse(
                agent=self.id,
                text=f'{pct}% of {base} is {_fmt(result)}.',
            )

        # ── Strip natural-language prefix then evaluate ────────────────────────
        expr   = _NL_PREFIX.sub('', query).rstrip('?').strip()
        result = _evaluate(expr)
        return AgentResponse(agent=self.id, text=f'The answer is {result}.')
