import asyncio
import logging
from math import asin, cos, radians, sin, sqrt

from fastapi import APIRouter, Query

from ..services.calfire import fetch_active_incidents as fetch_calfire
from ..services.nifc import fetch_all_incidents as fetch_nifc

router = APIRouter(prefix="/incidents", tags=["incidents"])

logger = logging.getLogger(__name__)


def _haversine_mi(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    R = 3958.7613
    dLat = radians(b_lat - a_lat)
    dLon = radians(b_lon - a_lon)
    lat1 = radians(a_lat)
    lat2 = radians(b_lat)
    h = sin(dLat / 2) ** 2 + sin(dLon / 2) ** 2 * cos(lat1) * cos(lat2)
    return 2 * R * asin(sqrt(h))


@router.get("/near")
async def get_incidents_near(
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
    if isinstance(calfire_res, Exception):
        logger.warning("calfire query failed: %s", calfire_res)
    else:
        for inc in calfire_res:
            d = _haversine_mi(lat, lon, inc.lat, inc.lon)
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
            d = _haversine_mi(lat, lon, inc.lat, inc.lon)
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
        match_idx = next(
            (
                i
                for i, prev in enumerate(merged)
                if _normalize_name(str(prev["name"])) == norm
                and _haversine_mi(rl_lat, rl_lon, float(prev["lat"]), float(prev["lon"]))  # type: ignore[arg-type]
                < 5.0
            ),
            None,
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


def _normalize_name(name: str) -> str:
    return (
        name.lower()
        .replace(" fire", "")
        .replace("incident", "")
        .replace("-", " ")
        .replace("  ", " ")
        .strip()
    )
