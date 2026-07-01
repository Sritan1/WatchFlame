"""Per-request source-health signaling.

Several routes aggregate multiple upstream feeds and DEGRADE GRACEFULLY when
one of them fails: they still return 200 with whatever data they have. That
keeps the website working, but it also hides the failure - an empty result
looks identical to a genuinely-quiet feed. A user staring at "no satellite
detections" has no way to know FIRMS is actually down.

To let the frontend tell those two cases apart (and show a "this feed is down"
note instead of a misleading "nothing here"), a route reports which of its
upstreams failed on THIS request via a response header. The response BODY is
never touched, so existing API consumers and the mobile client are unaffected;
only clients that opt in to reading the header see the health map.

Header value is a compact JSON object, e.g. {"nifc":"ok","calfire":"down"}.
"""
from __future__ import annotations

import json

from fastapi import Response

SOURCE_HEALTH_HEADER = "X-Source-Health"

OK = "ok"
DOWN = "down"


class SourceUnavailable(Exception):
    """Raised by a service when an upstream genuinely FAILED (network error,
    5xx, timeout) - as opposed to succeeding with an empty result. Lets a
    route record the source as `down` instead of conflating a real outage with
    a legitimately empty answer (no fires nearby, point outside the US, etc.).
    """


def set_source_health(response: Response, sources: dict[str, str]) -> None:
    """Attach a {source_key: "ok" | "down"} map to the response as a JSON
    header. Keys are stable identifiers the frontend maps to on-screen notes."""
    response.headers[SOURCE_HEALTH_HEADER] = json.dumps(sources, separators=(",", ":"))
