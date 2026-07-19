from __future__ import annotations

import pytest
import respx
from app.models.contracts import AgentRequest


@pytest.fixture
def make_req():
    """Build an AgentRequest with an optional agent_config dict."""
    def _make(text: str, cfg: dict | None = None) -> AgentRequest:
        return AgentRequest(text=text, context={'agent_config': cfg or {}})
    return _make


@pytest.fixture
def mock_http():
    """respx context that intercepts all httpx calls; does not require all routes to be called."""
    with respx.mock(assert_all_called=False) as m:
        yield m
