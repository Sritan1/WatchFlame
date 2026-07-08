"""OpenFEMA Disaster Declarations Summary v2 client.

Public, free, no key. Returns FEMA-declared disasters (Major Disasters,
Emergency Declarations, Fire Management Assistance) with one row per
declaration × designated county.

We use this to surface the "FEMA disaster currently active in your county"
context bridge between our static potential-shelter layer and the live
emergency reality. When this banner is on, the Safety screen's static
shelter list is much more likely to be relevant.

Endpoint:
  https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries

OData filter syntax. Example:
  $filter=state eq 'CA' and incidentEndDate eq null
        &$orderby=declarationDate desc

Note: FEMA returns one record per (disaster, county). A wildfire in three CA
counties is three rows. We dedupe by disaster number on the client.
"""

from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from typing import Any

import httpx

from ..core.source_health import SourceUnavailable

OPENFEMA_URL = (
    "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries"
)

_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}

# Short-lived negative cache for transient upstream failures. Separate from
# _CACHE because a success stores a list, where [] means "genuinely no active
# declarations" and is trusted for the full TTL. A failure must not be
# remembered as that empty answer. During an OpenFEMA outage this caps us at one
# probe per _fail_ttl() window rather than re-querying on every request, while
# still recovering within a minute. Mirrors the census + FIRMS degraded caches.
_FAIL_CACHE: dict[str, float] = {}


def _ttl() -> int:
    # Disasters change on the order of hours/days. 15-minute cache is plenty.
    return int(os.getenv("OPENFEMA_CACHE_TTL_SECONDS", "900"))


def _fail_ttl() -> int:
    # How long a transient failure suppresses re-hitting the upstream.
    return int(os.getenv("OPENFEMA_FAIL_CACHE_TTL_SECONDS", "60"))


@dataclass
class DisasterDeclaration:
    disaster_number: int
    declaration_type: str       # 'DR' (Major Disaster), 'EM' (Emergency), 'FM' (Fire Management)
    declaration_date: str       # ISO date string
    incident_type: str          # 'Fire', 'Severe Storm', 'Hurricane', etc.
    incident_begin: str | None
    incident_end: str | None
    state: str
    designated_area: str        # e.g. "Los Angeles (County)"
    title: str                  # plain-English declaration title


def _area_matches(area: str, needle: str, is_city: bool) -> bool:
    """Whether a lowercased FEMA `designatedArea` covers this jurisdiction.

    FEMA tags rows "<Name> (County)" / "(Parish)" / "(Borough)" for counties and
    "<Name> (City)" for independent cities. A bare substring test matched a
    county to the like-named independent city (e.g. Fairfax County VA to a
    "Fairfax (City)" declaration). We require a whole-word name match AND that
    the designation TYPE agrees, so the two distinct jurisdictions don't
    cross-match. Rows with no type qualifier fall through to the name match.
    """
    if not needle or re.search(rf"\b{re.escape(needle)}\b", area) is None:
        return False
    is_city_area = "(city)" in area
    is_county_area = "(" in area and not is_city_area
    if is_city_area:
        return is_city
    if is_county_area:
        return not is_city
    return True


async def fetch_active_for_county(
    state: str,
    county_name: str,
    is_city: bool = False,
) -> list[DisasterDeclaration]:
    """Active or recently-active declarations covering a specific county.

    'Active' = incidentEndDate is null. We also include the last 30 days of
    just-ended events so a freshly-contained fire still surfaces. `is_city`
    distinguishes an independent city from a like-named county (they are separate
    FEMA jurisdictions).
    """
    if not state or not county_name:
        return []

    cache_key = f"{state}|{county_name.lower()}|{'city' if is_city else 'county'}"
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _ttl():
        return [_to_decl(r) for r in cached[1]]

    # A recent failure for this county? Serve the outage from the negative cache
    # so we don't re-query a failing endpoint on every request, but still raise
    # so the route surfaces `down` (never a silent "no declarations").
    failed_at = _FAIL_CACHE.get(cache_key)
    if failed_at is not None and now - failed_at < _fail_ttl():
        raise SourceUnavailable("openfema query failed (cached)")

    # FEMA's designatedArea field includes "(County)" suffix for counties.
    # Some boroughs / parishes use different suffixes. Match prefix loosely.
    # Use $filter to scope by state + active end date; filter by county client-side.
    params = {
        "$filter": (
            f"state eq '{state}' and "
            "(incidentEndDate eq null or incidentEndDate ge '"
            f"{_thirty_days_ago_iso()}'"
            ")"
        ),
        "$orderby": "declarationDate desc",
        "$top": "200",
        "$select": (
            "disasterNumber,declarationType,declarationDate,"
            "incidentType,incidentBeginDate,incidentEndDate,"
            "state,designatedArea,declarationTitle"
        ),
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(OPENFEMA_URL, params=params)
            resp.raise_for_status()
            payload = resp.json()
    except Exception as e:
        # Real outage — record a short-lived failure so we probe at most once
        # per _fail_ttl() instead of re-querying every request, and don't cache
        # an empty result as if there were genuinely no declarations. Signal
        # `down` so the route can surface it.
        _FAIL_CACHE[cache_key] = now
        raise SourceUnavailable("openfema query failed") from e

    # Fetch succeeded — drop any stale failure marker for this county.
    _FAIL_CACHE.pop(cache_key, None)

    summaries = payload.get("DisasterDeclarationsSummaries", [])
    needle = county_name.lower().replace(" county", "").strip()

    matched: list[dict[str, Any]] = []
    seen_disasters: set[int] = set()
    for s in summaries:
        area = (s.get("designatedArea") or "").lower()
        if _area_matches(area, needle, is_city):
            # disasterNumber can be null/non-numeric on a matched record; skip
            # rather than raising out of the whole parse loop.
            try:
                num = int(s.get("disasterNumber"))
            except (TypeError, ValueError):
                continue
            if num in seen_disasters:
                continue
            seen_disasters.add(num)
            matched.append(
                {
                    "disaster_number": num,
                    "declaration_type": s.get("declarationType") or "",
                    "declaration_date": s.get("declarationDate") or "",
                    "incident_type": s.get("incidentType") or "",
                    "incident_begin": s.get("incidentBeginDate"),
                    "incident_end": s.get("incidentEndDate"),
                    "state": s.get("state") or state,
                    "designated_area": s.get("designatedArea") or "",
                    "title": s.get("declarationTitle") or "",
                }
            )

    _CACHE[cache_key] = (now, matched)
    return [_to_decl(r) for r in matched]


def _to_decl(r: dict[str, Any]) -> DisasterDeclaration:
    return DisasterDeclaration(**r)


def _thirty_days_ago_iso() -> str:
    from datetime import datetime, timedelta, timezone
    d = datetime.now(timezone.utc) - timedelta(days=30)
    return d.strftime("%Y-%m-%dT%H:%M:%S.000Z")
