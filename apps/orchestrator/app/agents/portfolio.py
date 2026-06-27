from __future__ import annotations

import re

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus
from app.services.indmoney_mcp import get_indmoney_client

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

        client = get_indmoney_client(endpoint, token)

        if request.text.strip() == '__boot__':
            return await self._boot(client)

        return await self._dispatch(request.text, client)

    # ── Boot ──────────────────────────────────────────────────────────

    async def _boot(self, client) -> AgentResponse:
        try:
            await client.initialize()
            tools = await client.list_tools()

            # Try to get a quick portfolio summary on boot
            summary_tool = next(
                (t['name'] for t in tools if re.search(r'(summary|overview|portfolio)', t.get('name', ''), re.I)),
                None,
            )
            if summary_tool:
                result = await client.call_tool(summary_tool)
                text   = _format_summary(result)
                return AgentResponse(agent=self.id, text=f'Portfolio connected. {text}')

            return AgentResponse(agent=self.id, text=f'Portfolio connected — {len(tools)} tools available.')
        except Exception as exc:
            return AgentResponse(agent=self.id, text=f'Portfolio connected. ({str(exc)[:80]})')

    # ── Dispatch ──────────────────────────────────────────────────────

    async def _dispatch(self, text: str, client: object) -> AgentResponse:
        t = text.lower()

        try:
            await client.initialize()
            tools: list[dict] = await client.list_tools()
        except Exception as exc:
            return AgentResponse(agent=self.id, text=f'Could not reach INDmoney: {str(exc)[:80]}')

        tool_names = {t_['name'].lower(): t_['name'] for t_ in tools}

        # Route by intent keyword
        if re.search(r'\b(mutual\s*fund|mf|sip|folio)\b', t):
            return await self._call_intent(client, tool_names, ['mutual_fund', 'mf', 'fund'], text)

        if re.search(r'\b(watchlist|watch|track)\b', t):
            return await self._call_intent(client, tool_names, ['watchlist', 'watch'], text)

        if re.search(r'\b(transaction|buy|sell|history|recent)\b', t):
            return await self._call_intent(client, tool_names, ['transaction', 'history', 'order'], text)

        if re.search(r'\b(p&?l|profit|loss|gain|return|returns)\b', t):
            return await self._call_intent(client, tool_names, ['pnl', 'p_l', 'profit', 'gain', 'return'], text)

        if re.search(r'\b(holding|stock|equity|share)\b', t):
            return await self._call_intent(client, tool_names, ['holding', 'stock', 'equity', 'portfolio'], text)

        if re.search(r'\b(summary|overview|total|value|net\s*worth)\b', t):
            return await self._call_intent(client, tool_names, ['summary', 'overview', 'portfolio', 'total'], text)

        # Default — try portfolio summary or holdings
        return await self._call_intent(client, tool_names, ['summary', 'overview', 'portfolio', 'holding'], text)

    async def _call_intent(
        self,
        client,
        tool_names: dict[str, str],
        candidates: list[str],
        query: str,
    ) -> AgentResponse:
        """Find the first matching tool from candidates and call it."""
        for keyword in candidates:
            matched = next(
                (real for lower, real in tool_names.items() if keyword in lower),
                None,
            )
            if matched:
                try:
                    result = await client.call_tool(matched, {'query': query})
                    return AgentResponse(agent=self.id, text=_format_result(result))
                except Exception as exc:
                    return AgentResponse(agent=self.id, text=f'Could not fetch portfolio data: {str(exc)[:100]}')

        # No matching tool found — list available tools
        tool_list = ', '.join(sorted(tool_names.values())[:8]) or 'none'
        return AgentResponse(
            agent=self.id,
            text=f"I couldn't find the right tool for that. Available tools: {tool_list}.",
        )


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
        # Format up to 5 items
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
