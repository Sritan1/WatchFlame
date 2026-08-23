"""Shared geographic helpers, so every distance in the app uses one earth model."""
from __future__ import annotations

from math import asin, cos, radians, sin, sqrt

_EARTH_RADIUS_MI = 3958.7613

# Loose US box (minLon, minLat, maxLon, maxLat). Wide enough for the lower 48 plus
# Alaska and Hawaii. Only used to drop obviously foreign queries early.
US_BBOX = (-180.0, 18.0, -66.0, 72.0)


def haversine_mi(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    d_lat = radians(b_lat - a_lat)
    d_lon = radians(b_lon - a_lon)
    h = (
        sin(d_lat / 2) ** 2
        + sin(d_lon / 2) ** 2 * cos(radians(a_lat)) * cos(radians(b_lat))
    )
    return 2 * _EARTH_RADIUS_MI * asin(sqrt(h))


def in_us(lat: float, lon: float) -> bool:
    min_lon, min_lat, max_lon, max_lat = US_BBOX
    return min_lat <= lat <= max_lat and min_lon <= lon <= max_lon


def bbox_around(
    lat: float, lon: float, radius_mi: float
) -> tuple[float, float, float, float]:
    """Rough box in degrees around a point, as (minLon, minLat, maxLon, maxLat).

    Longitude scales by cos(lat), floored so the box can't blow up near the poles.
    It over-grabs. Callers trim to the exact radius anyway.
    """
    d_lat = radius_mi / 69.0
    d_lon = radius_mi / (69.0 * max(cos(radians(lat)), 0.1))
    return (lon - d_lon, lat - d_lat, lon + d_lon, lat + d_lat)
