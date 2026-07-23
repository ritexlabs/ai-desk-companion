from __future__ import annotations

from abc import ABC, abstractmethod

import httpx


class TTSProvider(ABC):
    """Synthesise text → audio bytes (MP3). Return None to fall back to browser TTS."""

    @abstractmethod
    async def synthesize(self, text: str) -> bytes | None: ...

    @property
    @abstractmethod
    def format(self) -> str: ...

    @property
    def available(self) -> bool:
        return True


class BrowserTTSProvider(TTSProvider):
    """Sentinel — frontend uses its own Speech Synthesis API."""

    async def synthesize(self, text: str) -> bytes | None:
        return None

    @property
    def format(self) -> str:
        return 'browser'

    @property
    def available(self) -> bool:
        return False


class OpenAITTSProvider(TTSProvider):
    """OpenAI /v1/audio/speech — returns MP3."""

    VOICES  = ('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer')
    MODELS  = ('tts-1', 'tts-1-hd')

    def __init__(self, api_key: str, voice: str = 'nova', model: str = 'tts-1', speed: float = 1.05) -> None:
        self._api_key = api_key
        self._voice   = voice if voice in self.VOICES else 'nova'
        self._model   = model if model in self.MODELS else 'tts-1'
        self._speed   = round(max(0.25, min(4.0, speed)), 2)

    @property
    def format(self) -> str:
        return 'mp3'

    async def synthesize(self, text: str) -> bytes | None:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.post(
                    'https://api.openai.com/v1/audio/speech',
                    headers={'Authorization': f'Bearer {self._api_key}'},
                    json={
                        'model':           self._model,
                        'voice':           self._voice,
                        'input':           text,
                        'response_format': 'mp3',
                        'speed':           self._speed,
                    },
                )
                return r.content if r.status_code == 200 else None
        except Exception:
            return None


class ElevenLabsTTSProvider(TTSProvider):
    """ElevenLabs streaming TTS — returns MP3."""

    def __init__(self, api_key: str, voice_id: str = 'Rachel') -> None:
        self._api_key  = api_key
        self._voice_id = voice_id

    @property
    def format(self) -> str:
        return 'mp3'

    async def synthesize(self, text: str) -> bytes | None:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.post(
                    f'https://api.elevenlabs.io/v1/text-to-speech/{self._voice_id}',
                    headers={
                        'xi-api-key':    self._api_key,
                        'Content-Type':  'application/json',
                    },
                    json={
                        'text':     text,
                        'model_id': 'eleven_monolingual_v1',
                        'voice_settings': {'stability': 0.50, 'similarity_boost': 0.75},
                    },
                )
                return r.content if r.status_code == 200 else None
        except Exception:
            return None
