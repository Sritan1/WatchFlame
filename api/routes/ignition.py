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
    """Live fire-ignition-likelihood index for a location.

    Returns `null` (not an error) when the model artifact is missing or the
    upstream weather fetch fails - the frontend hides the chip, same graceful
    pattern as the rest of the API.
    """
    return await ignition_for_location(lat, lon)
