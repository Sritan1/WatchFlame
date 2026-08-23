"""Clear the failed year-long entries out of the weather cache so the next
calibration run can try them again. Successes stay, and so does everything from
the shorter windows.

Run from the project root with python -m scripts._clean_kbdi_cache
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

    # Keys end in their window length, so match on that and leave every other
    # window size alone.
    keep = {k: v for k, v in cache.items() if not (v is None and k.endswith("|365"))}
    removed = n_before - len(keep)
    print(f"removing {removed:,} entries; keeping {len(keep):,}")

    _save_cache(keep)
    print(f"wrote cleaned cache ({len(keep):,} entries)")


if __name__ == "__main__":
    main()
