"""NIFC WFIGS Current Wildland Fire Incident Locations client.

Replaces the old (retired) HIFLD Open wildfire feed. WFIGS = Wildland Fire
Interagency Geospatial Services — the official nationwide active-fires feed.
ArcGIS FeatureServer, public, no auth.

Typical record count: 300–1500 active+recent fires depending on season.
The full national list is small enough to fetch entirely and cache; per-request
geographic filtering happens in the route handler.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

import httpx

from ..core.parse import safe_float, safe_int
from ..core.source_health import SourceUnavailable

WFIGS_URL = (
    "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/"
    "WFIGS_Incident_Locations_Current/FeatureServer/0/query"
)

# Single global cache — same response served to all requests.
_CACHE: dict[str, Any] = {"ts": 0.0, "data": []}


def _ttl() -> int:
    return int(os.getenv("NIFC_CACHE_TTL_SECONDS", "600"))  # 10 minutes


def _fail_ttl() -> int:
    # How long a transient upstream failure suppresses re-hitting WFIGS.
    return int(os.getenv("NIFC_FAIL_CACHE_TTL_SECONDS", "60"))


@dataclass
class NifcIncident:
    id: str
    name: str
    lat: float
    lon: float
    acres: float | None
    contained_pct: float | None
    personnel: int | None
    cause: str | None
    discovered: str | None  # ISO timestamp string
    agency: str | None
    state: str | None


async def fetch_all_incidents(force: bool = False) -> list[NifcIncident]:
    now = time.time()
    if not force and _CACHE["data"] and now - _CACHE["ts"] < _ttl():
        return [_to_inc(r) for r in _CACHE["data"]]

    # A recent failure? Back off (at most one probe per _fail_ttl()) and signal
    # the outage so /incidents/near reports nifc `down` rather than conflating a
    # real outage with a genuinely-empty feed.
    if not force and now - _CACHE.get("fail_ts", 0.0) < _fail_ttl():
        raise SourceUnavailable("nifc upstream failed (cached)")

    params = {
        # Filter to actual wildfires only — exclude RX (prescribed burns) and
        # training exercises which dominate the raw feed off-season.
        "where": "IncidentTypeCategory='WF'",
        "outFields": (
            "IrwinID,IncidentName,IncidentSize,PercentContained,"
            "TotalIncidentPersonnel,FireCause,FireDiscoveryDateTime,"
            "POOJurisdictionalAgency,POOState,InitialLatitude,InitialLongitude"
        ),
        "outSR": "4326",
        "returnGeometry": "true",
        "f": "geojson",
        "resultRecordCount": "2000",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(WFIGS_URL, params=params)
            resp.raise_for_status()
            payload = resp.json()
    except (
        httpx.HTTPStatusError,
        httpx.TimeoutException,
        httpx.TransportError,
        ValueError,  # a 200 with a non-JSON body → resp.json() raises; treat as outage
    ) as e:
        # Real outage. Record a short-lived failure marker so we probe at most
        # once per _fail_ttl() instead of hammering WFIGS, and raise so
        # /incidents/near reports `down` (an empty list would read as "no fires
        # nearby" — the misleading state the source-health system exists to fix).
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(
            f"[nifc] upstream {status} ({type(e).__name__}); reporting down"
        )
        _CACHE["fail_ts"] = now
        raise SourceUnavailable(f"nifc upstream {status}") from e

    raw_rows: list[dict[str, Any]] = []
    for feat in payload.get("features", []):
        props = feat.get("properties") or {}
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates")
        # Prefer geometry; fall back to InitialLat/Lon fields. Coordinates can
        # be present-but-null on incidents with unset geometry, so coerce
        # defensively and skip the single row rather than aborting the whole
        # feed (the route swallows our exceptions via gather()).
        lon = lat = None
        if coords and len(coords) >= 2:
            lon, lat = safe_float(coords[0]), safe_float(coords[1])
        if lat is None or lon is None:
            lat = safe_float(props.get("InitialLatitude"))
            lon = safe_float(props.get("InitialLongitude"))
        if lat is None or lon is None:
            continue
        name = (props.get("IncidentName") or "").strip() or "Unnamed incident"
        raw_rows.append(
            {
                "id": str(props.get("IrwinID") or feat.get("id") or ""),
                "name": name,
                "lat": lat,
                "lon": lon,
                "acres": safe_float(props.get("IncidentSize")),
                "contained_pct": safe_float(props.get("PercentContained")),
                "personnel": safe_int(props.get("TotalIncidentPersonnel")),
                "cause": props.get("FireCause"),
                "discovered": _iso_from_arcgis(props.get("FireDiscoveryDateTime")),
                "agency": props.get("POOJurisdictionalAgency"),
                "state": props.get("POOState"),
            }
        )

    _CACHE["ts"] = now
    _CACHE["data"] = raw_rows
    _CACHE["fail_ts"] = 0.0
    return [_to_inc(r) for r in raw_rows]


def _to_inc(r: dict[str, Any]) -> NifcIncident:
    return NifcIncident(**r)


def _iso_from_arcgis(v: Any) -> str | None:
    """ArcGIS returns datetimes as epoch milliseconds. Convert to ISO 8601."""
    if v is None:
        return None
    try:
        ms = int(v)
        from datetime import datetime, timezone
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OSError, OverflowError):
        # OSError/OverflowError: an out-of-range epoch makes fromtimestamp raise
        # (notably on Windows) — must not abort the whole feed parse. Fall back
        # to the raw value only if it's already a non-empty string (e.g. a
        # pre-formatted ISO date); a bad numeric epoch degrades to None.
        return str(v) if isinstance(v, str) and v else None
