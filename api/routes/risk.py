import asyncio
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..core.ndvi import ndvi_anomaly as compute_ndvi_anomaly
from ..core.regional_calibration import (
    calibration_info,
    get_state_calibration,
    regional_level,
)
from ..core.risk_algorithm import compute_risk
from ..services.census import reverse_geocode
from ..services.ndvi_cache import get_climatology as get_ndvi_climatology
from ..services.ndvi_cache import get_current as get_ndvi_current
from ..services.openmeteo_history import fetch_days_since_rain_today, fetch_kbdi_today

router = APIRouter(prefix="/risk", tags=["risk"])


Season = Literal["winter", "spring", "summer", "fall"]


class RiskRequest(BaseModel):
    temperature: float = Field(..., description="Celsius")
    humidity: float = Field(..., ge=0, le=100, description="Percent 0-100")
    wind_speed: float = Field(..., ge=0, description="km/h")
    days_since_rain: int = Field(..., ge=0)
    season: Season
    lat: float | None = Field(
        None, ge=-90, le=90,
        description="Optional. If supplied with lon, response includes a regionally calibrated danger level.",
    )
    lon: float | None = Field(None, ge=-180, le=180)
    # Manual KBDI override (0-800). When supplied the route skips the archive
    # fetch entirely and uses this value as the drought input. Lets the
    # what-if calculator drive the same KBDI signal the geolocated path uses.
    kbdi: float | None = Field(None, ge=0, le=800)
    # Manual NDVI anomaly override (typically -0.3 to +0.3). When supplied
    # the route skips the CDSE fetch and uses this value as the vegetation
    # signal in place of the calendar season multiplier — same path the
    # geolocated Status flow takes.
    ndvi_anomaly: float | None = Field(None, ge=-1.0, le=1.0)
    # Optional regional-calibration override. The Risk Calculator surfaces a
    # state dropdown so users can see how the same numeric inputs would be
    # bucketed in different states. When set, this short-circuits the
    # Census reverse-geocode (no coords needed) and uses the state directly
    # for the regional_level/thresholds lookup.
    state: str | None = Field(None, min_length=2, max_length=2)


class RiskFactors(BaseModel):
    vpd: float       # Vapor Pressure Deficit factor — replaces V1's separate temp + humidity
    wind: float      # power-law (U/40)^1.5 with 0.2 floor
    drought: float   # exponential 1 - exp(-days/15) with 0.1 floor
    season: float    # vegetation/fuel-load proxy multiplier (0.4–1.0)


class RegionalThresholds(BaseModel):
    # Per-state cutoffs from the calibration JSON (50th / 75th / 90th / 97th
    # percentile of historical fire-day scores). Lets the frontend orb fill
    # by regional percentile so the dial and the regional_level pill agree
    # visually — instead of the dial showing a raw 42% while the pill says
    # EXTREME, the dial fills to ~97% when the score crosses the EXTREME cut.
    low: float
    moderate: float
    high: float
    extreme: float
    # Max score observed in this state's fire-day sample; used as the upper
    # anchor for the EXTREME band so anything above it pegs the dial at 100%.
    score_max: float


class RiskResponse(BaseModel):
    risk_score: float
    danger_level: Literal["LOW", "MODERATE", "HIGH", "EXTREME"]
    factors: RiskFactors
    # Calibrated against the user's state (when lat/lon supplied and the state
    # is in the calibration set). Falls back to None when ungeolocated or
    # uncalibrated — the global danger_level always remains valid.
    regional_level: Literal["LOW", "MODERATE", "HIGH", "EXTREME"] | None = None
    regional_state: str | None = None
    regional_thresholds: RegionalThresholds | None = None
    # KBDI value (0-800) used for the drought factor when lat/lon is supplied.
    # None when the request was manual (slider-driven days_since_rain) or when
    # the upstream weather archive was unreachable.
    kbdi: float | None = None
    # Days since the last rainfall >= 1 mm at the user's coords, derived from
    # the same Open-Meteo precipitation pull that KBDI uses. None when the
    # request was manual or when the archive was unreachable. Surfaced so the
    # web Risk Calculator can auto-seed the "days since rain" slider with a
    # real local value instead of a KBDI/100 proxy.
    days_since_rain_observed: int | None = None
    # NDVI anomaly (current − same-month climatology) used in place of the
    # calendar-based season multiplier. Negative = drier than normal (raises
    # risk). Present only when lat/lon was sent and the CDSE satellite
    # imagery archive returned usable observations.
    ndvi_anomaly: float | None = None


@router.post("", response_model=RiskResponse)
async def post_risk(body: RiskRequest) -> RiskResponse:
    kbdi_value: float | None = body.kbdi
    ndvi_anom: float | None = body.ndvi_anomaly
    # Observed days-since-rain from the archive (when fetched). Stays None on
    # manual / no-coords requests; surfaced in the response so the Calculator
    # can auto-seed its Days Since Rain slider with a real value.
    days_observed: int | None = None
    # Explicit state override (Risk Calculator dropdown) wins over any
    # geocoded lookup — the user picked a state, honor it.
    state_hint: str | None = body.state.upper() if body.state else None
    have_coords = body.lat is not None and body.lon is not None
    needs_kbdi_fetch = kbdi_value is None and have_coords
    needs_ndvi_fetch = ndvi_anom is None and have_coords

    # Fan out every coordinate-dependent upstream call in parallel — they all
    # hit different services (Open-Meteo, CDSE, Census), and the dominant
    # cost on a cold cache is the CDSE NDVI fetches (~10–18s). KBDI saves
    # ~2-4s, Census saves ~100–500ms by running alongside the others.
    if have_coords:
        month_utc = datetime.now(timezone.utc).month
        task_names: list[str] = []
        tasks: list = []
        if needs_kbdi_fetch:
            task_names.append("kbdi")
            tasks.append(fetch_kbdi_today(body.lat, body.lon))
            # Lag-free days-since-rain from the Forecast endpoint, fanned out
            # in parallel with KBDI. The Archive API (used for KBDI) trails
            # real-time by ~6 days so any rain in the past week is invisible
            # there; the Forecast endpoint exposes today's actuals.
            task_names.append("days_since_rain")
            tasks.append(fetch_days_since_rain_today(body.lat, body.lon))
        if needs_ndvi_fetch:
            task_names.append("ndvi_current")
            tasks.append(get_ndvi_current(body.lat, body.lon))
            task_names.append("ndvi_clim")
            tasks.append(get_ndvi_climatology(body.lat, body.lon, month_utc))
        # Census reverse-geocode is the AUTHORITATIVE state lookup — it
        # correctly disambiguates border-overlap points (e.g. Reno NV) that
        # the bbox+centroid heuristic in regional_calibration misclassifies.
        # Skip it when the caller already supplied an explicit `state` — no
        # need to spend the round-trip to derive what we were just told.
        needs_county = state_hint is None
        if needs_county:
            task_names.append("county")
            tasks.append(reverse_geocode(body.lat, body.lon))

        results = dict(zip(task_names, await asyncio.gather(*tasks)))

        kbdi_data = results.get("kbdi")
        if kbdi_data is not None:
            kbdi_value = kbdi_data["kbdi"]
        # Days-since-rain comes from the SEPARATE Forecast-API fetcher (not
        # the archive). Reports real wall-clock days from today, including
        # the previous ~24h that the archive doesn't cover yet.
        days_observed = results.get("days_since_rain")
        current = results.get("ndvi_current")
        clim = results.get("ndvi_clim")
        if current is not None and clim is not None:
            ndvi_anom = compute_ndvi_anomaly(current, clim)
        county = results.get("county")
        if county is not None:
            state_hint = county.state

    # When KBDI fetch failed but we computed the days-since-rain from the
    # same precip pull anyway, prefer that REAL value over whatever the
    # client sent (Status hardcodes days_since_rain=7 as a neutral
    # placeholder; the backend's own walk-back is strictly better).
    days_for_compute = (
        days_observed if kbdi_value is None and days_observed is not None
        else body.days_since_rain
    )
    result = compute_risk(
        temp_c=body.temperature,
        humidity_pct=body.humidity,
        wind_kph=body.wind_speed,
        days_since_rain=days_for_compute,
        season=body.season,
        kbdi=kbdi_value,
        ndvi_anomaly=ndvi_anom,
    )

    reg_level: str | None = None
    reg_state: str | None = None
    reg_thresholds: RegionalThresholds | None = None
    # Calibrate when we have coordinates OR an explicit state hint (the
    # Calculator's state-dropdown path supplies the latter without coords).
    if have_coords or state_hint is not None:
        reg_level, reg_state = regional_level(
            result.score, body.lat, body.lon, state_hint=state_hint,
        )
        cal = get_state_calibration(reg_state)
        if cal is not None:
            reg_thresholds = RegionalThresholds(**cal)

    return RiskResponse(
        risk_score=result.score,
        danger_level=result.level,
        factors=RiskFactors(**result.factors),
        regional_level=reg_level,
        regional_state=reg_state,
        regional_thresholds=reg_thresholds,
        kbdi=kbdi_value,
        days_since_rain_observed=days_observed,
        ndvi_anomaly=ndvi_anom,
    )


@router.get("/calibration")
async def get_calibration() -> dict:
    """Diagnostic — what calibration is the server currently serving."""
    return calibration_info()
