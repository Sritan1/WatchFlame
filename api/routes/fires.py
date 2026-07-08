from fastapi import APIRouter, HTTPException, Query, Response

from ..core.source_health import DOWN, OK, SourceUnavailable, set_source_health
from ..services.firms import fetch_fires_geojson

router = APIRouter(prefix="/fires", tags=["fires"])


def _canonical_bbox(bbox: str) -> str:
    """Validate a user bbox and return a canonical 'minLon,minLat,maxLon,maxLat'
    string. Raises 422 on anything malformed — this is the trust boundary that
    keeps arbitrary text out of the upstream FIRMS URL path."""
    parts = bbox.split(",")
    if len(parts) != 4:
        raise HTTPException(status_code=422, detail="bbox must be 'minLon,minLat,maxLon,maxLat'")
    try:
        min_lon, min_lat, max_lon, max_lat = (float(p) for p in parts)
    except ValueError:
        raise HTTPException(status_code=422, detail="bbox values must be numbers")
    if not (-180 <= min_lon <= 180 and -180 <= max_lon <= 180):
        raise HTTPException(status_code=422, detail="bbox longitudes must be within [-180, 180]")
    if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90):
        raise HTTPException(status_code=422, detail="bbox latitudes must be within [-90, 90]")
    if min_lon >= max_lon or min_lat >= max_lat:
        raise HTTPException(status_code=422, detail="bbox min must be less than max")
    return f"{min_lon},{min_lat},{max_lon},{max_lat}"


@router.get("")
async def get_fires(
    response: Response,
    days: int = Query(1, ge=1, le=10),
    bbox: str | None = Query(
        None,
        max_length=64,
        description="minLon,minLat,maxLon,maxLat (defaults to global if omitted)",
    ),
):
    clean_bbox = _canonical_bbox(bbox) if bbox else None
    # FIRMS signals a real outage by raising (same mechanism as the other
    # degrading feeds). Report firms=down and fall back to an empty
    # FeatureCollection so the frontend shows "feed down", not "no fires".
    try:
        data = await fetch_fires_geojson(days=days, bbox=clean_bbox)
        set_source_health(response, {"firms": OK})
    except SourceUnavailable:
        set_source_health(response, {"firms": DOWN})
        data = {"type": "FeatureCollection", "features": []}
    return data
