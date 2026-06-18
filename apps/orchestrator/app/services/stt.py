from __future__ import annotations

from abc import ABC, abstractmethod
import io

import httpx


class STTProvider(ABC):
    """Transcribe audio bytes → text. Return None to fall back to browser STT."""

    @abstractmethod
    async def transcribe(self, audio: bytes, fmt: str = 'webm') -> str | None: ...

    @property
    def available(self) -> bool:
        return True


class BrowserSTTProvider(STTProvider):
    """Sentinel — frontend uses its own Speech Recognition API."""

    async def transcribe(self, audio: bytes, fmt: str = 'webm') -> str | None:
        return None

    @property
    def available(self) -> bool:
        return False


class OpenAISTTProvider(STTProvider):
    """OpenAI /v1/audio/transcriptions (Whisper) — accepts webm, mp4, ogg, wav, mp3."""

    SUPPORTED_FORMATS = ('webm', 'mp4', 'ogg', 'wav', 'mp3', 'm4a', 'flac')

    def __init__(self, api_key: str, model: str = 'whisper-1') -> None:
        self._api_key = api_key
        self._model   = model

    async def transcribe(self, audio: bytes, fmt: str = 'webm') -> str | None:
        if fmt not in self.SUPPORTED_FORMATS:
            fmt = 'webm'
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.post(
                    'https://api.openai.com/v1/audio/transcriptions',
                    headers={'Authorization': f'Bearer {self._api_key}'},
                    files={
                        'file':  (f'audio.{fmt}', io.BytesIO(audio), f'audio/{fmt}'),
                        'model': (None, self._model),
                    },
                )
                if r.status_code == 200:
                    return (r.json().get('text') or '').strip() or None
                return None
        except Exception:
            return None
