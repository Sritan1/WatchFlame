from fastapi import APIRouter, Query, Request

from ..core.rate_limit import EXPENSIVE, limiter
from ..services.owm import geocode_city

router = APIRouter(prefix="/geocode", tags=["geocode"])


@router.get("")
@limiter.limit(EXPENSIVE)
async def get_geocode(request: Request, q: str = Query(..., min_length=2, max_length=120)):
    return await geocode_city(q, limit=5)
