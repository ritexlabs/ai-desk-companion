from app.services.agent_manager import AgentManager
from app.services.event_bus import EventBus
from app.services.router import IntentRouter
from app.services.auth import AuthManager
from app.services.mcp import MCPManager
from app.services.stt import STTProvider, BrowserSTTProvider, OpenAISTTProvider
from app.services.tts import TTSProvider, BrowserTTSProvider, OpenAITTSProvider, ElevenLabsTTSProvider
from app.services.wake_word import wake_word_service
from app.services.metrics import metrics_service
from app.core.config import settings


def _build_tts() -> TTSProvider:
    if settings.tts_provider == 'openai' and settings.openai_api_key:
        return OpenAITTSProvider(
            settings.openai_api_key,
            settings.openai_tts_voice,
            settings.openai_tts_model,
        )
    if settings.tts_provider == 'elevenlabs' and settings.elevenlabs_api_key:
        return ElevenLabsTTSProvider(settings.elevenlabs_api_key, settings.elevenlabs_voice_id)
    return BrowserTTSProvider()


def _build_stt() -> STTProvider:
    if settings.stt_provider == 'openai' and settings.openai_api_key:
        return OpenAISTTProvider(settings.openai_api_key)
    return BrowserSTTProvider()


agent_manager   = AgentManager()
event_bus       = EventBus()
router_service  = IntentRouter()
auth_manager    = AuthManager()
mcp_manager     = MCPManager()
tts_provider: TTSProvider = _build_tts()
stt_provider: STTProvider = _build_stt()
