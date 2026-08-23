import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query, Response

from ..core.source_health import DOWN, OK, SourceUnavailable, set_source_health
from ..services.census import reverse_geocode
from ..services.openfema import fetch_active_for_county

router = APIRouter(prefix="/disasters", tags=["disasters"])

logger = logging.getLogger(__name__)

# Don't remove this second filter. Upstream counts a missing end date as ongoing,
# but about 95% of those are old declarations nobody closed out. Fire declarations
# are short-lived, so this cutoff sits in a wide empty gap between the two groups.
_MAX_AGE_DAYS = 365


@router.get("/near")
async def get_disasters_near(
    response: Response,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    """Active FEMA declarations covering the user's county. Census turns coordinates
    into a county, then OpenFEMA says what is declared there. Empty outside the US,
    when either source is down, or when nothing is declared."""
    # Losing Census means losing FEMA too, with no county to ask about. A None
    # county with Census healthy just means the point isn't in one.
    try:
        info = await reverse_geocode(lat, lon)
    except SourceUnavailable:
        set_source_health(response, {"census": DOWN, "fema": DOWN})
        return {"county": None, "active": []}

    if info is None:
        set_source_health(response, {"census": OK, "fema": OK})
        return {"county": None, "active": []}

    try:
        decls = await fetch_active_for_county(
            info.state, info.county_name, is_city=_is_independent_city(info.county_fips)
        )
    except SourceUnavailable:
        set_source_health(response, {"census": OK, "fema": DOWN})
        return {
            "county": {
                "state": info.state,
                "name": info.county_name,
                "fips": info.county_fips,
            },
            "active": [],
        }

    set_source_health(response, {"census": OK, "fema": OK})
    cutoff = datetime.now(timezone.utc) - timedelta(days=_MAX_AGE_DAYS)
    decls = [d for d in decls if _within_window(d.incident_begin, cutoff)]
    return {
        "county": {
            "state": info.state,
            "name": info.county_name,
            "fips": info.county_fips,
        },
        "active": [
            {
                "disaster_number": d.disaster_number,
                "declaration_type": d.declaration_type,
                "declaration_date": d.declaration_date,
                "incident_type": d.incident_type,
                "incident_begin": d.incident_begin,
                "incident_end": d.incident_end,
                "title": d.title,
                "designated_area": d.designated_area,
                "state": d.state,
                "url": (
                    f"https://www.fema.gov/disaster/{d.disaster_number}"
                    if d.disaster_number
                    else None
                ),
            }
            for d in decls
        ],
    }


def _is_independent_city(county_fips: str | None) -> bool:
    """FIPS reserves county codes from 500 up for independent cities, so Fairfax
    city is 51600 while Fairfax County is 51059. FEMA's "(City)" and "(County)"
    rows have to match the right one."""
    if not county_fips or len(county_fips) < 5:
        return False
    tail = county_fips[-3:]
    return tail.isdigit() and int(tail) >= 500


def _within_window(iso: str | None, cutoff: datetime) -> bool:
    if not iso:
        return False
    try:
        # FEMA dates look like "2026-04-21T00:00:00.000Z".
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt >= cutoff
    except (TypeError, ValueError):
        return False
