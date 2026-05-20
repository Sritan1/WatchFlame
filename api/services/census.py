"""US Census Bureau reverse-geocoder.

Converts (lat, lon) → state + county. Free, no key, no auth.
We use this to scope OpenFEMA disaster lookups to the user's actual county
rather than their whole state.

Endpoint:
  https://geocoding.geo.census.gov/geocoder/geographies/coordinates
  ?x=LON&y=LAT&benchmark=Public_AR_Current&vintage=Current_Current
  &layers=86&format=json
  (layer 86 = Counties; Public_AR_Current = current address ranges)
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

import httpx

CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"

# FIPS-to-state-code map. Census's STUSAB field is sometimes empty in the
# coordinate-geographies response, so we derive it from the FIPS code (always
# populated). Static data; this list never changes.
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


def _ttl() -> int:
    # Reverse geocode for a given coordinate doesn't change.
    # 24 hours is more than enough.
    return int(os.getenv("CENSUS_CACHE_TTL_SECONDS", "86400"))


@dataclass
class CountyInfo:
    state: str           # two-letter, e.g. "CA"
    state_fips: str      # 2-digit FIPS, e.g. "06"
    county_name: str     # e.g. "Los Angeles County"
    county_fips: str     # 5-digit FIPS (state+county), e.g. "06037"


async def reverse_geocode(lat: float, lon: float) -> CountyInfo | None:
    """Return county info for a US lat/lon, or None if not in the US."""
    cache_key = f"{round(lat, 3)}|{round(lon, 3)}"
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _ttl():
        if cached[1] is None:
            return None
        return CountyInfo(**cached[1])

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
    except Exception:
        # Census endpoint can rate-limit or return 5xx; fail soft.
        _CACHE[cache_key] = (now, None)
        return None

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
        # STUSAB is sometimes empty in this response — fall back to FIPS map.
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
