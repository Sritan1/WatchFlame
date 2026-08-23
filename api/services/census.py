"""Census Bureau reverse-geocoder, turning coordinates into a state and county.
Free, no key.

We need the county so a FEMA lookup is about where the user actually lives rather
than their whole state.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

import httpx

from ..core.source_health import SourceUnavailable

CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"

# Census leaves its state-abbreviation field empty often enough that we work the
# state out from the FIPS code, which is always there.
_FIPS_TO_STATE: dict[str, str] = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
    "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
    "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
    "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
    "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
    "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
    "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
    "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
    "54": "WV", "55": "WI", "56": "WY",
    "60": "AS", "66": "GU", "69": "MP", "72": "PR", "78": "VI",
}

_CACHE: dict[str, tuple[float, dict[str, Any] | None]] = {}

# Failures get their own cache. A success here can be None, meaning the point is
# genuinely not in a US county, and an outage must never be mistaken for that.
_FAIL_CACHE: dict[str, float] = {}


def _ttl() -> int:
    # County lines don't move, so a day is conservative.
    return int(os.getenv("CENSUS_CACHE_TTL_SECONDS", "86400"))


def _fail_ttl() -> int:
    # How long a failure keeps us from trying again.
    return int(os.getenv("CENSUS_FAIL_CACHE_TTL_SECONDS", "60"))


@dataclass
class CountyInfo:
    state: str           # two-letter, e.g. "CA"
    state_fips: str      # 2-digit FIPS, e.g. "06"
    county_name: str     # e.g. "Los Angeles County"
    county_fips: str     # 5-digit FIPS (state+county), e.g. "06037"


async def reverse_geocode(lat: float, lon: float) -> CountyInfo | None:
    """The county a point falls in, or None if it isn't in one. A real outage raises
    instead, so callers can tell that apart from a point that isn't in the US."""
    cache_key = f"{round(lat, 3)}|{round(lon, 3)}"
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _ttl():
        if cached[1] is None:
            return None
        return CountyInfo(**cached[1])

    # Raise from here instead of asking again. It has to stay a raise, or the route
    # reports "not in the US".
    failed_at = _FAIL_CACHE.get(cache_key)
    if failed_at is not None and now - failed_at < _fail_ttl():
        raise SourceUnavailable("census reverse-geocode failed (cached)")

    params = {
        "x": str(lon),
        "y": str(lat),
        "benchmark": "Public_AR_Current",
        "vintage": "Current_Current",
        "layers": "86",  # Counties layer
        "format": "json",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(CENSUS_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        # A real outage. Say down, don't pretend the user is abroad.
        _FAIL_CACHE[cache_key] = now
        raise SourceUnavailable("census reverse-geocode failed") from e

    # Back up, so clear the failure marker.
    _FAIL_CACHE.pop(cache_key, None)

    geos = (
        data.get("result", {})
        .get("geographies", {})
        .get("Counties", [])
    )
    if not geos:
        _CACHE[cache_key] = (now, None)
        return None

    g = geos[0]
    state_fips = g.get("STATE", "")
    info = {
        # Their abbreviation field is often blank, so fall back to the FIPS map.
        "state": g.get("STUSAB") or _FIPS_TO_STATE.get(state_fips, ""),
        "state_fips": state_fips,
        "county_name": g.get("BASENAME", "") or g.get("NAME", ""),
        "county_fips": g.get("GEOID", ""),
    }
    if not info["state"] or not info["county_name"]:
        _CACHE[cache_key] = (now, None)
        return None

    _CACHE[cache_key] = (now, info)
    return CountyInfo(**info)
