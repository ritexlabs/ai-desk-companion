from __future__ import annotations

from app.agents.websearch import WebSearchAgent
from app.agents.calculator import CalculatorAgent
from app.agents.memory import MemoryAgent
from app.agents.briefing import BriefingAgent
from app.agents.general_ai import GeneralAIAgent

# Locally-managed agents — built-in skills that need no external credentials.
# SmartHome and WhatsApp are now served by the MCP Gateway (apps/mcp-gateway).
AGENTS: list = [
    WebSearchAgent,
    CalculatorAgent,
    MemoryAgent,
    BriefingAgent,
    GeneralAIAgent,
]
