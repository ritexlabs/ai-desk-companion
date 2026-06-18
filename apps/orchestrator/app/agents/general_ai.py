from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus


_NO_LLM_MSG = (
    'No AI provider is configured. '
    'Go to Settings → AI to connect OpenAI, Anthropic, Gemini, or a local Ollama model.'
)

_GENERAL_SYSTEM_PROMPT = (
    'You are Robo, a voice assistant. '
    'Answer only general knowledge questions (maths, definitions, history, coding help). '
    'You have NO access to the user\'s personal data, connected systems, or real-time information. '
    'If the user asks about time, weather, calendar, email, stocks, news, or system stats, '
    'tell them to make sure the relevant agent is enabled in Settings. '
    'Keep replies to 1–3 sentences, no markdown, plain spoken language.'
)


class GeneralAIAgent(AssistantAgent):
    id = 'general'
    name = 'General AI'

    async def initialize(self) -> None:
        return None

    async def health(self) -> AgentHealth:
        return AgentHealth(name=self.name, status=AgentStatus.ONLINE)

    async def shutdown(self) -> None:
        return None

    async def handle(self, request: AgentRequest) -> AgentResponse:
        llm_config: dict = request.context.get('llm_config', {})
        provider = (llm_config.get('provider') or '').lower()
        api_key  = (llm_config.get('api_key')  or '').strip()

        if not api_key and provider != 'ollama':
            return AgentResponse(agent=self.id, text=_NO_LLM_MSG)

        from app.services.llm import llm_service
        text = await llm_service.complete(
            request.text, llm_config,
            system_prompt=_GENERAL_SYSTEM_PROMPT,
            max_tokens=200,
        )
        if not text:
            return AgentResponse(
                agent=self.id,
                text='Having trouble reaching the AI provider. Please check your API key in Settings → AI.',
            )
        return AgentResponse(agent=self.id, text=text)
