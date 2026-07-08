"""Shared rate limiter.

Lives in its own module (depending only on `config`) so both `main.py` and the
route modules can import the same `Limiter` without a circular import. The
global default applies to every route via SlowAPIMiddleware; expensive routes
opt into a tighter cap with `@limiter.limit(EXPENSIVE)`.

When `RATE_LIMIT_ENABLED=false` (e.g. the test suite) the limiter is disabled
and every `@limiter.limit(...)` decorator becomes a no-op.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from .config import get_settings

_settings = get_settings()


def client_ip(request: Request) -> str:
    """Per-IP rate-limit key: the real client address.

    Behind a trusted reverse proxy (Railway) the immediate peer is the proxy,
    and the client IP is appended to the RIGHT of any client-supplied
    X-Forwarded-For chain. slowapi's default `get_remote_address` trusts
    whatever uvicorn set as `request.client` — with `--forwarded-allow-ips=*`
    that is the LEFTMOST XFF entry, which the client fully controls, so an
    attacker can rotate it per request and never hit the per-IP cap.

    We instead read the entry the trusted proxy appended: the
    `rate_limit_trusted_proxies`-th value from the right of the raw header. A
    spoofed client value sits further left and is ignored.
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
    # headers_enabled stays False: slowapi's informational X-RateLimit-* headers
    # require every decorated route to declare a `response: Response` param, and
    # without it slowapi raises on each request. Enforcement (429) is unaffected.
    headers_enabled=False,
)

# Tighter bucket for endpoints that fan out to paid / quota-limited upstreams.
EXPENSIVE = _settings.rate_limit_expensive
