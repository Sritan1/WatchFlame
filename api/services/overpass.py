"""OpenStreetMap Overpass API client for shelter / assembly-point lookups.

Public, free, no key required. We're polite citizens:
- 1-hour in-memory cache (Overpass's free tier ~10k requests/day)
- 25 s server-side timeout
- US bbox guard so we don't accidentally query global

Tag strategy:
  • emergency=assembly_point      — explicit gathering points (best signal)
  • amenity=community_centre      — civic buildings often used as shelters
  • amenity=shelter               — generic shelters; we filter out non-applicable
                                    sub-types (picnic, public transport, etc.)
  • social_facility=shelter       — registered social-service shelters
                                    (homeless shelters explicitly excluded)
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

import httpx

from ..core.geo import in_us
from ..core.source_health import SourceUnavailable

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}

# Short-lived negative cache for transient upstream failures — bounds us to one
# probe per _fail_ttl() window instead of re-hitting a throttled mirror on every
# request. Kept separate from _CACHE so a failure is never remembered as a real
# "no shelters here" answer. Mirrors the pattern in census.py / firms.py.
_FAIL_CACHE: dict[str, float] = {}


def _ttl() -> int:
    # Overpass data is updated minute-to-minute by OSM contributors but for our
    # purposes (rare event, "potential shelters" rarely move) an hour is plenty.
    return int(os.getenv("SHELTER_CACHE_TTL_SECONDS", "3600"))


def _fail_ttl() -> int:
    return int(os.getenv("SHELTER_FAIL_CACHE_TTL_SECONDS", "60"))


# ----- Tag filtering --------------------------------------------------------

# Sub-types we explicitly DON'T want returned as evacuation shelters.
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
    """Return a normalized human-readable category, or None to skip the row."""
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
            # Don't surface homeless shelters as wildfire evacuation points.
            return None
        return f"Shelter ({sub})" if sub else "Shelter"
    if tags.get("social_facility") == "shelter":
        sub = tags.get("social_facility:for", "").lower()
        if sub in _EXCLUDED_SOCIAL_FACILITY or "homeless" in sub:
            return None
        return "Social shelter"
    return None


# ----- US bbox guard --------------------------------------------------------

# ----- Public API -----------------------------------------------------------

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
    """Fetch potential shelters within `radius_km` of (lat, lon).

    Returns up to ~hundreds of nodes; the route handler will sort by distance
    and trim. Caching is by (rounded lat, rounded lon, rounded radius).
    Outside US returns []."""
    if not in_us(lat, lon):
        return []

    radius_m = int(min(max(radius_km, 5.0), 200.0) * 1000)
    cache_key = f"{round(lat, 2)}|{round(lon, 2)}|{radius_m}"
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _ttl():
        return [_to_shelter(r) for r in cached[1]]

    # Recent failure for this area? Back off and signal the outage so /shelters
    # reports shelters_osm `down` instead of a misleading empty candidate list.
    failed_at = _FAIL_CACHE.get(cache_key)
    if failed_at is not None and now - failed_at < _fail_ttl():
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
        # Overpass operators ask clients to identify themselves; without a
        # descriptive UA the public mirror sometimes returns 406.
        "User-Agent": "wildfire-app/0.2 (portfolio project; contact via repo)",
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(OVERPASS_URL, data={"data": query}, headers=headers)
            resp.raise_for_status()
            payload = resp.json()
    except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.TransportError) as e:
        # Overpass public mirrors throttle to 429 / 504 under load. Record a
        # short-lived failure marker so we back off the mirror, and raise so
        # /shelters reports `down` rather than an empty (misleading) list.
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(
            f"[overpass] upstream {status} for {lat:.2f},{lon:.2f} "
            f"({type(e).__name__}); reporting down"
        )
        _FAIL_CACHE[cache_key] = now
        raise SourceUnavailable(f"overpass upstream {status}") from e

    raw_rows: list[dict[str, Any]] = []
    for el in payload.get("elements", []):
        if el.get("type") != "node":
            continue
        tags = el.get("tags") or {}
        kind = _shelter_type_for(tags)
        if kind is None:
            continue
        # A node missing/with non-numeric lat/lon would abort the whole parse
        # (the route swallows our exceptions via gather()); skip the row instead.
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
