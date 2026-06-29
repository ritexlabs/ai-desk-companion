from __future__ import annotations

from app.agents.smarthome import SmartHomeAgent
from app.agents.whatsapp import WhatsAppAgent
from app.agents.websearch import WebSearchAgent
from app.agents.calculator import CalculatorAgent
from app.agents.memory import MemoryAgent
from app.agents.briefing import BriefingAgent
from app.agents.general_ai import GeneralAIAgent

# Ordered list of locally-managed agents.
# Weather, News, Stock, System, GitHub, Portfolio, Calendar, Email
# are now served by the MCP Gateway (apps/mcp-gateway) — no entries here.
AGENTS: list = [
    SmartHomeAgent,
    WhatsAppAgent,
    # ── Built-in skills (always auto-enabled, no credentials required) ──────
    WebSearchAgent,
    CalculatorAgent,
    MemoryAgent,
    BriefingAgent,
    GeneralAIAgent,
]
