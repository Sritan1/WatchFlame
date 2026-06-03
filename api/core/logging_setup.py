"""Centralized logging with secret redaction.

Service-level logs are already written to avoid secrets, but the global
exception handler logs tracebacks — and an uncaught httpx error's traceback can
contain the request URL, and the FIRMS URL embeds the API key in its path. This
filter scrubs any known secret value out of both log messages and formatted
tracebacks as a defense-in-depth backstop, so a key can never reach the logs.
"""
from __future__ import annotations

import logging

from .config import get_settings


class SecretRedactionFilter(logging.Filter):
    def __init__(self, secrets: list[str]):
        super().__init__()
        self._secrets = [s for s in secrets if s and len(s) >= 8]

    def filter(self, record: logging.LogRecord) -> bool:
        if not self._secrets:
            return True
        try:
            msg = record.getMessage()
        except Exception:
            msg = str(record.msg)
        redacted = msg
        for s in self._secrets:
            if s in redacted:
                redacted = redacted.replace(s, "***")
        if redacted != msg:
            record.msg = redacted
            record.args = ()
        # Scrub the traceback too. Pre-format it into exc_text (which the
        # handler's formatter prefers) and drop exc_info so the raw, unredacted
        # traceback is never re-formatted downstream.
        if record.exc_info:
            text = record.exc_text or logging.Formatter().formatException(record.exc_info)
            for s in self._secrets:
                if s in text:
                    text = text.replace(s, "***")
            record.exc_text = text
            record.exc_info = None
        return True


_configured = False


def configure_logging() -> None:
    """Install a stream handler on the root logger with the redaction filter.
    Idempotent — safe to call once at app startup."""
    global _configured
    if _configured:
        return
    settings = get_settings()
    redaction = SecretRedactionFilter(
        [
            settings.nasa_firms_api_key or "",
            settings.openweathermap_api_key or "",
            settings.cdse_client_secret or "",
        ]
    )
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    handler.addFilter(redaction)

    root = logging.getLogger()
    if not root.handlers:
        root.addHandler(handler)
    else:
        # Attach the filter to whatever handlers already exist (e.g. uvicorn's).
        for h in root.handlers:
            h.addFilter(redaction)
        root.addHandler(handler)
    root.setLevel(logging.INFO)
    _configured = True
