from __future__ import annotations

from app.agents.weather import WeatherAgent
from app.agents.system import SystemAgent
from app.agents.google_calendar import GoogleCalendarAgent
from app.agents.google_email import GoogleEmailAgent
from app.agents.github import GitHubAgent
from app.agents.stock import StockAgent
from app.agents.news import NewsAgent
from app.agents.smarthome import SmartHomeAgent
from app.agents.whatsapp import WhatsAppAgent
from app.agents.portfolio import PortfolioAgent
from app.agents.websearch import WebSearchAgent
from app.agents.calculator import CalculatorAgent
from app.agents.memory import MemoryAgent
from app.agents.briefing import BriefingAgent
from app.agents.general_ai import GeneralAIAgent

# Ordered list of all agents. Add a new agent by:
#   1. Creating app/agents/<name>.py with id, name, config_key, tool_meta
#   2. Importing it here and appending to AGENTS
# No other file needs to change.
AGENTS: list = [
    WeatherAgent,
    SystemAgent,
    GoogleCalendarAgent,
    GoogleEmailAgent,
    GitHubAgent,
    StockAgent,
    NewsAgent,
    SmartHomeAgent,
    WhatsAppAgent,
    PortfolioAgent,
    # ── Built-in skills (always auto-enabled, no credentials required) ──────
    WebSearchAgent,
    CalculatorAgent,
    MemoryAgent,
    BriefingAgent,
    GeneralAIAgent,
]
