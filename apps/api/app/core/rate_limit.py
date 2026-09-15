"""In-process fixed-window rate limiting for authentication endpoints.

The API currently runs as a single process (see docs/architecture.md), so
counters live in memory. The public surface is deliberately tiny so a
multi-instance deployment can later swap the storage (e.g. Redis) without
touching the callers.
"""

from __future__ import annotations

import math
import threading
import time

_PRUNE_THRESHOLD = 8192


class RateLimiter:
    """Thread-safe fixed-window counter keyed by arbitrary strings.

    Operations cover the auth use cases:
    - ``allow``: check and consume one slot (registration attempts).
    - ``blocked`` + ``record``: check without consuming, then register a
      violation (failed logins; successful logins never consume a slot).
    - ``reset``: forget a key's counter (after a successful login).
    """

    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._buckets: dict[str, tuple[float, int]] = {}
        self._lock = threading.Lock()

    def _window(self, key: str, now: float) -> tuple[float, int]:
        """Current (window_start, count), lazily expiring stale windows."""

        start, count = self._buckets.get(key, (now, 0))
        if now - start >= self.window_seconds:
            return now, 0
        return start, count

    def _retry_after(self, now: float, start: float) -> int:
        return max(1, math.ceil(self.window_seconds - (now - start)))

    def blocked(self, key: str) -> tuple[bool, int]:
        """Return (blocked, retry_after_seconds) without consuming a slot."""

        with self._lock:
            now = time.monotonic()
            start, count = self._window(key, now)
            if count >= self.limit:
                return True, self._retry_after(now, start)
            return False, 0

    def allow(self, key: str) -> tuple[bool, int]:
        """Consume one slot if available; return (allowed, retry_after)."""

        with self._lock:
            now = time.monotonic()
            start, count = self._window(key, now)
            if count >= self.limit:
                return False, self._retry_after(now, start)
            self._buckets[key] = (start, count + 1)
            self._prune(now)
            return True, 0

    def record(self, key: str) -> None:
        """Record one violation against the key's current window."""

        with self._lock:
            now = time.monotonic()
            start, count = self._window(key, now)
            self._buckets[key] = (start, count + 1)
            self._prune(now)

    def reset(self, key: str) -> None:
        """Drop a key's counter (e.g. forgive failures after a success)."""

        with self._lock:
            self._buckets.pop(key, None)

    def _prune(self, now: float) -> None:
        """Bound memory by dropping expired windows when the map grows."""

        if len(self._buckets) <= _PRUNE_THRESHOLD:
            return
        stale = [
            key
            for key, (start, _count) in self._buckets.items()
            if now - start >= self.window_seconds
        ]
        for key in stale:
            self._buckets.pop(key, None)
