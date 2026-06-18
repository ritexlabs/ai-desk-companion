import logging
import re
from .config import settings

# Patterns that match real credentials — redacted before any log output reaches stdout.
# Each entry is (compiled_pattern, replacement). Use r'\1[REDACTED]' when a capturing
# group preserves a non-secret prefix (avoids variable-width lookbehind).
_REDACT_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'sk-[A-Za-z0-9\-_]{20,}'),           '[REDACTED]'),  # OpenAI / Anthropic keys
    (re.compile(r'ya29\.[A-Za-z0-9\-_\.]{20,}'),       '[REDACTED]'),  # Google access tokens
    (re.compile(r'1//[A-Za-z0-9\-_\.]{20,}'),          '[REDACTED]'),  # Google refresh tokens
    (re.compile(r'ghp_[A-Za-z0-9]{36,}'),              '[REDACTED]'),  # GitHub PATs
    (re.compile(r'GOCSPX-[A-Za-z0-9\-_]{20,}'),        '[REDACTED]'),  # Google client secrets
    (re.compile(r'("(?:access_token|refresh_token|api_key|personal_access_token|client_secret)": ")[^"]{8,}(?=")', re.I),
                                                        r'\1[REDACTED]'),  # JSON credential values
]


class _RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        for pattern, replacement in _REDACT_PATTERNS:
            msg = pattern.sub(replacement, msg)
        record.msg  = msg
        record.args = ()
        return True


def configure_logging() -> None:
    level   = getattr(logging, settings.log_level.upper(), logging.INFO)
    handler = logging.StreamHandler()
    handler.addFilter(_RedactingFilter())
    logging.basicConfig(
        level=level,
        format='%(asctime)s %(levelname)s %(name)s %(message)s',
        handlers=[handler],
        force=True,
    )
