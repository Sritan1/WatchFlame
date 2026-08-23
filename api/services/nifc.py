"""The official nationwide active-fires feed, from the interagency geospatial
service that replaced the retired HIFLD one. Public ArcGIS, no auth.

It runs 300 to 1500 fires depending on the season, small enough that we pull the
whole country and cache it. The route does the geographic filtering.
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

# One cache for everyone. The feed is nationwide.
_CACHE: dict[str, Any] = {"ts": 0.0, "data": []}


def _ttl() -> int:
    return int(os.getenv("NIFC_CACHE_TTL_SECONDS", "600"))  # 10 minutes


def _fail_ttl() -> int:
    # How long a failure keeps us from trying again.
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

    # Back off and say down. An empty list would read as "no fires near you", the
    # thing this whole system exists to avoid.
    if not force and now - _CACHE.get("fail_ts", 0.0) < _fail_ttl():
        raise SourceUnavailable("nifc upstream failed (cached)")

    params = {
        # Real wildfires only. Prescribed burns and training exercises are most of
        # the raw feed out of season.
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
        ValueError,  # a 200 that isn't JSON at all
    ) as e:
        # A real outage. Note it and raise so the route can flag the feed.
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
        # Either can be present but null, so skip the row rather than killing the
        # whole parse.
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
    """ArcGIS sends times as epoch milliseconds. Turn them into ISO strings."""
    if v is None:
        return None
    try:
        ms = int(v)
        from datetime import datetime, timezone
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OSError, OverflowError):
        # An out-of-range epoch makes fromtimestamp raise, especially on Windows,
        # and that must not take the feed down. Keep the raw value only when it
        # already looks like a date string.
        return str(v) if isinstance(v, str) and v else None
