from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class GatewayClient:
    """
    HTTP client for the MCP Gateway (default: apps/mcp-gateway, port 8788).

    The gateway owns all tool credentials in its own .env — this client
    does NOT forward credentials per-call.  It authenticates with a single
    Bearer token (GATEWAY_API_TOKEN) that matches the gateway's configuration.

    To point at an external gateway, change GATEWAY_URL and GATEWAY_API_TOKEN
    in the orchestrator .env — no other code changes needed.
    """

    def __init__(self, base_url: str, api_token: str = '', timeout: float = 30.0) -> None:
        self._base    = base_url.rstrip('/')
        self._token   = api_token
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        """Return the shared persistent client, creating it on first use."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(connect=5.0, read=self._timeout, write=10.0, pool=5.0),
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            )
        return self._client

    def _headers(self) -> dict:
        if self._token:
            return {'Authorization': f'Bearer {self._token}'}
        return {}

    async def health(self) -> dict:
        r = await self._get_client().get(f'{self._base}/health', headers=self._headers(), timeout=5.0)
        r.raise_for_status()
        return r.json()

    async def list_tools(self) -> list[dict]:
        try:
            r = await self._get_client().get(f'{self._base}/tools', headers=self._headers())
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            logger.warning('Gateway list_tools failed: %s', exc)
            return []

    async def update_google_session(self, access_token: str, refresh_token: str = '') -> bool:
        """Push a per-session Google OAuth token to the gateway (in-memory only)."""
        try:
            r = await self._get_client().put(
                f'{self._base}/session/google',
                json={'access_token': access_token, 'refresh_token': refresh_token},
                headers=self._headers(), timeout=5.0,
            )
            return r.is_success and r.json().get('configured', False)
        except Exception:
            return False

    async def update_smarthome_session(self, endpoint: str, token: str) -> bool:
        """Push per-session SmartHome credentials to the gateway (in-memory only)."""
        try:
            r = await self._get_client().put(
                f'{self._base}/session/smarthome',
                json={'endpoint': endpoint, 'token': token},
                headers=self._headers(), timeout=5.0,
            )
            return r.is_success and r.json().get('configured', False)
        except Exception:
            return False

    async def update_weather_session(self, api_key: str, default_city: str, provider: str) -> bool:
        try:
            r = await self._get_client().put(
                f'{self._base}/session/weather',
                json={'api_key': api_key, 'default_city': default_city, 'provider': provider},
                headers=self._headers(), timeout=5.0,
            )
            return r.is_success
        except Exception:
            return False

    async def update_github_session(self, token: str) -> bool:
        try:
            r = await self._get_client().put(
                f'{self._base}/session/github',
                json={'token': token},
                headers=self._headers(), timeout=5.0,
            )
            return r.is_success and r.json().get('configured', False)
        except Exception:
            return False

    async def update_news_session(self, api_key: str, default_country: str) -> bool:
        try:
            r = await self._get_client().put(
                f'{self._base}/session/news',
                json={'api_key': api_key, 'default_country': default_country},
                headers=self._headers(), timeout=5.0,
            )
            return r.is_success
        except Exception:
            return False

    async def update_whatsapp_session(
        self,
        phone_number_id: str,
        access_token: str,
        webhook_verify_token: str,
        contacts: str,
    ) -> bool:
        try:
            r = await self._get_client().put(
                f'{self._base}/session/whatsapp',
                json={
                    'phone_number_id':      phone_number_id,
                    'access_token':         access_token,
                    'webhook_verify_token': webhook_verify_token,
                    'contacts':             contacts,
                },
                headers=self._headers(), timeout=5.0,
            )
            return r.is_success and r.json().get('configured', False)
        except Exception:
            return False

    async def update_portfolio_session(
        self,
        client_id: str,
        client_secret: str,
        access_token: str,
        refresh_token: str,
        expires_at: int,
    ) -> bool:
        try:
            r = await self._get_client().put(
                f'{self._base}/session/portfolio',
                json={
                    'client_id':     client_id,
                    'client_secret': client_secret,
                    'access_token':  access_token,
                    'refresh_token': refresh_token,
                    'expires_at':    expires_at,
                },
                headers=self._headers(), timeout=5.0,
            )
            return r.is_success and r.json().get('configured', False)
        except Exception:
            return False

    async def update_socialmedia_session(self, accounts_json: str) -> bool:
        """Push per-session social media accounts to the gateway (in-memory only)."""
        try:
            r = await self._get_client().put(
                f'{self._base}/session/socialmedia',
                json={'accounts': accounts_json},
                headers=self._headers(), timeout=5.0,
            )
            return r.is_success and r.json().get('configured', False)
        except Exception:
            return False

    async def update_dhan_session(self, trade_enabled: bool = False) -> bool:
        """Push Dhan trade-mode flag to the gateway (OAuth token lives in gateway)."""
        try:
            r = await self._get_client().put(
                f'{self._base}/session/dhan',
                json={'trade_enabled': trade_enabled},
                headers=self._headers(), timeout=5.0,
            )
            return r.is_success
        except Exception:
            return False

    async def update_zerodha_session(self, trade_enabled: bool = False) -> bool:
        """Push Zerodha trade-mode flag to the gateway (OAuth token lives in gateway)."""
        try:
            r = await self._get_client().put(
                f'{self._base}/session/zerodha',
                json={'trade_enabled': trade_enabled},
                headers=self._headers(), timeout=5.0,
            )
            return r.is_success
        except Exception:
            return False

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        r = await self._get_client().post(
            f'{self._base}/tools/{tool_name}',
            json={'arguments': arguments},
            headers=self._headers(),
        )
        if r.status_code == 401:
            raise PermissionError(r.json().get('detail', 'Unauthorized'))
        if r.status_code == 404:
            raise ValueError(r.json().get('detail', f'Unknown tool: {tool_name}'))
        if not r.is_success:
            try:
                detail = r.json().get('detail', r.text[:300])
            except Exception:
                detail = r.text[:300]
            raise RuntimeError(detail)
        return r.json().get('result')
