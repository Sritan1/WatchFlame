"""Find why FL/GA/NC/SC fires got 0 'complete weather' rows."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.core.openmeteo import _load_cache, summarize_window_with_kbdi
from datetime import date

cache = _load_cache()
print(f"total: {len(cache):,}")

# How many cache entries fall in Florida's bbox?
def in_florida(lat, lon):
    return 24.5 <= lat <= 31.5 and -88 <= lon <= -80

fl_entries = []
for k, v in cache.items():
    if not k.endswith("|365"):
        continue
    parts = k.split("|")
    if len(parts) != 4:
        continue
    try:
        lat = float(parts[0])
        lon = float(parts[1])
    except ValueError:
        continue
    if in_florida(lat, lon):
        fl_entries.append((k, v))

print(f"FL 365-day entries: {len(fl_entries)}")
if not fl_entries:
    print("\n=> NO Florida 365-day cache entries exist. The fetches NEVER HAPPENED.")
    print("   That means the previous run hit rate-limit and cached responses as None,")
    print("   then the cleaner already removed them, OR fetch_window suppressed them silently.")
else:
    k, v = fl_entries[0]
    print(f"\nfirst FL entry key: {k}")
    print(f"  is None: {v is None}")
    if v is not None:
        daily = v.get("daily", {}) or {}
        hourly = v.get("hourly", {}) or {}
        print(f"  daily.time len:        {len(daily.get('time', []))}")
        print(f"  daily.temp_max len:    {len(daily.get('temperature_2m_max', []) or [])}")
        print(f"  daily.wind_max len:    {len(daily.get('wind_speed_10m_max', []) or [])}")
        print(f"  daily.precip_sum len:  {len(daily.get('precipitation_sum', []) or [])}")
        print(f"  hourly.time len:       {len(hourly.get('time', []))}")
        print(f"  hourly.humidity len:   {len(hourly.get('relative_humidity_2m', []) or [])}")

        # Try to summarize this entry assuming the file's fire_date is in there
        times = daily.get("time", []) or []
        if times:
            fire_iso = times[-1]
            fire_dt = date.fromisoformat(fire_iso)
            summary = summarize_window_with_kbdi(v, fire_dt)
            print(f"\n  fire_date={fire_iso} → summary:")
            for kk, vv in summary.items():
                print(f"    {kk}: {vv}")

# Also count *which* states have cached 365-day entries (rough state via simple bbox)
def rough_state(lat, lon):
    if 32.5 <= lat <= 42 and -125 <= lon <= -114: return "CA"
    if 42 <= lat <= 46.5 and -125 <= lon <= -116: return "OR"
    if 45.5 <= lat <= 49 and -125 <= lon <= -117: return "WA"
    if 41.5 <= lat <= 49 and -117 <= lon <= -111: return "ID/MT"
    if 41 <= lat <= 45 and -111 <= lon <= -104: return "WY"
    if 35 <= lat <= 42 and -120 <= lon <= -114: return "NV"
    if 37 <= lat <= 42 and -114 <= lon <= -109: return "UT"
    if 31 <= lat <= 37 and -115 <= lon <= -109: return "AZ"
    if 31 <= lat <= 37 and -109 <= lon <= -103: return "NM"
    if 37 <= lat <= 41 and -109 <= lon <= -102: return "CO"
    if 25 <= lat <= 37 and -107 <= lon <= -93: return "TX"
    if 33 <= lat <= 37 and -100 <= lon <= -94: return "OK"
    if 24 <= lat <= 31 and -88 <= lon <= -80: return "FL"
    if 30 <= lat <= 35 and -86 <= lon <= -81: return "GA"
    if 33.5 <= lat <= 37 and -85 <= lon <= -75: return "NC"
    if 32 <= lat <= 35.5 and -84 <= lon <= -78: return "SC"
    return "other"

state_counts: dict[str, int] = {}
for k in cache:
    if not k.endswith("|365"):
        continue
    parts = k.split("|")
    if len(parts) != 4:
        continue
    try:
        lat = float(parts[0]); lon = float(parts[1])
    except ValueError:
        continue
    s = rough_state(lat, lon)
    state_counts[s] = state_counts.get(s, 0) + 1
print(f"\n365-day cache entries by rough state:")
for s in sorted(state_counts, key=lambda x: -state_counts[x]):
    print(f"  {s:8s} {state_counts[s]}")
