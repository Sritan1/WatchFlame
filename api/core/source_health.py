"""Per-request source-health signaling.

A route that pulls several feeds still returns 200 when one fails, so "no satellite
detections" reads the same whether the sky is quiet or FIRMS is down. Failed
upstreams go in a header instead, like {"nifc":"ok","calfire":"down"}.
"""
from __future__ import annotations

import json

from fastapi import Response

SOURCE_HEALTH_HEADER = "X-Source-Health"

OK = "ok"
DOWN = "down"


class SourceUnavailable(Exception):
    """Raised when an upstream really failed (network error, 5xx, timeout) rather
    than answering with nothing, so an outage never looks like "no fires nearby."
    """


def set_source_health(response: Response, sources: dict[str, str]) -> None:
    """Attach the {source: "ok" | "down"} map as a JSON header. Keys are stable. The
    frontend maps them to on-screen notes."""
    response.headers[SOURCE_HEALTH_HEADER] = json.dumps(sources, separators=(",", ":"))
