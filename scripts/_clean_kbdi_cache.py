"""Drop only the failed (None-valued) `days=365` entries from the
Open-Meteo cache so the next calibration run can re-fetch them.

Preserves: every successful (non-None) entry, AND every `days=60` entry
from the validation notebook. Only purges the 365-day failures created
during the rate-limited initial KBDI run.

Run from project root:  python -m scripts._clean_kbdi_cache
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.core.openmeteo import _load_cache, _save_cache


def main():
    cache = _load_cache()
    n_before = len(cache)
    n_none = sum(1 for v in cache.values() if v is None)
    n_none_365 = sum(
        1
        for k, v in cache.items()
        if v is None and k.endswith("|365")
    )
    print(f"cache: {n_before:,} total, {n_none:,} None entries ({n_none_365:,} are days=365)")

    # The cache key format is "lat|lon|YYYY-MM-DD|days" (see _key in openmeteo.py).
    # We only purge None entries with `|365` suffix to leave 60-day notebook
    # data and any other window sizes alone.
    keep = {k: v for k, v in cache.items() if not (v is None and k.endswith("|365"))}
    removed = n_before - len(keep)
    print(f"removing {removed:,} entries; keeping {len(keep):,}")

    _save_cache(keep)
    print(f"wrote cleaned cache ({len(keep):,} entries)")


if __name__ == "__main__":
    main()
