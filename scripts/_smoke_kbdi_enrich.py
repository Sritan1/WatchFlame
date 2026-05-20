"""Two-fire dry run of the KBDI-enabled enricher + compute_risk override path.

Run from project root:  python -m scripts._smoke_kbdi_enrich
"""
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.core.openmeteo import _load_cache, enrich_iter_kbdi
from api.core.risk_algorithm import compute_risk


def main():
    rows = [
        {
            "lat": 37.5, "lon": -120.0, "fire_date": date(2014, 7, 15),
            "season": "summer", "fire_size": 50, "doy": 196, "fire_year": 2014,
            "state": "CA", "size_bucket": "medium",
        },
        {
            "lat": 44.0, "lon": -123.0, "fire_date": date(2012, 4, 10),
            "season": "spring", "fire_size": 5, "doy": 101, "fire_year": 2012,
            "state": "OR", "size_bucket": "medium",
        },
    ]
    cache = _load_cache()
    print(f"cache size before: {len(cache):,}")
    enriched = enrich_iter_kbdi(rows, cache=cache)
    for r in enriched:
        print(
            f"  {r['state']} {r['fire_date']}: "
            f"T={r.get('temperature_c')} RH={r.get('humidity_pct')} "
            f"U={r.get('wind_kph')} dsr={r.get('days_since_rain')} "
            f"kbdi={r.get('kbdi')} ann_precip={r.get('mean_annual_precip_mm')}"
        )
        if r.get("kbdi") is not None:
            s = compute_risk(
                temp_c=float(r["temperature_c"]),
                humidity_pct=float(r["humidity_pct"]),
                wind_kph=float(r["wind_kph"]),
                days_since_rain=0,
                season=r["season"],
                kbdi=float(r["kbdi"]),
            )
            drought = s.factors["drought"]
            print(f"    score={s.score:.4f} level={s.level} drought_f={drought:.3f}")
    print(f"cache size after: {len(cache):,}")


if __name__ == "__main__":
    main()
