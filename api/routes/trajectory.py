"""Trajectory endpoint — short-term forward-looking signal for the composite tier.

Front-end uses this to render the Trajectory chip on Status (RISING /
STEADY / FALLING) and the projection arrow on the 2D phase-space
visualization.

Request: GET /trajectory?lat=&lon=
Response: see TrajectoryResponse below.
"""
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

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
    tier: str = Field(..., description="rising | steady | falling")
    delta_pct: float
    horizon_hours: int
    now: TrajectoryFrameOut
    projected: TrajectoryFrameOut
    dominant_driver: str


@router.get("/trajectory", response_model=TrajectoryResponse | None)
async def get_trajectory(lat: float, lon: float) -> TrajectoryResponse | None:
    """Compute trajectory for the given coordinates.

    Returns `null` rather than 5xx on upstream failures (Open-Meteo
    timeout, sparse response, etc.) so the frontend can degrade
    gracefully — same pattern as the rest of the API.
    """
    if not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise HTTPException(status_code=400, detail="lat/lon out of range")

    forecast = await fetch_forecast_hourly(lat, lon)
    if forecast is None:
        return None

    # Hold KBDI + NDVI anomaly constant across the 6-hour projection.
    # Both move on timescales >> 6 hr (KBDI integrates daily; NDVI
    # cadence is multi-day). Using the same value for now and projected
    # means the score delta reflects only the meteorological trajectory.
    kbdi_info = await fetch_kbdi_today(lat, lon)
    kbdi = float(kbdi_info["kbdi"]) if kbdi_info else None

    # NDVI anomaly = current - same-month climatology. Climatology cache
    # is keyed by month, mirroring the /risk pipeline.
    ndvi_now = await get_ndvi_current(lat, lon)
    ndvi_clim = await get_ndvi_climatology(lat, lon, date.today().month)
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

    return TrajectoryResponse(
        tier=result.tier,
        delta_pct=result.delta_pct,
        horizon_hours=result.horizon_hours,
        now=TrajectoryFrameOut(
            label=result.now.label,
            iso_time=result.now.iso_time,
            temperature_c=result.now.temperature_c,
            humidity_pct=result.now.humidity_pct,
            wind_kph=result.now.wind_kph,
            precipitation_mm=result.now.precipitation_mm,
            v4_score=result.now.v4_score,
        ),
        projected=TrajectoryFrameOut(
            label=result.projected.label,
            iso_time=result.projected.iso_time,
            temperature_c=result.projected.temperature_c,
            humidity_pct=result.projected.humidity_pct,
            wind_kph=result.projected.wind_kph,
            precipitation_mm=result.projected.precipitation_mm,
            v4_score=result.projected.v4_score,
        ),
        dominant_driver=result.dominant_driver,
    )
