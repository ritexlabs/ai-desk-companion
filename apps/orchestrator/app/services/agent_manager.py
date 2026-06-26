from __future__ import annotations

import asyncio
from app.agents.registry import AGENTS
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse
from app.core.config import settings


def _env_agent_defaults() -> dict:
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
        'smarthome': {
            'endpoint': settings.myhome_mcp_endpoint,
            'token':    settings.myhome_mcp_token,
        },
        'whatsapp': {
            'phone_number_id':      settings.whatsapp_phone_number_id,
            'access_token':         settings.whatsapp_access_token,
            'webhook_verify_token': settings.whatsapp_webhook_verify_token,
            'contacts':             settings.whatsapp_contacts,
        },
    }


def _env_llm_defaults() -> dict:
    return {
        'provider': settings.llm_provider,
        'api_key':  settings.openai_api_key,
        'model':    settings.llm_model,
        'base_url': settings.llm_base_url,
    }


def _merge(env: dict, session: dict) -> dict:
    """Shallow merge: session value wins over env value when non-empty."""
    merged = {**env}
    for k, v in session.items():
        if v not in (None, '', [], {}):
            merged[k] = v
    return merged


def _merge_llm(env: dict, session: dict) -> dict:
    """Merge LLM configs, guarding against cross-provider key contamination.

    If the session selects a different provider but supplies no key, the env key
    belongs to a different provider — use the env pair intact.
    """
    s_key      = (session.get('api_key')  or '').strip()
    s_provider = (session.get('provider') or '').lower().strip()
    e_provider = (env.get('provider')     or '').lower().strip()

    if s_key:
        return _merge(env, session)

    if s_provider and s_provider != e_provider:
        return dict(env)

    return _merge(env, session)


class AgentManager:
    def __init__(self) -> None:
        # Build agent map from registry — no direct imports needed here.
        self._agents = {cls.id: cls() for cls in AGENTS}

        self._session_llm_config:     dict      = {}
        self._session_agent_config:   dict      = {}
        self._session_enabled_agents: list[str] = []
        self._session_calling_name:   str       = 'Master'
        self._session_assistant_name: str       = 'Robo'

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
        calling_name: str = 'Master',
        assistant_name: str = 'Robo',
    ) -> None:
        self._session_llm_config    = llm_config      or {}
        self._session_agent_config  = agent_config    or {}
        self._session_calling_name  = calling_name    or 'Master'
        self._session_assistant_name = assistant_name or 'Robo'
        agents = list(enabled_agents or [])
        if 'general' not in agents:
            agents.append('general')
        self._session_enabled_agents = agents

    def clear_session(self) -> None:
        """Zero out session credentials. Called on stop_session."""
        self._session_llm_config     = {}
        self._session_agent_config   = {}
        self._session_enabled_agents = []
        self._session_calling_name   = 'Master'
        self._session_assistant_name = 'Robo'

    async def initialize_enabled_agents(self) -> None:
        await asyncio.gather(*(
            agent.initialize()
            for aid, agent in self._agents.items()
            if aid != 'general'
        ))
        await self._agents['general'].initialize()

    async def health_snapshot(self) -> list[AgentHealth]:
        return [await agent.health() for agent in self._agents.values()]

    async def handle(self, agent_id: str, request: AgentRequest) -> AgentResponse:
        if agent_id not in self._agents:
            agent_id = 'general'

        agent      = self._agents[agent_id]
        config_key = agent.config_key

        if config_key:
            env_cfg     = _env_agent_defaults().get(config_key, {})
            session_cfg = self._session_agent_config.get(config_key, {})
            agent_cfg   = _merge(env_cfg, session_cfg)
        else:
            agent_cfg = {}

        llm_cfg = _merge_llm(_env_llm_defaults(), self._session_llm_config)

        enriched = request.model_copy(update={
            'context': {
                **request.context,
                'llm_config':     llm_cfg,
                'agent_config':   agent_cfg,
                'calling_name':   self._session_calling_name,
                'assistant_name': self._session_assistant_name,
            },
        })
        return await agent.handle(enriched)

    async def handle_as_tool(self, agent_id: str, query: str) -> str:
        if agent_id not in self._agents:
            return f'Unknown agent: {agent_id}'
        response = await self.handle(agent_id, AgentRequest(text=query))
        return response.text

    async def orchestrate(self, user_message: str) -> tuple[str, str]:
        if self.llm_configured:
            from app.services.orchestrator import llm_orchestrator
            return await llm_orchestrator.handle(
                user_message,
                self._session_llm_config,
                self._session_enabled_agents,
                self._agents,
                self.handle_as_tool,
                assistant_name=self._session_assistant_name,
            )

        from app.services.router import _keyword_route
        route    = _keyword_route(user_message)
        response = await self.handle(route.agent, AgentRequest(text=user_message))
        return response.text, route.agent

    async def shutdown(self) -> None:
        await asyncio.gather(*(agent.shutdown() for agent in self._agents.values()))
