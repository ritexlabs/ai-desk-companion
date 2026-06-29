from __future__ import annotations

import asyncio
import re

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus
from app.services import indmoney_mcp

_DEFAULT_ENDPOINT = 'https://mcp.indmoney.com/mcp'


class PortfolioAgent(AssistantAgent):
    id         = 'portfolio'
    name       = 'Portfolio'
    config_key = 'portfolio'
    tool_meta  = {
        'description': (
            'Access the user\'s investment portfolio via INDmoney broker MCP. '
            'Use this tool for ANY question about investments, holdings, P&L, returns, '
            'mutual funds, watchlist, transactions, or portfolio performance. '
            'Never answer portfolio questions from training data — always call this tool.'
        ),
        'query_hint': (
            'The portfolio question or command, e.g. '
            '"show my holdings", "what is my total P&L", '
            '"list my mutual funds", "recent transactions", "what is on my watchlist"'
        ),
    }

    async def initialize(self) -> None:
        return None

    async def health(self) -> AgentHealth:
        return AgentHealth(name=self.name, status=AgentStatus.ONLINE)

    async def shutdown(self) -> None:
        return None

    # ── Credentials ───────────────────────────────────────────────────

    def _creds(self, request: AgentRequest) -> tuple[str, str]:
        cfg      = (request.context or {}).get('agent_config', {})
        endpoint = (cfg.get('endpoint')     or '').strip() or _DEFAULT_ENDPOINT
        token    = (cfg.get('access_token') or '').strip()
        return endpoint, token

    # ── Entry point ───────────────────────────────────────────────────

    async def handle(self, request: AgentRequest) -> AgentResponse:
        endpoint, token = self._creds(request)

        if not token:
            return AgentResponse(
                agent=self.id,
                text=(
                    'Portfolio is not connected. '
                    'Click Connect in Settings → Agents → Portfolio to sign in with INDmoney.'
                ),
            )

        if request.text.strip() == '__boot__':
            return await self._boot(endpoint, token)

        return await self._dispatch(request.text, endpoint, token)

    # ── Boot ──────────────────────────────────────────────────────────

    async def _boot(self, endpoint: str, token: str) -> AgentResponse:
        """Connect to INDmoney MCP (up to 3 attempts) then fetch today's P&L."""
        tools: list[dict] = []
        for attempt in range(3):
            try:
                tools = await indmoney_mcp.list_tools(endpoint, token, force=True)
                break                                   # success — exit retry loop
            except PermissionError:
                return AgentResponse(
                    agent=self.id,
                    text='Portfolio access token expired. Please reconnect in Settings → Agents → Portfolio.',
                )
            except Exception:
                if attempt < 2:
                    await asyncio.sleep(3)
        else:
            # All 3 attempts failed
            return AgentResponse(
                agent=self.id,
                text='Portfolio agent is online — INDmoney MCP is still warming up. Try asking a question in a moment.',
            )

        n = len(tools)
        base = f'Portfolio connected — {n} tool{"s" if n != 1 else ""} available.'
        daily = await self._fetch_daily_change(endpoint, token, tools)
        change_msg = daily if daily else 'No changes in portfolio value from yesterday.'
        return AgentResponse(agent=self.id, text=f'{base} {change_msg}')

    # ── Daily change (called from boot) ───────────────────────────────

    async def _fetch_daily_change(self, endpoint: str, token: str, tools: list[dict]) -> str:
        """Try to report today's portfolio gain/loss in the boot greeting."""
        tool_map = {t['name'].lower(): t['name'] for t in tools}

        # Priority order: today-specific → P&L → summary/portfolio overview
        for keyword in ['today', 'daily', 'day_pnl', 'pnl', 'summary', 'networth', 'overview', 'portfolio', 'holding']:
            matched = next((real for lower, real in tool_map.items() if keyword in lower), None)
            if not matched:
                continue
            try:
                data = await indmoney_mcp.call_tool(endpoint, token, matched)
                msg = _extract_daily_change(data)
                if msg:
                    return msg
            except Exception:
                continue
        return ''

    # ── Dispatch ──────────────────────────────────────────────────────

    async def _dispatch(self, text: str, endpoint: str, token: str) -> AgentResponse:
        t = text.lower()

        try:
            tools = await indmoney_mcp.list_tools(endpoint, token)
        except PermissionError:
            return AgentResponse(
                agent=self.id,
                text='Portfolio access token expired. Please reconnect in Settings → Agents → Portfolio.',
            )
        except Exception:
            return AgentResponse(agent=self.id, text='Could not reach INDmoney MCP. Please try again shortly.')

        tool_names = {t_['name'].lower(): t_['name'] for t_ in tools}

        if re.search(r'\b(mutual\s*fund|mf|sip|folio)\b', t):
            return await self._call_intent(endpoint, token, tool_names, ['mutual_fund', 'mf', 'fund', 'folio'], text)

        if re.search(r'\b(watchlist|watch|track)\b', t):
            return await self._call_intent(endpoint, token, tool_names, ['watchlist', 'watch'], text)

        if re.search(r'\b(transaction|buy|sell|history|recent)\b', t):
            return await self._call_intent(endpoint, token, tool_names, ['transaction', 'history', 'order'], text)

        if re.search(r'\b(p&?l|profit|loss|gain|return|returns)\b', t):
            return await self._call_intent(endpoint, token, tool_names, ['pnl', 'p_l', 'profit', 'gain', 'return'], text)

        if re.search(r'\b(holding|stock|equity|share)\b', t):
            return await self._call_intent(endpoint, token, tool_names, ['holding', 'stock', 'equity', 'portfolio'], text)

        if re.search(r'\b(summary|overview|total|value|net\s*worth|networth)\b', t):
            return await self._call_intent(endpoint, token, tool_names, ['summary', 'overview', 'networth', 'portfolio', 'total'], text)

        # Default — try summary/overview/holdings
        return await self._call_intent(endpoint, token, tool_names, ['summary', 'overview', 'networth', 'portfolio', 'holding'], text)

    async def _call_intent(
        self,
        endpoint: str,
        token: str,
        tool_names: dict[str, str],
        candidates: list[str],
        query: str,
    ) -> AgentResponse:
        for keyword in candidates:
            matched = next(
                (real for lower, real in tool_names.items() if keyword in lower),
                None,
            )
            if matched:
                try:
                    result = await indmoney_mcp.call_tool(endpoint, token, matched)
                    return AgentResponse(agent=self.id, text=_format_result(result))
                except PermissionError:
                    return AgentResponse(
                        agent=self.id,
                        text='Portfolio access token expired. Please reconnect in Settings → Agents → Portfolio.',
                    )
                except Exception as exc:
                    return AgentResponse(agent=self.id, text=f'Could not fetch portfolio data: {str(exc)[:100]}')

        tool_list = ', '.join(sorted(tool_names.values())[:8]) or 'none'
        return AgentResponse(
            agent=self.id,
            text=f"I couldn't find the right tool for that. Available tools: {tool_list}.",
        )


# ── Daily-change extraction ────────────────────────────────────────────────────

def _fmt_inr(n: float) -> str:
    abs_n = abs(n)
    if abs_n >= 10_000_000:
        return f'₹{abs_n / 10_000_000:.2f}Cr'
    if abs_n >= 100_000:
        return f'₹{abs_n / 100_000:.2f}L'
    return f'₹{abs_n:,.0f}'


def _extract_daily_change(data: object) -> str:
    """
    Try to pull today's gain/loss out of an MCP response and return a
    human-readable sentence.  Returns '' when no day-level data is found.
    """
    if not isinstance(data, dict):
        return ''

    # ── 1. Explicit today/day fields at top level ────────────────────
    DAY_AMOUNT_KEYS = [
        'day_gain', 'today_gain', 'day_pnl', 'today_pnl',
        'day_change', 'today_change', 'one_day_gain', 'daily_gain',
    ]
    DAY_PCT_KEYS = [
        'day_return_pct', 'today_return_pct', 'day_change_pct',
        'daily_return_pct', 'one_day_return_pct', 'day_gain_pct',
        'today_gain_pct',
    ]

    day_amt: float | None = None
    day_pct: float | None = None

    for k in DAY_AMOUNT_KEYS:
        if k in data and data[k] is not None:
            try:
                day_amt = float(data[k])
                break
            except (ValueError, TypeError):
                pass

    for k in DAY_PCT_KEYS:
        if k in data and data[k] is not None:
            try:
                day_pct = float(data[k])
                break
            except (ValueError, TypeError):
                pass

    if day_amt is not None or day_pct is not None:
        return _format_day_change(day_amt, day_pct)

    # ── 2. Aggregate day_gain across investments array ───────────────
    investments = data.get('investments') or data.get('holdings') or []
    if isinstance(investments, list) and investments:
        total_day: float = 0.0
        found_any = False
        total_prev: float = 0.0

        for inv in investments:
            if not isinstance(inv, dict):
                continue
            for k in DAY_AMOUNT_KEYS:
                if k in inv and inv[k] is not None:
                    try:
                        total_day += float(inv[k])
                        found_any = True
                    except (ValueError, TypeError):
                        pass
                    break
            # Accumulate current values to estimate previous-day base
            cur = inv.get('current_value') or inv.get('portfolio_value') or 0
            try:
                total_prev += float(cur)
            except (ValueError, TypeError):
                pass

        if found_any:
            pct = (total_day / (total_prev - total_day) * 100) if (total_prev - total_day) > 0 else None
            return _format_day_change(total_day, pct)

    return ''


def _format_day_change(amt: float | None, pct: float | None) -> str:
    if amt is None and pct is None:
        return ''
    direction = 'up' if (amt or pct or 0) >= 0 else 'down'
    parts: list[str] = []
    if amt is not None:
        parts.append(_fmt_inr(abs(amt)))
    if pct is not None:
        parts.append(f'{abs(pct):.2f}%')
    value_str = ' / '.join(parts)
    return f'Your portfolio is {direction} {value_str} from yesterday.'


# ── Formatting helpers ────────────────────────────────────────────────────────

def _format_summary(data: object) -> str:
    if isinstance(data, str):
        return data[:280]
    if isinstance(data, dict):
        parts = []
        for k, v in data.items():
            if isinstance(v, (int, float, str)):
                label = k.replace('_', ' ').title()
                parts.append(f'{label}: {v}')
            if len(parts) >= 5:
                break
        return ', '.join(parts) if parts else str(data)[:200]
    if isinstance(data, list) and data:
        return _format_summary(data[0])
    return str(data)[:200]


def _format_result(data: object) -> str:
    if isinstance(data, str):
        return data[:500]
    if isinstance(data, list):
        if not data:
            return 'No data found.'
        lines = []
        for item in data[:5]:
            if isinstance(item, dict):
                parts = [f'{k.replace("_", " ").title()}: {v}' for k, v in item.items() if isinstance(v, (str, int, float))]
                lines.append(' · '.join(parts[:4]))
            else:
                lines.append(str(item)[:100])
        suffix = f' (and {len(data) - 5} more)' if len(data) > 5 else ''
        return '. '.join(lines) + suffix
    if isinstance(data, dict):
        return _format_summary(data)
    return str(data)[:300]
