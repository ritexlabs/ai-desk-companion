from __future__ import annotations

import json
import httpx

# ── Tool definitions (agents exposed to the LLM) ─────────────────────────────

_AGENT_TOOL_META: dict[str, dict] = {
    'weather': {
        'description': 'Get current weather conditions, temperature, humidity, wind, or forecast for any city.',
        'query_hint':  'The weather query, e.g. "weather in Mumbai" or "Delhi forecast tomorrow"',
    },
    'system': {
        'description': 'Get the current time, date, day of the week, timezone, or OS/hardware/CPU/memory info.',
        'query_hint':  'The system query, e.g. "what time is it" or "current date" or "CPU usage"',
    },
    'calendar': {
        'description': 'Get upcoming meetings, events, appointments, or free time slots from Google Calendar.',
        'query_hint':  'The calendar query, e.g. "meetings today" or "what is on my schedule this week"',
    },
    'email': {
        'description': 'Read Gmail inbox, check unread emails, get message summaries or sender information.',
        'query_hint':  'The email query, e.g. "unread emails" or "emails from John today"',
    },
    'github': {
        'description': 'Get GitHub pull requests, issues, commits, branch info, or CI/CD workflow status.',
        'query_hint':  'The GitHub query, e.g. "open pull requests" or "recent commits on main"',
    },
    'stock': {
        'description': 'Get live stock prices and market indices like Nifty 50, Sensex, S&P 500, or Dow Jones.',
        'query_hint':  'The stock query, e.g. "Nifty 50 today" or "price of RELIANCE"',
    },
    'news': {
        'description': 'Get latest news headlines, breaking news, or top stories by country or topic.',
        'query_hint':  'The news query, e.g. "top India news today" or "news about cricket"',
    },
    'smarthome': {
        'description': (
            'Control and query smart home devices via Home Assistant. '
            'ALWAYS use this tool for ANY request involving lights, switches, fans, covers, locks, '
            'climate/thermostat, scenes, sensors, or any connected smart device. '
            'Use it to turn devices on or off, dim lights, change colors, set temperatures, '
            'activate scenes, or list device states. '
            'Never answer smart home questions from your own knowledge — always call this tool.'
        ),
        'query_hint': (
            'The full smart home command or question, e.g. '
            '"turn off light 1", "how many lights are on", '
            '"set living room brightness to 50%", "lock the front door", "activate movie scene"'
        ),
    },
}

# ── System prompt ─────────────────────────────────────────────────────────────
#
# The LLM is a pure synthesis layer. It has ZERO built-in knowledge of the
# user's personal systems. Every piece of live data (time, date, weather, news,
# calendar, email, stocks, GitHub, system metrics) MUST come through a tool.
# The only exception is true general knowledge (maths, definitions, history)
# where no connected system holds the answer.

def _make_system_prompt(name: str) -> str:
    return (
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
        'IMPORTANT: Always respond in English. Do not switch to another language unless the user explicitly asks you to.'
    )


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


# ── Orchestrator ──────────────────────────────────────────────────────────────

class LLMOrchestrator:
    """
    Strict tool-only orchestrator.

    The LLM is the synthesis layer only — it has no direct access to user data.
    ALL live data (time, weather, news, calendar, email, stocks, GitHub, system)
    flows exclusively through agent tool calls.

    Flow:
      1. Send user message to LLM with all enabled agent tools.
      2. LLM calls the appropriate tool(s) → agents fetch live data.
      3. LLM synthesizes a natural spoken response from the tool results.
      4. If the LLM provider call fails → return a clear error (no plain-LLM bypass).
    """

    async def handle(
        self,
        user_message: str,
        llm_config: dict,
        enabled_agents: list[str],
        call_agent: object,  # async callable (agent_id: str, query: str) -> str
        calling_name: str = 'Robo',
    ) -> tuple[str, str]:
        """
        Returns (response_text, primary_agent_used).
        primary_agent_used is 'general' when the LLM answered a non-tool query directly.
        """
        provider = (llm_config.get('provider') or 'openai').lower()
        api_key  = (llm_config.get('api_key')  or '').strip()
        model    = (llm_config.get('model')     or '').strip()
        base_url = (llm_config.get('base_url')  or '').strip().rstrip('/')

        tools_available = {
            aid: _AGENT_TOOL_META[aid]
            for aid in enabled_agents
            if aid in _AGENT_TOOL_META
        }

        if provider in ('openai', 'ollama'):
            return await self._openai_handle(
                user_message, api_key,
                model or ('gpt-4o-mini' if provider == 'openai' else 'llama3'),
                base_url or ('https://api.openai.com' if provider == 'openai' else 'http://localhost:11434'),
                tools_available, call_agent, calling_name,
            )
        if provider == 'anthropic':
            return await self._anthropic_handle(
                user_message, api_key,
                model or 'claude-haiku-4-5-20251001',
                tools_available, call_agent, calling_name,
            )
        if provider == 'gemini':
            return await self._gemini_handle(
                user_message, api_key,
                model or 'gemini-2.0-flash',
                tools_available, call_agent, calling_name,
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
        calling_name: str = 'Robo',
    ) -> tuple[str, str]:
        headers: dict = {'Content-Type': 'application/json'}
        if api_key:
            headers['Authorization'] = f'Bearer {api_key}'

        tools    = [_openai_tool(aid, meta) for aid, meta in tools_available.items()]
        messages = [
            {'role': 'system', 'content': _make_system_prompt(calling_name)},
            {'role': 'user',   'content': message},
        ]

        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                f'{base_url}/v1/chat/completions',
                headers=headers,
                json={
                    'model':        model,
                    'messages':     messages,
                    'tools':        tools,
                    'tool_choice':  'auto',
                    'max_tokens':   300,
                    'temperature':  0.5,
                },
            )
            r.raise_for_status()
            data = r.json()

        choice = data['choices'][0]
        msg    = choice['message']

        # LLM answered directly (general knowledge — maths, facts, etc.)
        if choice.get('finish_reason') != 'tool_calls' or not msg.get('tool_calls'):
            return (msg.get('content') or '').strip(), 'general'

        # Execute tool calls
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

        # Synthesis call — LLM only sees tool results, no raw user data
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
        calling_name: str = 'Robo',
    ) -> tuple[str, str]:
        tools        = [_anthropic_tool(aid, meta) for aid, meta in tools_available.items()]
        base_headers = {
            'x-api-key':         api_key,
            'anthropic-version': '2023-06-01',
            'content-type':      'application/json',
        }
        system_prompt = _make_system_prompt(calling_name)

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

        # LLM answered directly (general knowledge)
        if stop_reason != 'tool_use':
            text = next((b['text'] for b in content if b.get('type') == 'text'), '')
            return text.strip(), 'general'

        # Execute tool calls
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

        # Synthesis call
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
        calling_name: str = 'Robo',
    ) -> tuple[str, str]:
        tool_defs     = [_gemini_tool(aid, meta) for aid, meta in tools_available.items()]
        base_url      = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
        system_prompt = _make_system_prompt(calling_name)

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

        # LLM answered directly (general knowledge)
        if not func_calls:
            text = next((p.get('text', '') for p in parts if 'text' in p), '')
            return text.strip(), 'general'

        # Execute tool calls
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

        # Synthesis call
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


# Module-level singleton
llm_orchestrator = LLMOrchestrator()
