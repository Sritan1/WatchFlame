"""Call the /risk handler with coordinates and check KBDI comes back through it.

Run from the project root with python -m scripts._smoke_risk_e2e
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.routes.risk import RiskRequest, post_risk


async def main():
    cases = [
        ("Phoenix, AZ — hot+dry summer", dict(
            temperature=37.0, humidity=15.0, wind_speed=15.0,
            days_since_rain=30, season="summer", lat=33.45, lon=-112.07,
        )),
        ("Seattle, WA — same scenario", dict(
            temperature=37.0, humidity=15.0, wind_speed=15.0,
            days_since_rain=30, season="summer", lat=47.61, lon=-122.33,
        )),
        ("Tampa, FL — same scenario", dict(
            temperature=37.0, humidity=15.0, wind_speed=15.0,
            days_since_rain=30, season="summer", lat=27.95, lon=-82.46,
        )),
        ("Manual (no lat/lon) — same wx + days_since_rain=30", dict(
            temperature=37.0, humidity=15.0, wind_speed=15.0,
            days_since_rain=30, season="summer",
        )),
    ]
    for label, kw in cases:
        body = RiskRequest(**kw)
        resp = await post_risk(body)
        print(f"{label}")
        print(
            f"  score={resp.risk_score:.4f} global={resp.danger_level} "
            f"regional={resp.regional_level} state={resp.regional_state} "
            f"kbdi={resp.kbdi}"
        )
        print(f"  factors: {resp.factors.model_dump()}")
        print()


if __name__ == "__main__":
    asyncio.run(main())
