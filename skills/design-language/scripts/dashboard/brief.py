"""Read the resumable session state (brief.json) for page generation.

Pages render from the brief but must never crash a regeneration over a missing
or half-written file — so reads degrade to an empty shell rather than raising.
"""

from __future__ import annotations

import json
from pathlib import Path

_EMPTY = {"meta": {}, "northStar": {}, "safeness": {}, "decisions": {}}


def read_brief(root: Path) -> dict:
    """Load brief.json; tolerate a missing/broken file with an empty shell."""
    path = root / ".state" / "brief.json"
    if not path.exists():
        return dict(_EMPTY)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return dict(_EMPTY)


def lang_name(brief: dict) -> str:
    return brief.get("meta", {}).get("name") or "Untitled language"
