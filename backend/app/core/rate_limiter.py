import time
from collections import defaultdict
from threading import Lock
from typing import Dict, List

from fastapi import HTTPException, Request, status


class SlidingWindowRateLimiter:
    """
    Thread-safe in-memory sliding window rate limiter.
    Enforces maximum number of requests per window_seconds for a given key.
    """

    def __init__(self, max_requests: int, window_seconds: int, name: str = "RateLimiter"):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.name = name
        self._history: Dict[str, List[float]] = defaultdict(list)
        self._lock = Lock()

    def check(self, key: str) -> None:
        """
        Records an attempt for `key` and raises HTTP 429 if the limit is exceeded.
        """
        now = time.time()
        cutoff = now - self.window_seconds

        with self._lock:
            # Filter timestamps outside window
            timestamps = [t for t in self._history[key] if t > cutoff]
            if len(timestamps) >= self.max_requests:
                retry_after = int(self.window_seconds - (now - timestamps[0])) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded for {self.name}. Maximum {self.max_requests} requests per {self.window_seconds}s. Please retry in {retry_after} seconds.",
                    headers={"Retry-After": str(retry_after)},
                )
            timestamps.append(now)
            self._history[key] = timestamps

    def reset(self) -> None:
        """Clears all rate limit state (useful in test teardowns)."""
        with self._lock:
            self._history.clear()


# Pre-configured instances
login_rate_limiter = SlidingWindowRateLimiter(
    max_requests=10,
    window_seconds=60,
    name="Login Protection",
)

scan_rate_limiter = SlidingWindowRateLimiter(
    max_requests=10,
    window_seconds=60,
    name="Security Scans",
)

ai_rate_limiter = SlidingWindowRateLimiter(
    max_requests=30,
    window_seconds=60,
    name="AI Operations",
)


def rate_limit_login(request: Request) -> None:
    """Dependency for authentication endpoints keyed by client IP."""
    client_ip = request.client.host if request.client else "unknown_client"
    login_rate_limiter.check(client_ip)
