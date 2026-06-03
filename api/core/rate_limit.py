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

from .config import get_settings

_settings = get_settings()

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[_settings.rate_limit_default],
    enabled=_settings.rate_limit_enabled,
    # headers_enabled stays False: slowapi's informational X-RateLimit-* headers
    # require every decorated route to declare a `response: Response` param, and
    # without it slowapi raises on each request. Enforcement (429) is unaffected.
    headers_enabled=False,
)

# Tighter bucket for endpoints that fan out to paid / quota-limited upstreams.
EXPENSIVE = _settings.rate_limit_expensive
