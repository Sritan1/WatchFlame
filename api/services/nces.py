"""NCES (National Center for Education Statistics) Public Schools client.

The original HIFLD Open ArcGIS endpoints were retired in August 2025. NCES
maintains the authoritative public-school dataset in an actively-served ArcGIS
FeatureServer that we can query by bounding box. ~100k US K-12 schools.

Public schools are commonly designated as evacuation shelters by county
emergency-management offices (gym, cafeteria, parking lot — large indoor
volume, accessible by school bus). They make a strong static "potential
shelter" layer alongside the OSM data.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

import httpx

from ..core.geo import bbox_around, in_us
from ..core.source_health import SourceUnavailable

NCES_FEATURESERVER = (
    "https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/"
    "Public_School_Locations_Current/FeatureServer/0/query"
)

_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}

# Short-lived negative cache for transient upstream failures (see census.py).
_FAIL_CACHE: dict[str, float] = {}


def _ttl() -> int:
    return int(os.getenv("NCES_CACHE_TTL_SECONDS", "3600"))


def _fail_ttl() -> int:
    return int(os.getenv("NCES_FAIL_CACHE_TTL_SECONDS", "60"))


@dataclass
class School:
    id: str
    name: str
    lat: float
    lon: float
    address: str | None


async def fetch_schools(
    lat: float,
    lon: float,
    radius_mi: float = 50.0,
) -> list[School]:
    if not in_us(lat, lon):
        return []

    cache_key = f"{round(lat, 2)}|{round(lon, 2)}|{round(radius_mi)}"
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _ttl():
        return [_to_school(r) for r in cached[1]]

    # Recent failure for this area? Back off and signal the outage so /shelters
    # reports shelters_nces `down` instead of a misleading empty list.
    failed_at = _FAIL_CACHE.get(cache_key)
    if failed_at is not None and now - failed_at < _fail_ttl():
        raise SourceUnavailable("nces failed (cached)")

    minLon, minLat, maxLon, maxLat = bbox_around(lat, lon, radius_mi)
    params = {
        "where": "1=1",
        "geometry": f"{minLon},{minLat},{maxLon},{maxLat}",
        "geometryType": "esriGeometryEnvelope",
        "spatialRel": "esriSpatialRelIntersects",
        "inSR": "4326",
        "outSR": "4326",
        "outFields": "NCESSCH,NAME,STREET,CITY,STATE,ZIP",
        "returnGeometry": "true",
        "f": "geojson",
        "resultRecordCount": "500",
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(NCES_FEATURESERVER, params=params)
            resp.raise_for_status()
            payload = resp.json()
    except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.TransportError) as e:
        # ArcGIS endpoints occasionally 5xx during heavy ingest windows. Record a
        # short-lived failure marker to back off, and raise so /shelters reports
        # `down` rather than a misleading empty list.
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(
            f"[nces] upstream {status} for {lat:.2f},{lon:.2f} "
            f"({type(e).__name__}); reporting down"
        )
        _FAIL_CACHE[cache_key] = now
        raise SourceUnavailable(f"nces upstream {status}") from e

    raw_rows: list[dict[str, Any]] = []
    for feat in payload.get("features", []):
        props = feat.get("properties") or {}
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates")
        if not coords or len(coords) < 2:
            continue
        # Coordinates can be present-but-null for a school with unset geometry;
        # skip the row rather than aborting the whole feed (the route swallows
        # our exceptions via gather()).
        try:
            lat, lon = float(coords[1]), float(coords[0])
        except (TypeError, ValueError):
            continue
        addr_parts = []
        if props.get("STREET"):
            addr_parts.append(str(props["STREET"]).strip())
        if props.get("CITY"):
            addr_parts.append(str(props["CITY"]).strip())
        if props.get("STATE"):
            addr_parts.append(str(props["STATE"]).strip())
        raw_rows.append(
            {
                "id": str(props.get("NCESSCH") or feat.get("id") or ""),
                "name": (props.get("NAME") or "Public school").strip(),
                "lat": lat,
                "lon": lon,
                "address": ", ".join(addr_parts) or None,
            }
        )

    _CACHE[cache_key] = (now, raw_rows)
    _FAIL_CACHE.pop(cache_key, None)
    return [_to_school(r) for r in raw_rows]


def _to_school(r: dict[str, Any]) -> School:
    return School(
        id=r["id"],
        name=r["name"],
        lat=r["lat"],
        lon=r["lon"],
        address=r["address"],
    )
