import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query

from ..services.census import reverse_geocode
from ..services.openfema import fetch_active_for_county

router = APIRouter(prefix="/disasters", tags=["disasters"])

logger = logging.getLogger(__name__)

# Why this second filter exists (don't remove it): the upstream query treats
# "incidentEndDate is null" as ongoing, but ~95% of FEMA's null-end records are
# zombies — old Fire Management declarations (some from 1998-99) whose end date
# was simply never logged. Filtering on incidentBeginDate within the last year
# drops that decades-old backlog. Real active fires are always recent (FM
# declarations are short-lived), so the cutoff sits in a wide empty gap and
# never drops a genuinely-active disaster. Null begin dates (currently 0 records
# on the live feed) are also dropped, which is fine — they're part of the same
# stale backlog.
_MAX_AGE_DAYS = 365


@router.get("/near")
async def get_disasters_near(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    """Return active FEMA disaster declarations covering the user's county.

    Two-step lookup:
      1. Census Geocoder reverses lat/lon to a county.
      2. OpenFEMA Disaster Declarations Summary returns active declarations
         (no end date OR ended within last 30 days) for that state + county.

    Empty list outside the US, on Census/FEMA failure, or when no active
    declaration covers the user's county.

    Response shape:
      {
        county: { state, name, fips } | null,
        active: [...],
      }
    """
    info = await reverse_geocode(lat, lon)
    if info is None:
        return {"county": None, "active": []}

    decls = await fetch_active_for_county(info.state, info.county_name)
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


def _within_window(iso: str | None, cutoff: datetime) -> bool:
    if not iso:
        return False
    try:
        # FEMA returns dates like "2026-04-21T00:00:00.000Z"
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt >= cutoff
    except (TypeError, ValueError):
        return False
