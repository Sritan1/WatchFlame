"""Cal Fire Active Incidents client.

Cal Fire's public Umbraco-backed JSON API powers their public incident map.
California-specific, but the feed is richer than NIFC's nationwide one —
includes a human-readable `ControlStatement`, Cal Fire's own canonical URL,
and tighter update cadence during active events.

We use this in addition to NIFC: NIFC for nationwide coverage, Cal Fire for
the better detail when an incident is in California.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

import httpx

from ..core.parse import safe_float
from ..core.source_health import SourceUnavailable

CALFIRE_URL = "https://incidents.fire.ca.gov/umbraco/api/IncidentApi/List"

_CACHE: dict[str, Any] = {"ts": 0.0, "data": []}


def _ttl() -> int:
    return int(os.getenv("CALFIRE_CACHE_TTL_SECONDS", "300"))  # 5 minutes


def _fail_ttl() -> int:
    # How long a transient upstream failure suppresses re-hitting Cal Fire.
    return int(os.getenv("CALFIRE_FAIL_CACHE_TTL_SECONDS", "60"))


@dataclass
class CalFireIncident:
    id: str
    name: str
    lat: float
    lon: float
    acres: float | None
    contained_pct: float | None
    started: str | None
    county: str | None
    location: str | None
    control_statement: str | None
    agency: str | None
    url: str | None
    is_active: bool


async def fetch_active_incidents(force: bool = False) -> list[CalFireIncident]:
    now = time.time()
    if not force and _CACHE["data"] and now - _CACHE["ts"] < _ttl():
        return [_to_inc(r) for r in _CACHE["data"]]

    # A recent failure? Back off and signal the outage so /incidents/near
    # reports calfire `down` rather than conflating it with an empty feed.
    if not force and now - _CACHE.get("fail_ts", 0.0) < _fail_ttl():
        raise SourceUnavailable("calfire upstream failed (cached)")

    headers = {"User-Agent": "wildfire-app/0.2 (portfolio)", "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                CALFIRE_URL,
                params={"inactive": "false"},
                headers=headers,
            )
            resp.raise_for_status()
            # A 200 with a non-JSON body (Cloudflare / maintenance interstitial)
            # raises ValueError here — treat it as an outage, not a crash.
            data = resp.json()
    except (
        httpx.HTTPStatusError,
        httpx.TimeoutException,
        httpx.TransportError,
        ValueError,
    ) as e:
        # Real outage. Back off (one probe per _fail_ttl()) and raise so
        # /incidents/near reports `down` instead of showing an empty list.
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(
            f"[calfire] upstream {status} ({type(e).__name__}); reporting down"
        )
        _CACHE["fail_ts"] = now
        raise SourceUnavailable(f"calfire upstream {status}") from e

    if not isinstance(data, list):
        # Unexpected 200 shape (error wrapper) — a real upstream problem.
        _CACHE["fail_ts"] = now
        raise SourceUnavailable("calfire returned a non-list body")

    raw_rows: list[dict[str, Any]] = []
    for inc in data:
        if not isinstance(inc, dict):
            # A null / non-object element must not abort the whole feed.
            continue
        try:
            lat = float(inc.get("Latitude"))
            lon = float(inc.get("Longitude"))
        except (TypeError, ValueError):
            continue
        if lat == 0 or lon == 0:
            continue
        url = inc.get("Url")
        # Cal Fire returns relative URLs; prepend the host.
        if url and url.startswith("/"):
            url = f"https://incidents.fire.ca.gov{url}"
        raw_rows.append(
            {
                "id": str(inc.get("UniqueId") or inc.get("Name") or ""),
                "name": (inc.get("Name") or "Unnamed incident").strip(),
                "lat": lat,
                "lon": lon,
                "acres": safe_float(inc.get("AcresBurned")),
                "contained_pct": safe_float(inc.get("PercentContained")),
                "started": inc.get("Started") or inc.get("StartedDateOnly"),
                "county": inc.get("County"),
                "location": inc.get("Location"),
                "control_statement": inc.get("ControlStatement"),
                "agency": (inc.get("AgencyNames") or "Cal Fire"),
                "url": url,
                "is_active": bool(inc.get("IsActive", True)),
            }
        )

    _CACHE["ts"] = now
    _CACHE["data"] = raw_rows
    _CACHE["fail_ts"] = 0.0
    return [_to_inc(r) for r in raw_rows]


def _to_inc(r: dict[str, Any]) -> CalFireIncident:
    return CalFireIncident(**r)


