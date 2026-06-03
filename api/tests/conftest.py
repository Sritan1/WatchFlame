"""Shared pytest configuration.

Runs before any test module imports `api.main`, so the env set here is what
`get_settings()` (lru-cached at import) reads.

Rate limiting is disabled for the suite: Starlette's TestClient keys every
request to a single client host, so the 60/min global limit would otherwise
trip partway through a fast run and fail unrelated tests. The limiter's own
behavior is verified in isolation by test_security.py with a fresh app.
"""
import os

os.environ.setdefault("ENVIRONMENT", "dev")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
