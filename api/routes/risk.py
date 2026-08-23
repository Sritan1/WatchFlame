import asyncio
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from ..core.ndvi import ndvi_anomaly as compute_ndvi_anomaly
from ..core.rate_limit import EXPENSIVE, limiter
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
    # Bounded to Earth extremes. This also keeps out NaN and infinity, which
    # pydantic otherwise accepts, and the saturation_vapor_pressure_hpa singularity.
    temperature: float = Field(..., ge=-90, le=60, description="Celsius")
    humidity: float = Field(..., ge=0, le=100, description="Percent 0-100")
    wind_speed: float = Field(..., ge=0, le=250, description="km/h")
    days_since_rain: int = Field(..., ge=0)
    season: Season
    lat: float | None = Field(
        None, ge=-90, le=90,
        description="Optional. If supplied with lon, response includes a regionally calibrated danger level.",
    )
    lon: float | None = Field(None, ge=-180, le=180)
    # Sending a KBDI skips the archive fetch, which is how the what-if calculator
    # drives the same drought signal the located path uses.
    kbdi: float | None = Field(None, ge=0, le=800)
    # Same idea for vegetation, replacing the calendar season multiplier.
    ndvi_anomaly: float | None = Field(None, ge=-1.0, le=1.0)
    # The what-if state dropdown. Setting it skips the Census lookup and needs no
    # coordinates.
    state: str | None = Field(None, min_length=2, max_length=2)


class RiskFactors(BaseModel):
    vpd: float       # vapor pressure deficit, temperature and humidity together
    wind: float
    drought: float   # from KBDI, or days since rain when there is no KBDI
    season: float    # vegetation, either measured or guessed from the calendar


class RegionalThresholds(BaseModel):
    # Percentiles of this state's historical fire-day scores. The frontend fills its
    # dial against these, or the dial sits at 42% while the pill reads EXTREME.
    low: float
    moderate: float
    high: float
    extreme: float
    # Highest score in this state's sample, anchoring the top of the dial.
    score_max: float


class RiskResponse(BaseModel):
    risk_score: float
    danger_level: Literal["LOW", "MODERATE", "HIGH", "EXTREME"]
    factors: RiskFactors
    # Read against the user's own state, null with no coordinates or no fit for
    # that state. danger_level is always valid.
    regional_level: Literal["LOW", "MODERATE", "HIGH", "EXTREME"] | None = None
    regional_state: str | None = None
    regional_thresholds: RegionalThresholds | None = None
    # Null on a manual request or when the archive was unreachable.
    kbdi: float | None = None
    # From the same precipitation pull. The what-if screen seeds its slider off
    # this instead of guessing from KBDI.
    days_since_rain_observed: int | None = None
    # Vegetation against the same month in past years, negative meaning drier than
    # normal. Only present when the satellite had a usable look.
    ndvi_anomaly: float | None = None


@router.post("", response_model=RiskResponse)
@limiter.limit(EXPENSIVE)
async def post_risk(request: Request, body: RiskRequest) -> RiskResponse:
    kbdi_value: float | None = body.kbdi
    ndvi_anom: float | None = body.ndvi_anomaly
    days_observed: int | None = None
    # A state the caller named beats anything we could geocode.
    state_hint: str | None = body.state.upper() if body.state else None
    have_coords = body.lat is not None and body.lon is not None
    needs_kbdi_fetch = kbdi_value is None and have_coords
    needs_ndvi_fetch = ndvi_anom is None and have_coords

    # Fire all the coordinate lookups at once. On a cold cache the satellite NDVI
    # call dominates at 10 to 18 seconds, so the rest may as well run under it.
    if have_coords:
        month_utc = datetime.now(timezone.utc).month
        task_names: list[str] = []
        tasks: list = []
        if needs_kbdi_fetch:
            task_names.append("kbdi")
            tasks.append(fetch_kbdi_today(body.lat, body.lon))
            # From the forecast endpoint, not the archive KBDI uses. The archive
            # trails about 6 days, so rain this week is invisible to it.
            task_names.append("days_since_rain")
            tasks.append(fetch_days_since_rain_today(body.lat, body.lon))
        if needs_ndvi_fetch:
            task_names.append("ndvi_current")
            tasks.append(get_ndvi_current(body.lat, body.lon))
            task_names.append("ndvi_clim")
            tasks.append(get_ndvi_climatology(body.lat, body.lon, month_utc))
        # Census is the real answer for which state a point is in, getting border
        # towns like Reno right where the bbox guess does not.
        needs_county = state_hint is None
        if needs_county:
            task_names.append("county")
            tasks.append(reverse_geocode(body.lat, body.lon))

        # One upstream falling over costs that signal, not the whole route. Days
        # since rain covers for KBDI, the season for NDVI, the bbox for Census.
        raw = await asyncio.gather(*tasks, return_exceptions=True)
        results = {
            name: (None if isinstance(val, Exception) else val)
            for name, val in zip(task_names, raw)
        }

        kbdi_data = results.get("kbdi")
        if kbdi_data is not None:
            kbdi_value = kbdi_data["kbdi"]
        days_observed = results.get("days_since_rain")
        current = results.get("ndvi_current")
        clim = results.get("ndvi_clim")
        if current is not None and clim is not None:
            ndvi_anom = compute_ndvi_anomaly(current, clim)
        county = results.get("county")
        if county is not None:
            state_hint = county.state

    # With KBDI gone but a real dry streak known, that beats whatever the client
    # sent. Status just sends a flat 7 as a placeholder.
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
    # Coordinates or a named state will do. The dropdown path has no coordinates.
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
    """Which calibration this server is running."""
    return calibration_info()
