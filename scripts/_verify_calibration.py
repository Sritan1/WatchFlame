"""Verify api/data/regional_thresholds.json after the handoff calibration run."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.core.regional_calibration import calibration_info, regional_level

d = json.load(open(Path(__file__).resolve().parents[1] / "api/data/regional_thresholds.json"))
print("version:", d.get("version"))
print("algo:", d.get("algorithm_version"))
print("fitted_at:", d.get("fitted_at"))
print("drought_input:", d.get("drought_input"))
print("n_states:", len(d["states"]))
print("states:", sorted(d["states"].keys()))
print()
print("per-state n_fires + thresholds:")
for s in sorted(d["states"]):
    info = d["states"][s]
    t = info["thresholds"]
    n = info["n_fires"]
    print(
        f'  {s}: n={n:>3}  '
        f'low={t["low"]:.3f}  mod={t["moderate"]:.3f}  '
        f'high={t["high"]:.3f}  ext={t["extreme"]:.3f}'
    )
print()
print("calibration_info() returns:")
print(json.dumps(calibration_info(), indent=2))
print()
print("smoke-test regional_level(score=0.55):")
cities = [
    ("Phoenix, AZ", 33.45, -112.07),
    ("Tampa, FL", 27.95, -82.46),
    ("Atlanta, GA", 33.75, -84.39),
    ("Raleigh, NC", 35.78, -78.64),
    ("Columbia, SC", 34.00, -81.03),
    ("Oklahoma City, OK", 35.47, -97.52),
    ("Reno, NV", 39.53, -119.81),
    ("Cheyenne, WY", 41.14, -104.82),
    ("Boulder, CO", 40.02, -105.27),
    ("Houston, TX", 29.76, -95.37),
    ("Honolulu, HI (uncalibrated)", 21.30, -157.85),
]
for name, lat, lon in cities:
    level, state = regional_level(0.55, lat, lon)
    print(f"  {name:32s} -> {level:9s}  state={state}")
