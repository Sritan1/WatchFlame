import os
import time
from typing import Any

import httpx
from fastapi import HTTPException

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


def _ttl() -> int:
    return int(os.getenv("CACHE_TTL_SECONDS", "300"))


def _api_key() -> str:
    key = os.getenv("OPENWEATHERMAP_API_KEY")
    if not key:
        raise RuntimeError("OPENWEATHERMAP_API_KEY is not set; copy api/.env.example to api/.env")
    return key


async def geocode_city(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Look up US city candidates by name via OpenWeatherMap's free Geocoding API.

    The search is scoped to the United States (this is a US wildfire app): OWM's
    geocoder restricts to a country when the query ends in ",<country code>", so
    we append ",US" — which also makes it return US matches (up to `limit`)
    rather than foreign cities that share the name (e.g. "London" returns
    London KY/OH/... instead of London GB). Results are additionally filtered to
    country == "US" as a guarantee.

    Returns the matching cities, or an empty list when the query genuinely has
    no US match (a successful lookup with zero results). Raises HTTPException(503)
    on an upstream failure or an unexpected non-list payload, so the caller can
    tell "the search service is down" apart from "no city by that name" — the
    frontend shows a distinct "search unavailable" state instead of a misleading
    "No matches". Mirrors fetch_current_weather's 503-on-outage contract. Logs a
    one-liner so failures stay visible.
    """
    url = "https://api.openweathermap.org/geo/1.0/direct"
    q = query.strip()
    if not q.lower().endswith(",us"):
        q = f"{q},US"
    params = {"q": q, "limit": int(limit), "appid": _api_key()}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.TransportError, ValueError) as e:
        # ValueError covers a non-JSON 200 body (resp.json() decode failure).
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(
            f"[owm-geocode] upstream {status} for {query!r} "
            f"({type(e).__name__}); reporting unavailable"
        )
        raise HTTPException(status_code=503, detail="Geocoding service unavailable") from e
    # A 200 can still carry an unexpected shape (an error object, not a list).
    # That's a real upstream problem, not a genuine empty result — surface it as
    # an outage rather than silently returning "no matches".
    if not isinstance(data, list):
        print(f"[owm-geocode] non-list payload for {query!r}; reporting unavailable")
        raise HTTPException(status_code=503, detail="Geocoding service unavailable")
    out: list[dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        if item.get("country") != "US":
            continue  # US-only search (guarantee alongside the ",US" query)
        out.append(
            {
                "name": item.get("name"),
                "state": item.get("state"),
                "country": item.get("country"),
                "lat": item.get("lat"),
                "lon": item.get("lon"),
            }
        )
    return out


async def fetch_current_weather(lat: float, lon: float) -> dict[str, Any]:
    """Current weather for a point. Raises HTTPException(503) on upstream
    failure — the frontend's TanStack Query error state handles this and
    every weather field is non-nullable in the response contract, so we
    can't return a half-filled placeholder dict.
    """
    cache_key = f"{round(lat, 2)}|{round(lon, 2)}"
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _ttl():
        return cached[1]

    url = "https://api.openweathermap.org/data/2.5/weather"
    params = {"lat": lat, "lon": lon, "appid": _api_key(), "units": "metric"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (
        httpx.HTTPStatusError,
        httpx.TimeoutException,
        httpx.TransportError,
        ValueError,  # a 200 with a non-JSON body → resp.json() raises; raise 503, not 500
    ) as e:
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(
            f"[owm] upstream {status} for {lat:.2f},{lon:.2f} "
            f"({type(e).__name__}); raising 503"
        )
        raise HTTPException(status_code=503, detail="Weather service unavailable")

    # A 200 with a null/missing `main`/`wind` or a non-dict `weather[0]` (OWM
    # occasionally returns a bare error object) must degrade, not 500. `.get(k)
    # or {}` handles both the missing-key and explicit-null cases.
    if not isinstance(data, dict):
        print(f"[owm] non-object payload for {lat:.2f},{lon:.2f}; raising 503")
        raise HTTPException(status_code=503, detail="Weather service unavailable")
    main = data.get("main") or {}
    wind = data.get("wind") or {}
    weather_arr = data.get("weather") or [{}]
    first = weather_arr[0] if isinstance(weather_arr, list) and weather_arr else {}
    conditions = first.get("description") if isinstance(first, dict) else None

    out = {
        "temperature": main.get("temp"),
        "humidity": main.get("humidity"),
        "wind_speed": (wind.get("speed") or 0) * 3.6,  # m/s -> km/h
        "wind_deg": wind.get("deg"),  # direction wind is coming FROM, 0-360
        "conditions": conditions,
        "location": {"lat": lat, "lon": lon, "name": data.get("name")},
    }
    _CACHE[cache_key] = (now, out)
    return out
