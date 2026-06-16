"""Trajectory endpoint — short-term forward-looking signal for the composite tier.

Front-end uses this to render the Trajectory chip on Status (RISING /
STEADY / FALLING) and the projection arrow on the 2D phase-space
visualization.

Request: GET /trajectory?lat=&lon=
Response: see TrajectoryResponse below.
"""
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
    """Trajectory result for the user's location.

    `tier` drives the chip color/label; `delta_pct` is the % change in V4
    score from `now` to `projected`; `dominant_driver` names the input
    that shifted the most ("vpd" / "wind" / "humidity") so the UI can
    surface a one-line context like "VPD up 18% by 3pm"."""
    tier: Literal["rising", "steady", "falling"] = Field(
        ..., description="rising | steady | falling"
    )
    delta_pct: float
    horizon_hours: int
    now: TrajectoryFrameOut
    projected: TrajectoryFrameOut
    dominant_driver: Literal["vpd", "wind", "humidity"]
    # Hour-by-hour series (now .. +horizon_hours). frames[0] == now and
    # frames[-1] == projected; powers the phase-space hour-by-hour curve.
    frames: list[TrajectoryFrameOut]


@router.get("/trajectory", response_model=TrajectoryResponse | None)
@limiter.limit(EXPENSIVE)
async def get_trajectory(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
) -> TrajectoryResponse | None:
    """Compute trajectory for the given coordinates.

    Returns `null` rather than 5xx on upstream failures (Open-Meteo
    timeout, sparse response, etc.) so the frontend can degrade
    gracefully — same pattern as the rest of the API.
    """
    forecast = await fetch_forecast_hourly(lat, lon)
    if forecast is None:
        return None

    # Hold KBDI + NDVI anomaly constant across the 6-hour projection.
    # Both move on timescales >> 6 hr (KBDI integrates daily; NDVI
    # cadence is multi-day). Using the same value for now and projected
    # means the score delta reflects only the meteorological trajectory.
    #
    # These three fetches are independent of each other, so fan them out
    # concurrently (same pattern as the /risk route) instead of serially —
    # on a cold NDVI cache the serial path is ~12-22s per Status load.
    # NDVI anomaly = current - same-month climatology; climatology cache is
    # keyed by month, mirroring the /risk pipeline.
    kbdi_info, ndvi_now, ndvi_clim = await asyncio.gather(
        fetch_kbdi_today(lat, lon),
        get_ndvi_current(lat, lon),
        get_ndvi_climatology(lat, lon, date.today().month),
    )
    kbdi = float(kbdi_info["kbdi"]) if kbdi_info else None
    ndvi_anomaly: float | None = None
    if ndvi_now is not None and ndvi_clim is not None:
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
