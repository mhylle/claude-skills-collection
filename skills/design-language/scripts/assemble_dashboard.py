#!/usr/bin/env python3
"""assemble_dashboard — regenerate ./design-system/ pages FROM tokens.

Realizes the spec §4 invariant: ``css/tokens.css`` is the single source of truth
and every dashboard page is *regenerated from it*, so the visible dashboard can
never drift from the machine-readable tokens. This is the thin CLI orchestrator;
the page generators live in the ``dashboard`` package:

- ``dashboard.render``        — shared head/nav/shell HTML primitives
- ``dashboard.assets``        — copy static CSS/JS, re-derive the W3C JSON
- ``dashboard.brief``         — read the resumable brief.json state
- ``dashboard.pages_overview``— index, moodboard, voice (brief-driven)
- ``dashboard.pages_tokens``  — tokens.html (token visualizations)
- ``dashboard.pages_showcase``— components, patterns, motion, imagery
- ``dashboard.pages_compare`` — compare.html (default-Claude vs. yours)
- ``dashboard.contract``      — DESIGN_LANGUAGE.md generator

CLI
---
    python3 assemble_dashboard.py --dir ./design-system [--page all|tokens|...]

``--page X`` regenerates just that page; css/json are always refreshed.
Idempotent and re-runnable. Stdlib only.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import tokens_lib
from dashboard.assets import refresh_assets, refresh_json
from dashboard.brief import read_brief
from dashboard.contract import design_language_md
from dashboard.pages_compare import page_compare
from dashboard.pages_overview import page_index, page_moodboard, page_voice
from dashboard.pages_showcase import (
    page_components, page_imagery, page_motion, page_patterns,
)
from dashboard.pages_tokens import page_tokens

# key -> (builder, output filename under pages/). index.html lives at the root.
PAGE_BUILDERS = {
    "index": (page_index, None),
    "moodboard": (page_moodboard, "moodboard.html"),
    "tokens": (page_tokens, "tokens.html"),
    "components": (page_components, "components.html"),
    "patterns": (page_patterns, "patterns.html"),
    "motion": (page_motion, "motion.html"),
    "imagery": (page_imagery, "imagery.html"),
    "voice": (page_voice, "voice.html"),
    "compare": (page_compare, "compare.html"),
}


def _write_page(root: Path, key: str, brief: dict, tokens: dict) -> Path:
    builder, filename = PAGE_BUILDERS[key]
    content = builder(root, brief, tokens)
    if key == "index":
        out = root / "index.html"
    else:
        (root / "pages").mkdir(parents=True, exist_ok=True)
        out = root / "pages" / filename
    out.write_text(content, encoding="utf-8")
    return out


def assemble(root: Path, page: str) -> dict:
    tokens_css = root / "css" / "tokens.css"
    if not tokens_css.exists():
        raise FileNotFoundError(
            f"{tokens_css} not found — run init_state.py scaffold first."
        )
    # Always refresh assets + JSON so pages and machine tokens never drift.
    refresh_assets(root)
    refresh_json(root)

    brief = read_brief(root)
    tokens = tokens_lib.parse_tokens_css(tokens_css)

    if page == "all":
        keys = ["index"] + [k for k in PAGE_BUILDERS if k != "index"]
    else:
        if page not in PAGE_BUILDERS:
            raise ValueError(f"Unknown page '{page}'. Known: all, {', '.join(PAGE_BUILDERS)}")
        keys = [page]

    written = [str(_write_page(root, k, brief, tokens)) for k in keys]

    # The contract is regenerated on a full assemble (or when index is targeted).
    md_path = None
    if page in ("all", "index"):
        md_path = root / "DESIGN_LANGUAGE.md"
        md_path.write_text(design_language_md(brief, tokens), encoding="utf-8")

    return {"pages": written, "contract": str(md_path) if md_path else None}


def _main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description="Regenerate ./design-system pages from tokens.")
    p.add_argument("--dir", default="./design-system")
    p.add_argument("--page", default="all",
                   help="all | index | " + " | ".join(k for k in PAGE_BUILDERS if k != "index"))
    args = p.parse_args(argv)

    result = assemble(Path(args.dir), args.page)
    print(json.dumps({"ok": True, **result}))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
