from __future__ import annotations

import json
import httpx


# ── System prompt ─────────────────────────────────────────────────────────────

def _make_system_prompt(name: str, language: str = 'en') -> str:
    base = (
        f'You are {name}, a voice assistant. '
        'Your role is synthesis only: receive data from tools, speak it naturally. '
        'You have NO built-in knowledge of the user\'s personal world. '
        'For anything about the user\'s systems or live data '
        '(time, date, weather, news, calendar events, emails, GitHub, stocks, system stats, '
        'smart home devices, lights, switches, locks, climate, scenes) '
        'you MUST call the appropriate tool — never answer from your own knowledge. '
        'If the user asks to control or query a smart device, ALWAYS call the smarthome tool. '
        'Only answer directly for pure general knowledge (maths, definitions, history). '
        'Replies: 1–3 sentences, no markdown, no bullet points, plain spoken language. '
    )
    if language == 'hi':
        base += (
            'IMPORTANT: The user is speaking Hindi. '
            'Respond entirely in Hindi using Devanagari script. '
            'Do not mix English words unless they are technical proper nouns (e.g. API, CPU).'
        )
    else:
        base += 'IMPORTANT: Always respond in English unless the user explicitly asks otherwise.'
    return base


# ── Provider-specific tool format builders ────────────────────────────────────

def _openai_tool(agent_id: str, meta: dict) -> dict:
    return {
        'type': 'function',
        'function': {
            'name': agent_id,
            'description': meta['description'],
            'parameters': {
                'type': 'object',
                'properties': {
                    'query': {'type': 'string', 'description': meta['query_hint']},
                },
                'required': ['query'],
            },
        },
    }


def _anthropic_tool(agent_id: str, meta: dict) -> dict:
    return {
        'name': agent_id,
        'description': meta['description'],
        'input_schema': {
            'type': 'object',
            'properties': {
                'query': {'type': 'string', 'description': meta['query_hint']},
            },
            'required': ['query'],
        },
    }


def _gemini_tool(agent_id: str, meta: dict) -> dict:
    return {
        'name': agent_id,
        'description': meta['description'],
        'parameters': {
            'type': 'OBJECT',
            'properties': {
                'query': {'type': 'STRING', 'description': meta['query_hint']},
            },
            'required': ['query'],
        },
    }


def _build_tools(
    enabled_agents: list[str],
    agents: dict,
    gateway_tools: dict | None = None,
) -> dict:
    """Return {tool_id: tool_meta} merging local agents and gateway tools."""
    local: dict = {}
    for aid in enabled_agents:
        if aid not in agents or agents[aid].tool_meta is None:
            continue
        local[aid] = agents[aid].tool_meta

    if gateway_tools:
        local.update(gateway_tools)
    return local


# ── Orchestrator ──────────────────────────────────────────────────────────────

class LLMOrchestrator:
    """
    Strict tool-only orchestrator.

    The LLM is the synthesis layer only — it has no direct access to user data.
    ALL live data flows exclusively through agent tool calls.

    Flow:
      1. Send user message to LLM with all enabled agent tools.
      2. LLM calls the appropriate tool(s) → agents fetch live data.
      3. LLM synthesizes a natural spoken response from the tool results.
    """

    async def handle(
        self,
        user_message: str,
        llm_config: dict,
        enabled_agents: list[str],
        agents: dict,
        call_agent: object,
        assistant_name: str = 'Robo',
        gateway_tools: dict | None = None,
        language: str = 'en',
    ) -> tuple[str, str]:
        self._language = language
        provider = (llm_config.get('provider') or 'openai').lower()
        api_key  = (llm_config.get('api_key')  or '').strip()
        model    = (llm_config.get('model')     or '').strip()
        base_url = (llm_config.get('base_url')  or '').strip().rstrip('/')

        tools_available = _build_tools(enabled_agents, agents, gateway_tools)

        if provider in ('openai', 'ollama'):
            return await self._openai_handle(
                user_message, api_key,
                model or ('gpt-4o-mini' if provider == 'openai' else 'llama3'),
                base_url or ('https://api.openai.com' if provider == 'openai' else 'http://localhost:11434'),
                tools_available, call_agent, assistant_name,
            )
        if provider == 'anthropic':
            return await self._anthropic_handle(
                user_message, api_key,
                model or 'claude-haiku-4-5-20251001',
                tools_available, call_agent, assistant_name,
            )
        if provider == 'gemini':
            return await self._gemini_handle(
                user_message, api_key,
                model or 'gemini-2.0-flash',
                tools_available, call_agent, assistant_name,
            )

        return "I don't recognise the configured AI provider. Please check Settings → AI.", 'error'

    # ── OpenAI / Ollama ───────────────────────────────────────────────────────

    async def _openai_handle(
        self,
        message: str,
        api_key: str,
        model: str,
        base_url: str,
        tools_available: dict,
        call_agent: object,
        assistant_name: str = 'Robo',
    ) -> tuple[str, str]:
        headers: dict = {'Content-Type': 'application/json'}
        if api_key:
            headers['Authorization'] = f'Bearer {api_key}'

        tools    = [_openai_tool(aid, meta) for aid, meta in tools_available.items()]
        messages = [
            {'role': 'system', 'content': _make_system_prompt(assistant_name, language=getattr(self, '_language', 'en'))},
            {'role': 'user',   'content': message},
        ]

        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                f'{base_url}/v1/chat/completions',
                headers=headers,
                json={
                    'model':       model,
                    'messages':    messages,
                    'tools':       tools,
                    'tool_choice': 'auto',
                    'max_tokens':  300,
                    'temperature': 0.5,
                },
            )
            r.raise_for_status()
            data = r.json()

        choice = data['choices'][0]
        msg    = choice['message']

        if choice.get('finish_reason') != 'tool_calls' or not msg.get('tool_calls'):
            return (msg.get('content') or '').strip(), 'general'

        messages.append(msg)
        agent_used = 'general'
        for tc in msg['tool_calls']:
            fn_name = tc['function']['name']
            try:
                args = json.loads(tc['function']['arguments'])
            except Exception:
                args = {}
            query       = args.get('query', message)
            tool_result = await call_agent(fn_name, query)
            agent_used  = fn_name
            messages.append({
                'role':         'tool',
                'tool_call_id': tc['id'],
                'content':      tool_result,
            })

        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                f'{base_url}/v1/chat/completions',
                headers=headers,
                json={'model': model, 'messages': messages, 'max_tokens': 200, 'temperature': 0.5},
            )
            r.raise_for_status()
            data = r.json()

        text = (data['choices'][0]['message'].get('content') or '').strip()
        return text, agent_used

    # ── Anthropic ─────────────────────────────────────────────────────────────

    async def _anthropic_handle(
        self,
        message: str,
        api_key: str,
        model: str,
        tools_available: dict,
        call_agent: object,
        assistant_name: str = 'Robo',
    ) -> tuple[str, str]:
        tools        = [_anthropic_tool(aid, meta) for aid, meta in tools_available.items()]
        base_headers = {
            'x-api-key':         api_key,
            'anthropic-version': '2023-06-01',
            'content-type':      'application/json',
        }
        system_prompt = _make_system_prompt(assistant_name, language=getattr(self, '_language', 'en'))

        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                'https://api.anthropic.com/v1/messages',
                headers=base_headers,
                json={
                    'model':      model,
                    'system':     system_prompt,
                    'messages':   [{'role': 'user', 'content': message}],
                    'tools':      tools,
                    'max_tokens': 300,
                },
            )
            r.raise_for_status()
            data = r.json()

        content     = data.get('content', [])
        stop_reason = data.get('stop_reason')

        if stop_reason != 'tool_use':
            text = next((b['text'] for b in content if b.get('type') == 'text'), '')
            return text.strip(), 'general'

        tool_results = []
        agent_used   = 'general'
        for block in content:
            if block.get('type') != 'tool_use':
                continue
            query       = block['input'].get('query', message)
            tool_result = await call_agent(block['name'], query)
            agent_used  = block['name']
            tool_results.append({
                'type':        'tool_result',
                'tool_use_id': block['id'],
                'content':     tool_result,
            })

        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                'https://api.anthropic.com/v1/messages',
                headers=base_headers,
                json={
                    'model':    model,
                    'system':   system_prompt,
                    'messages': [
                        {'role': 'user',      'content': message},
                        {'role': 'assistant', 'content': content},
                        {'role': 'user',      'content': tool_results},
                    ],
                    'max_tokens': 200,
                },
            )
            r.raise_for_status()
            data = r.json()

        text = next((b['text'] for b in data.get('content', []) if b.get('type') == 'text'), '')
        return text.strip(), agent_used

    # ── Google Gemini ─────────────────────────────────────────────────────────

    async def _gemini_handle(
        self,
        message: str,
        api_key: str,
        model: str,
        tools_available: dict,
        call_agent: object,
        assistant_name: str = 'Robo',
    ) -> tuple[str, str]:
        tool_defs     = [_gemini_tool(aid, meta) for aid, meta in tools_available.items()]
        base_url      = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
        system_prompt = _make_system_prompt(assistant_name, language=getattr(self, '_language', 'en'))

        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                base_url, params={'key': api_key},
                json={
                    'system_instruction': {'parts': [{'text': system_prompt}]},
                    'contents':           [{'role': 'user', 'parts': [{'text': message}]}],
                    'tools':              [{'function_declarations': tool_defs}],
                    'generationConfig':   {'maxOutputTokens': 300},
                },
            )
            r.raise_for_status()
            data = r.json()

        parts      = data['candidates'][0]['content']['parts']
        func_calls = [p for p in parts if 'functionCall' in p]

        if not func_calls:
            text = next((p.get('text', '') for p in parts if 'text' in p), '')
            return text.strip(), 'general'

        contents = [
            {'role': 'user',  'parts': [{'text': message}]},
            {'role': 'model', 'parts': parts},
        ]
        func_responses = []
        agent_used     = 'general'
        for fc in func_calls:
            fn          = fc['functionCall']
            tool_result = await call_agent(fn['name'], fn['args'].get('query', message))
            agent_used  = fn['name']
            func_responses.append({
                'functionResponse': {
                    'name':     fn['name'],
                    'response': {'result': tool_result},
                },
            })
        contents.append({'role': 'user', 'parts': func_responses})

        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                base_url, params={'key': api_key},
                json={
                    'system_instruction': {'parts': [{'text': system_prompt}]},
                    'contents':           contents,
                    'generationConfig':   {'maxOutputTokens': 200},
                },
            )
            r.raise_for_status()
            data = r.json()

        parts = data['candidates'][0]['content']['parts']
        text  = next((p.get('text', '') for p in parts if 'text' in p), '')
        return text.strip(), agent_used


llm_orchestrator = LLMOrchestrator()
