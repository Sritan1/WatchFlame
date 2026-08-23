"""Shared pytest configuration. Runs before any test module imports api.main, so
the env set here is what get_settings() reads.

Rate limiting is off for the suite. TestClient keys everything to one host and the
60/min cap would trip mid-run. test_security.py verifies the limiter on a fresh app.
"""
import os

os.environ.setdefault("ENVIRONMENT", "dev")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
