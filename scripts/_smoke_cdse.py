"""One-off smoke test: verify CDSE OAuth + Process API actually work.

Run from project root:

    .\.venv\Scripts\Activate.ps1
    python -m scripts._smoke_cdse

What to expect:
  - First line: "OK token" (OAuth succeeded → keys are valid + portal reachable)
  - Then 6 lines, one per city, each showing current NDVI + May climatology.
  - Healthy values: current NDVI roughly 0.05–0.85 depending on biome,
    climatology in the same range. None means the satellite saw too much
    cloud in the window (rerun later).

If you see "RuntimeError: CDSE_CLIENT_ID is not set" → keys are missing from
api/.env. If you see HTTP 401 → keys are wrong / expired (regenerate in the
CDSE dashboard).
"""

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Load .env BEFORE importing the service module so os.getenv sees the keys.
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / "api" / ".env")
except ImportError:
    print("(python-dotenv not installed — assuming env is set in shell)")

# Turn on per-request progress prints from cdse so a slow run is visibly
# making progress (otherwise minutes of silence look like a hang).
os.environ["CDSE_VERBOSE"] = "1"

from api.services.cdse import (  # noqa: E402
    _get_token,
    fetch_ndvi_climatology,
    fetch_ndvi_current,
)

# Use only the last 3 years for the smoke test — enough to prove the API
# works without blowing the rate-limit budget on a verification run. The
# production fetch defaults to the full 2018–2025 window.
_SMOKE_YEARS = [2023, 2024, 2025]


async def main() -> None:
    # Step 1: OAuth handshake. Fails fast if creds are wrong.
    try:
        token = await _get_token()
        print(f"OK token  (len={len(token)})")
    except Exception as e:  # noqa: BLE001
        print(f"FAIL token  {type(e).__name__}: {e}")
        return

    # Step 2: two fetches per city — current + same-month climatology.
    # Pick May (month=5) so the climatology call is meaningful regardless of
    # when this is run.
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
