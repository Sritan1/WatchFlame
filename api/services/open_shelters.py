"""Shelters open right now, from FEMA's National Shelter System. Layer 0 is the open
ones.

No federal declaration needed. Shelters open on local decisions, often before one
arrives. Records turn up missing coordinates, so parsing is defensive. Set
MOCK_OPEN_SHELTERS=1 for fixtures, the real feed is too sparse to demo with.
"""
from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from ..core import http
from ..core.geo import bbox_around
from ..core.source_health import SourceUnavailable

logger = logging.getLogger(__name__)

NSS_OPEN_SHELTERS_URL = (
    "https://gis.fema.gov/arcgis/rest/services/NSS/FEMA_NSS/FeatureServer/0/query"
)

_OUT_FIELDS = ",".join(
    [
        "shelter_id",
        "shelter_name",
        "address_1",
        "city",
        "state",
        "zip",
        "evacuation_capacity",
        "post_impact_capacity",
        "total_population",
        "general_population",
        "ada_compliant",
        "wheelchair_accessible",
        "pet_accommodations_code",
        "org_organization_name",
        "shelter_status_code",
        "reporting_period",
        "shelter_open_date",
        "incident_name",
        "objectid",
    ]
)

_CACHE: dict[str, tuple[float, list["OpenShelter"]]] = {}

# Failures cached separately from results, as in census.py.
_FAIL_CACHE: dict[str, float] = {}


@dataclass
class OpenShelter:
    id: str
    name: str
    lat: float
    lon: float
    address: str | None
    status: str                 # OPEN, STANDBY or FULL
    capacity: int | None
    occupancy: int | None
    pet_friendly: bool | None
    ada_accessible: bool | None
    managing_org: str | None
    # Both timestamps come from FEMA's record, not from when we fetched it.
    # updated_at is the last status report, opened_at is when it opened. The status
    # report is usually missing, so opened_at is what people normally see.
    updated_at: str | None      # ISO8601 UTC
    opened_at: str | None       # ISO8601 UTC


def _mock_enabled() -> bool:
    return os.getenv("MOCK_OPEN_SHELTERS", "0") == "1"


def _ttl() -> int:
    # During an operation this changes by the hour, so keep it short.
    return int(os.getenv("OPEN_SHELTERS_CACHE_TTL_SECONDS", "300"))


def _fail_ttl() -> int:
    return int(os.getenv("OPEN_SHELTERS_FAIL_CACHE_TTL_SECONDS", "60"))


def _grid_key(lat: float, lon: float, radius_mi: float) -> str:
    return f"{round(lat, 1)}|{round(lon, 1)}|{round(radius_mi)}"


# Field parsing, defensive because these records are often half empty.

def _epoch_ms_to_iso(v: Any) -> str | None:
    try:
        return datetime.fromtimestamp(float(v) / 1000.0, tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OSError):
        return None


def _int_or_none(v: Any) -> int | None:
    try:
        if v is None:
            return None
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _yn(v: Any) -> bool | None:
    """FEMA's Y, N and UNK into a bool or None."""
    if not isinstance(v, str):
        return None
    s = v.strip().upper()
    if s in ("Y", "YES", "TRUE", "1"):
        return True
    if s in ("N", "NO", "FALSE", "0"):
        return False
    return None  # UNK / unknown


def _pet_friendly(code: Any) -> bool | None:
    if not isinstance(code, str):
        return None
    s = code.strip().upper()
    if s in ("", "UNK", "UNKNOWN"):
        return None
    if s in ("NONE", "NO", "N"):
        return False
    return True  # HOUSEHOLD_PETS / SERVICE_ANIMALS / etc.


def _address(a: dict[str, Any]) -> str | None:
    parts = [
        str(a.get("address_1")).strip() if a.get("address_1") else None,
        str(a.get("city")).strip() if a.get("city") else None,
        str(a.get("state")).strip() if a.get("state") else None,
    ]
    joined = ", ".join(p for p in parts if p)
    return joined or None


def _map_feature(feat: dict[str, Any]) -> OpenShelter | None:
    a = feat.get("attributes") or {}
    geom = feat.get("geometry") or {}
    # Read coordinates from the geometry. The latitude and longitude attribute
    # fields are usually null. Nothing to place means nothing to show.
    lon, lat = geom.get("x"), geom.get("y")
    if lon is None or lat is None:
        return None
    try:
        lon_f, lat_f = float(lon), float(lat)
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat_f <= 90 and -180 <= lon_f <= 180):
        return None

    name = a.get("shelter_name") or "Open shelter"
    capacity = _int_or_none(a.get("evacuation_capacity")) or _int_or_none(
        a.get("post_impact_capacity")
    )
    occupancy = _int_or_none(a.get("total_population"))
    if occupancy is None:
        occupancy = _int_or_none(a.get("general_population"))

    # Everything on this layer is open, but say FULL once it hits capacity.
    status = "OPEN"
    raw_status = (a.get("shelter_status_code") or "").strip().upper()
    if raw_status in ("FULL",) or (
        capacity and occupancy is not None and occupancy >= capacity
    ):
        status = "FULL"
    elif raw_status in ("ALERT", "STANDBY", "PENDING"):
        status = "STANDBY"

    ada = _yn(a.get("ada_compliant"))
    if ada is None:
        ada = _yn(a.get("wheelchair_accessible"))

    sid = a.get("shelter_id") or a.get("objectid")
    return OpenShelter(
        id=str(sid),
        name=str(name),
        lat=lat_f,
        lon=lon_f,
        address=_address(a),
        status=status,
        capacity=capacity,
        occupancy=occupancy,
        pet_friendly=_pet_friendly(a.get("pet_accommodations_code")),
        ada_accessible=ada,
        managing_org=(a.get("org_organization_name") or None),
        updated_at=_epoch_ms_to_iso(a.get("reporting_period")),
        opened_at=_epoch_ms_to_iso(a.get("shelter_open_date")),
    )


async def _fetch_nss_open_shelters(
    lat: float, lon: float, radius_mi: float
) -> list[OpenShelter]:
    """Query FEMA NSS layer 0 within an envelope around the point."""
    cache_key = _grid_key(lat, lon, radius_mi)
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _ttl():
        return cached[1]

    # Failed recently. Report down instead of an empty list
    # that reads like "no shelters near you".
    failed_at = _FAIL_CACHE.get(cache_key)
    if failed_at is not None and now - failed_at < _fail_ttl():
        raise SourceUnavailable("open-shelters failed (cached)")

    # A box around the point. The route trims to the real radius afterward, so
    # asking for slightly too much is fine.
    min_lon, min_lat, max_lon, max_lat = bbox_around(lat, lon, radius_mi)
    params = {
        "where": "1=1",
        "geometry": f"{min_lon},{min_lat},{max_lon},{max_lat}",
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": _OUT_FIELDS,
        "returnGeometry": "true",
        "outSR": "4326",
        "resultRecordCount": "50",
        "f": "json",
    }

    try:
        resp = await http.get(NSS_OPEN_SHELTERS_URL, params=params, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError) as e:
        # A real outage, so note it and report down.
        logger.warning("FEMA NSS open-shelters query failed: %s", e)
        _FAIL_CACHE[cache_key] = now
        raise SourceUnavailable("open-shelters upstream failed") from e

    # ArcGIS returns its query errors in the body with a 200 status.
    if isinstance(data, dict) and data.get("error"):
        logger.warning("FEMA NSS returned error: %s", data["error"])
        _FAIL_CACHE[cache_key] = now
        raise SourceUnavailable("open-shelters returned an error body")

    out: list[OpenShelter] = []
    for feat in data.get("features") or []:
        s = _map_feature(feat)
        if s is not None:
            out.append(s)

    _CACHE[cache_key] = (now, out)
    _FAIL_CACHE.pop(cache_key, None)
    return out


def _fixtures(lat: float, lon: float) -> list[OpenShelter]:
    """Demo shelters a mile or two from the user, with varied statuses and
    capacities to exercise the UI."""
    now = datetime.now(timezone.utc)

    def ago(minutes: int) -> str:
        return (now - timedelta(minutes=minutes)).isoformat()

    return [
        OpenShelter(
            id="nss-1001",
            name="Civic Center Evacuation Shelter",
            lat=lat + 0.018,
            lon=lon + 0.010,
            address="Civic Center Dr",
            status="OPEN",
            capacity=300,
            occupancy=142,
            pet_friendly=True,
            ada_accessible=True,
            managing_org="American Red Cross",
            updated_at=ago(12),
            opened_at=ago(60 * 30),
        ),
        OpenShelter(
            id="nss-1002",
            name="Lincoln High School Shelter",
            lat=lat - 0.030,
            lon=lon + 0.034,
            address="Lincoln High School",
            status="OPEN",
            capacity=180,
            occupancy=171,
            pet_friendly=False,
            ada_accessible=True,
            managing_org="County Emergency Management",
            updated_at=ago(47),
            opened_at=ago(60 * 54),
        ),
        OpenShelter(
            id="nss-1003",
            name="Fairgrounds Reception Center",
            lat=lat + 0.045,
            lon=lon - 0.038,
            address="County Fairgrounds",
            status="STANDBY",
            capacity=500,
            occupancy=0,
            pet_friendly=True,
            ada_accessible=True,
            managing_org="State Emergency Management",
            updated_at=ago(95),
            opened_at=None,
        ),
    ]


async def fetch_open_shelters(
    lat: float, lon: float, radius_mi: float = 50.0
) -> list[OpenShelter]:
    """Open shelters near a point, live from FEMA unless MOCK_OPEN_SHELTERS is
    set. The route trims by distance, same as it does for the candidates."""
    if _mock_enabled():
        return _fixtures(lat, lon)
    return await _fetch_nss_open_shelters(lat, lon, radius_mi)
