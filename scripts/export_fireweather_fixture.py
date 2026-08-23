"""Export a fixture that keeps the two scorers honest.

Runs the real Python scorer over a spread of inputs and writes the answers to JSON.
The web suite loads it and checks its TypeScript copy produces the same numbers,
which turns duplicated math from a hazard into something CI catches.

Regenerate after any re-fit with python scripts/export_fireweather_fixture.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api.core.risk_algorithm import compute_risk  # noqa: E402

OUT = ROOT / "web" / "lib" / "__tests__" / "fixtures" / "v4_parity.json"

# Cases worth pinning are both drought paths, both vegetation paths, calm against
# gale, humid against bone dry, all four seasons, the extreme corner, and every
# clamp boundary. A scorer that dropped a clamp should fail here.
CASES = [
    (35.0, 15.0, 30.0, 10, "summer", 600.0, None),
    (20.0, 60.0, 10.0, 2, "spring", 200.0, None),
    (40.0, 8.0, 45.0, 30, "summer", 750.0, -0.10),
    (10.0, 80.0, 5.0, 0, "winter", 50.0, 0.05),
    (28.0, 35.0, 18.0, 7, "fall", None, None),      # days-since-rain drought path
    (30.0, 25.0, 22.0, 5, "summer", None, -0.08),   # NDVI veg path, no KBDI
    (15.0, 95.0, 0.0, 0, "winter", 0.0, None),       # edge, 0 wind, nearly saturated air
    (45.0, 5.0, 60.0, 40, "summer", 800.0, -0.30),   # extreme corner, at the NDVI ceiling
    (25.0, 50.0, 15.0, 3, "spring", 300.0, 0.20),    # greener-than-normal veg
    (33.0, 20.0, 25.0, 14, "fall", 500.0, None),
    (30.0, 20.0, 20.0, 5, "summer", 400.0, 0.60),    # NDVI floor clamp, so the factor lands at 0.40
    (38.0, 12.0, 35.0, 20, "summer", 950.0, None),   # KBDI > 800 clamps to 800
    (22.0, 55.0, 12.0, 1, "spring", -75.0, None),    # KBDI < 0 clamps to 0
]


def main() -> int:
    rows = []
    for temp, rh, wind, days, season, kbdi, ndvi in CASES:
        r = compute_risk(
            temp_c=temp,
            humidity_pct=rh,
            wind_kph=wind,
            days_since_rain=days,
            season=season,
            kbdi=kbdi,
            ndvi_anomaly=ndvi,
        )
        rows.append({
            "input": {
                "temperatureC": temp,
                "humidityPct": rh,
                "windKph": wind,
                "daysSinceRain": days,
                "season": season,
                "kbdi": kbdi,
                "ndviAnomaly": ndvi,
            },
            "expectedScore": r.score,
        })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} cases -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
