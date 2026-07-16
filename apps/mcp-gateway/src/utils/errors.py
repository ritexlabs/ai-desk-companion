from __future__ import annotations


class GatewayError(Exception):
    """Base class for all gateway errors."""


class ToolNotFoundError(GatewayError, ValueError):
    """Raised when the requested tool namespace/name is not registered."""


class ToolAuthError(GatewayError, PermissionError):
    """Raised when a tool is missing required credentials."""


class ToolCallError(GatewayError, RuntimeError):
    """Raised when a tool call fails due to an upstream error."""


def sanitize_error(exc: Exception, max_len: int = 200) -> str:
    """Return a safe, truncated error message — never leaks stack traces."""
    msg = str(exc)
    if len(msg) > max_len:
        msg = msg[:max_len] + '…'
    return msg
