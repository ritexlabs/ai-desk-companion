"""Always-on wake-word detection using openWakeWord + sounddevice.

Both packages are optional. If either is missing the service sets
``available = False`` and the UI falls back to browser speech recognition.

Install (optional):
    pip install sounddevice openwakeword numpy
    # macOS also needs: brew install portaudio
"""
from __future__ import annotations

import asyncio
import logging
import threading
from typing import Callable

logger = logging.getLogger(__name__)

_SAMPLE_RATE = 16_000
_CHUNK       = 1_280   # 80 ms at 16 kHz — minimum for openWakeWord


def _check_deps() -> bool:
    try:
        import sounddevice        # noqa: F401
        from openwakeword.model import Model  # noqa: F401
        import numpy              # noqa: F401
        return True
    except ImportError:
        logger.info(
            'Wake-word deps not installed (sounddevice, openwakeword, numpy). '
            'Server wake-word disabled; browser fallback active.'
        )
        return False


class WakeWordService:
    """Thread-safe wake-word listener. Calls *callback* in the asyncio event
    loop (via call_soon_threadsafe) whenever a model fires above sensitivity."""

    def __init__(self) -> None:
        self._available = _check_deps()
        self._running   = False
        self._thread:   threading.Thread | None = None
        self._loop:     asyncio.AbstractEventLoop | None = None
        self._callback: Callable[[str], None] | None = None

    @property
    def available(self) -> bool:
        return self._available

    # ── lifecycle ──────────────────────────────────────────────────────

    def start(
        self,
        models: list[str],
        sensitivity: float,
        callback: Callable[[str], None],
        loop: asyncio.AbstractEventLoop,
    ) -> None:
        if not self._available or self._running:
            return
        self._callback = callback
        self._loop     = loop
        self._running  = True
        self._thread   = threading.Thread(
            target=self._run,
            args=(models, sensitivity),
            daemon=True,
            name='wake-word',
        )
        self._thread.start()
        logger.info('Wake-word service started  models=%s  sensitivity=%.2f', models, sensitivity)

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=2.0)
            self._thread = None
        logger.info('Wake-word service stopped.')

    # ── inference thread ───────────────────────────────────────────────

    def _run(self, models: list[str], sensitivity: float) -> None:
        try:
            import sounddevice as sd
            import numpy as np
            from openwakeword.model import Model as OWW
        except Exception as exc:
            logger.error('Wake-word init error: %s', exc)
            self._running = False
            return

        try:
            oww = OWW(wakeword_models=models, inference_framework='tflite')
        except Exception as exc:
            logger.error('openWakeWord model load error: %s', exc)
            self._running = False
            return

        def _audio_cb(indata: bytes, frames: int, _time, _status) -> None:
            if not self._running:
                return
            audio = np.frombuffer(indata, dtype=np.int16)
            try:
                preds = oww.predict(audio)
            except Exception:
                return
            for model_name, score in preds.items():
                if score >= sensitivity:
                    oww.reset()
                    if self._loop and self._callback:
                        self._loop.call_soon_threadsafe(self._callback, model_name)
                    break  # one event per chunk

        try:
            with sd.RawInputStream(
                samplerate=_SAMPLE_RATE,
                blocksize=_CHUNK,
                dtype='int16',
                channels=1,
                callback=_audio_cb,
            ):
                while self._running:
                    sd.sleep(50)
        except Exception as exc:
            logger.error('Wake-word stream error: %s', exc)
            self._running = False


wake_word_service = WakeWordService()
