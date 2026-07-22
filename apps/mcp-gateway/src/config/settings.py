from __future__ import annotations

import logging
import re
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_log = logging.getLogger(__name__)


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

    # ── My Stocks (Google Sheet portfolio) ───────────────────────────────────
    # Google Sheet ID from the URL: docs.google.com/spreadsheets/d/<ID>/edit
    mystocks_spreadsheet_id: str = ''
    # Sheet range to read — default reads all columns. Change to e.g. 'Sheet1!A:H'
    # if your portfolio is not on the first sheet.
    mystocks_range:           str = 'A:Z'

    # ── Dhan Broker (MCP at https://mcp.dhan.co/mcp) ─────────────────────────
    # Authentication is via Dhan's OAuth flow — no manual token entry required.
    # These are populated automatically by the /auth/dhan OAuth callback.
    dhan_oauth_client_id:     str   = ''    # dynamic client-registration ID
    dhan_oauth_client_secret: str   = ''    # dynamic client-registration secret
    dhan_access_token:        str   = ''    # OAuth access token (set by callback)
    dhan_refresh_token:       str   = ''    # OAuth refresh token (set by callback)
    dhan_token_expires_at:    float = 0.0   # epoch seconds
    # Set to true only when the user explicitly enables trading from the UI.
    # Never default to true — live orders are executed immediately.
    dhan_trade_enabled:       bool  = False

    # ── Zerodha Broker (MCP at https://mcp.kite.trade/mcp) ───────────────────
    # Authentication is via Zerodha's Kite OAuth flow — no manual token entry required.
    # These are populated automatically by the /auth/zerodha OAuth callback.
    zerodha_oauth_client_id:     str   = ''    # dynamic client-registration ID
    zerodha_oauth_client_secret: str   = ''    # dynamic client-registration secret
    zerodha_access_token:        str   = ''    # OAuth access token (set by callback)
    zerodha_refresh_token:       str   = ''    # OAuth refresh token (set by callback)
    zerodha_token_expires_at:    float = 0.0   # epoch seconds
    # Set to true only when the user explicitly enables trading from the UI.
    # Never default to true — live orders are executed immediately.
    zerodha_trade_enabled:       bool  = False

    # ── Social Media ──────────────────────────────────────────────────────────
    # JSON array of account objects — set per-session via PUT /session/socialmedia.
    # Schema: [{"id":"..","platform":"youtube"|"instagram","label":"..","token":"..","channelId":"..","enabled":true}]
    social_accounts: str = ''

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

    def is_mystocks_configured(self) -> bool:
        return bool(self.mystocks_spreadsheet_id and self.google_access_token)

    def is_dhan_configured(self) -> bool:
        return bool(self.dhan_access_token)

    def is_zerodha_configured(self) -> bool:
        return bool(self.zerodha_access_token)

    def auth_enabled(self) -> bool:
        return bool(self.gateway_api_token)

    def persist_to_env(self, updates: dict[str, str]) -> None:
        """Write key=value pairs into the .env file, creating or updating entries."""
        env_path = Path('.env')
        try:
            text = env_path.read_text(encoding='utf-8') if env_path.exists() else ''
        except OSError:
            _log.warning('persist_to_env: could not read .env')
            return
        lines = text.splitlines(keepends=True)
        for key, val in updates.items():
            upper = key.upper()
            pattern = re.compile(rf'^#?\s*{re.escape(upper)}\s*=.*$', re.MULTILINE)
            new_line = f'{upper}={val}\n'
            if pattern.search(text):
                text = pattern.sub(new_line.rstrip('\n'), text)
            else:
                text = text.rstrip('\n') + f'\n{new_line}'
            lines = text.splitlines(keepends=True)
        try:
            env_path.write_text(''.join(lines) if lines else text, encoding='utf-8')
        except OSError:
            _log.warning('persist_to_env: could not write .env')


settings = GatewaySettings()
