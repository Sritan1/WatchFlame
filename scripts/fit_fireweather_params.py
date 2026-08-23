"""Fit the fire-weather constants against the frozen hindcast set.

Reads data/hindcast_features.csv, splits by fire size, and searches for constants
that best rank fires by how big they got. Quote the held-out test split. Writes only
data/fitted_params.json, so production is untouched until someone copies the values
across. Scoring matches validate_fireweather_chart.py, and a self-check confirms the
fast scorer agrees with compute_risk.

Run with python scripts/fit_fireweather_params.py
"""
from __future__ import annotations

import json
import sys
from dataclasses import asdict, replace
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Windows consoles default to a codepage that can't print the symbols we use.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy import stats  # noqa: E402

from api.core.risk_algorithm import (  # noqa: E402
    DEFAULT_PARAMS,
    RiskParams,
    _DROUGHT_TAU_DAYS,
    _SEASON_MULT,
    compute_risk,
)

CSV_PATH = PROJECT_ROOT / "data" / "hindcast_features.csv"
OUT_PARAMS = PROJECT_ROOT / "data" / "fitted_params.json"

SEED = 7
TEST_FRAC = 0.30
N_RANDOM = 6000          # random-search samples
REFINE_PASSES = 4        # coordinate-descent refinement passes
BUCKETS = ["small", "medium", "large", "very_large"]
LABELS = {"small": "<1 ac", "medium": "1-100 ac",
          "large": "100-1,000 ac", "very_large": ">1,000 ac"}

# Floor on every exponent, so all three factors keep carrying weight instead of the
# fit collapsing into a wind and VPD index. MIN_EXP=0 for the unconstrained version.
import os  # noqa: E402
MIN_EXP = float(os.environ.get("MIN_EXP", "0.12"))

# Where the random phase looks. Exponents are handled separately because they have
# to sum to 1.
RANGES = {
    "vpd_scale_hpa": (20.0, 60.0),
    "wind_scale_kph": (20.0, 60.0),
    "wind_floor": (0.0, 0.40),
    "drought_floor": (0.0, 0.30),
}


# The fast scorer, checked against compute_risk below.

def _season_mult_array(seasons: pd.Series) -> np.ndarray:
    return seasons.map(_SEASON_MULT).to_numpy(dtype=float)


def score_array(df: pd.DataFrame, p: RiskParams) -> np.ndarray:
    """Score every row at once. Same math as compute_risk down the season path,
    preferring KBDI for drought."""
    t = df["temperature_c"].to_numpy(dtype=float)
    rh = np.clip(df["humidity_pct"].to_numpy(dtype=float), 0.0, 100.0)
    wind = np.maximum(df["wind_kph"].to_numpy(dtype=float), 0.0)
    dsr = np.maximum(df["days_since_rain"].to_numpy(dtype=float), 0.0)
    kbdi = df["kbdi"].to_numpy(dtype=float)  # may contain NaN

    es = 6.1078 * np.exp(17.27 * t / (t + 237.3))
    vpd = es * (1.0 - rh / 100.0)
    vpd_f = np.clip(vpd / p.vpd_scale_hpa, 0.0, 1.0)

    wbase = (wind / p.wind_scale_kph) ** 1.5
    wind_f = np.clip(p.wind_floor + (1.0 - p.wind_floor) * wbase, p.wind_floor, 1.0)

    # KBDI where we have it, drying curve where we don't.
    kbdi_clamped = np.clip(kbdi, 0.0, 800.0)
    drought_kbdi = p.drought_floor + (1.0 - p.drought_floor) * (kbdi_clamped / 800.0)
    dsr_base = 1.0 - np.exp(-dsr / _DROUGHT_TAU_DAYS)
    drought_dsr = np.clip(
        p.drought_floor + (1.0 - p.drought_floor) * dsr_base, p.drought_floor, 1.0
    )
    drought_f = np.where(np.isnan(kbdi), drought_dsr, drought_kbdi)

    season_m = _season_mult_array(df["season"])

    raw = (vpd_f ** p.exp_vpd) * (wind_f ** p.exp_wind) * (drought_f ** p.exp_drought)
    return np.clip(season_m * raw, 0.0, 1.0)


def _verify_scorer(df: pd.DataFrame) -> None:
    """Check the fast scorer against the real one before trusting the fit."""
    vec = score_array(df, DEFAULT_PARAMS)
    ref = np.array([
        compute_risk(
            temp_c=float(r.temperature_c),
            humidity_pct=float(r.humidity_pct),
            wind_kph=float(r.wind_kph),
            days_since_rain=int(r.days_since_rain),
            season=r.season,
            kbdi=(None if pd.isna(r.kbdi) else float(r.kbdi)),
        ).score
        for r in df.itertuples(index=False)
    ])
    max_diff = float(np.max(np.abs(vec - ref)))
    # compute_risk rounds to 4 places, so allow that much plus float noise.
    assert max_diff < 1e-3, f"vectorized scorer diverges from compute_risk: {max_diff}"
    print(f"  scorer self-check OK (max |vec - compute_risk| = {max_diff:.2e})")


# Objective and search

def spearman(df: pd.DataFrame, p: RiskParams) -> float:
    s = score_array(df, p)
    if np.allclose(s, s[0]):  # every score identical, so there's no correlation
        return -1.0
    rho, _ = stats.spearmanr(s, df["log_size"].to_numpy())
    return float(rho)


def _random_simplex(rng: np.random.Generator) -> tuple[float, float, float]:
    """Three exponents that sum to 1, retried until each clears the floor. The
    fallback clamps and renormalizes, which can land one a hair under."""
    # Drawn loosely around the current values, rejecting anything that puts a
    # factor under the floor.
    for _ in range(64):
        a = rng.dirichlet([5.0, 3.0, 2.0])
        if a.min() >= MIN_EXP:
            return float(a[0]), float(a[1]), float(a[2])
    # If we keep missing, clamp and renormalize instead.
    a = np.maximum(rng.dirichlet([5.0, 3.0, 2.0]), MIN_EXP)
    a = a / a.sum()
    return float(a[0]), float(a[1]), float(a[2])


def random_search(train: pd.DataFrame, rng: np.random.Generator) -> tuple[RiskParams, float]:
    best_p = DEFAULT_PARAMS
    best_rho = spearman(train, DEFAULT_PARAMS)
    for _ in range(N_RANDOM):
        ev, ew, ed = _random_simplex(rng)
        p = RiskParams(
            exp_vpd=ev, exp_wind=ew, exp_drought=ed,
            vpd_scale_hpa=float(rng.uniform(*RANGES["vpd_scale_hpa"])),
            wind_scale_kph=float(rng.uniform(*RANGES["wind_scale_kph"])),
            wind_floor=float(rng.uniform(*RANGES["wind_floor"])),
            drought_floor=float(rng.uniform(*RANGES["drought_floor"])),
        )
        rho = spearman(train, p)
        if rho > best_rho:
            best_rho, best_p = rho, p
    return best_p, best_rho


def coordinate_refine(
    train: pd.DataFrame, p0: RiskParams, rho0: float
) -> tuple[RiskParams, float]:
    """Nudge each constant one at a time around the random winner."""
    best_p, best_rho = p0, rho0
    # Field, how far either side to look, and how many steps. Exponents move in pairs
    # to keep summing to 1.
    scalar_steps = {
        "vpd_scale_hpa": (8.0, 16),
        "wind_scale_kph": (8.0, 16),
        "wind_floor": (0.08, 16),
        "drought_floor": (0.06, 16),
    }
    for _ in range(REFINE_PASSES):
        improved = False
        # Scalars
        for field, (half, n) in scalar_steps.items():
            cur = getattr(best_p, field)
            for cand in np.linspace(cur - half, cur + half, n):
                if cand < 0:
                    continue
                p = replace(best_p, **{field: float(cand)})
                rho = spearman(train, p)
                if rho > best_rho:
                    best_rho, best_p, improved = rho, p, True
        # Shift weight between two exponents and leave the third alone.
        for i, j in ((0, 1), (0, 2), (1, 2)):
            names = ("exp_vpd", "exp_wind", "exp_drought")
            for delta in np.linspace(-0.15, 0.15, 16):
                vals = [best_p.exp_vpd, best_p.exp_wind, best_p.exp_drought]
                vals[i] += delta
                vals[j] -= delta
                if min(vals) < MIN_EXP:
                    continue
                p = replace(best_p, exp_vpd=vals[0], exp_wind=vals[1], exp_drought=vals[2])
                rho = spearman(train, p)
                if rho > best_rho:
                    best_rho, best_p, improved = rho, p, True
        if not improved:
            break
    return best_p, best_rho


# Benchmark indices

def hot_dry_windy(df: pd.DataFrame) -> np.ndarray:
    """Hot-Dry-Windy, VPD times wind speed. Srock et al. 2018."""
    t = df["temperature_c"].to_numpy(dtype=float)
    rh = np.clip(df["humidity_pct"].to_numpy(dtype=float), 0.0, 100.0)
    wind_ms = df["wind_kph"].to_numpy(dtype=float) / 3.6
    es = 6.1078 * np.exp(17.27 * t / (t + 237.3))
    vpd = es * (1.0 - rh / 100.0)
    return vpd * wind_ms


def fosberg_ffwi(df: pd.DataFrame) -> np.ndarray:
    """Fosberg Fire Weather Index (1978). Wants Fahrenheit and mph."""
    t_f = df["temperature_c"].to_numpy(dtype=float) * 9.0 / 5.0 + 32.0
    rh = np.clip(df["humidity_pct"].to_numpy(dtype=float), 0.0, 100.0)
    u_mph = df["wind_kph"].to_numpy(dtype=float) / 1.609

    m = np.empty_like(rh)
    lo = rh < 10.0
    mid = (rh >= 10.0) & (rh < 50.0)
    hi = rh >= 50.0
    m[lo] = 0.03229 + 0.281073 * rh[lo] - 0.000578 * rh[lo] * t_f[lo]
    m[mid] = 2.22749 + 0.160107 * rh[mid] - 0.014784 * t_f[mid]
    m[hi] = 21.0606 + 0.005565 * rh[hi] ** 2 - 0.00035 * rh[hi] * t_f[hi] - 0.483199 * rh[hi]

    mr = m / 30.0
    eta = 1.0 - 2.0 * mr + 1.5 * mr ** 2 - 0.5 * mr ** 3
    return eta * np.sqrt(1.0 + u_mph ** 2) / 0.3002


def _rho(values: np.ndarray, log_size: np.ndarray) -> float:
    rho, _ = stats.spearmanr(values, log_size)
    return float(rho)


# Per-bucket discrimination

def bucket_means(df: pd.DataFrame, scores: np.ndarray) -> pd.DataFrame:
    tmp = df.assign(_score=scores)
    rows = []
    for b in BUCKETS:
        sub = tmp.loc[tmp["size_bucket"] == b, "_score"]
        if len(sub) < 2:
            rows.append({"bucket": b, "mean": float(sub.mean()) if len(sub) else 0.0,
                         "ci": 0.0, "n": int(len(sub))})
            continue
        m = float(sub.mean())
        ci = float(stats.sem(sub) * stats.t.ppf(0.975, len(sub) - 1))
        rows.append({"bucket": b, "mean": m, "ci": ci, "n": int(len(sub))})
    return pd.DataFrame(rows).set_index("bucket")


def _non_overlap(agg: pd.DataFrame) -> bool:
    small_hi = agg.loc["small", "mean"] + agg.loc["small", "ci"]
    vlarge_lo = agg.loc["very_large", "mean"] - agg.loc["very_large", "ci"]
    return bool(vlarge_lo > small_hi)


def main() -> int:
    if not CSV_PATH.exists():
        print(f"ERROR: {CSV_PATH} not found. Run freeze_hindcast_dataset.py first.")
        return 1

    df = pd.read_csv(CSV_PATH)
    df = df.dropna(subset=["temperature_c", "humidity_pct", "wind_kph", "days_since_rain"])
    df["log_size"] = np.log10(df["fire_size"] + 1.0)
    print(f"loaded {len(df)} fires from {CSV_PATH.name} "
          f"({int(df['kbdi'].notna().sum())} with real KBDI)")
    print(df["size_bucket"].value_counts().reindex(BUCKETS).to_string())

    _verify_scorer(df)

    # Split so both halves get the same mix of fire sizes.
    rng = np.random.default_rng(SEED)
    test_idx = []
    for b in BUCKETS:
        idx = np.array(df.index[df["size_bucket"] == b].to_numpy(), copy=True)
        rng.shuffle(idx)
        k = int(round(len(idx) * TEST_FRAC))
        test_idx.extend(idx[:k].tolist())
    test = df.loc[test_idx]
    train = df.drop(index=test_idx)
    print(f"\ntrain={len(train)}  test={len(test)}  (stratified {int((1-TEST_FRAC)*100)}/"
          f"{int(TEST_FRAC*100)} by size bucket)\n")

    # Search.
    print(f"random search ({N_RANDOM} samples)…")
    cand, cand_rho = random_search(train, rng)
    print(f"  best train ρ after random: {cand_rho:+.4f}")
    print("coordinate refine…")
    fitted, fitted_rho = coordinate_refine(train, cand, cand_rho)
    print(f"  best train ρ after refine: {fitted_rho:+.4f}")

    # Evaluate current vs fitted on both splits.
    cur = DEFAULT_PARAMS
    rho_cur_train = spearman(train, cur)
    rho_cur_test = spearman(test, cur)
    rho_fit_train = spearman(train, fitted)
    rho_fit_test = spearman(test, fitted)

    print("\n== Spearman ρ(score, log fire size) ===================")
    print(f"{'':16}{'train':>10}{'test':>10}")
    print(f"{'current':16}{rho_cur_train:>+10.4f}{rho_cur_test:>+10.4f}")
    print(f"{'fitted':16}{rho_fit_train:>+10.4f}{rho_fit_test:>+10.4f}")

    # The published indices, on the same test fires.
    log_test = test["log_size"].to_numpy()
    rho_hdw = _rho(hot_dry_windy(test), log_test)
    rho_ffwi = _rho(fosberg_ffwi(test), log_test)
    print("\n== Benchmark vs published indices (test split) ========")
    print(f"{'Hot-Dry-Windy':16}{rho_hdw:>+10.4f}")
    print(f"{'Fosberg FFWI':16}{rho_ffwi:>+10.4f}")
    print(f"{'current':16}{rho_cur_test:>+10.4f}")
    print(f"{'fitted':16}{rho_fit_test:>+10.4f}")

    # Does the score actually separate the size buckets?
    agg_cur = bucket_means(test, score_array(test, cur))
    agg_fit = bucket_means(test, score_array(test, fitted))
    print("\n== Per-bucket mean ± 95% CI on TEST ===================")
    for label, agg in (("current", agg_cur), ("fitted", agg_fit)):
        print(f"  [{label}]  non-overlapping extremes: "
              f"{'YES' if _non_overlap(agg) else 'NO'}")
        for b in BUCKETS:
            r = agg.loc[b]
            print(f"    {LABELS[b]:<14} mean={r['mean']:.3f}  ±{r['ci']:.3f}  n={int(r['n'])}")

    print("\n== Fitted RiskParams ==================================")
    for k, v in asdict(fitted).items():
        print(f"  {k:16}= {v:.4f}")

    # Is the fit worth adopting?
    improves = rho_fit_test > rho_cur_test
    gate_ok = improves and _non_overlap(agg_fit)
    print("\n== Decision gate =====================================")
    print(f"  test ρ improves:           {improves} "
          f"({rho_cur_test:+.4f} -> {rho_fit_test:+.4f})")
    print(f"  fitted CIs non-overlapping: {_non_overlap(agg_fit)}")
    print(f"  ADOPT: {'YES' if gate_ok else 'NO — keep current constants'}")

    # Leave the winner on disk for the adoption step.
    OUT_PARAMS.write_text(json.dumps({
        "fitted_params": asdict(fitted),
        "current_params": asdict(cur),
        "metrics": {
            "rho_current_train": rho_cur_train, "rho_current_test": rho_cur_test,
            "rho_fitted_train": rho_fit_train, "rho_fitted_test": rho_fit_test,
            "rho_hdw_test": rho_hdw, "rho_ffwi_test": rho_ffwi,
            "non_overlap_current": _non_overlap(agg_cur),
            "non_overlap_fitted": _non_overlap(agg_fit),
            "adopt": gate_ok,
        },
        "seed": SEED, "test_frac": TEST_FRAC, "n_random": N_RANDOM,
    }, indent=2), encoding="utf-8")
    print(f"\nwrote {OUT_PARAMS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
