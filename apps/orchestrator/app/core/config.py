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
    openai_tts_model: str = 'tts-1'       # tts-1 | tts-1-hd

    # ElevenLabs TTS
    elevenlabs_api_key: str = ''
    elevenlabs_voice_id: str = 'Rachel'

    # Wake word detection (requires: pip install sounddevice openwakeword numpy)
    wake_word_enabled:     bool  = False
    wake_word_model:       str   = 'hey_jarvis'   # hey_jarvis | alexa | hey_mycroft | hey_rhasspy
    wake_word_sensitivity: float = 0.5             # 0.1 (loose) – 0.9 (strict)

    # ── LLM fallback (used when UI sends no llm_config) ──────────────
    llm_provider: str = 'openai'   # openai | anthropic | gemini | ollama
    llm_model:    str = ''         # leave blank to use provider default
    llm_base_url: str = ''         # Ollama base URL, e.g. http://localhost:11434

    # ── Weather agent fallback ────────────────────────────────────────
    weather_api_key:      str = ''              # OpenWeatherMap or WeatherAPI key
    weather_provider:     str = 'openweathermap'
    weather_default_city: str = 'Bengaluru'

    # ── GitHub agent fallback ─────────────────────────────────────────
    github_token: str = ''   # Personal Access Token

    # ── Google agents fallback (Calendar + Gmail) ─────────────────────
    # Access tokens are short-lived; prefer setting these via the UI.
    # Useful for testing or server-side automation.
    google_access_token:  str = ''
    google_refresh_token: str = ''
    google_client_id:     str = ''
    google_client_secret: str = ''

    # ── Stock Market agent ─────────────────────────────────────────────
    # default_market: 'IN' (NSE tickers) | 'US' (NYSE/NASDAQ)
    # No API key required — uses yfinance (Yahoo Finance, free).
    stock_default_market: str = 'IN'

    # ── News agent ─────────────────────────────────────────────────────
    # Free developer key from newsapi.org (100 req/day, localhost only)
    news_api_key:         str = ''
    news_default_country: str = 'in'   # ISO 2-letter country code

    # ── Smart Home agent (Home Assistant) ──────────────────────────────
    # Endpoint: e.g. http://homeassistant.local:8123
    # Token: long-lived access token from HA profile page
    myhome_mcp_endpoint: str = 'http://homeassistant.local:8123'
    myhome_mcp_token:    str = ''

    # ── Portfolio agent (INDmoney Broker MCP) ──────────────────────────
    # MCP server — default is INDmoney's public MCP endpoint
    indmoney_mcp_endpoint: str = 'https://mcp.indmoney.com/mcp'
    # Bearer token — obtain from your INDmoney account / developer settings
    indmoney_token: str = ''

    # ── WhatsApp agent (Meta Cloud API) ────────────────────────────────
    # phone_number_id: from Meta Developer Console → WhatsApp → API Setup
    # access_token:    permanent system user token or temporary test token (24 h)
    # webhook_verify_token: custom string you set in Meta's webhook config
    # app_secret:      Meta app secret — validates X-Hub-Signature-256 on webhooks
    # contacts:        "Name: +E164number" lines, one per line
    whatsapp_phone_number_id:      str = ''
    whatsapp_access_token:         str = ''
    whatsapp_webhook_verify_token: str = 'robo-whatsapp-verify'
    whatsapp_app_secret:           str = ''
    whatsapp_contacts:             str = ''

    # ── Cloudflare Tunnel ───────────────────────────────────────────────
    # Base domain for the WhatsApp webhook tunnel.
    # If set, callback URL becomes https://whatsapp.<CLOUDFLARE_DOMAIN>.
    # Not sensitive — domain name is returned to the UI for display purposes.
    cloudflare_domain: str = ''


settings = Settings()
