from __future__ import annotations
import re

_DEVANAGARI = re.compile(r'[ऀ-ॿ]')

def detect_language(text: str) -> str:
    """Return 'hi' if >15% of non-space chars are Devanagari, else 'en'."""
    stripped = text.replace(' ', '')
    if not stripped:
        return 'en'
    ratio = len(_DEVANAGARI.findall(stripped)) / len(stripped)
    return 'hi' if ratio > 0.15 else 'en'
