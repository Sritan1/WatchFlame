"""Shared rate limiter.

Its own module, importing only config, so main.py and the routes share one Limiter
without a circular import. SlowAPIMiddleware applies the default cap everywhere.
RATE_LIMIT_ENABLED=false makes every decorator a no-op, which is what tests use.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from .config import get_settings

_settings = get_settings()


def client_ip(request: Request) -> str:
    """The real client address, used as the per-IP rate-limit key.

    The proxy appends the client IP to the RIGHT of any X-Forwarded-For the caller
    sent. slowapi's get_remote_address takes the leftmost entry, which the caller
    writes and can rotate every request to dodge the cap.
    """
    n = _settings.rate_limit_trusted_proxies
    if n > 0:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            parts = [p.strip() for p in xff.split(",") if p.strip()]
            if parts:
                return parts[-min(n, len(parts))]
    return get_remote_address(request)


limiter = Limiter(
    key_func=client_ip,
    default_limits=[_settings.rate_limit_default],
    enabled=_settings.rate_limit_enabled,
    # Leave this False. The X-RateLimit-* headers need every decorated route to take
    # a response: Response param, and slowapi 500s on any route without one.
    headers_enabled=False,
)

# Tighter bucket for the routes that hit quota-limited upstreams.
EXPENSIVE = _settings.rate_limit_expensive
