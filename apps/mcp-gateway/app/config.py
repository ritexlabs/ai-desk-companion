from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class GatewaySettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore',
    )

    gateway_port: int = 8788
    gateway_host: str = '0.0.0.0'

    # ── INDmoney (Phase 2) ────────────────────────────────────────────
    # Tokens are injected per-call via the request body; the endpoint is fixed.
    indmoney_mcp_endpoint: str = 'https://mcp.indmoney.com/mcp'

    # ── GitHub (Phase 2) ──────────────────────────────────────────────
    github_token: str = ''

    # ── Weather (Phase 3b) ───────────────────────────────────────────
    weather_api_key: str = ''
    weather_provider: str = 'open_meteo'

    # ── News (Phase 3b) ──────────────────────────────────────────────
    news_api_key: str = ''
    news_default_country: str = 'in'


settings = GatewaySettings()
