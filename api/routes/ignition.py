from fastapi import APIRouter, Query, Request

from ..core.rate_limit import EXPENSIVE, limiter
from ..services.ignition import ignition_for_location

router = APIRouter(tags=["ignition"])


@router.get("/ignition")
@limiter.limit(EXPENSIVE)
async def get_ignition(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    """How fire-start-like conditions are at a location. Null rather than an error
    when the model file is missing or the weather fetch fails."""
    return await ignition_for_location(lat, lon)
