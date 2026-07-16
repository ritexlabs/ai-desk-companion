from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class GatewaySettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore',
    )

    # ── Server ────────────────────────────────────────────────────────────────
    gateway_port: int = 8788
    gateway_host: str = '0.0.0.0'

    # Bearer token that callers (orchestrator, external clients) must present.
    # If empty, auth is disabled (dev mode — set a strong token in production).
    gateway_api_token: str = ''

    # ── GitHub ────────────────────────────────────────────────────────────────
    github_token: str = ''

    # ── Weather ───────────────────────────────────────────────────────────────
    # Defaults to Open-Meteo (free, no key required).
    # Set a key and change provider to 'openweathermap' or 'weatherapi'.
    weather_api_key: str = ''
    weather_provider: str = 'open_meteo'    # open_meteo | openweathermap | weatherapi
    weather_default_city: str = 'Bengaluru'

    # ── News ──────────────────────────────────────────────────────────────────
    # Free developer key from gnews.io (100 req/day).
    news_api_key: str = ''
    news_default_country: str = 'in'        # ISO 3166-1 alpha-2

    # ── Stock Market ──────────────────────────────────────────────────────────
    # No API key required — uses yfinance (Yahoo Finance, free).
    stock_default_market: str = 'IN'        # IN (NSE tickers) | US (NYSE/NASDAQ)

    # ── Google (Calendar + Gmail) ─────────────────────────────────────────────
    # Obtain tokens by running the Google OAuth flow once:
    #   python3 -c "from src.auth.google_oauth import run_oauth; run_oauth()"
    # Or paste the access/refresh token from your Google account directly.
    google_access_token: str = ''
    google_refresh_token: str = ''
    google_client_id: str = ''
    google_client_secret: str = ''

    # ── Smart Home (Home Assistant via hass-mcp Docker) ──────────────────────────
    # Local or Nabu Casa cloud URL of your Home Assistant instance.
    myhome_mcp_endpoint: str = 'http://homeassistant.local:8123'
    # Long-lived access token — HA Profile → Long-lived access tokens → Create Token
    myhome_mcp_token: str = ''

    # ── WhatsApp (Meta Cloud API) ─────────────────────────────────────────────
    whatsapp_phone_number_id:      str = ''
    whatsapp_access_token:         str = ''
    whatsapp_webhook_verify_token: str = 'robo-whatsapp-verify'
    # App Secret — used to validate X-Hub-Signature-256 on incoming webhooks.
    # Leave blank to skip validation (insecure; only for local dev).
    whatsapp_app_secret:           str = ''
    # One "Name: +E164number" entry per line, e.g. "Mom: +919876543210"
    whatsapp_contacts:             str = ''

    # ── Cloudflare Tunnel ─────────────────────────────────────────────────────
    # Named tunnel ID or name (from `cloudflared tunnel list`).
    # Leave blank to use quick tunnel (auto URL) or hostname mode.
    cloudflare_tunnel_name:   str = ''
    # Public domain/subdomain that Cloudflare routes to this gateway.
    # Set automatically by quick-tunnel mode; set manually for named/hostname mode.
    whatsapp_webhook_domain:  str = ''

    # ── INDmoney Portfolio ─────────────────────────────────────────────────────
    # MCP endpoint — fixed to INDmoney's public server (SSRF constraint).
    indmoney_mcp_url:      str = 'https://mcp.indmoney.com/mcp'
    # OAuth 2.0 credentials — obtain via the INDmoney OAuth flow.
    indmoney_client_id:     str = ''
    indmoney_client_secret: str = ''
    # JSON string: {"access_token": "...", "refresh_token": "...", "expires_at": 0}
    indmoney_oauth_token:   str = ''
    # Optional: tool name to expose (leave blank = auto-discover all tools)
    indmoney_display_tool:  str = ''

    # ── System metrics ────────────────────────────────────────────────────────
    # Comma-separated list of metric names to skip when collecting system info.
    # Metrics that may require elevated permissions or optional CLI tools are
    # disabled by default. Configure via Settings → Agents → System in the UI.
    system_disabled_metrics: str = 'temperature,disk_io,top_processes'

    # ── Helpers ───────────────────────────────────────────────────────────────

    def is_google_configured(self) -> bool:
        return bool(self.google_access_token)

    def is_github_configured(self) -> bool:
        return bool(self.github_token)

    def is_news_configured(self) -> bool:
        return bool(self.news_api_key)

    def is_smarthome_configured(self) -> bool:
        return bool(self.myhome_mcp_endpoint and self.myhome_mcp_token)

    def is_whatsapp_configured(self) -> bool:
        return bool(self.whatsapp_phone_number_id and self.whatsapp_access_token)

    def is_portfolio_configured(self) -> bool:
        return bool(self.indmoney_oauth_token)

    def auth_enabled(self) -> bool:
        return bool(self.gateway_api_token)


settings = GatewaySettings()
