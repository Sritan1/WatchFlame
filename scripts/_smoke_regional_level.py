"""Check that one score really does read differently state to state."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.core.regional_calibration import regional_level, calibration_info

info = calibration_info()
print("calibration_info:")
print(f"  version           = {info['version']}")
print(f"  fitted_at         = {info['fitted_at']}")
print(f"  algorithm_version = {info['algorithm_version']}")
print(f"  states_calibrated ({len(info['states_calibrated'])}) = {info['states_calibrated']}")
print()

cities = [
    ("Phoenix AZ", 33.45, -112.07),
    ("Tampa FL",   27.95,  -82.46),
    ("Boulder CO", 40.01, -105.27),
]
for city, lat, lon in cities:
    print(f"{city} ({lat},{lon}):")
    for score in (0.35, 0.55, 0.70):
        level, state = regional_level(score, lat, lon)
        print(f"  score={score:.2f}  ->  {level:9}  (state={state})")
    print()
