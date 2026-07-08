import asyncio
import logging

from fastapi import APIRouter, Query, Response

from ..core.geo import haversine_mi
from ..core.source_health import DOWN, OK, set_source_health
from ..services.calfire import fetch_active_incidents as fetch_calfire
from ..services.nifc import fetch_all_incidents as fetch_nifc

router = APIRouter(prefix="/incidents", tags=["incidents"])

logger = logging.getLogger(__name__)


@router.get("/near")
async def get_incidents_near(
    response: Response,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_mi: float = Query(15.0, ge=1.0, le=200.0),
    limit: int = Query(5, ge=1, le=50),
):
    """Return named-incident matches near (lat, lon).

    Merges two sources concurrently:
      • **NIFC WFIGS** — nationwide (~700 active fires); incident_size, containment %,
        personnel, cause, agency, IRWIN id.
      • **Cal Fire** — California only but richer detail (control statement, source URL).

    For California incidents that appear in both feeds, Cal Fire wins because its
    detail is better (we dedupe by name within a 5-mile bubble).

    Used by the fire-detail screen to enrich satellite point detections with the
    real incident name + management metadata.
    """
    nifc_task = asyncio.create_task(fetch_nifc())
    calfire_task = asyncio.create_task(fetch_calfire())
    nifc_res, calfire_res = await asyncio.gather(
        nifc_task, calfire_task, return_exceptions=True
    )

    rows: list[dict[str, object]] = []

    # Cal Fire first so its richer rows are kept on dedupe.
    set_source_health(
        response,
        {
            "nifc": DOWN if isinstance(nifc_res, Exception) else OK,
            "calfire": DOWN if isinstance(calfire_res, Exception) else OK,
        },
    )

    if isinstance(calfire_res, Exception):
        logger.warning("calfire query failed: %s", calfire_res)
    else:
        for inc in calfire_res:
            d = haversine_mi(lat, lon, inc.lat, inc.lon)
            if d > radius_mi:
                continue
            rows.append(
                {
                    "source": "calfire",
                    "id": f"calfire-{inc.id}",
                    "name": inc.name,
                    "lat": inc.lat,
                    "lon": inc.lon,
                    "distance_mi": round(d, 2),
                    "acres": inc.acres,
                    "contained_pct": inc.contained_pct,
                    "personnel": None,
                    "cause": None,
                    "started": inc.started,
                    "agency": inc.agency,
                    "state": "CA",
                    "county": inc.county,
                    "location": inc.location,
                    "control_statement": inc.control_statement,
                    "url": inc.url,
                }
            )

    if isinstance(nifc_res, Exception):
        logger.warning("nifc query failed: %s", nifc_res)
    else:
        for inc in nifc_res:
            d = haversine_mi(lat, lon, inc.lat, inc.lon)
            if d > radius_mi:
                continue
            rows.append(
                {
                    "source": "nifc",
                    "id": f"nifc-{inc.id}",
                    "name": inc.name,
                    "lat": inc.lat,
                    "lon": inc.lon,
                    "distance_mi": round(d, 2),
                    "acres": inc.acres,
                    "contained_pct": inc.contained_pct,
                    "personnel": inc.personnel,
                    "cause": inc.cause,
                    "started": inc.discovered,
                    "agency": inc.agency,
                    "state": inc.state,
                    "county": None,
                    "location": None,
                    "control_statement": None,
                    "url": None,
                }
            )

    # Same incident often appears in both feeds for CA fires. Instead of
    # dropping the duplicate we MERGE: keep the first-seen base (Cal Fire,
    # which has the URL + control statement) and fill any null fields from
    # the duplicate (NIFC, which has personnel + cause).
    merged: list[dict[str, object]] = []
    for r in rows:
        norm = _normalize_name(str(r["name"]))
        rl_lat = float(r["lat"])  # type: ignore[arg-type]
        rl_lon = float(r["lon"])  # type: ignore[arg-type]
        # Only dedupe on a REAL name. Two distinct unnamed fires both normalize
        # to a placeholder ("unnamed"/""/"none"), so name-matching them would
        # merge two separate nearby incidents into one and drop a real fire.
        # Generic-named rows are always kept distinct.
        match_idx = (
            None
            if norm in _GENERIC_NAMES
            else next(
                (
                    i
                    for i, prev in enumerate(merged)
                    if _normalize_name(str(prev["name"])) == norm
                    and haversine_mi(rl_lat, rl_lon, float(prev["lat"]), float(prev["lon"]))  # type: ignore[arg-type]
                    < 5.0
                ),
                None,
            )
        )
        if match_idx is None:
            merged.append(r)
        else:
            base = merged[match_idx]
            # Fill any null/missing fields on the base from the duplicate.
            for key in (
                "acres", "contained_pct", "personnel", "cause", "started",
                "agency", "state", "county", "location", "control_statement",
                "url",
            ):
                if base.get(key) in (None, "") and r.get(key) not in (None, ""):
                    base[key] = r[key]

    merged.sort(key=lambda x: x["distance_mi"])  # type: ignore[arg-type]
    return merged[:limit]


# Normalized names that carry no identity — a row with one of these must never
# dedupe-merge with another (they are not "the same fire", just both unnamed).
_GENERIC_NAMES = frozenset({"", "unnamed", "none", "unknown", "null"})


def _normalize_name(name: str) -> str:
    return (
        name.lower()
        .replace(" fire", "")
        .replace("incident", "")
        .replace("-", " ")
        .replace("  ", " ")
        .strip()
    )
