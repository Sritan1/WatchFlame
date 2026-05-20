from fastapi import APIRouter, Query

from ..services.owm import fetch_current_weather

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get("")
async def get_weather(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    return await fetch_current_weather(lat=lat, lon=lon)
