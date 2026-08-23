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
    """Places to go near a point, best first.

    Open shelters come from the National Shelter System with live status and
    capacity, no FEMA declaration needed. The other two are candidates, buildings
    where a shelter could open, from OpenStreetMap and public schools. Open ones sort
    first, win ties at the same address, and candidates carry activated: false.
    """
    radius_km = radius_mi * 1.60934

    # All three at once. One going down shouldn't take the others with it.
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

    # Open shelters go in first so they win the dedupe below.
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

    # Round to about 100m and keep the first at each spot, so a tagged shelter
    # beats a school at the same address.
    seen: set[tuple[float, float]] = set()
    unique: list[dict[str, object]] = []
    for r in rows:
        key = (round(float(r["lat"]), 3), round(float(r["lon"]), 3))
        if key in seen:
            continue
        seen.add(key)
        unique.append(r)

    # Open shelters first, then nearest.
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
