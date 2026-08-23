"""Light and dark theming for the chart scripts.

Charts render light by default. Set CHART_THEME=dark for a version matched to
GitHub's dark background, landing in its own folder, so the <picture> tags in the
docs can hand readers whichever suits. Only themes the neutrals. Series colors stay
with each script, the tier palette reads fine on either.
"""
from __future__ import annotations

import colorsys
import os
from pathlib import Path

import matplotlib.pyplot as plt

_LIGHT = {"bg": "white", "fg": "#111827", "muted": "#6b7280", "grid": "#c9ced6", "edge": "#1f2937"}
_DARK = {"bg": "#0d1117", "fg": "#e6edf3", "muted": "#9aa4b2", "grid": "#2a313c", "edge": "#0d1117"}


def is_dark() -> bool:
    return os.environ.get("CHART_THEME", "").lower() == "dark"


def palette() -> dict:
    return _DARK if is_dark() else _LIGHT


def apply() -> dict:
    """Apply the current theme to matplotlib and hand back its palette."""
    p = palette()
    plt.rcParams.update(
        {
            "figure.facecolor": p["bg"],
            "axes.facecolor": p["bg"],
            "savefig.facecolor": p["bg"],
            "text.color": p["fg"],
            "axes.labelcolor": p["fg"],
            "axes.edgecolor": p["fg"],
            "axes.titlecolor": p["fg"],
            "xtick.color": p["fg"],
            "ytick.color": p["fg"],
            "grid.color": p["grid"],
            "legend.edgecolor": p["grid"],
            "legend.facecolor": p["bg"],
            "legend.labelcolor": p["fg"],
        }
    )
    return p


def mute(hex_color: str, sat: float = 0.70, val: float = 0.88) -> str:
    """Take the glow off a bright color so it sits calmly on a dark page."""
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
    r, g, b = colorsys.hsv_to_rgb(hh, ss * sat, vv * val)
    return "#{:02x}{:02x}{:02x}".format(round(r * 255), round(g * 255), round(b * 255))


def data_color(hex_color: str) -> str:
    """A series color for the current theme, muted on dark and left alone on light."""
    return mute(hex_color) if is_dark() else hex_color


def out_path(base: Path) -> Path:
    """Redirect the output into the dark folder when we're rendering dark."""
    if is_dark():
        dark_dir = base.parent / "charts-dark"
        dark_dir.mkdir(parents=True, exist_ok=True)
        return dark_dir / base.name
    return base
