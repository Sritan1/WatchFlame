"""GET /trajectory, feeding the Status chip and the phase-space projection arrow."""
import asyncio
from datetime import date
from typing import Literal

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field

from ..core.rate_limit import EXPENSIVE, limiter
from ..core.trajectory import compute_trajectory
from ..services.ndvi_cache import get_climatology as get_ndvi_climatology
from ..services.ndvi_cache import get_current as get_ndvi_current
from ..services.openmeteo_forecast import fetch_forecast_hourly
from ..services.openmeteo_history import fetch_kbdi_today

router = APIRouter(tags=["trajectory"])


class TrajectoryFrameOut(BaseModel):
    label: str
    iso_time: str
    temperature_c: float
    humidity_pct: float
    wind_kph: float
    precipitation_mm: float
    v4_score: float


class TrajectoryResponse(BaseModel):
    """Where conditions are heading. `tier` colors the chip, `delta_pct` is how far
    the score moves, `dominant_driver` names whichever input moved most."""
    tier: Literal["rising", "steady", "falling"] = Field(
        ..., description="rising | steady | falling"
    )
    delta_pct: float
    horizon_hours: int
    now: TrajectoryFrameOut
    projected: TrajectoryFrameOut
    dominant_driver: Literal["vpd", "wind", "humidity"]
    # Every hour to the horizon, what the phase-space curve draws.
    frames: list[TrajectoryFrameOut]


@router.get("/trajectory", response_model=TrajectoryResponse | None)
@limiter.limit(EXPENSIVE)
async def get_trajectory(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
) -> TrajectoryResponse | None:
    """Trajectory for these coordinates. Upstream trouble returns null rather than
    an error, so the frontend can just hide the chip."""
    forecast = await fetch_forecast_hourly(lat, lon)
    if forecast is None:
        return None

    # Drought and vegetation stay fixed across the window, so the change in score
    # is purely the weather. Run all three together, because serially a cold NDVI
    # cache costs 12 to 22 seconds on every Status load.
    kbdi_info, ndvi_now, ndvi_clim = await asyncio.gather(
        fetch_kbdi_today(lat, lon),
        get_ndvi_current(lat, lon),
        get_ndvi_climatology(lat, lon, date.today().month),
        return_exceptions=True,
    )
    kbdi = float(kbdi_info["kbdi"]) if isinstance(kbdi_info, dict) and "kbdi" in kbdi_info else None
    ndvi_anomaly: float | None = None
    if isinstance(ndvi_now, float) and isinstance(ndvi_clim, float):
        ndvi_anomaly = float(ndvi_now - ndvi_clim)

    result = compute_trajectory(
        forecast=forecast,
        kbdi=kbdi,
        ndvi_anomaly=ndvi_anomaly,
    )
    if result is None:
        return None

    def _out(f) -> TrajectoryFrameOut:
        return TrajectoryFrameOut(
            label=f.label,
            iso_time=f.iso_time,
            temperature_c=f.temperature_c,
            humidity_pct=f.humidity_pct,
            wind_kph=f.wind_kph,
            precipitation_mm=f.precipitation_mm,
            v4_score=f.v4_score,
        )

    return TrajectoryResponse(
        tier=result.tier,
        delta_pct=result.delta_pct,
        horizon_hours=result.horizon_hours,
        now=_out(result.now),
        projected=_out(result.projected),
        dominant_driver=result.dominant_driver,
        frames=[_out(f) for f in result.frames],
    )
