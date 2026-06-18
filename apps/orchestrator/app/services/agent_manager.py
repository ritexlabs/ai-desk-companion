from __future__ import annotations

import asyncio
from app.agents.weather import WeatherAgent
from app.agents.system import SystemAgent
from app.agents.google_calendar import GoogleCalendarAgent
from app.agents.google_email import GoogleEmailAgent
from app.agents.github import GitHubAgent
from app.agents.general_ai import GeneralAIAgent
from app.agents.stock import StockAgent
from app.agents.news import NewsAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse
from app.core.config import settings

# Maps agent ID → key under agent_config dict sent from the UI
_CONFIG_KEY: dict[str, str | None] = {
    'weather':  'weather',
    'github':   'github',
    'calendar': 'google',
    'email':    'google',
    'stock':    'stock',
    'news':     'news',
    'system':   None,
    'general':  None,
}


def _env_agent_defaults() -> dict:
    """Build agent config dicts from .env values. These are used as fallbacks
    when the UI has not configured a particular agent."""
    return {
        'weather': {
            'api_key':      settings.weather_api_key,
            'provider':     settings.weather_provider,
            'default_city': settings.weather_default_city,
        },
        'github': {
            'personal_access_token': settings.github_token,
        },
        'google': {
            'access_token':  settings.google_access_token,
            'refresh_token': settings.google_refresh_token,
            'client_id':     settings.google_client_id,
            'client_secret': settings.google_client_secret,
        },
        'stock': {
            'default_market': settings.stock_default_market,
        },
        'news': {
            'api_key': settings.news_api_key,
            'country': settings.news_default_country,
        },
    }


def _env_llm_defaults() -> dict:
    """Build LLM config from .env values."""
    return {
        'provider': settings.llm_provider,
        'api_key':  settings.openai_api_key,   # OPENAI_API_KEY serves as default LLM key
        'model':    settings.llm_model,
        'base_url': settings.llm_base_url,
    }


def _merge(env: dict, session: dict) -> dict:
    """Shallow merge: session value wins over env value for each key."""
    merged = {**env}
    for k, v in session.items():
        if v not in (None, '', [], {}):
            merged[k] = v
    return merged


def _merge_llm(env: dict, session: dict) -> dict:
    """Merge LLM configs, guarding against cross-provider key contamination.

    If the session specifies a different provider than the env but supplies no
    API key, the env key would be wrong for that provider (e.g. OpenAI key sent
    to Anthropic). In that case fall back entirely to the env config so the key
    and provider always belong together.
    """
    s_key      = (session.get('api_key')  or '').strip()
    s_provider = (session.get('provider') or '').lower().strip()
    e_provider = (env.get('provider')     or '').lower().strip()

    if s_key:
        return _merge(env, session)  # session has its own credentials — trust it

    if s_provider and s_provider != e_provider:
        return dict(env)  # different provider, no key → env has the matching pair

    return _merge(env, session)  # same provider → merge normally


class AgentManager:
    def __init__(self) -> None:
        self._agents = {
            'weather':  WeatherAgent(),
            'system':   SystemAgent(),
            'calendar': GoogleCalendarAgent(),
            'email':    GoogleEmailAgent(),
            'github':   GitHubAgent(),
            'stock':    StockAgent(),
            'news':     NewsAgent(),
            'general':  GeneralAIAgent(),
        }
        # Populated at start_session; reset between sessions
        self._session_llm_config:     dict      = {}
        self._session_agent_config:   dict      = {}
        self._session_enabled_agents: list[str] = []
        self._session_calling_name:   str       = 'Robo'

    @property
    def agents(self):
        return self._agents

    @property
    def llm_configured(self) -> bool:
        provider = (self._session_llm_config.get('provider') or '').lower()
        api_key  = (self._session_llm_config.get('api_key')  or '').strip()
        return bool(api_key) or provider == 'ollama'

    def configure_session(
        self,
        llm_config: dict,
        agent_config: dict,
        enabled_agents: list[str] | None = None,
        calling_name: str = 'Robo',
    ) -> None:
        """Called once per wake/start_session with credentials from the UI payload."""
        self._session_llm_config    = llm_config    or {}
        self._session_agent_config  = agent_config  or {}
        self._session_calling_name  = calling_name  or 'Robo'
        agents = list(enabled_agents or [])
        if 'general' not in agents:
            agents.append('general')
        self._session_enabled_agents = agents

    async def initialize_enabled_agents(self) -> None:
        await asyncio.gather(*(agent.initialize() for key, agent in self._agents.items() if key != 'general'))
        await self._agents['general'].initialize()

    async def health_snapshot(self) -> list[AgentHealth]:
        return [await agent.health() for agent in self._agents.values()]

    async def handle(self, agent_id: str, request: AgentRequest) -> AgentResponse:
        if agent_id not in self._agents:
            agent_id = 'general'

        config_key = _CONFIG_KEY.get(agent_id)

        if config_key:
            env_cfg     = _env_agent_defaults().get(config_key, {})
            session_cfg = self._session_agent_config.get(config_key, {})
            agent_cfg   = _merge(env_cfg, session_cfg)
        else:
            agent_cfg = {}

        env_llm     = _env_llm_defaults()
        session_llm = self._session_llm_config
        llm_cfg     = _merge_llm(env_llm, session_llm)

        enriched = request.model_copy(update={
            'context': {
                **request.context,
                'llm_config':    llm_cfg,
                'agent_config':  agent_cfg,
                'calling_name':  self._session_calling_name,
            },
        })
        return await self._agents[agent_id].handle(enriched)

    async def handle_as_tool(self, agent_id: str, query: str) -> str:
        """Call an agent and return its raw text result. Used by the LLM orchestrator as a tool."""
        if agent_id not in self._agents:
            return f'Unknown agent: {agent_id}'
        response = await self.handle(agent_id, AgentRequest(text=query))
        return response.text

    async def orchestrate(self, user_message: str) -> tuple[str, str]:
        """
        LLM-first handling: the LLM decides which agent tools to call,
        executes them, then synthesizes a natural response.
        Falls back to keyword router → direct agent when no LLM is configured.
        Returns (response_text, agent_used).
        """
        if self.llm_configured:
            from app.services.orchestrator import llm_orchestrator
            return await llm_orchestrator.handle(
                user_message,
                self._session_llm_config,
                self._session_enabled_agents,
                self.handle_as_tool,
                calling_name=self._session_calling_name,
            )

        # No LLM configured — keyword route to a single agent
        from app.services.router import _keyword_route
        route    = _keyword_route(user_message)
        response = await self.handle(route.agent, AgentRequest(text=user_message))
        return response.text, route.agent

    async def shutdown(self) -> None:
        await asyncio.gather(*(agent.shutdown() for agent in self._agents.values()))
