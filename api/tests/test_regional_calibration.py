"""Unit tests for the regional bucket calibration.

These exercise the calibration logic against a synthetic in-memory state map
so the tests don't depend on whether scripts/build_regional_thresholds.py has
been run yet.
"""
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
    # San Francisco — squarely inside CA
    assert rc.lookup_state(37.77, -122.42) == "CA"
    # Phoenix — squarely inside AZ
    assert rc.lookup_state(33.45, -112.07) == "AZ"


def test_lookup_state_no_match_returns_none(monkeypatch):
    _install_fake_data(monkeypatch, {
        "CA": {"bbox": [-124.0, 32.5, -114.0, 42.0], "centroid": [37.0, -120.0]},
    })
    # Honolulu — outside CA bbox
    assert rc.lookup_state(21.3, -157.85) is None


def test_lookup_state_overlap_picks_nearest_centroid(monkeypatch):
    # Two overlapping bboxes — point sits in both. Should pick the closer centroid.
    _install_fake_data(monkeypatch, {
        "WEST": {"bbox": [-120.0, 35.0, -110.0, 45.0], "centroid": [40.0, -118.0]},
        "EAST": {"bbox": [-115.0, 35.0, -105.0, 45.0], "centroid": [40.0, -107.0]},
    })
    # (40, -119) — solidly inside WEST and outside EAST
    assert rc.lookup_state(40.0, -119.0) == "WEST"
    # (40, -106) — solidly inside EAST
    assert rc.lookup_state(40.0, -106.0) == "EAST"
    # (40, -112.5) — overlap zone, closer to WEST centroid
    assert rc.lookup_state(40.0, -112.5) == "WEST"
    # (40, -109) — overlap zone, closer to EAST centroid
    assert rc.lookup_state(40.0, -109.0) == "EAST"


def test_regional_level_uses_state_thresholds(monkeypatch):
    _install_fake_data(monkeypatch, {
        "CA": {
            "bbox": [-124.0, 32.5, -114.0, 42.0],
            "centroid": [37.0, -120.0],
            "thresholds": {"low": 0.20, "moderate": 0.45, "high": 0.65, "extreme": 0.80},
        },
    })
    # Score 0.50 in CA → HIGH under regional (0.45 ≤ 0.50 < 0.65 → "high" bucket)
    level, state = rc.regional_level(0.50, 37.77, -122.42)
    assert state == "CA"
    assert level == "HIGH"

    # Same score, ungeolocated → MODERATE under global (0.3 ≤ 0.50 < 0.6)
    # Regional and global disagree → calibration is doing real work
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
    # Outside any calibrated state — should use global cutoffs
    level, state = rc.regional_level(0.55, 21.3, -157.85)
    assert state is None
    assert level == "MODERATE"  # 0.3 ≤ 0.55 < 0.6


def test_extreme_boundary_uses_extreme_key_not_high_key(monkeypatch):
    """Regression: scores in [t['high'], t['extreme']) must be HIGH, not EXTREME.

    Earlier the _bucket function used t['high'] (90th pctile) as the
    HIGH→EXTREME boundary, making EXTREME = top 10% of fire days. The fix
    uses t['extreme'] (97th pctile) so EXTREME = top 3% as documented in
    scripts/build_regional_thresholds.py.

    This test pins a score that sits in the ambiguous range so a future
    refactor can't silently revert.
    """
    _install_fake_data(monkeypatch, {
        "MT": {
            "bbox": [-115.875, 44.8767, -104.2505, 48.6314],
            "centroid": [46.5, -110.0],
            # Real shape from MT calibration: high-extreme gap is ~0.12 wide
            "thresholds": {"low": 0.36, "moderate": 0.46, "high": 0.54, "extreme": 0.66},
        },
    })
    # 0.55 is in [t['high']=0.54, t['extreme']=0.66) — must be HIGH, not EXTREME
    level, state = rc.regional_level(0.55, 46.59, -112.04)  # Helena, MT
    assert state == "MT"
    assert level == "HIGH", \
        f"score 0.55 should be HIGH for MT (90-97th percentile range), got {level}"

    # Just above t['extreme'] — must be EXTREME
    level, _ = rc.regional_level(0.70, 46.59, -112.04)
    assert level == "EXTREME"

    # Just below t['high'] — must be MODERATE → HIGH boundary check
    level, _ = rc.regional_level(0.50, 46.59, -112.04)
    assert level == "HIGH"  # 0.50 ≥ t['moderate']=0.46 and < t['extreme']


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
    """When the caller supplies state_hint (e.g. from authoritative Census
    reverse-geocode), it must take precedence over the bbox+centroid lookup
    — even if the heuristic would pick a different state."""
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
    # Point in overlap zone closer to WEST centroid — heuristic would say WEST.
    # state_hint="EAST" must win and use EAST's thresholds.
    level, state = rc.regional_level(0.55, 40.0, -112.5, state_hint="EAST")
    assert state == "EAST"
    assert level == "MODERATE"  # 0.55 is in [EAST.moderate=0.6, ...) → wait 0.55 < 0.6 → MODERATE? No.
    # Verify the bucket: EAST thresholds are low=0.50 mod=0.60 high=0.70 ext=0.80
    # score 0.55 is in [0.50, 0.60) → MODERATE
    assert level == "MODERATE"

    # Without state_hint, the bbox heuristic picks WEST.
    level_w, state_w = rc.regional_level(0.55, 40.0, -112.5)
    assert state_w == "WEST"


def test_state_hint_unknown_state_falls_back_to_global(monkeypatch):
    """state_hint for a non-calibrated state (e.g. NY) should fall through
    to the global bucket — calibration data simply isn't there."""
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
    assert level == "MODERATE"  # 0.3 ≤ 0.55 < 0.6 in globals


def test_reno_nv_border_overlap_regression(monkeypatch):
    """Reno NV (39.53, -119.81) sits inside both NV's and CA's bboxes; the
    bbox+centroid heuristic returns CA because CA's centroid is closer.
    With state_hint="NV" from Census, the route must end up using NV
    thresholds, not CA's.

    Pins the documented Reno bug from handoff.md."""
    _install_fake_data(monkeypatch, {
        "NV": {
            # Real NV bbox + centroid from production V4 calibration data.
            "bbox": [-119.9747, 36.1469, -114.0669, 41.9319],
            "centroid": [39.7015, -116.7347],
            "thresholds": {"low": 0.42, "moderate": 0.49, "high": 0.53, "extreme": 0.57},
        },
        "CA": {
            # Real CA bbox — extends east past Reno's longitude because the
            # deterministic FPA_FOD sample picks up Sierra Nevada fires.
            # CA's centroid sits at the latitude of Reno-area Sierras (north
            # of SoCal-heavy fire counts), making it closer to Reno than
            # NV's centroid in the Mojave-leaning interior.
            "bbox": [-123.7267, 32.7544, -116.56, 41.9883],
            "centroid": [37.3218, -119.6089],
            "thresholds": {"low": 0.37, "moderate": 0.46, "high": 0.50, "extreme": 0.51},
        },
    })
    # Sanity check the bug condition still exists in the heuristic — if this
    # ever flips to NV on its own, the regression test below becomes silent.
    assert rc.lookup_state(39.53, -119.81) == "CA"

    # With Census-provided state_hint="NV", the result must use NV's
    # thresholds, not CA's. At score 0.55:
    #   NV → HIGH       (high=0.53 ≤ 0.55 < 0.57=extreme)
    #   CA → EXTREME    (0.55 ≥ extreme=0.51)
    # Different buckets per state, so the assertion proves NV's thresholds
    # were actually consulted.
    level, state = rc.regional_level(0.55, 39.53, -119.81, state_hint="NV")
    assert state == "NV", f"state_hint should win; got {state}"
    assert level == "HIGH", f"expected NV's HIGH bucket; got CA's EXTREME ({level})"

    # And the converse — no state_hint reproduces the bug.
    level_buggy, state_buggy = rc.regional_level(0.55, 39.53, -119.81)
    assert state_buggy == "CA"
    assert level_buggy == "EXTREME"


def test_regional_level_state_hint_alone_no_coords(monkeypatch):
    """The Risk Calculator's state dropdown supplies a state_hint without
    coords. regional_level must still bucket using that state's thresholds —
    lat/lon are optional when a hint is given."""
    _install_fake_data(monkeypatch, {
        "FL": {
            "bbox": [-86.63, 25.35, -80.20, 30.96],
            "centroid": [28.04, -81.87],
            "thresholds": {"low": 0.27, "moderate": 0.33, "high": 0.38, "extreme": 0.42},
        },
    })
    # 0.45 in FL → EXTREME (≥ 0.42 cutoff). No coords passed.
    level, state = rc.regional_level(0.45, state_hint="FL")
    assert state == "FL"
    assert level == "EXTREME"

    # 0.30 in FL → MODERATE (between low=0.27 and moderate=0.33).
    level, _ = rc.regional_level(0.30, state_hint="FL")
    assert level == "MODERATE"


def test_regional_level_no_inputs_falls_back_to_global(monkeypatch):
    """Calling regional_level with neither coords nor state_hint must fall
    back to the global cutoffs. Defensive — the route guards against this
    case but the helper itself should be safe to call."""
    _install_fake_data(
        monkeypatch,
        states={},
        global_t={"low": 0.3, "moderate": 0.6, "high": 0.8, "extreme": 1.0},
    )
    level, state = rc.regional_level(0.55)
    assert state is None
    assert level == "MODERATE"  # 0.3 ≤ 0.55 < 0.6


def test_get_state_calibration_returns_thresholds_and_max(monkeypatch):
    """Happy path: a fitted state returns the four threshold cutoffs plus
    score_max (the upper anchor for the EXTREME band in the orb's
    percentile-fill mapping)."""
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
    """The route passes the result of regional_level() (which can be None) in
    directly — None input must be safe and return None."""
    _install_fake_data(monkeypatch, {})
    assert rc.get_state_calibration(None) is None


def test_get_state_calibration_missing_score_summary_returns_none(monkeypatch):
    """Defensive against legacy/backup JSONs whose state blocks predate
    score_summary. Helper must return None rather than KeyError, so the route
    silently falls back to no regional_thresholds in the response."""
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
    """Same defense for malformed thresholds dict — any of the four bucket
    keys missing means the block is unusable and we return None."""
    _install_fake_data(monkeypatch, {
        "PARTIAL": {
            "bbox": [-120, 35, -110, 45],
            "centroid": [40, -115],
            "thresholds": {"low": 0.20, "moderate": 0.45},  # missing high + extreme
            "score_summary": {"max": 0.95},
        },
    })
    assert rc.get_state_calibration("PARTIAL") is None


def test_regional_level_partial_thresholds_falls_back_to_global(monkeypatch):
    """Regression: regional_level only truthiness-checked `thresholds`, but
    _bucket indexes low/moderate/extreme directly — a truthy-but-incomplete
    block (stale/partial JSON) KeyError'd into a 500 on /risk. It must instead
    fall back to global cutoffs, mirroring lookup_state's defensiveness."""
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
    # Point squarely inside PARTIAL's bbox: must NOT raise, must use globals.
    level, state = rc.regional_level(0.55, 40.0, -115.0)
    assert state is None
    assert level == "MODERATE"  # 0.3 ≤ 0.55 < 0.6 in globals


def test_loader_handles_missing_file(tmp_path, monkeypatch):
    # Point _DATA_PATH at a non-existent file and call _load() directly.
    # We don't importlib.reload — that re-runs module-level code and would
    # reset _DATA_PATH back to its real value.
    monkeypatch.setattr(rc, "_DATA_PATH", tmp_path / "missing.json")
    fallback = rc._load()
    assert fallback["version"] == "uncalibrated"
    assert fallback["states"] == {}
    assert fallback["global"] == rc._GLOBAL_FALLBACK
