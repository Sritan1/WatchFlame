"""FEMA disaster declarations. Public, free, no key.

Tells the Safety screen whether a federal declaration is active where the user is,
which separates "buildings that might open" from an emergency underway. FEMA returns
a row per disaster and county, so we dedupe by disaster number.
"""

from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from typing import Any

from ..core import http
from ..core.source_health import SourceUnavailable

OPENFEMA_URL = (
    "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries"
)

_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}

# Failures cached separately, because an empty list here means "nothing declared"
# and an outage must never be remembered as that.
_FAIL_CACHE: dict[str, float] = {}


def _ttl() -> int:
    # Declarations move over hours and days, so 15 minutes is plenty.
    return int(os.getenv("OPENFEMA_CACHE_TTL_SECONDS", "900"))


def _fail_ttl() -> int:
    # How long a failure keeps us from trying again.
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
    """Does this FEMA area cover the jurisdiction we're asking about?

    FEMA writes "Fairfax (County)" and "Fairfax (City)", two different places, and a
    plain substring test matched one to the other. Name has to match as a whole word
    and the type has to agree. Rows with no bracketed type match on name alone.
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
    """Declarations covering one county, active or recently ended.

    Active means no end date. The last 30 days of finished events come too, so a
    fire contained yesterday still shows. Pass `is_city` for an independent city,
    which FEMA treats as its own jurisdiction.
    """
    if not state or not county_name:
        return []

    cache_key = f"{state}|{county_name.lower()}|{'city' if is_city else 'county'}"
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _ttl():
        return [_to_decl(r) for r in cached[1]]

    # Raise from here instead of asking again. It has to stay a raise, or the route
    # reports "nothing declared".
    failed_at = _FAIL_CACHE.get(cache_key)
    if failed_at is not None and now - failed_at < _fail_ttl():
        raise SourceUnavailable("openfema query failed (cached)")

    # Ask FEMA for the state and let it filter on the end date. The county match is
    # ours, because parishes and boroughs get labeled inconsistently.
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
        resp = await http.get(OPENFEMA_URL, params=params, timeout=20)
        resp.raise_for_status()
        payload = resp.json()
    except Exception as e:
        # A real outage. Never cache the empty result as "nothing declared".
        _FAIL_CACHE[cache_key] = now
        raise SourceUnavailable("openfema query failed") from e

    # Back up, so clear the failure marker.
    _FAIL_CACHE.pop(cache_key, None)

    summaries = payload.get("DisasterDeclarationsSummaries", [])
    needle = county_name.lower().replace(" county", "").strip()

    matched: list[dict[str, Any]] = []
    seen_disasters: set[int] = set()
    for s in summaries:
        area = (s.get("designatedArea") or "").lower()
        if _area_matches(area, needle, is_city):
            # A matched record can still carry a junk disaster number, so skip the
            # row rather than killing the loop.
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
