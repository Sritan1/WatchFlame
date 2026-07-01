import asyncio
import logging

from fastapi import APIRouter, Query, Request, Response

from ..core.geo import haversine_mi
from ..core.rate_limit import EXPENSIVE, limiter
from ..core.source_health import DOWN, OK, set_source_health
from ..services.nces import fetch_schools
from ..services.open_shelters import fetch_open_shelters
from ..services.overpass import fetch_shelters

router = APIRouter(prefix="/shelters", tags=["shelters"])

logger = logging.getLogger(__name__)


@router.get("")
@limiter.limit(EXPENSIVE)
async def get_shelters(
    request: Request,
    response: Response,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_mi: float = Query(50.0, ge=5.0, le=125.0),
    limit: int = Query(20, ge=1, le=100),
):
    """Return up to `limit` evacuation points near (lat, lon), tiered by
    confidence.

    Three sources are queried concurrently and merged:
      • **Open shelters** (tier 1, `activated: true`) — shelters reported OPEN
        right now by Emergency Management / the Red Cross (National Shelter
        System). Carry live status + capacity. Independent of FEMA declarations.
        Mock-first today (see services/open_shelters.py).
      • **OSM Overpass** (candidate) — community-tagged assembly points,
        community centres, shelters, fire stations, social facilities (US bbox).
      • **NCES Public Schools** (candidate) — authoritative US K-12 dataset;
        schools are commonly designated as evacuation shelters by county EMs.

    Activated shelters sort first; the rest are sorted by distance, deduped
    roughly by location (an open shelter wins over a candidate at the same
    site). Candidates carry `activated: false` — the client labels them as
    *potential* evacuation points, not officially activated shelters.
    """
    radius_km = radius_mi * 1.60934

    # Run all sources concurrently — a failure in one shouldn't kill the others.
    open_task = asyncio.create_task(fetch_open_shelters(lat, lon, radius_mi=radius_mi))
    overpass_task = asyncio.create_task(fetch_shelters(lat, lon, radius_km=radius_km))
    nces_task = asyncio.create_task(fetch_schools(lat, lon, radius_mi=radius_mi))
    open_res, overpass_res, nces_res = await asyncio.gather(
        open_task, overpass_task, nces_task, return_exceptions=True
    )

    set_source_health(
        response,
        {
            "shelters_open": DOWN if isinstance(open_res, Exception) else OK,
            "shelters_osm": DOWN if isinstance(overpass_res, Exception) else OK,
            "shelters_nces": DOWN if isinstance(nces_res, Exception) else OK,
        },
    )

    rows: list[dict[str, object]] = []

    # Tier 1 — activated/open shelters first so they win the location dedupe
    # below and (after sorting) sit at the top of the list.
    if isinstance(open_res, Exception):
        logger.warning("open-shelters query failed: %s", open_res)
    else:
        for s in open_res:
            d = haversine_mi(lat, lon, s.lat, s.lon)
            if d > radius_mi:
                continue
            rows.append(
                {
                    "id": f"open-{s.id}",
                    "name": s.name,
                    "lat": s.lat,
                    "lon": s.lon,
                    "type": s.managing_org or "Open shelter",
                    "distance_mi": round(d, 2),
                    "address": s.address,
                    "activated": True,
                    "status": s.status,
                    "capacity": s.capacity,
                    "occupancy": s.occupancy,
                    "pet_friendly": s.pet_friendly,
                    "ada_accessible": s.ada_accessible,
                    "managing_org": s.managing_org,
                    "updated_at": s.updated_at,
                    "opened_at": s.opened_at,
                }
            )

    if isinstance(overpass_res, Exception):
        logger.warning("overpass query failed: %s", overpass_res)
    else:
        for s in overpass_res:
            d = haversine_mi(lat, lon, s.lat, s.lon)
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
                    "activated": False,
                }
            )

    if isinstance(nces_res, Exception):
        logger.warning("nces query failed: %s", nces_res)
    else:
        for sch in nces_res:
            d = haversine_mi(lat, lon, sch.lat, sch.lon)
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
                    "activated": False,
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

    # Activated (open) shelters first, then by distance.
    unique.sort(key=lambda x: (not x.get("activated", False), x["distance_mi"]))  # type: ignore[arg-type, return-value]
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
