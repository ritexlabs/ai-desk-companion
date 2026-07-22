from __future__ import annotations

import asyncio
import random

# ── Static phrase pools (all phrases extracted from session.py) ───────────────

_EN: dict[str, list[str]] = {
    'gw_connect': [
        'MCP gateway link established — tool matrix online.',
        'Secure tunnel to tool gateway confirmed — all channels open.',
        'Gateway handshake complete — external services armed.',
        'MCP bridge authenticated — routing layer active.',
        'Tool aggregator online — gateway API responding.',
        'Gateway protocol negotiated — data pipelines hot.',
        'Control plane connected — gateway ready to route.',
        'MCP transport layer up — tool mesh online.',
    ],
    'gw_fail': [
        'MCP gateway unreachable — tool network dark.',
        'Gateway link failed — external tools suspended.',
        'No response from MCP gateway — tool services offline.',
        'Gateway connection dropped — reverting to local agents.',
        'MCP bridge down — gateway tools unavailable.',
        'Handshake timeout — gateway unreachable on port 8788.',
        'Tool aggregator not responding — gateway circuit open.',
        'MCP control plane silent — external services suspended.',
    ],
    'agent_online': [
        '{label} module synchronized and online.',
        '{label} integration confirmed, link active.',
        '{label} service handshake complete.',
        '{label} pipeline connected and streaming.',
        '{label} bridge authenticated, ready to serve.',
        '{label} online, endpoints responding.',
        '{label} channel open and standing by.',
        '{label} node connected, live feed established.',
        '{label} interface wired and ready.',
        '{label} subsystem nominal, stream open.',
    ],
    'greeting': [
        '{tod}, {name}, wonderful to have you back.',
        "{tod}, {name}, I've been waiting for you.",
        "{tod}, {name}, it's great to have you back.",
        '{tod}, {name}, welcome back.',
        "{tod}, {name}, let's make this a productive session.",
        '{tod}, {name}, always a pleasure.',
        '{tod}, {name}, glad you are here.',
        '{tod}, {name}, good to see you again.',
        '{tod}, {name}, great to have you here.',
    ],
    'assembling': [
        'Assembling all agents — please stand by.',
        'Initialising agent network — one moment.',
        'Bringing all modules online — standby.',
        'Activating your command centre — just a moment.',
        'Spinning up the full agent matrix — hold on.',
        'Waking up all agents — this will only take a moment.',
        'Loading all systems — standby while I assemble the team.',
        'Agent initialisation in progress — please hold.',
    ],
    'boot_ready': [
        "All agents are online — I'm here to answer all your questions.",
        'Systems fully assembled — what can I do for you?',
        "All modules are live and standing by — I'm all ears.",
        'Agent network is complete — ready for your command.',
        'Everything is online and operational — ask me anything.',
        "All agents assembled and ready — what's on your mind?",
        "Your full team is online — I'm ready when you are.",
    ],
    'broker_connected': [
        'Your {broker} stock broker is now connected.',
        '{broker} trading account confirmed online.',
        'Your {broker} broker account is live and ready.',
        '{broker} broker link established — your account is active.',
        'Connected to your {broker} trading account.',
    ],
    'farewell': [
        'Goodbye! Have a wonderful day.',
        "Take care! I'll be here when you need me.",
        'Goodnight! Rest well.',
        'Farewell! It was a pleasure assisting you.',
        'See you soon! Powering down now.',
        "Goodbye! Don't hesitate to wake me up anytime.",
        'Goodnight! Sweet dreams.',
        'Until next time! Take care of yourself.',
        'Signing off now. Goodbye!',
        'It was great working with you. Goodbye!',
    ],
    'agent_online_local': ['{label} agent, online.'],
    'agent_degraded_local': ['{label} agent — configuration needed.'],
    'agent_failed_local': ['{label} agent failed to start.'],
    'boot_summary': [
        '{total_online} of {total} agent{plural} online and ready for your command.',
    ],
    'smarthome_starting': [
        'Smart Home bridge is starting — I will notify you when it comes online.',
    ],
    'smarthome_auth_error': [
        'Smart Home not configured — please add your Home Assistant token in Settings.',
    ],
    'smarthome_timeout': [
        'Smart Home took too long to connect. '
        'Verify your Home Assistant token and endpoint in Settings, '
        'and ensure the voska/hass-mcp container can reach your Home Assistant instance.',
    ],
    'google_connected': ['Google connected — {detail}.'],
    'google_online': ['Google integration online.'],
    'google_not_configured': ['Google not configured — credentials needed.'],
    'portfolio_auth_error': [
        'Portfolio offline — INDmoney token may have expired. '
        'Please reconnect in Settings to restore access.',
    ],
}

# Hindi fallback pool — partial (high-frequency phrases only)
_HI: dict[str, list[str]] = {
    'gw_connect':          ['MCP गेटवे से कनेक्शन सफल — टूल नेटवर्क सक्रिय।'],
    'gw_fail':             ['MCP गेटवे से कनेक्शन विफल — बाहरी सेवाएं बंद।'],
    'agent_online':        ['{label} ऑनलाइन और तैयार है।'],
    'greeting':            ['{tod}, {name}, आपका स्वागत है।'],
    'farewell':            ['अलविदा! जब जरूरत हो, मुझे जगाएं।'],
    'smarthome_starting':  ['स्मार्ट होम ब्रिज शुरू हो रहा है — ऑनलाइन होने पर सूचित करूंगा।'],
    'smarthome_auth_error':['स्मार्ट होम कॉन्फ़िगर नहीं — Settings में Home Assistant टोकन जोड़ें।'],
    'google_not_configured':['Google कनेक्ट नहीं — क्रेडेंशियल जरूरी हैं।'],
}

# LLM system prompts per category — used only when LLM is configured
_LLM_PROMPTS: dict[str, str] = {
    'agent_online': (
        'You are a futuristic sci-fi voice assistant. '
        'Generate exactly ONE excited 8-12 word announcement that {label} is now online. '
        'Plain text only. No markdown. No quotes.'
    ),
    'gw_connect': (
        'You are a futuristic AI. Generate exactly ONE short (8-14 word) announcement '
        'that the MCP tool gateway is now connected. Sci-fi tone. Plain text only.'
    ),
    'gw_fail': (
        'You are a futuristic AI. Generate exactly ONE short (8-14 word) announcement '
        'that the MCP tool gateway is unreachable. Concise. Plain text only.'
    ),
    'greeting': (
        'You are {assistant_name}, a warm AI voice assistant. '
        'Generate exactly ONE natural greeting for {name} at {tod}. '
        '8-14 words, spoken English, no markdown. '
        'Do NOT mention systems, agents, or readiness — just a warm personal welcome.'
    ),
    'assembling': (
        'You are {assistant_name}, a futuristic AI voice assistant. '
        'Generate exactly ONE short phrase (8-14 words) telling {name} that all agents are now '
        'starting up or assembling. Warm, natural, slightly sci-fi tone. Plain text only. No markdown.'
    ),
    'boot_ready': (
        'You are {assistant_name}, a warm futuristic AI. '
        '{total_online} of {total} agents are now online and assembled. '
        'Generate exactly ONE sentence (10-18 words) telling {name} that everything is online '
        'and you are ready to answer their questions. Warm, inviting, slightly sci-fi. '
        'Plain text only. No markdown.'
    ),
    'broker_connected': (
        'You are {assistant_name}, a warm futuristic AI. '
        'Generate exactly ONE sentence (8-14 words) announcing that the {broker} stock broker '
        'account is now connected and ready. Natural, slightly sci-fi. Plain text only. No markdown.'
    ),
    'farewell': (
        'You are {assistant_name}, a warm AI voice assistant saying goodbye to {name}. '
        'Generate exactly ONE short farewell (10-18 words). Match user\'s tone from: "{phrase}". '
        'Plain spoken English only. No markdown, no quotes.'
    ),
    'boot_summary': (
        'Generate exactly ONE sentence summarising that {total_online} of {total} agents are online. '
        'Upbeat, futuristic tone. 10-16 words. Plain text only.'
    ),
}


class PhraseEngine:
    """Singleton. Call configure() at session start; then generate() anywhere."""

    def __init__(self) -> None:
        self._llm_config: dict = {}
        self._language: str = 'en'

    def configure(self, llm_config: dict, language: str = 'en') -> None:
        self._llm_config = llm_config or {}
        self._language = language

    async def generate(self, category: str, context: dict) -> str:
        """Return a phrase for `category`, filling `context` placeholders.

        Tries LLM first when configured; falls back to static pool.
        """
        if self._llm_config:
            result = await self._llm(category, context)
            if result:
                return result
        return self._static(category, context)

    async def _llm(self, category: str, context: dict) -> str:
        prompt_template = _LLM_PROMPTS.get(category)
        if not prompt_template:
            return ''
        from app.services.llm import llm_service
        lang_suffix = ' Respond in Hindi using Devanagari script.' if self._language == 'hi' else ''
        try:
            prompt = prompt_template.format(**{**context, 'phrase': context.get('phrase', '')}) + lang_suffix
        except KeyError:
            return ''
        try:
            result = await asyncio.wait_for(
                llm_service.complete(
                    prompt,
                    self._llm_config,
                    max_tokens=60,
                    temperature=0.88,
                ),
                timeout=3.0,
            )
            return (result or '').strip()
        except Exception:
            return ''

    def _static(self, category: str, context: dict) -> str:
        pool_map = _HI if self._language == 'hi' else {}
        pool = pool_map.get(category) or _EN.get(category, [])
        if not pool:
            return ''
        return random.choice(pool).format(**{k: v for k, v in context.items()})


phrase_engine = PhraseEngine()
