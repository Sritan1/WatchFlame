from fastapi import APIRouter, Query

from ..services.firms import fetch_fires_geojson

router = APIRouter(prefix="/fires", tags=["fires"])


@router.get("")
async def get_fires(
    days: int = Query(1, ge=1, le=10),
    bbox: str | None = Query(
        None,
        description="minLon,minLat,maxLon,maxLat (defaults to global if omitted)",
    ),
):
    return await fetch_fires_geojson(days=days, bbox=bbox)
