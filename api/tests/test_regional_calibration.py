"""Unit tests for the regional bucket calibration. These run against a synthetic
in-memory state map, so they don't depend on whether build_regional_thresholds.py
has been run yet."""
from __future__ import annotations

from api.core import regional_calibration as rc


def _install_fake_data(monkeypatch, states: dict, global_t: dict | None = None):
    """Replace the module-level state map with a deterministic fixture."""
    monkeypatch.setattr(rc, "_STATES", states)
    if global_t is not None:
        monkeypatch.setattr(rc, "_GLOBAL", global_t)


def test_lookup_state_single_match(monkeypatch):
    _install_fake_data(monkeypatch, {
        "CA": {"bbox": [-124.0, 32.5, -114.0, 42.0], "centroid": [37.0, -120.0]},
        "AZ": {"bbox": [-114.8, 31.3, -109.0, 37.0], "centroid": [34.0, -112.0]},
    })
    # San Francisco, squarely inside CA
    assert rc.lookup_state(37.77, -122.42) == "CA"
    # Phoenix, squarely inside AZ
    assert rc.lookup_state(33.45, -112.07) == "AZ"


def test_lookup_state_no_match_returns_none(monkeypatch):
    _install_fake_data(monkeypatch, {
        "CA": {"bbox": [-124.0, 32.5, -114.0, 42.0], "centroid": [37.0, -120.0]},
    })
    # Honolulu, outside CA bbox
    assert rc.lookup_state(21.3, -157.85) is None


def test_lookup_state_overlap_picks_nearest_centroid(monkeypatch):
    # Two overlapping bboxes, point sits in both. Should pick the closer centroid.
    _install_fake_data(monkeypatch, {
        "WEST": {"bbox": [-120.0, 35.0, -110.0, 45.0], "centroid": [40.0, -118.0]},
        "EAST": {"bbox": [-115.0, 35.0, -105.0, 45.0], "centroid": [40.0, -107.0]},
    })
    # (40, -119), solidly inside WEST and outside EAST
    assert rc.lookup_state(40.0, -119.0) == "WEST"
    # (40, -106), solidly inside EAST
    assert rc.lookup_state(40.0, -106.0) == "EAST"
    # (40, -112.5) is in both boxes and exactly the same distance from each
    # centroid. WEST only wins on dict order.
    assert rc.lookup_state(40.0, -112.5) == "WEST"
    # (40, -109) is past WEST's edge at -110, so EAST is the only candidate.
    assert rc.lookup_state(40.0, -109.0) == "EAST"
    # (40, -111) sits in both boxes but nearer EAST's centroid, so nearest-centroid
    # has to return EAST even though WEST comes first in the map.
    assert rc.lookup_state(40.0, -111.0) == "EAST"


def test_regional_level_uses_state_thresholds(monkeypatch):
    _install_fake_data(monkeypatch, {
        "CA": {
            "bbox": [-124.0, 32.5, -114.0, 42.0],
            "centroid": [37.0, -120.0],
            "thresholds": {"low": 0.20, "moderate": 0.45, "high": 0.65, "extreme": 0.80},
        },
    })
    # In California this score reads HIGH.
    level, state = rc.regional_level(0.50, 37.77, -122.42)
    assert state == "CA"
    assert level == "HIGH"

    # The same score with no state reads MODERATE on the global cutoffs, which
    # is the whole point. It shows the calibration is doing real work.
    level_global, state_global = rc.regional_level(0.50, 50.0, 0.0)  # ocean
    assert state_global is None
    assert level_global == "MODERATE"


def test_regional_level_falls_back_to_global_when_no_state(monkeypatch):
    _install_fake_data(
        monkeypatch,
        states={
            "CA": {
                "bbox": [-124.0, 32.5, -114.0, 42.0],
                "centroid": [37.0, -120.0],
                "thresholds": {"low": 0.20, "moderate": 0.45, "high": 0.65, "extreme": 0.80},
            },
        },
        global_t={"low": 0.3, "moderate": 0.6, "high": 0.8, "extreme": 1.0},
    )
    # Outside any calibrated state, should use global cutoffs
    level, state = rc.regional_level(0.55, 21.3, -157.85)
    assert state is None
    assert level == "MODERATE"  # 0.55 sits between the global 0.3 and 0.6


def test_extreme_boundary_uses_extreme_key_not_high_key(monkeypatch):
    """Bucketing used to cut at `high`, making EXTREME the top tenth of fire days
    instead of the top few percent."""
    _install_fake_data(monkeypatch, {
        "MT": {
            "bbox": [-115.875, 44.8767, -104.2505, 48.6314],
            "centroid": [46.5, -110.0],
            # Made up, not Montana's fitted numbers. Picked so the high band runs
            # a wide 0.12 from 0.54 to 0.66.
            "thresholds": {"low": 0.36, "moderate": 0.46, "high": 0.54, "extreme": 0.66},
        },
    })
    # Right in that gap, so it has to read HIGH.
    level, state = rc.regional_level(0.55, 46.59, -112.04)  # Helena
    assert state == "MT"
    assert level == "HIGH", \
        f"score 0.55 should be HIGH for MT (90-97th percentile range), got {level}"

    # Above the extreme cutoff.
    level, _ = rc.regional_level(0.70, 46.59, -112.04)
    assert level == "EXTREME"

    # Under the 0.54 high mark and still HIGH, because the band opens where
    # moderate ends at 0.46.
    level, _ = rc.regional_level(0.50, 46.59, -112.04)
    assert level == "HIGH"


def test_regional_level_extreme_bucket(monkeypatch):
    _install_fake_data(monkeypatch, {
        "CA": {
            "bbox": [-124.0, 32.5, -114.0, 42.0],
            "centroid": [37.0, -120.0],
            "thresholds": {"low": 0.20, "moderate": 0.45, "high": 0.65, "extreme": 0.80},
        },
    })
    level, _ = rc.regional_level(0.85, 37.77, -122.42)
    assert level == "EXTREME"
    level, _ = rc.regional_level(0.10, 37.77, -122.42)
    assert level == "LOW"


def test_state_hint_overrides_heuristic(monkeypatch):
    _install_fake_data(monkeypatch, {
        "WEST": {
            "bbox": [-120.0, 35.0, -110.0, 45.0],
            "centroid": [40.0, -118.0],
            "thresholds": {"low": 0.10, "moderate": 0.20, "high": 0.30, "extreme": 0.40},
        },
        "EAST": {
            "bbox": [-115.0, 35.0, -105.0, 45.0],
            "centroid": [40.0, -107.0],
            "thresholds": {"low": 0.50, "moderate": 0.60, "high": 0.70, "extreme": 0.80},
        },
    })
    # A point in the overlap zone the box guess would call WEST.
    level, state = rc.regional_level(0.55, 40.0, -112.5, state_hint="EAST")
    assert state == "EAST"
    # EAST's low is 0.50 and its moderate is 0.60, so 0.55 lands in moderate.
    assert level == "MODERATE"

    # Without the hint, the box guess picks WEST.
    level_w, state_w = rc.regional_level(0.55, 40.0, -112.5)
    assert state_w == "WEST"


def test_state_hint_unknown_state_falls_back_to_global(monkeypatch):
    _install_fake_data(
        monkeypatch,
        states={
            "CA": {
                "bbox": [-124.0, 32.5, -114.0, 42.0],
                "centroid": [37.0, -120.0],
                "thresholds": {"low": 0.20, "moderate": 0.45, "high": 0.65, "extreme": 0.80},
            },
        },
        global_t={"low": 0.3, "moderate": 0.6, "high": 0.8, "extreme": 1.0},
    )
    level, state = rc.regional_level(0.55, 40.7, -74.0, state_hint="NY")
    assert state is None
    assert level == "MODERATE"  # 0.55 sits between the global 0.3 and 0.6


def test_reno_nv_border_overlap_regression(monkeypatch):
    """Reno sits inside both Nevada's and California's boxes, and the guess picks
    California because its centroid is nearer."""
    _install_fake_data(monkeypatch, {
        "NV": {
            # Real NV bbox and centroid from production calibration data.
            "bbox": [-119.9747, 36.1469, -114.0669, 41.9319],
            "centroid": [39.7015, -116.7347],
            "thresholds": {"low": 0.42, "moderate": 0.49, "high": 0.53, "extreme": 0.57},
        },
        "CA": {
            # CA's real box reaches east past Reno because the sample picks up
            # Sierra Nevada fires, which drags the centroid closer to Reno than
            # Nevada's own centroid out in the middle of the state.
            "bbox": [-123.7267, 32.7544, -116.56, 41.9883],
            "centroid": [37.3218, -119.6089],
            "thresholds": {"low": 0.37, "moderate": 0.46, "high": 0.50, "extreme": 0.51},
        },
    })
    # Confirm the guess still gets it wrong. If it ever starts getting it right
    # on its own, the test below stops proving anything.
    assert rc.lookup_state(39.53, -119.81) == "CA"

    # This score reads HIGH in Nevada and EXTREME in California, so which tier
    # comes back proves which state's thresholds were used.
    level, state = rc.regional_level(0.55, 39.53, -119.81, state_hint="NV")
    assert state == "NV", f"state_hint should win; got {state}"
    assert level == "HIGH", f"expected NV's HIGH bucket; got CA's EXTREME ({level})"

    # And without the hint, the bug comes back.
    level_buggy, state_buggy = rc.regional_level(0.55, 39.53, -119.81)
    assert state_buggy == "CA"
    assert level_buggy == "EXTREME"


def test_regional_level_state_hint_alone_no_coords(monkeypatch):
    """The what-if dropdown sends a hint and no coords, so lat/lon are optional."""
    _install_fake_data(monkeypatch, {
        "FL": {
            "bbox": [-86.63, 25.35, -80.20, 30.96],
            "centroid": [28.04, -81.87],
            "thresholds": {"low": 0.27, "moderate": 0.33, "high": 0.38, "extreme": 0.42},
        },
    })
    # Florida's extreme cutoff is 0.42, so 0.45 clears it. No coordinates here.
    level, state = rc.regional_level(0.45, state_hint="FL")
    assert state == "FL"
    assert level == "EXTREME"

    # And 0.30 sits between its low and moderate cutoffs.
    level, _ = rc.regional_level(0.30, state_hint="FL")
    assert level == "MODERATE"


def test_regional_level_no_inputs_falls_back_to_global(monkeypatch):
    _install_fake_data(
        monkeypatch,
        states={},
        global_t={"low": 0.3, "moderate": 0.6, "high": 0.8, "extreme": 1.0},
    )
    level, state = rc.regional_level(0.55)
    assert state is None
    assert level == "MODERATE"  # 0.55 sits between the global 0.3 and 0.6


def test_get_state_calibration_returns_thresholds_and_max(monkeypatch):
    """score_max is the top anchor the orb fills the EXTREME band against."""
    _install_fake_data(monkeypatch, {
        "CA": {
            "bbox": [-124.0, 32.5, -114.0, 42.0],
            "centroid": [37.0, -120.0],
            "thresholds": {"low": 0.20, "moderate": 0.45, "high": 0.65, "extreme": 0.80},
            "score_summary": {"min": 0.05, "median": 0.20, "mean": 0.30, "max": 0.95},
        },
    })
    cal = rc.get_state_calibration("CA")
    assert cal == {
        "low": 0.20,
        "moderate": 0.45,
        "high": 0.65,
        "extreme": 0.80,
        "score_max": 0.95,
    }


def test_get_state_calibration_unknown_state_returns_none(monkeypatch):
    _install_fake_data(monkeypatch, {
        "CA": {
            "bbox": [-124.0, 32.5, -114.0, 42.0],
            "centroid": [37.0, -120.0],
            "thresholds": {"low": 0.20, "moderate": 0.45, "high": 0.65, "extreme": 0.80},
            "score_summary": {"min": 0, "median": 0.2, "mean": 0.3, "max": 0.95},
        },
    })
    assert rc.get_state_calibration("XX") is None


def test_get_state_calibration_none_input_returns_none(monkeypatch):
    """The route feeds regional_level()'s result straight in, and that can be None."""
    _install_fake_data(monkeypatch, {})
    assert rc.get_state_calibration(None) is None


def test_get_state_calibration_missing_score_summary_returns_none(monkeypatch):
    """Old backup JSONs predate score_summary."""
    _install_fake_data(monkeypatch, {
        "OLD": {
            "bbox": [-120, 35, -110, 45],
            "centroid": [40, -115],
            "thresholds": {"low": 0.20, "moderate": 0.45, "high": 0.65, "extreme": 0.80},
            # no score_summary
        },
    })
    assert rc.get_state_calibration("OLD") is None


def test_get_state_calibration_missing_threshold_key_returns_none(monkeypatch):
    _install_fake_data(monkeypatch, {
        "PARTIAL": {
            "bbox": [-120, 35, -110, 45],
            "centroid": [40, -115],
            "thresholds": {"low": 0.20, "moderate": 0.45},  # missing high and extreme
            "score_summary": {"max": 0.95},
        },
    })
    assert rc.get_state_calibration("PARTIAL") is None


def test_regional_level_partial_thresholds_falls_back_to_global(monkeypatch):
    """regional_level used to only check that `thresholds` was truthy, but _bucket
    indexes the keys, so a partial block turned into a 500 on /risk."""
    _install_fake_data(
        monkeypatch,
        states={
            "PARTIAL": {
                "bbox": [-120, 35, -110, 45],
                "centroid": [40, -115],
                "thresholds": {"low": 0.20, "moderate": 0.45},  # missing extreme
            },
        },
        global_t={"low": 0.3, "moderate": 0.6, "high": 0.8, "extreme": 1.0},
    )
    # Squarely inside PARTIAL's bbox, so it must not raise.
    level, state = rc.regional_level(0.55, 40.0, -115.0)
    assert state is None
    assert level == "MODERATE"  # 0.55 sits between the global 0.3 and 0.6


def test_valid_thresholds_helper():
    assert rc._valid_thresholds({"low": 0.3, "moderate": 0.6, "extreme": 0.8}) is True
    assert rc._valid_thresholds({"low": 0.3, "moderate": 0.6}) is False  # no extreme
    assert rc._valid_thresholds({}) is False
    assert rc._valid_thresholds(None) is False
    assert rc._valid_thresholds("nope") is False


def test_loaded_global_is_always_valid():
    """So the uncalibrated fallback in _bucket can never hit a missing key."""
    assert rc._valid_thresholds(rc._GLOBAL)


def test_loader_handles_missing_file(tmp_path, monkeypatch):
    # Point _DATA_PATH at a file that isn't there and call _load() directly.
    # importlib.reload would re-run module setup and reset the path.
    monkeypatch.setattr(rc, "_DATA_PATH", tmp_path / "missing.json")
    fallback = rc._load()
    assert fallback["version"] == "uncalibrated"
    assert fallback["states"] == {}
    assert fallback["global"] == rc._GLOBAL_FALLBACK
