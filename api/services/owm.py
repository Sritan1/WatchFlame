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
    """Look up city candidates by name via OpenWeatherMap's free Geocoding API.

    Returns an empty list on upstream failure — the frontend "no results"
    state handles this cleanly. Logs a one-liner so failures stay visible.
    """
    url = "https://api.openweathermap.org/geo/1.0/direct"
    params = {"q": query, "limit": int(limit), "appid": _api_key()}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.TransportError) as e:
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(
            f"[owm-geocode] upstream {status} for {query!r} "
            f"({type(e).__name__}); returning empty"
        )
        return []
    # A 200 can still carry an unexpected shape (an error object, not a list).
    # Iterating a dict would yield its keys and crash on item.get(...).
    if not isinstance(data, list):
        print(f"[owm-geocode] non-list payload for {query!r}; returning empty")
        return []
    out: list[dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
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
    except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.TransportError) as e:
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
