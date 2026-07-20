from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from src.config.settings import settings
from src.tools.base import BaseTool

_YT_BASE = 'https://www.googleapis.com/youtube/v3'
_IG_BASE = 'https://graph.facebook.com/v21.0'


def _enabled_accounts() -> list[dict]:
    raw = (settings.social_accounts or '').strip()
    if not raw:
        return []
    try:
        return [a for a in json.loads(raw) if a.get('enabled') and a.get('token') and a.get('channelId')]
    except Exception:
        return []


def _fmt(n: int) -> str:
    if n >= 1_000_000:
        return f'{n / 1_000_000:.1f}M'
    if n >= 1_000:
        return f'{n / 1_000:.1f}K'
    return str(n)


class SocialMediaTool(BaseTool):
    """Unified social media tool — YouTube + Instagram across multiple accounts."""

    namespace = 'socialmedia'

    async def list_tools(self) -> list[dict]:
        return [
            {
                'name': 'get_24h_summary',
                'description': (
                    'Get a summary of social media activity across all connected channels '
                    'and accounts in the last 24 hours — new views, recent posts, likes. '
                    'Use for morning briefings, daily recaps, or social media performance questions.'
                ),
                'inputSchema': {'type': 'object', 'properties': {}},
            },
            {
                'name': 'get_account_stats',
                'description': (
                    'Get detailed statistics for all connected social media accounts: '
                    'subscriber counts, total views, follower counts, and video/post counts.'
                ),
                'inputSchema': {'type': 'object', 'properties': {}},
            },
        ]

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        accounts = _enabled_accounts()
        if not accounts:
            return (
                'No social media accounts configured. '
                'Add accounts in Settings → Agents → Social Media.'
            )
        if tool_name == 'get_24h_summary':
            return await self._get_24h_summary(accounts)
        if tool_name == 'get_account_stats':
            return await self._get_account_stats(accounts)
        return f'Unknown social media tool: {tool_name}'

    # ── 24h summary ───────────────────────────────────────────────────

    async def _get_24h_summary(self, accounts: list[dict]) -> str:
        since   = datetime.now(timezone.utc) - timedelta(hours=24)
        results: list[str] = []

        async with httpx.AsyncClient(timeout=15.0) as client:
            for acc in accounts:
                platform = acc.get('platform', '')
                label    = acc.get('label', platform)
                token    = acc['token'].strip()
                cid      = acc['channelId'].strip()

                if platform == 'youtube':
                    line = await self._yt_24h(client, token, cid, label, since)
                elif platform == 'instagram':
                    line = await self._ig_24h(client, token, cid, label, since)
                else:
                    continue

                if line:
                    results.append(line)

        # Empty string signals the boot sequence to skip this agent's announcement
        return '; '.join(results)

    async def _yt_24h(
        self, client: httpx.AsyncClient, access_token: str, channel_id: str, label: str, since: datetime,
    ) -> str:
        """Use the uploads playlist instead of search.list — 1 quota unit vs 100."""
        headers = {'Authorization': f'Bearer {access_token}'}
        try:
            # Step 1: resolve the uploads playlist ID for this channel (1 unit)
            cr = await client.get(
                f'{_YT_BASE}/channels',
                params={'part': 'contentDetails', 'id': channel_id},
                headers=headers,
            )
            cr.raise_for_status()
            channel_items = cr.json().get('items', [])
            if not channel_items:
                return ''
            uploads_id = channel_items[0]['contentDetails']['relatedPlaylists']['uploads']

            # Step 2: fetch recent items from the uploads playlist (1 unit)
            pr = await client.get(
                f'{_YT_BASE}/playlistItems',
                params={'part': 'snippet', 'playlistId': uploads_id, 'maxResults': 50},
                headers=headers,
            )
            pr.raise_for_status()
            since_str = since.strftime('%Y-%m-%dT%H:%M:%SZ')
            recent_ids = [
                item['snippet']['resourceId']['videoId']
                for item in pr.json().get('items', [])
                if item.get('snippet', {}).get('publishedAt', '') >= since_str
                and 'resourceId' in item.get('snippet', {})
            ]

            new_views = 0
            if recent_ids:
                vr = await client.get(
                    f'{_YT_BASE}/videos',
                    params={'part': 'statistics', 'id': ','.join(recent_ids[:50])},
                    headers=headers,
                )
                vr.raise_for_status()
                for v in vr.json().get('items', []):
                    new_views += int(v.get('statistics', {}).get('viewCount', 0))

            if not recent_ids and not new_views:
                return ''
            parts: list[str] = []
            if recent_ids: parts.append(f'{len(recent_ids)} new video{"s" if len(recent_ids) != 1 else ""}')
            if new_views:  parts.append(f'{_fmt(new_views)} views')
            return f'{label}: {", ".join(parts)}'
        except httpx.HTTPStatusError as exc:
            return f'{label}: YouTube API error {exc.response.status_code}'
        except Exception as exc:
            return f'{label}: {str(exc)[:80]}'

    async def _ig_24h(
        self, client: httpx.AsyncClient, access_token: str, page_id: str, label: str, since: datetime,
    ) -> str:
        try:
            mr = await client.get(
                f'{_IG_BASE}/{page_id}/media',
                params={
                    'fields':       'like_count,comments_count,timestamp',
                    'since':        int(since.timestamp()),
                    'access_token': access_token,
                },
            )
            mr.raise_for_status()
            posts     = mr.json().get('data', [])
            new_likes = sum(p.get('like_count', 0) for p in posts)

            if not posts and not new_likes:
                return ''
            parts: list[str] = []
            if posts:      parts.append(f'{len(posts)} new post{"s" if len(posts) != 1 else ""}')
            if new_likes:  parts.append(f'{_fmt(new_likes)} likes')
            return f'{label}: {", ".join(parts)}'
        except httpx.HTTPStatusError as exc:
            return f'{label}: Instagram API error {exc.response.status_code}'
        except Exception as exc:
            return f'{label}: {str(exc)[:80]}'

    # ── Full account stats ─────────────────────────────────────────────

    async def _get_account_stats(self, accounts: list[dict]) -> str:
        lines: list[str] = []

        async with httpx.AsyncClient(timeout=15.0) as client:
            for acc in accounts:
                platform = acc.get('platform', '')
                label    = acc.get('label', platform)
                token    = acc['token'].strip()
                cid      = acc['channelId'].strip()

                if platform == 'youtube':
                    lines.append(await self._yt_stats(client, token, cid, label))
                elif platform == 'instagram':
                    lines.append(await self._ig_stats(client, token, cid, label))

        return '\n'.join(lines) if lines else 'No account data available.'

    async def _yt_stats(
        self, client: httpx.AsyncClient, access_token: str, channel_id: str, label: str,
    ) -> str:
        try:
            r = await client.get(
                f'{_YT_BASE}/channels',
                params={'part': 'statistics', 'id': channel_id},
                headers={'Authorization': f'Bearer {access_token}'},
            )
            r.raise_for_status()
            items = r.json().get('items', [])
            if not items:
                return f'{label} (YouTube): channel not found — verify the channel ID'
            stats = items[0].get('statistics', {})
            subs  = _fmt(int(stats.get('subscriberCount', 0)))
            views = _fmt(int(stats.get('viewCount', 0)))
            vids  = stats.get('videoCount', '?')
            return f'{label} (YouTube): {subs} subscribers · {views} total views · {vids} videos'
        except httpx.HTTPStatusError as exc:
            return f'{label} (YouTube): API error {exc.response.status_code} — check OAuth token'
        except Exception as exc:
            return f'{label} (YouTube): {str(exc)[:80]}'

    async def _ig_stats(
        self, client: httpx.AsyncClient, access_token: str, page_id: str, label: str,
    ) -> str:
        try:
            r = await client.get(
                f'{_IG_BASE}/{page_id}',
                params={'fields': 'name,followers_count,media_count', 'access_token': access_token},
            )
            r.raise_for_status()
            data      = r.json()
            name      = data.get('name', label)
            followers = _fmt(int(data.get('followers_count', 0)))
            media     = data.get('media_count', '?')
            return f'{name} (Instagram): {followers} followers · {media} posts'
        except httpx.HTTPStatusError as exc:
            return f'{label} (Instagram): API error {exc.response.status_code} — check your access token'
        except Exception as exc:
            return f'{label} (Instagram): {str(exc)[:80]}'
