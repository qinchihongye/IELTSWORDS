"""
请求频率限制中间件
基于内存的简单限流，适用于单 worker 部署。
"""

import time
from collections import defaultdict

from fastapi import Request, HTTPException, status


class RateLimiter:
    def __init__(self, requests: int = 5, window_seconds: int = 60):
        self.requests = requests
        self.window_seconds = window_seconds
        self._store: dict[str, list[float]] = defaultdict(list)

    def _clean(self, key: str, now: float) -> None:
        cutoff = now - self.window_seconds
        self._store[key] = [t for t in self._store[key] if t > cutoff]

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        self._clean(key, now)
        if len(self._store[key]) >= self.requests:
            return False
        self._store[key].append(now)
        return True


_auth_limiter = RateLimiter(requests=10, window_seconds=60)


async def auth_rate_limit(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    key = f"{client_ip}:{request.url.path}"
    if not _auth_limiter.is_allowed(key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="请求过于频繁，请稍后再试",
        )
