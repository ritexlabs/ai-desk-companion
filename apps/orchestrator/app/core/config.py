from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    app_name: str = 'Personal AI Agent Orchestrator'
    env: str = 'development'
    log_level: str = 'INFO'
    wake_phrase: str = 'Robo'
    agent_idle_ttl_seconds: int = 600
    allowed_origins: list[str] = ['http://localhost:5173', 'http://localhost:4173', 'tauri://localhost']

    # Voice providers
    tts_provider: str = 'browser'          # 'browser' | 'openai' | 'elevenlabs'
    stt_provider: str = 'browser'          # 'browser' | 'openai'

    # OpenAI (used by both OpenAI TTS and OpenAI Whisper STT)
    openai_api_key: str = ''
    openai_tts_voice: str = 'nova'         # alloy | echo | fable | onyx | nova | shimmer
    openai_tts_model: str = 'tts-1'        # tts-1 | tts-1-hd

    # ElevenLabs TTS
    elevenlabs_api_key: str = ''
    elevenlabs_voice_id: str = 'Rachel'

    # Wake word detection (requires: pip install sounddevice openwakeword numpy)
    wake_word_enabled:     bool  = False
    wake_word_model:       str   = 'hey_jarvis'   # hey_jarvis | alexa | hey_mycroft | hey_rhasspy
    wake_word_sensitivity: float = 0.5             # 0.1 (loose) – 0.9 (strict)

    # LLM (used when UI sends no llm_config)
    llm_provider: str = 'openai'   # openai | anthropic | gemini | ollama
    llm_model:    str = ''         # leave blank to use provider default
    llm_base_url: str = ''         # Ollama base URL, e.g. http://localhost:11434

    # MCP Gateway — URL and shared Bearer token
    # Change GATEWAY_URL to point at an external gateway; no other code changes needed.
    gateway_url:       str = 'http://localhost:8788'
    gateway_api_token: str = ''   # must match GATEWAY_API_TOKEN in gateway .env



settings = Settings()
