import asyncio
import logging
from math import asin, cos, radians, sin, sqrt

from fastapi import APIRouter, Query

from ..services.nces import fetch_schools
from ..services.overpass import fetch_shelters

router = APIRouter(prefix="/shelters", tags=["shelters"])

logger = logging.getLogger(__name__)


def _haversine_mi(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    R = 3958.7613  # miles
    dLat = radians(b_lat - a_lat)
    dLon = radians(b_lon - a_lon)
    lat1 = radians(a_lat)
    lat2 = radians(b_lat)
    h = sin(dLat / 2) ** 2 + sin(dLon / 2) ** 2 * cos(lat1) * cos(lat2)
    return 2 * R * asin(sqrt(h))


@router.get("")
async def get_shelters(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_mi: float = Query(50.0, ge=5.0, le=125.0),
    limit: int = Query(20, ge=1, le=100),
):
    """Return up to `limit` *potential* evacuation points near (lat, lon).

    Two static sources are queried concurrently and merged:
      • **OSM Overpass** — community-tagged assembly points, community centres,
        shelters, fire stations, social facilities (US bbox).
      • **NCES Public Schools** — authoritative US K-12 dataset; schools are
        commonly designated as evacuation shelters by county EMs.

    Sorted by distance, deduped roughly by location. Outside the US: empty.
    Items are *static* potential evacuation points — not officially activated
    shelters during a current emergency. The client labels them as such.
    """
    radius_km = radius_mi * 1.60934

    # Run both sources concurrently — failures in one shouldn't kill the other.
    overpass_task = asyncio.create_task(fetch_shelters(lat, lon, radius_km=radius_km))
    nces_task = asyncio.create_task(fetch_schools(lat, lon, radius_mi=radius_mi))
    overpass_res, nces_res = await asyncio.gather(
        overpass_task, nces_task, return_exceptions=True
    )

    rows: list[dict[str, object]] = []

    if isinstance(overpass_res, Exception):
        logger.warning("overpass query failed: %s", overpass_res)
    else:
        for s in overpass_res:
            d = _haversine_mi(lat, lon, s.lat, s.lon)
            if d > radius_mi:
                continue
            rows.append(
                {
                    "id": f"osm-{s.id}",
                    "name": s.name,
                    "lat": s.lat,
                    "lon": s.lon,
                    "type": s.type,
                    "distance_mi": round(d, 2),
                    "address": _format_overpass_address(s.tags),
                }
            )

    if isinstance(nces_res, Exception):
        logger.warning("nces query failed: %s", nces_res)
    else:
        for sch in nces_res:
            d = _haversine_mi(lat, lon, sch.lat, sch.lon)
            if d > radius_mi:
                continue
            rows.append(
                {
                    "id": f"nces-{sch.id}",
                    "name": sch.name,
                    "lat": sch.lat,
                    "lon": sch.lon,
                    "type": "Public school",
                    "distance_mi": round(d, 2),
                    "address": sch.address,
                }
            )

    # Dedupe roughly by location: round to ~250 m and keep first occurrence
    # (so OSM-tagged shelters win over NCES schools at the same site).
    seen: set[tuple[float, float]] = set()
    unique: list[dict[str, object]] = []
    for r in rows:
        key = (round(float(r["lat"]), 3), round(float(r["lon"]), 3))
        if key in seen:
            continue
        seen.add(key)
        unique.append(r)

    unique.sort(key=lambda x: x["distance_mi"])  # type: ignore[arg-type, return-value]
    return unique[:limit]


def _format_overpass_address(tags: dict[str, str]) -> str | None:
    parts = []
    if tags.get("addr:housenumber") and tags.get("addr:street"):
        parts.append(f"{tags['addr:housenumber']} {tags['addr:street']}")
    elif tags.get("addr:street"):
        parts.append(tags["addr:street"])
    if tags.get("addr:city"):
        parts.append(tags["addr:city"])
    if tags.get("addr:state"):
        parts.append(tags["addr:state"])
    return ", ".join(parts) or None
