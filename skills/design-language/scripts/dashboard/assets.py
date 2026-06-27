"""Refresh the token-derived artifacts that every assemble run rewrites.

The authored static stylesheets and demo script are copied into the output, and
the W3C JSON is re-derived from tokens.css — so the machine tokens and the page
CSS can never drift from the hand-edited source of truth.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import tokens_lib

# Where the authored static assets live, relative to the scripts/ directory.
ASSETS_DIR = Path(__file__).resolve().parent.parent.parent / "assets" / "dashboard"


def refresh_assets(root: Path) -> None:
    """Copy authored base.css/components.css into css/ and demos.js into js/."""
    (root / "css").mkdir(parents=True, exist_ok=True)
    (root / "js").mkdir(parents=True, exist_ok=True)
    for name in ("base.css", "components.css"):
        src = ASSETS_DIR / name
        if src.exists():
            shutil.copyfile(src, root / "css" / name)
    demos = ASSETS_DIR / "demos.js"
    if demos.exists():
        shutil.copyfile(demos, root / "js" / "demos.js")


def refresh_json(root: Path) -> None:
    """Re-derive tokens/design-tokens.json from tokens.css."""
    (root / "tokens").mkdir(parents=True, exist_ok=True)
    tokens_lib.export_json(root / "css" / "tokens.css", root / "tokens" / "design-tokens.json")
