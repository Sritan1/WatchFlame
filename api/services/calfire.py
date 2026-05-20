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

CALFIRE_URL = "https://incidents.fire.ca.gov/umbraco/api/IncidentApi/List"

_CACHE: dict[str, Any] = {"ts": 0.0, "data": []}


def _ttl() -> int:
    return int(os.getenv("CALFIRE_CACHE_TTL_SECONDS", "300"))  # 5 minutes


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

    headers = {"User-Agent": "wildfire-app/0.2 (portfolio)", "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                CALFIRE_URL,
                params={"inactive": "false"},
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.TransportError) as e:
        # /incidents/near already swallows our exceptions via gather().
        # Same pattern as nifc.py — short-cache empty so the log stays clean
        # and we briefly back off the Cal Fire endpoint while it's degraded.
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(
            f"[calfire] upstream {status} ({type(e).__name__}); returning empty"
        )
        _CACHE["ts"] = now - max(_ttl() - 60, 0)
        _CACHE["data"] = []
        return []

    if not isinstance(data, list):
        return []

    raw_rows: list[dict[str, Any]] = []
    for inc in data:
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
                "acres": _safe_float(inc.get("AcresBurned")),
                "contained_pct": _safe_float(inc.get("PercentContained")),
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
    return [_to_inc(r) for r in raw_rows]


def _to_inc(r: dict[str, Any]) -> CalFireIncident:
    return CalFireIncident(**r)


def _safe_float(v: Any) -> float | None:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None
