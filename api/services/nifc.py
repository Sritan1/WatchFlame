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

WFIGS_URL = (
    "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/"
    "WFIGS_Incident_Locations_Current/FeatureServer/0/query"
)

# Single global cache — same response served to all requests.
_CACHE: dict[str, Any] = {"ts": 0.0, "data": []}


def _ttl() -> int:
    return int(os.getenv("NIFC_CACHE_TTL_SECONDS", "600"))  # 10 minutes


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
    except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.TransportError) as e:
        # /incidents/near already swallows our exceptions via gather().
        # Cache empty briefly so a degraded WFIGS doesn't get re-hit during
        # the cache window — short TTL (60s) so the next try comes soon.
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(
            f"[nifc] upstream {status} ({type(e).__name__}); returning empty"
        )
        _CACHE["ts"] = now - max(_ttl() - 60, 0)
        _CACHE["data"] = []
        return []

    raw_rows: list[dict[str, Any]] = []
    for feat in payload.get("features", []):
        props = feat.get("properties") or {}
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates")
        # Prefer geometry; fall back to InitialLat/Lon fields.
        if coords and len(coords) >= 2:
            lon, lat = float(coords[0]), float(coords[1])
        elif props.get("InitialLatitude") and props.get("InitialLongitude"):
            lat = float(props["InitialLatitude"])
            lon = float(props["InitialLongitude"])
        else:
            continue
        name = (props.get("IncidentName") or "").strip() or "Unnamed incident"
        raw_rows.append(
            {
                "id": str(props.get("IrwinID") or feat.get("id") or ""),
                "name": name,
                "lat": lat,
                "lon": lon,
                "acres": _safe_float(props.get("IncidentSize")),
                "contained_pct": _safe_float(props.get("PercentContained")),
                "personnel": _safe_int(props.get("TotalIncidentPersonnel")),
                "cause": props.get("FireCause"),
                "discovered": _iso_from_arcgis(props.get("FireDiscoveryDateTime")),
                "agency": props.get("POOJurisdictionalAgency"),
                "state": props.get("POOState"),
            }
        )

    _CACHE["ts"] = now
    _CACHE["data"] = raw_rows
    return [_to_inc(r) for r in raw_rows]


def _to_inc(r: dict[str, Any]) -> NifcIncident:
    return NifcIncident(**r)


def _safe_float(v: Any) -> float | None:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _safe_int(v: Any) -> int | None:
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _iso_from_arcgis(v: Any) -> str | None:
    """ArcGIS returns datetimes as epoch milliseconds. Convert to ISO 8601."""
    if v is None:
        return None
    try:
        ms = int(v)
        from datetime import datetime, timezone
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()
    except (TypeError, ValueError):
        # Already a string?
        return str(v) if v else None
