"""One request, to see whether we still have quota."""
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

end = date.today() - timedelta(days=10)
start = end - timedelta(days=10)
params = {
    "latitude": 27.95,
    "longitude": -82.46,
    "start_date": start.isoformat(),
    "end_date": end.isoformat(),
    "daily": "temperature_2m_max,precipitation_sum",
    "timezone": "auto",
}
print(f"Probing Open-Meteo for Tampa FL, {start.isoformat()}..{end.isoformat()}")
with httpx.Client(timeout=15) as client:
    resp = client.get("https://archive-api.open-meteo.com/v1/archive", params=params)
print(f"  status: {resp.status_code}")
print(f"  headers: ratelimit-remaining={resp.headers.get('x-ratelimit-remaining')} retry-after={resp.headers.get('retry-after')}")
print(f"  body[:300]: {resp.text[:300]}")
