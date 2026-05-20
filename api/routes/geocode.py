from fastapi import APIRouter, Query

from ..services.owm import geocode_city

router = APIRouter(prefix="/geocode", tags=["geocode"])


@router.get("")
async def get_geocode(q: str = Query(..., min_length=2, max_length=120)):
    return await geocode_city(q, limit=5)
