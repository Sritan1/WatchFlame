"""Tests for the calibration-runner control flow in scripts/build_regional_thresholds.

What's pinned here is the circuit-breaker contract that decides when to bail
out of a long-running fit. The actual SQLite/Open-Meteo work is mocked out —
we only care that:
  - 3 consecutive data_poverty states trip the breaker
  - quota_exhausted does NOT count (that's what the pre-run probe is for)
  - thin_pool / no_pool / thin_data do NOT count
  - a successful state resets the consecutive counter
  - write_progress merges the new states INTO whatever's already on disk
"""
from __future__ import annotations

import json


from scripts.build_regional_thresholds import run_calibration, write_progress


def _diag(outcome: str, result: dict | None = None) -> dict:
    return {
        "outcome": outcome,
        "result": result,
        "n_sample": 100,
        "n_with_weather": 0 if result is None else 50,
        "n_quota_exhausted": 0,
    }


def _ok_result(state: str) -> dict:
    return {
        "n_fires": 50,
        "bbox": [0.0, 0.0, 1.0, 1.0],
        "centroid": [0.5, 0.5],
        "thresholds": {"low": 0.4, "moderate": 0.5, "high": 0.6, "extreme": 0.7},
        "score_summary": {"min": 0.1, "median": 0.4, "mean": 0.4, "max": 0.8},
    }


class _FitDriver:
    """Replays a scripted sequence of outcomes for run_calibration."""
    def __init__(self, plan: list[tuple[str, dict]]):
        # plan is [(state, diag), ...] — one entry per expected fit_fn call
        self._plan = list(plan)
        self.calls: list[str] = []

    def __call__(self, state: str) -> dict:
        self.calls.append(state)
        if not self._plan:
            raise AssertionError(f"unexpected fit call for {state}")
        expected_state, diag = self._plan.pop(0)
        assert state == expected_state, f"plan mismatch: expected {expected_state}, got {state}"
        return diag


def test_breaker_trips_after_three_consecutive_data_poverty():
    plan = [
        ("CA", _diag("data_poverty")),
        ("OR", _diag("data_poverty")),
        ("WA", _diag("data_poverty")),
        # Should never reach this — the breaker should fire after WA.
        ("ID", _diag("ok", _ok_result("ID"))),
    ]
    driver = _FitDriver(plan)
    written: list[dict] = []
    summary = run_calibration(
        states=["CA", "OR", "WA", "ID"],
        fit_fn=driver,
        write_progress_fn=lambda r: written.append(dict(r)),
        breaker_threshold=3,
    )
    assert summary["breaker_tripped"] is True
    assert summary["breaker_at"] == "WA"
    assert summary["states_attempted"] == ["CA", "OR", "WA"]
    assert summary["state_results"] == {}
    assert driver.calls == ["CA", "OR", "WA"], "ID must not be attempted"


def test_successful_state_resets_breaker_counter():
    """data_poverty, data_poverty, ok, data_poverty, data_poverty → no trip."""
    plan = [
        ("CA", _diag("data_poverty")),
        ("OR", _diag("data_poverty")),
        ("WA", _diag("ok", _ok_result("WA"))),  # resets the streak
        ("ID", _diag("data_poverty")),
        ("MT", _diag("data_poverty")),
    ]
    driver = _FitDriver(plan)
    summary = run_calibration(
        states=["CA", "OR", "WA", "ID", "MT"],
        fit_fn=driver,
        write_progress_fn=lambda r: None,
        breaker_threshold=3,
    )
    assert summary["breaker_tripped"] is False
    assert summary["state_results"] == {"WA": _ok_result("WA")}
    assert driver.calls == ["CA", "OR", "WA", "ID", "MT"]


def test_quota_exhausted_does_not_count_toward_breaker():
    """A state that came back all-429 is a quota signal, not a data-poverty
    signal — the pre-run probe is responsible for catching wholesale lockout,
    so the breaker must not double-count.
    """
    plan = [
        ("CA", _diag("quota_exhausted")),
        ("OR", _diag("quota_exhausted")),
        ("WA", _diag("quota_exhausted")),
        ("ID", _diag("ok", _ok_result("ID"))),
    ]
    driver = _FitDriver(plan)
    summary = run_calibration(
        states=["CA", "OR", "WA", "ID"],
        fit_fn=driver,
        write_progress_fn=lambda r: None,
        breaker_threshold=3,
    )
    assert summary["breaker_tripped"] is False
    assert summary["state_results"] == {"ID": _ok_result("ID")}


def test_thin_pool_and_thin_data_do_not_count_toward_breaker():
    """Skips for upstream sample sparseness must not trip the breaker — the
    breaker is for "sampled & enriched fine but produced zero usable scores".
    """
    plan = [
        ("CA", _diag("thin_pool")),
        ("OR", _diag("no_pool")),
        ("WA", _diag("thin_data")),
        ("ID", _diag("data_poverty")),
        ("MT", _diag("data_poverty")),
        ("WY", _diag("data_poverty")),  # this is the third data_poverty in a row
    ]
    driver = _FitDriver(plan)
    summary = run_calibration(
        states=["CA", "OR", "WA", "ID", "MT", "WY"],
        fit_fn=driver,
        write_progress_fn=lambda r: None,
        breaker_threshold=3,
    )
    assert summary["breaker_tripped"] is True
    assert summary["breaker_at"] == "WY"


def test_write_progress_called_after_every_state():
    """The point of incremental save is that a kill at any point preserves
    progress — so write_progress must fire each iteration, including on skips.
    """
    plan = [
        ("CA", _diag("ok", _ok_result("CA"))),
        ("OR", _diag("thin_pool")),
        ("WA", _diag("ok", _ok_result("WA"))),
    ]
    driver = _FitDriver(plan)
    snapshots: list[dict] = []
    run_calibration(
        states=["CA", "OR", "WA"],
        fit_fn=driver,
        write_progress_fn=lambda r: snapshots.append(dict(r)),
        breaker_threshold=3,
    )
    # 3 states, 3 snapshots — the OR skip still triggered a write so a
    # mid-run kill there wouldn't lose CA.
    assert len(snapshots) == 3
    assert "CA" in snapshots[0]
    assert "CA" in snapshots[1]
    assert "OR" not in snapshots[1], "skipped state should not appear in results"
    assert {"CA", "WA"} <= set(snapshots[2].keys())


def test_write_progress_merges_with_existing_on_disk(tmp_path):
    """If the JSON already has 10 calibrated states from a prior run, a partial
    re-run that calibrates only WY must NOT erase the other 10.
    """
    out_path = tmp_path / "regional_thresholds.json"
    # Pre-existing file with 2 already-calibrated states (stand-in for the 10).
    out_path.write_text(json.dumps({
        "version": "v2",
        "states": {
            "CA": {"n_fires": 100, "thresholds": {"low": 0.4, "moderate": 0.5,
                                                  "high": 0.6, "extreme": 0.7}},
            "OR": {"n_fires": 100, "thresholds": {"low": 0.45, "moderate": 0.53,
                                                  "high": 0.6, "extreme": 0.62}},
        },
    }), encoding="utf-8")

    write_progress({"WY": _ok_result("WY")}, output_path=out_path)
    written = json.loads(out_path.read_text(encoding="utf-8"))

    assert set(written["states"].keys()) == {"CA", "OR", "WY"}
    # Old entries preserved verbatim.
    assert written["states"]["CA"]["thresholds"]["low"] == 0.4
    assert written["states"]["OR"]["thresholds"]["high"] == 0.6
    # New entry written through.
    assert written["states"]["WY"]["n_fires"] == 50


def test_write_progress_overrides_existing_state_when_refit(tmp_path):
    """A state re-fit in the current run should replace its older entry
    (fresh data wins), not be silently dropped because the old entry exists.
    """
    out_path = tmp_path / "regional_thresholds.json"
    out_path.write_text(json.dumps({
        "version": "v2",
        "states": {
            "CA": {"n_fires": 9999, "thresholds": {"low": 0.0, "moderate": 0.0,
                                                   "high": 0.0, "extreme": 0.0}},
        },
    }), encoding="utf-8")

    fresh = _ok_result("CA")
    write_progress({"CA": fresh}, output_path=out_path)
    written = json.loads(out_path.read_text(encoding="utf-8"))

    assert written["states"]["CA"]["n_fires"] == fresh["n_fires"]
    assert written["states"]["CA"]["thresholds"] == fresh["thresholds"]


def test_write_progress_handles_missing_output_file(tmp_path):
    """First-ever run: no file on disk yet, should still write cleanly."""
    out_path = tmp_path / "subdir" / "regional_thresholds.json"
    assert not out_path.exists()
    write_progress({"WY": _ok_result("WY")}, output_path=out_path)
    written = json.loads(out_path.read_text(encoding="utf-8"))
    assert written["states"] == {"WY": _ok_result("WY")}
    # All metadata fields should be populated even on the first write.
    assert written["version"] == "v4"
    assert written["drought_input"] == "kbdi"
    assert written["vegetation_input"] == "ndvi-anomaly-baseline-neutral"
    assert "fitted_at" in written
