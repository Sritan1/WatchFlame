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

NCES_FEATURESERVER = (
    "https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/"
    "Public_School_Locations_Current/FeatureServer/0/query"
)

_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}


def _ttl() -> int:
    return int(os.getenv("NCES_CACHE_TTL_SECONDS", "3600"))


# US bbox guard (matches overpass.py)
_US_BBOX = (-180.0, 18.0, -66.0, 72.0)


def _in_us(lat: float, lon: float) -> bool:
    minLon, minLat, maxLon, maxLat = _US_BBOX
    return minLat <= lat <= maxLat and minLon <= lon <= maxLon


@dataclass
class School:
    id: str
    name: str
    lat: float
    lon: float
    address: str | None


def _bbox_around(lat: float, lon: float, radius_mi: float) -> tuple[float, float, float, float]:
    """Square-ish bbox in degrees around a point. Approximate — the API filters
    by intersecting envelope, so over-fetching slightly is fine."""
    # 1 degree latitude ≈ 69 mi; longitude depends on lat.
    import math
    dLat = radius_mi / 69.0
    dLon = radius_mi / (69.0 * max(math.cos(math.radians(lat)), 0.1))
    return (lon - dLon, lat - dLat, lon + dLon, lat + dLat)


async def fetch_schools(
    lat: float,
    lon: float,
    radius_mi: float = 50.0,
) -> list[School]:
    if not _in_us(lat, lon):
        return []

    cache_key = f"{round(lat, 2)}|{round(lon, 2)}|{round(radius_mi)}"
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _ttl():
        return [_to_school(r) for r in cached[1]]

    minLon, minLat, maxLon, maxLat = _bbox_around(lat, lon, radius_mi)
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
        # ArcGIS endpoints occasionally 5xx during heavy ingest windows. The
        # /shelters route already swallows our exceptions via gather(), but
        # we log+cache empty here so the trace stays clean and we don't
        # hammer the upstream while it's degraded.
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(
            f"[nces] upstream {status} for {lat:.2f},{lon:.2f} "
            f"({type(e).__name__}); returning empty"
        )
        _CACHE[cache_key] = (now, [])
        return []

    raw_rows: list[dict[str, Any]] = []
    for feat in payload.get("features", []):
        props = feat.get("properties") or {}
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates")
        if not coords or len(coords) < 2:
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
                "lat": float(coords[1]),
                "lon": float(coords[0]),
                "address": ", ".join(addr_parts) or None,
            }
        )

    _CACHE[cache_key] = (now, raw_rows)
    return [_to_school(r) for r in raw_rows]


def _to_school(r: dict[str, Any]) -> School:
    return School(
        id=r["id"],
        name=r["name"],
        lat=r["lat"],
        lon=r["lon"],
        address=r["address"],
    )
