"""Shared geographic helpers used across routes + services.

Previously the haversine formula, the US bounding box / membership test, and the
degree-bbox-around-a-point math each had two or three near-identical copies.
Centralizing them means distances and query envelopes are computed on one earth
model everywhere.
"""
from __future__ import annotations

from math import asin, cos, radians, sin, sqrt

# Earth radius in miles (the value the codebase has standardized on).
_EARTH_RADIUS_MI = 3958.7613

# Generous CONUS+ bounding box (minLon, minLat, maxLon, maxLat) — covers the
# lower 48 plus AK/HI margins. Used to short-circuit clearly out-of-US queries.
US_BBOX = (-180.0, 18.0, -66.0, 72.0)


def haversine_mi(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    """Great-circle distance between two lat/lon points, in miles."""
    d_lat = radians(b_lat - a_lat)
    d_lon = radians(b_lon - a_lon)
    h = (
        sin(d_lat / 2) ** 2
        + sin(d_lon / 2) ** 2 * cos(radians(a_lat)) * cos(radians(b_lat))
    )
    return 2 * _EARTH_RADIUS_MI * asin(sqrt(h))


def in_us(lat: float, lon: float) -> bool:
    """True when the point falls within the generous US bounding box."""
    min_lon, min_lat, max_lon, max_lat = US_BBOX
    return min_lat <= lat <= max_lat and min_lon <= lon <= max_lon


def bbox_around(
    lat: float, lon: float, radius_mi: float
) -> tuple[float, float, float, float]:
    """Approximate square bbox (minLon, minLat, maxLon, maxLat) in degrees around
    a point. 1° latitude ≈ 69 mi; longitude is scaled by cos(lat) with a floor so
    the box doesn't explode near the poles. Over-fetches slightly — fine for an
    envelope-intersect query that's trimmed to the exact radius afterward."""
    d_lat = radius_mi / 69.0
    d_lon = radius_mi / (69.0 * max(cos(radians(lat)), 0.1))
    return (lon - d_lon, lat - d_lat, lon + d_lon, lat + d_lat)
