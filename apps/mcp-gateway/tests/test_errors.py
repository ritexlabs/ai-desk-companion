from __future__ import annotations

from src.utils.errors import (
    GatewayError,
    ToolAuthError,
    ToolCallError,
    ToolNotFoundError,
    sanitize_error,
)


class TestErrorHierarchy:
    def test_tool_not_found_is_gateway_error(self):
        assert issubclass(ToolNotFoundError, GatewayError)

    def test_tool_auth_is_gateway_error(self):
        assert issubclass(ToolAuthError, GatewayError)

    def test_tool_call_is_gateway_error(self):
        assert issubclass(ToolCallError, GatewayError)

    def test_tool_not_found_is_value_error(self):
        assert issubclass(ToolNotFoundError, ValueError)

    def test_tool_auth_is_permission_error(self):
        assert issubclass(ToolAuthError, PermissionError)

    def test_tool_call_is_runtime_error(self):
        assert issubclass(ToolCallError, RuntimeError)


class TestSanitizeError:
    def test_short_message_unchanged(self):
        exc = RuntimeError('short error')
        assert sanitize_error(exc) == 'short error'

    def test_long_message_truncated(self):
        long_msg = 'x' * 300
        result   = sanitize_error(RuntimeError(long_msg), max_len=200)
        assert len(result) <= 204        # 200 chars + '…'
        assert result.endswith('…')

    def test_exactly_at_limit_not_truncated(self):
        msg    = 'a' * 200
        result = sanitize_error(RuntimeError(msg), max_len=200)
        assert result == msg
        assert not result.endswith('…')

    def test_custom_max_len(self):
        result = sanitize_error(RuntimeError('hello world'), max_len=5)
        assert result == 'hello…'

    def test_empty_message(self):
        assert sanitize_error(RuntimeError('')) == ''
