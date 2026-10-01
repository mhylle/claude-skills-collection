#!/usr/bin/env python3
"""Grab still frames from a video at exact timestamps (for screenshots or a
closer look at a section), at native resolution by default.

Usage:
    python grab.py <video> --out DIR --times 1:23 2:45.5 90
    python grab.py <video> --out DIR --start 1:00 --end 1:30 --every 2
Options:
    --width W       scale to W px wide (default: native resolution)
    --crop W:H:X:Y  crop first (ffmpeg crop syntax, source pixels), e.g. to cut
                    letterbox margins or zoom into one panel: --crop 960:540:160:90
    --prefix P      filename prefix (default: shot)

Prints one line per image: <path> (t=MM:SS.s). Read the images to check them -
frames near cuts or transitions are often blurred or mid-fade; shift by ±0.5-1 s.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def to_seconds(value: str) -> float:
    parts = [float(p) for p in str(value).strip().split(":")]
    total = 0.0
    for p in parts:
        total = total * 60 + p
    return total


def label(seconds: float) -> str:
    m, s = divmod(seconds, 60)
    return f"{int(m):02d}m{s:04.1f}s".replace(".", "_")


def grab(video: str, seconds: float, out: Path, width: int | None, crop: str | None = None) -> bool:
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
           "-ss", f"{seconds:.3f}", "-i", video, "-frames:v", "1", "-q:v", "2"]
    filters = []
    if crop:
        filters.append(f"crop={crop}")
    if width:
        filters.append(f"scale={width}:-2")
    if filters:
        cmd += ["-vf", ",".join(filters)]
    cmd.append(str(out))
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0 or not out.exists():
        print(f"[grab] failed at {seconds:.1f}s: {proc.stderr.strip()[:200]}", file=sys.stderr)
        return False
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("--out", required=True)
    ap.add_argument("--times", nargs="*", default=[])
    ap.add_argument("--start")
    ap.add_argument("--end")
    ap.add_argument("--every", type=float, help="seconds between frames for --start/--end sampling")
    ap.add_argument("--width", type=int)
    ap.add_argument("--crop", help="W:H:X:Y crop in source pixels, applied before --width")
    ap.add_argument("--prefix", default="shot")
    args = ap.parse_args()

    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg not found on PATH")
    if not Path(args.video).is_file():
        raise SystemExit(f"video not found: {args.video}")

    times = [to_seconds(t) for t in args.times]
    if args.start is not None and args.end is not None:
        step = args.every or 1.0
        t, end = to_seconds(args.start), to_seconds(args.end)
        while t <= end + 1e-6:
            times.append(round(t, 3))
            t += step
    if not times:
        raise SystemExit("give --times and/or --start/--end [--every]")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    for t in times:
        path = out_dir / f"{args.prefix}_{label(t)}.jpg"
        if grab(args.video, t, path, args.width, args.crop):
            m, s = divmod(t, 60)
            print(f"{path} (t={int(m):02d}:{s:04.1f})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
