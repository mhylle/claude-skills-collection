#!/usr/bin/env python3
"""Turn real numbers into the CSS values the template's charts need, so bar
lengths and plotted lines stay proportional to the data.

Usage:
    python chart_math.py --values 1.8 2.4 3.9 4.6 --min 0 --max 6 \
        [--xs 2019 2020 2022 2025] [--labels A B C D] [--mark 5.25] \
        [--aspect 3] [--stroke 1.4]

Prints:
  - --v for each value (for .bars / .columns / .range, % of the axis range)
  - --x/--y for each point and ready-to-paste .area + .stroke divs (for .plot)
  - --mark for a reference line
  - y-axis ticks that line up with the gridlines, and the matching --rows
--xs gives real x positions (e.g. years) for uneven spacing; default is even.
--aspect is the plot's width / height on screen (a full-width .plot in the text
column is about 3; in a .wide figure about 4). It keeps the line equally thick
on steep and flat stretches.
"""
from __future__ import annotations

import argparse
import math

NICE = (1, 2, 2.5, 5)


def pct(v: float, lo: float, hi: float) -> float:
    return 0.0 if hi == lo else (v - lo) / (hi - lo) * 100


def r(x: float) -> str:
    return f"{x:.2f}".rstrip("0").rstrip(".") if abs(x) < 10 else f"{x:.1f}".rstrip("0").rstrip(".")


def is_nice(step: float) -> bool:
    if step <= 0:
        return False
    mag = 10 ** math.floor(math.log10(step))
    return any(abs(step - m * mag) < 1e-9 * max(1, step) for m in NICE + (10,))


def aligned_ticks(lo: float, hi: float) -> tuple[int, list[float]] | None:
    """Pick a gridline count (rows) so every gridline lands on a round value."""
    for rows in (4, 5, 3, 6, 2, 8):
        step = (hi - lo) / rows
        if is_nice(step):
            return rows, [lo + i * step for i in range(rows + 1)]
    return None


def nice_bounds(lo: float, hi: float, rows: int = 4) -> tuple[float, float]:
    raw = (hi - lo) / rows
    mag = 10 ** math.floor(math.log10(raw)) if raw > 0 else 1
    for m in NICE + (10,):
        step = m * mag
        a, b = math.floor(lo / step) * step, math.ceil(hi / step) * step
        if (b - a) / step <= rows:
            return a, a + rows * step
    return lo, hi


def stroke_polygon(pts: list[tuple[float, float]], aspect: float, thickness: float) -> str:
    """Polygon for a constant-thickness polyline. pts are (x%, y% from top)."""
    P = [(x * aspect, y) for x, y in pts]          # to isotropic units (1 = 1% of height)
    h = thickness / 2
    normals = []
    for (x0, y0), (x1, y1) in zip(P, P[1:]):
        dx, dy = x1 - x0, y1 - y0
        length = math.hypot(dx, dy) or 1
        normals.append((dy / length, -dx / length))  # points "up" on screen
    top, bottom = [], []
    for i, (x, y) in enumerate(P):
        if len(normals) == 0:
            n = (0.0, -1.0)
            scale = h
        elif i == 0:
            n, scale = normals[0], h
        elif i == len(P) - 1:
            n, scale = normals[-1], h
        else:
            a, b = normals[i - 1], normals[i]
            sx, sy = a[0] + b[0], a[1] + b[1]
            ln = math.hypot(sx, sy) or 1
            n = (sx / ln, sy / ln)
            cos = max(0.34, n[0] * b[0] + n[1] * b[1])  # miter limit ~3x
            scale = h / cos
        top.append((x + n[0] * scale, y + n[1] * scale))
        bottom.append((x - n[0] * scale, y - n[1] * scale))
    ring = top + bottom[::-1]
    return ", ".join(f"{r(x / aspect)}% {r(y)}%" for x, y in ring)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--values", nargs="+", type=float, required=True)
    ap.add_argument("--min", type=float, default=None, help="axis minimum (default: a round value below the data)")
    ap.add_argument("--max", type=float, default=None, help="axis maximum (default: a round value above the data)")
    ap.add_argument("--xs", nargs="*", type=float, help="real x positions (same count as values)")
    ap.add_argument("--labels", nargs="*", help="labels for each value")
    ap.add_argument("--mark", type=float, help="reference value for a dashed line")
    ap.add_argument("--aspect", type=float, default=3.0, help="plot width / height on screen (default 3)")
    ap.add_argument("--stroke", type=float, default=1.4, help="line thickness in %% of plot height (default 1.4 = about 3px on a 14rem plot)")
    args = ap.parse_args()

    vals = args.values
    data_lo = min(vals + ([args.mark] if args.mark is not None else []))
    data_hi = max(vals + ([args.mark] if args.mark is not None else []))
    if args.min is None and args.max is None:
        lo, hi = nice_bounds(min(0.0, data_lo), data_hi)
    else:
        lo = args.min if args.min is not None else min(0.0, data_lo)
        hi = args.max if args.max is not None else data_hi
    labels = args.labels or [r(v) for v in vals]
    if args.xs and len(args.xs) != len(vals):
        raise SystemExit("--xs must have the same count as --values")
    xs = args.xs or list(range(len(vals)))
    x_lo, x_hi = min(xs), max(xs)

    print(f"axis: {r(lo)} .. {r(hi)}")
    print("\n# .bars / .columns / .range  (style=\"--v:...\")")
    for lab, v in zip(labels, vals):
        print(f"  {lab}: --v:{r(pct(v, lo, hi))}")

    print("\n# .plot points  (style=\"--x:...; --y:...\", y from bottom)")
    pts = []
    for lab, x, v in zip(labels, xs, vals):
        px, py = pct(x, x_lo, x_hi), pct(v, lo, hi)
        pts.append((px, 100 - py))
        print(f"  {lab}: --x:{r(px)}; --y:{r(py)}")

    area = ", ".join([f"{r(pts[0][0])}% 100%"] + [f"{r(x)}% {r(y)}%" for x, y in pts] + [f"{r(pts[-1][0])}% 100%"])
    print("\n# .plot .area (fill) and .stroke (line)")
    print(f'  <div class="area" style="clip-path: polygon({area})"></div>')
    print(f'  <div class="stroke" style="clip-path: polygon({stroke_polygon(pts, args.aspect, args.stroke)})"></div>')

    if args.mark is not None:
        print(f"\n# reference line: --mark:{r(pct(args.mark, lo, hi))}")

    print("\n# y-axis ticks  (<span class=\"y\" style=\"--y:...\">)")
    aligned = aligned_ticks(lo, hi)
    if aligned:
        rows, ticks = aligned
        for t in ticks:
            print(f"  {r(t)}: --y:{r(pct(t, lo, hi))}")
        print(f"  -> set --rows:{rows} on .plot so gridlines sit on these ticks")
    else:
        a, b = nice_bounds(lo, hi)
        print(f"  axis {r(lo)}..{r(hi)} has no round gridline spacing; re-run with --min {r(a)} --max {r(b)}")
        print(f"  (or keep it and label only the ends: {r(lo)}: --y:0, {r(hi)}: --y:100)")
    if args.xs:
        print("\n# x-axis labels  (<span class=\"x\" style=\"--x:...\">)")
        for x in xs:
            print(f"  {r(x)}: --x:{r(pct(x, x_lo, x_hi))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
