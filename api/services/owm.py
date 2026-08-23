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
    """Find US cities by name.

    The query gets ",US" appended, which is how the geocoder scopes to a country.
    Search "London" and you want Kentucky and Ohio, not England. Results are filtered
    on country too. An empty list means no such city, an outage raises a 503.
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
        # ValueError catches a 200 that isn't JSON at all.
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(
            f"[owm-geocode] upstream {status} for {query!r} "
            f"({type(e).__name__}); reporting unavailable"
        )
        raise HTTPException(status_code=503, detail="Geocoding service unavailable") from e
    # A 200 carrying an error object instead of a list is an outage, not an empty
    # result.
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
    """Current weather for a point, raising a 503 when the upstream fails. Every
    field in the response is required, so there is no half-filled dict to hand
    back and the frontend's error state takes over instead."""
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
        ValueError,  # a 200 that isn't JSON at all
    ) as e:
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(
            f"[owm] upstream {status} for {lat:.2f},{lon:.2f} "
            f"({type(e).__name__}); raising 503"
        )
        raise HTTPException(status_code=503, detail="Weather service unavailable")

    # OpenWeather sometimes returns a bare error object with a 200, so the main and
    # wind blocks can be missing. Degrade instead of 500ing.
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
        "wind_speed": (wind.get("speed") or 0) * 3.6,  # m/s into km/h
        "wind_deg": wind.get("deg"),  # direction wind is coming FROM, 0-360
        "conditions": conditions,
        "location": {"lat": lat, "lon": lon, "name": data.get("name")},
    }
    _CACHE[cache_key] = (now, out)
    return out
