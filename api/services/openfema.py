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
import time
from dataclasses import dataclass
from typing import Any

import httpx

from ..core.source_health import SourceUnavailable

OPENFEMA_URL = (
    "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries"
)

_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}


def _ttl() -> int:
    # Disasters change on the order of hours/days. 15-minute cache is plenty.
    return int(os.getenv("OPENFEMA_CACHE_TTL_SECONDS", "900"))


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


async def fetch_active_for_county(
    state: str,
    county_name: str,
) -> list[DisasterDeclaration]:
    """Active or recently-active declarations covering a specific county.

    'Active' = incidentEndDate is null. We also include the last 30 days of
    just-ended events so a freshly-contained fire still surfaces.
    """
    if not state or not county_name:
        return []

    cache_key = f"{state}|{county_name.lower()}"
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _ttl():
        return [_to_decl(r) for r in cached[1]]

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
        # Real outage — don't cache an empty result as if there were genuinely
        # no declarations, and signal `down` so the route can surface it.
        raise SourceUnavailable("openfema query failed") from e

    summaries = payload.get("DisasterDeclarationsSummaries", [])
    needle = county_name.lower().replace(" county", "").strip()

    matched: list[dict[str, Any]] = []
    seen_disasters: set[int] = set()
    for s in summaries:
        area = (s.get("designatedArea") or "").lower()
        if needle and needle in area:
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
