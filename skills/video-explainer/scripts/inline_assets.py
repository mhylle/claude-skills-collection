#!/usr/bin/env python3
"""Embed local images referenced by an HTML page as data: URIs so the page is a
single self-contained file (works offline, can be emailed or published).

Usage:
    python inline_assets.py page.html            # rewrite in place
    python inline_assets.py page.html -o out.html

Handles <img src="...">, srcset is not supported. Paths are resolved relative
to the HTML file (absolute paths work too). http(s): and data: URLs are left
alone. Missing files are reported and leave the page unchanged at that spot.
"""
from __future__ import annotations

import argparse
import base64
import mimetypes
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SRC_RE = re.compile(r'(<img\b[^>]*?\bsrc\s*=\s*)(["\'])(.*?)\2', re.I | re.S)


def resolve(ref: str, base: Path) -> Path | None:
    if ref.startswith(("data:", "http:", "https:", "//")):
        return None
    if ref.startswith("file:"):
        ref = unquote(urlparse(ref).path)
        if re.match(r"^/[A-Za-z]:/", ref):  # file:///C:/...
            ref = ref[1:]
    p = Path(unquote(ref))
    return p if p.is_absolute() else (base / p)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("html")
    ap.add_argument("-o", "--output")
    args = ap.parse_args()

    src = Path(args.html).resolve()
    page = src.read_text(encoding="utf-8")
    base = src.parent
    stats = {"inlined": 0, "missing": [], "bytes": 0}

    def repl(m: re.Match) -> str:
        path = resolve(m.group(3), base)
        if path is None:
            return m.group(0)
        if not path.is_file():
            stats["missing"].append(m.group(3))
            return m.group(0)
        data = path.read_bytes()
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        stats["inlined"] += 1
        stats["bytes"] += len(data)
        return f'{m.group(1)}{m.group(2)}data:{mime};base64,{base64.b64encode(data).decode()}{m.group(2)}'

    out_html = SRC_RE.sub(repl, page)
    out = Path(args.output).resolve() if args.output else src
    out.write_text(out_html, encoding="utf-8")
    size_kb = out.stat().st_size / 1024
    print(f"[inline] {stats['inlined']} image(s) embedded ({stats['bytes'] / 1024:.0f} KB raw) -> {out} ({size_kb:.0f} KB)")
    for ref in stats["missing"]:
        print(f"[inline] WARNING missing file: {ref}")
    if size_kb > 6000:
        print("[inline] WARNING page is over 6 MB - consider fewer or smaller screenshots (grab.py --width 960)")
    return 1 if stats["missing"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
