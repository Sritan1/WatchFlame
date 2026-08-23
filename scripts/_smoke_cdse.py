"""Check that the Copernicus credentials and the vegetation API still work.

    .\\.venv\\Scripts\\Activate.ps1
    python -m scripts._smoke_cdse

A good run prints "OK token" then a line per city with a current NDVI and a May norm.
0.05 to 0.85 is normal depending on biome, and None just means too much cloud. A
missing-key error means the credentials aren't in api/.env. A 401 means regenerate.
"""

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Load .env before importing the service, or it won't see the keys.
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / "api" / ".env")
except ImportError:
    print("(python-dotenv not installed — assuming env is set in shell)")

# Print per request, so a slow run doesn't look like a hang.
os.environ["CDSE_VERBOSE"] = "1"

from api.services.cdse import (  # noqa: E402
    _get_token,
    fetch_ndvi_climatology,
    fetch_ndvi_current,
)

# Three years is enough to prove the API works without spending the whole rate
# budget just checking.
_SMOKE_YEARS = [2023, 2024, 2025]


async def main() -> None:
    # Handshake first, which fails immediately on bad credentials.
    try:
        token = await _get_token()
        print(f"OK token  (len={len(token)})")
    except Exception as e:  # noqa: BLE001
        print(f"FAIL token  {type(e).__name__}: {e}")
        return

    # Then a current reading and a monthly norm per city. May, so the norm means
    # something whenever this gets run.
    cities = [
        ("Phoenix, AZ",  33.45, -112.07),
        ("Seattle, WA",  47.61, -122.33),
        ("Tampa, FL",    27.95,  -82.46),
        ("Boulder, CO",  40.02, -105.27),
        ("Reno, NV",     39.53, -119.81),
        ("Asheville, NC",35.60,  -82.55),
    ]
    print(f"{'city':18s}  {'current':>8s}  {'may-clim':>8s}")
    for name, lat, lon in cities:
        print(f"--- {name} ---", flush=True)
        try:
            cur = await fetch_ndvi_current(lat, lon)
            clim = await fetch_ndvi_climatology(lat, lon, month=5, years=_SMOKE_YEARS)
        except Exception as e:  # noqa: BLE001
            print(f"{name:18s}  FAIL  {type(e).__name__}: {e}")
            continue
        cur_str = f"{cur:+.3f}" if cur is not None else "  none"
        clim_str = f"{clim:+.3f}" if clim is not None else "  none"
        print(f"{name:18s}  {cur_str:>8s}  {clim_str:>8s}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
