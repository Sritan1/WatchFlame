"""One-off smoke test: hit Open-Meteo and compute KBDI for diverse cities.

Run from project root:  python -m scripts._smoke_kbdi
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.services.openmeteo_history import fetch_kbdi_today


async def main():
    cities = [
        ("Phoenix, AZ", 33.45, -112.07),
        ("Seattle, WA", 47.61, -122.33),
        ("Tampa, FL", 27.95, -82.46),
        ("Boulder, CO", 40.02, -105.27),
        ("Honolulu, HI", 21.30, -157.85),
        ("Reno, NV", 39.53, -119.81),
    ]
    for name, lat, lon in cities:
        d = await fetch_kbdi_today(lat, lon)
        if d is None:
            print(f"{name:18s} <upstream failed>")
            continue
        print(
            f"{name:18s} KBDI={d['kbdi']:6.1f}  "
            f"annual_precip={d['mean_annual_precip_mm']:6.0f}mm  "
            f"end={d['end_date']}  n={d['n_days']}"
        )


if __name__ == "__main__":
    asyncio.run(main())
