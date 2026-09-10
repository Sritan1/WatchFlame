"""OpenStreetMap lookups for buildings that could serve as shelters. Public and
free, so behave. An hour of caching, a server-side timeout, and a US box so we never
ask for the whole planet. Wants assembly points, community centres, generic shelters
and social facilities. Picnic shelters, bus stops and homeless shelters get filtered.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

import httpx

from ..core import http
from ..core.geo import in_us
from ..core.source_health import SourceUnavailable

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}

# Failures cached apart from results, so an outage is never remembered as a real
# "nothing here" answer.
_FAIL_CACHE: dict[str, float] = {}


def _ttl() -> int:
    # Community centres don't move, so an hour is plenty.
    return int(os.getenv("SHELTER_CACHE_TTL_SECONDS", "3600"))


def _fail_ttl() -> int:
    return int(os.getenv("SHELTER_FAIL_CACHE_TTL_SECONDS", "60"))


# Things tagged as shelters that nobody should evacuate to.
_EXCLUDED_SHELTER_TYPES = {
    "picnic_shelter",
    "public_transport",
    "lean_to",
    "rock_shelter",
    "sun_shelter",
    "weather_shelter",
    "field_shelter",
    "field_hut",
    "basic_hut",
    "bivouac",
    "lookout",
    "lookout_tower",
    "lookout_shelter",
    "shooting",
    "hunting_stand",
    "gazebo",
    "pavilion",
    "bus_station",
}

_EXCLUDED_SOCIAL_FACILITY = {
    "outreach",
    "soup_kitchen",
    "ambulatory_care",
    "food_bank",
    "clothing_bank",
}


def _shelter_type_for(tags: dict[str, str]) -> str | None:
    """A readable category for this row, or None to drop it."""
    if tags.get("emergency") == "assembly_point":
        return "Assembly point"
    if tags.get("amenity") == "community_centre":
        return "Community centre"
    if tags.get("amenity") == "fire_station":
        return "Fire station"
    if tags.get("amenity") == "shelter":
        sub = tags.get("shelter_type", "").lower()
        if sub in _EXCLUDED_SHELTER_TYPES:
            return None
        if sub == "homeless_shelter":
            # A homeless shelter is not an evacuation point.
            return None
        return f"Shelter ({sub})" if sub else "Shelter"
    if tags.get("social_facility") == "shelter":
        sub = tags.get("social_facility:for", "").lower()
        if sub in _EXCLUDED_SOCIAL_FACILITY or "homeless" in sub:
            return None
        return "Social shelter"
    return None


@dataclass
class Shelter:
    id: str
    name: str
    lat: float
    lon: float
    type: str
    tags: dict[str, str]


async def fetch_shelters(
    lat: float,
    lon: float,
    radius_km: float = 80.0,
) -> list[Shelter]:
    """Candidate shelters near a point, unsorted and possibly hundreds. The route
    sorts and trims. Empty outside the US.

    A failed refresh serves the stale list. Buildings don't move, and hours-old data
    beats a "feed is down" every time a public mirror hiccups. Only a cold cache and
    a failing upstream together report down."""
    if not in_us(lat, lon):
        return []

    radius_m = int(min(max(radius_km, 5.0), 200.0) * 1000)
    cache_key = f"{round(lat, 2)}|{round(lon, 2)}|{radius_m}"
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _ttl():
        return [_to_shelter(r) for r in cached[1]]

    # Stale or missing, and we're inside a backoff window. Serve whatever we last
    # got, and only admit defeat when there is nothing to fall back on.
    failed_at = _FAIL_CACHE.get(cache_key)
    if failed_at is not None and now - failed_at < _fail_ttl():
        if cached is not None:
            return [_to_shelter(r) for r in cached[1]]
        raise SourceUnavailable("overpass failed (cached)")

    query = f"""
[out:json][timeout:25];
(
  node["emergency"="assembly_point"](around:{radius_m},{lat},{lon});
  node["amenity"="community_centre"](around:{radius_m},{lat},{lon});
  node["amenity"="shelter"](around:{radius_m},{lat},{lon});
  node["amenity"="fire_station"](around:{radius_m},{lat},{lon});
  node["social_facility"="shelter"](around:{radius_m},{lat},{lon});
);
out body 600;
""".strip()

    headers = {
        # Overpass asks clients to say who they are, and the public mirror
        # sometimes 406s without a real user agent.
        "User-Agent": "wildfire-app/0.2 (portfolio project; contact via repo)",
        "Accept": "application/json",
    }
    try:
        resp = await http.post(OVERPASS_URL, data={"data": query}, headers=headers, timeout=30)
        resp.raise_for_status()
        payload = resp.json()
    except (
        httpx.HTTPStatusError,
        httpx.TimeoutException,
        httpx.TransportError,
        ValueError,  # a 200 that isn't JSON at all
    ) as e:
        # The public mirrors throttle under load. Note the failure, back off, and
        # prefer the last good list over reporting down. Only raise when we have
        # nothing cached at all.
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        _FAIL_CACHE[cache_key] = now
        if cached is not None:
            print(
                f"[overpass] upstream {status} for {lat:.2f},{lon:.2f} "
                f"({type(e).__name__}); serving stale cache ({len(cached[1])} rows)"
            )
            return [_to_shelter(r) for r in cached[1]]
        print(
            f"[overpass] upstream {status} for {lat:.2f},{lon:.2f} "
            f"({type(e).__name__}); no cache, reporting down"
        )
        raise SourceUnavailable(f"overpass upstream {status}") from e

    raw_rows: list[dict[str, Any]] = []
    for el in payload.get("elements", []):
        if el.get("type") != "node":
            continue
        tags = el.get("tags") or {}
        kind = _shelter_type_for(tags)
        if kind is None:
            continue
        # One node with a bad coordinate would otherwise kill the whole parse,
        # and the route would never see why. Skip the row.
        try:
            lat, lon = float(el["lat"]), float(el["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        raw_rows.append(
            {
                "id": str(el.get("id")),
                "name": tags.get("name") or tags.get("operator") or kind,
                "lat": lat,
                "lon": lon,
                "type": kind,
                "tags": tags,
            }
        )

    _CACHE[cache_key] = (now, raw_rows)
    _FAIL_CACHE.pop(cache_key, None)
    return [_to_shelter(r) for r in raw_rows]


def _to_shelter(r: dict[str, Any]) -> Shelter:
    return Shelter(
        id=r["id"],
        name=r["name"],
        lat=r["lat"],
        lon=r["lon"],
        type=r["type"],
        tags=r["tags"],
    )
