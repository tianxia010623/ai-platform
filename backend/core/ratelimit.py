"""Tiny in-memory sliding-window rate limiter for the auth endpoints.

Process-local by design: this app runs as a single uvicorn process. If it is
ever scaled out, swap this for a shared store (e.g. Redis)."""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)


def reset() -> None:
    _hits.clear()


def rate_limit(name: str, max_calls: int, window_seconds: int):
    """FastAPI dependency allowing at most max_calls per client IP per window."""

    async def dependency(request: Request) -> None:
        client = request.client.host if request.client else "unknown"
        key = (name, client)
        now = time.monotonic()
        hits = _hits[key]
        while hits and now - hits[0] > window_seconds:
            hits.popleft()
        if len(hits) >= max_calls:
            retry_after = int(window_seconds - (now - hits[0])) + 1
            raise HTTPException(
                status_code=429,
                detail=f"Too many attempts. Please wait {retry_after} seconds and try again.",
                headers={"Retry-After": str(retry_after)},
            )
        hits.append(now)

    return dependency
