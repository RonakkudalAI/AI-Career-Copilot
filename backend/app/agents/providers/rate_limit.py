from __future__ import annotations

import asyncio
import logging
import threading
import time
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_LLM_RPM = 40.0


class AsyncRpmLimiter:
    def __init__(self, *, rpm: float = DEFAULT_LLM_RPM, name: str = "llm"):
        self.name = name
        self._rpm = max(1.0, float(rpm))
        self._min_interval = 60.0 / self._rpm
        self._lock = asyncio.Lock()
        self._last_mono = 0.0
        self._total_waits = 0
        self._total_acquired = 0

    @property
    def rpm(self) -> float:
        return self._rpm

    @property
    def min_interval(self) -> float:
        return self._min_interval

    def configure(self, rpm: float) -> None:
        self._rpm = max(1.0, float(rpm))
        self._min_interval = 60.0 / self._rpm

    def snapshot(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "rpm": self._rpm,
            "min_interval_seconds": round(self._min_interval, 3),
            "acquired": self._total_acquired,
            "waits": self._total_waits,
        }

    async def acquire(self) -> float:
        async with self._lock:
            now = time.monotonic()
            wait = self._min_interval - (now - self._last_mono)
            waited = 0.0
            if wait > 0:
                self._total_waits += 1
                await asyncio.sleep(wait)
                waited = wait
                now = time.monotonic()
            self._last_mono = now
            self._total_acquired += 1
            return waited


def parse_retry_after_seconds(value: str | None, *, default: float = 1.0) -> float:
    if value is None:
        return default
    try:
        seconds = float(str(value).strip())
    except (TypeError, ValueError):
        return default
    if seconds < 0:
        return default
    return min(seconds, 60.0)


_provider_limiters: dict[str, AsyncRpmLimiter] = {}
_provider_limiters_lock = threading.Lock()


async def provider_rpm_limiter(name: str, rpm: float) -> AsyncRpmLimiter:
    """Return a shared per-provider RPM limiter, reconfigured when the budget changes."""
    with _provider_limiters_lock:
        limiter = _provider_limiters.get(name)
        if limiter is None:
            limiter = AsyncRpmLimiter(rpm=rpm, name=name)
            _provider_limiters[name] = limiter
        elif abs(limiter.rpm - float(rpm)) > 1e-6:
            limiter.configure(rpm)
        return limiter
