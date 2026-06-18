from __future__ import annotations

import httpx

VOICE_SYSTEM_PROMPT = (
    'You are Robo, a helpful AI voice assistant. '
    'You answer only general knowledge questions. '
    'You have no access to the user\'s personal data or real-time information — '
    'those come exclusively from connected agents. '
    'Reply in 1–3 short sentences. No markdown, no bullet points — plain spoken language only.'
)


class LLMService:
    """Thin async wrapper over multiple LLM providers. Returns plain text or None on failure."""

    async def complete(
        self,
        user_message: str,
        llm_config: dict,
        system_prompt: str = VOICE_SYSTEM_PROMPT,
        max_tokens: int = 250,
        temperature: float = 0.7,
    ) -> str | None:
        provider = (llm_config.get('provider') or 'openai').lower()
        api_key  = (llm_config.get('api_key')  or '').strip()
        model    = (llm_config.get('model')     or '').strip()
        base_url = (llm_config.get('base_url')  or '').strip().rstrip('/')

        try:
            if provider == 'openai':
                return await self._openai_compat(
                    system_prompt, user_message, api_key,
                    model or 'gpt-4o-mini',
                    base_url or 'https://api.openai.com',
                    max_tokens, temperature,
                )
            if provider == 'ollama':
                return await self._openai_compat(
                    system_prompt, user_message, '',
                    model or 'llama3',
                    base_url or 'http://localhost:11434',
                    max_tokens, temperature,
                )
            if provider == 'anthropic':
                return await self._anthropic(
                    system_prompt, user_message,
                    api_key, model or 'claude-haiku-4-5-20251001', max_tokens, temperature,
                )
            if provider == 'gemini':
                return await self._gemini(
                    system_prompt, user_message,
                    api_key, model or 'gemini-2.0-flash', max_tokens, temperature,
                )
        except Exception:
            return None
        return None

    # ── OpenAI / Ollama (OpenAI-compatible) ──────────────────────────────────

    async def _openai_compat(
        self,
        system: str,
        user: str,
        api_key: str,
        model: str,
        base_url: str,
        max_tokens: int,
        temperature: float = 0.7,
    ) -> str | None:
        headers: dict = {'Content-Type': 'application/json'}
        if api_key:
            headers['Authorization'] = f'Bearer {api_key}'
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                f'{base_url}/v1/chat/completions',
                headers=headers,
                json={
                    'model': model,
                    'messages': [
                        {'role': 'system', 'content': system},
                        {'role': 'user',   'content': user},
                    ],
                    'max_tokens': max_tokens,
                    'temperature': temperature,
                },
            )
            if r.status_code == 200:
                return r.json()['choices'][0]['message']['content'].strip() or None
        return None

    # ── Anthropic ─────────────────────────────────────────────────────────────

    async def _anthropic(
        self, system: str, user: str, api_key: str, model: str, max_tokens: int,
        temperature: float = 0.7,
    ) -> str | None:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                'https://api.anthropic.com/v1/messages',
                headers={
                    'x-api-key':          api_key,
                    'anthropic-version':  '2023-06-01',
                    'content-type':       'application/json',
                },
                json={
                    'model':       model,
                    'system':      system,
                    'messages':    [{'role': 'user', 'content': user}],
                    'max_tokens':  max_tokens,
                    'temperature': temperature,
                },
            )
            if r.status_code == 200:
                return r.json()['content'][0]['text'].strip() or None
        return None

    # ── Google Gemini ─────────────────────────────────────────────────────────

    async def _gemini(
        self, system: str, user: str, api_key: str, model: str, max_tokens: int,
        temperature: float = 0.7,
    ) -> str | None:
        combined = f'{system}\n\nUser: {user}'
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
                params={'key': api_key},
                json={
                    'contents':         [{'parts': [{'text': combined}]}],
                    'generationConfig': {'maxOutputTokens': max_tokens, 'temperature': temperature},
                },
            )
            if r.status_code == 200:
                text = r.json()['candidates'][0]['content']['parts'][0]['text'].strip()
                return text or None
        return None


# Module-level singleton shared across agents
llm_service = LLMService()
