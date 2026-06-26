from __future__ import annotations

import time

import pytest

from app.api.ws import MAX_INPUT_CHARS, _RateLimiter


# ── _RateLimiter ─────────────────────────────────────────────────────────────

class TestRateLimiter:
    def test_first_call_allowed(self):
        rl = _RateLimiter(max_calls=5, window_sec=10.0)
        assert rl.is_allowed()

    def test_all_calls_within_limit_allowed(self):
        rl = _RateLimiter(max_calls=5, window_sec=10.0)
        results = [rl.is_allowed() for _ in range(5)]
        assert all(results)

    def test_call_over_limit_blocked(self):
        rl = _RateLimiter(max_calls=3, window_sec=10.0)
        for _ in range(3):
            rl.is_allowed()
        assert not rl.is_allowed()

    def test_limit_of_one_blocks_second_call(self):
        rl = _RateLimiter(max_calls=1, window_sec=10.0)
        assert rl.is_allowed()
        assert not rl.is_allowed()

    def test_sliding_window_resets_after_expiry(self):
        rl = _RateLimiter(max_calls=2, window_sec=0.05)
        rl.is_allowed()
        rl.is_allowed()
        assert not rl.is_allowed()
        time.sleep(0.07)
        assert rl.is_allowed()

    def test_old_calls_pruned_from_window(self):
        rl = _RateLimiter(max_calls=2, window_sec=0.05)
        rl.is_allowed()
        time.sleep(0.07)
        rl.is_allowed()  # first is now outside window, this is "first" again
        assert rl.is_allowed()  # second allowed

    def test_max_input_chars_is_2000(self):
        assert MAX_INPUT_CHARS == 2000

    def test_origin_enforcement_constant_in_settings(self):
        from app.core.config import settings
        assert isinstance(settings.allowed_origins, list)
        assert len(settings.allowed_origins) > 0
