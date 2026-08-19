"""Shared light/dark theming for the docs chart scripts.

Charts default to the existing light look. Set the env var ``CHART_THEME=dark``
to render a dark variant matched to GitHub's dark canvas (``#0d1117``); the
output filename gains a ``-dark`` suffix. These dark PNGs back the ``<picture>``
tags in README.md / METHODOLOGY.md so each chart matches the reader's theme.

Data-series colors (the bars, lines, markers) are left to each script since the
saturated tier/brand colors already read on either background. This module only
themes the neutrals: figure/axes background, text, spines, ticks, and grid.
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
    """Set matplotlib rcParams for the active theme; return its palette dict."""
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
    """Soften a bright series color for the dark canvas: pull saturation and
    brightness down so bars read calmly instead of glowing against #0d1117."""
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
    r, g, b = colorsys.hsv_to_rgb(hh, ss * sat, vv * val)
    return "#{:02x}{:02x}{:02x}".format(round(r * 255), round(g * 255), round(b * 255))


def data_color(hex_color: str) -> str:
    """Series color for the active theme: muted on dark, unchanged on light."""
    return mute(hex_color) if is_dark() else hex_color


def out_path(base: Path) -> Path:
    """docs/foo.png -> docs/charts-dark/foo.png when CHART_THEME=dark, else unchanged."""
    if is_dark():
        dark_dir = base.parent / "charts-dark"
        dark_dir.mkdir(parents=True, exist_ok=True)
        return dark_dir / base.name
    return base
