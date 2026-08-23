"""Logging setup with secret redaction.

Our log lines avoid secrets, but the global exception handler logs tracebacks, and
an httpx traceback carries the request URL. The FIRMS key sits in that path.
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
        # Formatting into exc_text and dropping exc_info stops anything downstream
        # from re-rendering the raw traceback.
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
    """Put a redaction-filtered handler on the root logger. Safe to call twice."""
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
        # Also filter whatever handlers are already there, like uvicorn's.
        for h in root.handlers:
            h.addFilter(redaction)
        root.addHandler(handler)
    root.setLevel(logging.INFO)
    _configured = True
