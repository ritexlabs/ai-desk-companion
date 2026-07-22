from __future__ import annotations

import asyncio
import json
import logging

from app.agents.registry import AGENTS
from app.models.agent_message import AgentMessage
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse
from app.core.config import settings

logger = logging.getLogger(__name__)


def _env_agent_defaults() -> dict:
    """Env-level defaults for local built-in agents.
    All integrations (smarthome, whatsapp, etc.) are now served by the MCP Gateway."""
    return {}


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
        self._session_language:       str       = 'en'

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
        language: str = 'en',
    ) -> None:
        self._session_llm_config    = llm_config      or {}
        self._session_agent_config  = agent_config    or {}
        self._session_calling_name  = calling_name    or 'Master'
        self._session_assistant_name = assistant_name or 'Robo'
        self._session_language       = language        or 'en'
        agents = list(enabled_agents or [])
        # Auto-add built-in skills and general AI if not already present
        for always_on in ('websearch', 'calculator', 'memory', 'briefing', 'general'):
            if always_on not in agents:
                agents.append(always_on)
        self._session_enabled_agents = agents

    def update_language(self, language: str) -> None:
        """Called by ws.py after each user turn to track detected language."""
        self._session_language = language

    @property
    def session_language(self) -> str:
        return self._session_language

    @property
    def enabled_agents(self) -> list[str]:
        return list(self._session_enabled_agents)

    def clear_session(self) -> None:
        """Zero out session credentials. Called on stop_session."""
        self._session_llm_config     = {}
        self._session_agent_config   = {}
        self._session_enabled_agents = []
        self._session_calling_name   = 'Master'
        self._session_assistant_name = 'Robo'
        self._session_language       = 'en'
        from app.services.cache import agent_cache
        agent_cache.clear()

    async def initialize_enabled_agents(self) -> None:
        await asyncio.gather(*(
            agent.initialize() for agent in self._agents.values()
        ))

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

    async def handle_as_tool(self, fn_name: str, query: str) -> str:
        from app.services.cache import agent_cache
        agent_id = fn_name.split('__')[0] if '__' in fn_name else fn_name
        cached = agent_cache.get(agent_id, query)
        if cached is not None:
            return cached

        result: str
        if '__' in fn_name:
            # Gateway-namespaced tool call (e.g. indmoney__query_portfolio).
            # No credentials forwarded — gateway reads them from its own .env.
            from app.dependencies import gateway_client
            try:
                raw = await gateway_client.call_tool(fn_name, {'query': query})
                if isinstance(raw, str):
                    result = raw
                else:
                    result = json.dumps(raw) if raw is not None else 'No data available.'
            except PermissionError as exc:
                return str(exc)
            except Exception as exc:
                logger.warning('Gateway tool call %s failed: %s', fn_name, exc)
                return f'Tool call failed: {str(exc)[:100]}'
        else:
            # Local agent call
            if fn_name not in self._agents:
                return f'Unknown agent: {fn_name}'
            response = await self.handle(fn_name, AgentRequest(text=query))
            result = response.text

        if result and isinstance(result, str) and not result.startswith('Tool call failed'):
            agent_cache.set(agent_id, query, result)
        return result

    async def call_agent_from_agent(self, msg: AgentMessage) -> str:
        """Route an AgentMessage through the orchestrator.

        Checks cache first; sets cache on success.
        Gateway tools: delegated to handle_as_tool().
        Local agents: delegated to handle_as_tool().
        """
        from app.services.cache import agent_cache
        agent_id = msg.tool_name.split('__')[0] if '__' in msg.tool_name else msg.tool_name
        query = msg.arguments.get('query', '')
        cached = agent_cache.get(agent_id, query)
        if cached is not None:
            return cached
        result = await asyncio.wait_for(
            self.handle_as_tool(msg.tool_name, query),
            timeout=msg.timeout,
        )
        if result and not result.startswith('Tool call failed'):
            agent_cache.set(agent_id, query, result)
        return result

    async def _fetch_gateway_tools(self) -> dict:
        """Fetch tools from the gateway and convert to tool_meta format for the LLM."""
        from app.dependencies import gateway_client
        try:
            raw = await gateway_client.list_tools()
        except Exception as exc:
            logger.debug('Gateway list_tools unavailable: %s', exc)
            return {}

        tools: dict = {}
        for t in raw:
            name = t.get('name', '')
            if not name:
                continue
            # Extract query parameter description as query_hint
            props     = t.get('inputSchema', {}).get('properties', {})
            query_doc = props.get('query', {}).get('description', name)
            tools[name] = {
                'description': t.get('description', name),
                'query_hint':  query_doc,
            }
        return tools

    async def orchestrate(self, user_message: str) -> tuple[str, str]:
        if self.llm_configured:
            from app.services.orchestrator import llm_orchestrator
            gateway_tools = await self._fetch_gateway_tools()
            return await llm_orchestrator.handle(
                user_message,
                self._session_llm_config,
                self._session_enabled_agents,
                self._agents,
                self.handle_as_tool,
                assistant_name=self._session_assistant_name,
                gateway_tools=gateway_tools if gateway_tools else None,
                language=self._session_language,
            )

        from app.services.router import _keyword_route
        route    = _keyword_route(user_message)
        response = await self.handle(route.agent, AgentRequest(text=user_message))
        return response.text, route.agent

    async def shutdown(self) -> None:
        await asyncio.gather(*(agent.shutdown() for agent in self._agents.values()))
