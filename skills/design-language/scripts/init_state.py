#!/usr/bin/env python3
"""init_state — scaffold (or resume) a ``./design-system/`` folder.

Owns the *state* side of the output: the directory tree, ``css/tokens.css`` (via
tokens_lib), the W3C JSON, and ``.state/brief.json`` (the resumable session
state, spec §9). It deliberately does NOT generate any HTML/CSS pages — that is
assemble_dashboard.py's job — so the two concerns stay cleanly separated.

The skill calls ``status`` first on every invocation to decide fresh-vs-resume,
then ``scaffold`` to ensure the structure exists. Both print a JSON status line
the orchestrator reads.

CLI
---
    python3 init_state.py status   --dir ./design-system
    python3 init_state.py scaffold --dir ./design-system [--name NAME] [--force]
"""

from __future__ import annotations

import argparse
import datetime
import json
import sys
from pathlib import Path

import tokens_lib

# Canonical phase order. The orchestrator drives these; init_state only needs
# them to compute "where do I resume" and to seed an empty brief.
PHASES: list[str] = [
    "discovery",      # Phase 0 — North Star
    "foundations",    # Phase 1 — color, type, spacing, shape, elevation
    "motion-imagery", # Phase 2
    "components",     # Phase 3
    "patterns",       # Phase 4
    "voice",          # Phase 5
    "assemble",       # Phase 6 — contract + compare + parent dashboard
]

# Dimensions that get a committed decision entry in brief.json["decisions"].
# (Voice is prose-led, but still recorded so the contract can cite it.)
DIMENSIONS: list[str] = [
    "color", "typography", "spacing", "shape", "elevation",
    "motion", "imagery", "components", "patterns", "voice",
]

SUBDIRS = ["pages", "css", "js", "tokens", ".state", ".state/phases", ".state/research", ".state/deltas"]


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _empty_brief(name: str) -> dict:
    return {
        "meta": {
            "name": name,
            "createdAt": _now(),
            "lastPhase": "",
            "completedDimensions": [],
        },
        "northStar": {
            "adjectives": [],
            "useCases": [],
            "references": [],
            # Pre-seeded: escaping the default Claude look is the skill's reason
            # to exist, so it is an anti-reference by construction (spec §13).
            "antiReferences": [
                {"what": "the default Anthropic/Claude look (warm beige, clay/terracotta accent, "
                         "pillowy rounded cards, the stock serif+sans pairing)",
                 "why": "this language must be the user's own, not the assistant's default"}
            ],
            "hardConstraints": [],
        },
        "safeness": {"default": 3, "perDimension": {}},
        "decisions": {},
    }


def _read_brief(state_dir: Path) -> dict | None:
    brief_path = state_dir / "brief.json"
    if not brief_path.exists():
        return None
    try:
        return json.loads(brief_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _next_phase(brief: dict) -> str:
    """The first phase not yet recorded as complete; 'assemble' once all done."""
    completed = set(brief.get("meta", {}).get("completedDimensions", []))
    if not set(DIMENSIONS).issubset(completed):
        # find earliest dimension not done, map roughly to its phase
        last = brief.get("meta", {}).get("lastPhase", "")
        if last in PHASES:
            return last  # resume the phase in progress
        return PHASES[0] if not completed else PHASES[1]
    return "assemble"


def cmd_status(dir_: str) -> int:
    root = Path(dir_)
    state_dir = root / ".state"
    brief = _read_brief(state_dir)
    if brief is None:
        status = {"exists": False, "fresh": True}
    else:
        meta = brief.get("meta", {})
        status = {
            "exists": True,
            "fresh": False,
            "name": meta.get("name", ""),
            "lastPhase": meta.get("lastPhase", ""),
            "completedDimensions": meta.get("completedDimensions", []),
            "nextPhase": _next_phase(brief),
        }
    print(json.dumps(status))
    return 0


def cmd_scaffold(dir_: str, name: str, force: bool) -> int:
    root = Path(dir_)
    for sub in SUBDIRS:
        (root / sub).mkdir(parents=True, exist_ok=True)

    tokens_css = root / "css" / "tokens.css"
    wrote_tokens = False
    if force or not tokens_css.exists():
        tokens_lib.write_tokens_css(tokens_css, tokens_lib.DEFAULT_TOKENS, language_name=name)
        wrote_tokens = True

    # Always (re)derive the machine JSON from the (possibly hand-edited) CSS.
    tokens_lib.export_json(tokens_css, root / "tokens" / "design-tokens.json")

    brief_path = root / ".state" / "brief.json"
    existing = _read_brief(root / ".state")
    if existing is None:
        brief = _empty_brief(name)
        brief_path.write_text(json.dumps(brief, indent=2) + "\n", encoding="utf-8")
        resumed = False
    else:
        brief = existing
        # keep name fresh if the user provided one and none was stored
        if name and not brief.get("meta", {}).get("name"):
            brief.setdefault("meta", {})["name"] = name
            brief_path.write_text(json.dumps(brief, indent=2) + "\n", encoding="utf-8")
        resumed = True

    status = {
        "scaffolded": True,
        "resumed": resumed,
        "wroteDefaultTokens": wrote_tokens,
        "dir": str(root),
        "nextPhase": _next_phase(brief),
        "completedDimensions": brief.get("meta", {}).get("completedDimensions", []),
    }
    print(json.dumps(status))
    return 0


def _deep_merge(dst: dict, src: dict) -> dict:
    """Recursively merge src into dst (dicts merge; everything else replaces)."""
    for key, value in src.items():
        if isinstance(value, dict) and isinstance(dst.get(key), dict):
            _deep_merge(dst[key], value)
        else:
            dst[key] = value
    return dst


def cmd_set_brief(dir_: str, json_path: str) -> int:
    """Deep-merge a JSON object into brief.json (northStar, safeness, meta, …).

    Used by Phase 0 to record adjectives / use-cases / references / anti-
    references / hard constraints / per-dimension safeness baselines without the
    orchestrator hand-editing JSON (which risks corruption).
    """
    root = Path(dir_)
    brief = _read_brief(root / ".state")
    if brief is None:
        print(json.dumps({"error": "no brief.json; run scaffold first"}))
        return 1
    patch = json.loads(Path(json_path).read_text(encoding="utf-8"))
    _deep_merge(brief, patch)
    (root / ".state" / "brief.json").write_text(json.dumps(brief, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "merged": sorted(patch.keys())}))
    return 0


def cmd_commit(dir_: str, dimension: str, level, safeness, rationale: str,
               delta: str | None, phase: str) -> int:
    """Commit one dimension: merge its delta into tokens.css, record the decision.

    This is the single atomic "a dimension is decided" mutation: it folds the
    chosen variant's token delta onto the source of truth, re-derives the W3C
    JSON, and records the decision (with its INTENDED safeness level, so the
    contract and future work match the intended adventurousness) in brief.json.
    Run assemble_dashboard.py afterward to regenerate the pages.
    """
    root = Path(dir_)
    brief = _read_brief(root / ".state")
    if brief is None:
        print(json.dumps({"error": "no brief.json; run scaffold first"}))
        return 1

    tokens_css = root / "css" / "tokens.css"
    delta_dict: dict = {}
    if delta:
        delta_dict = tokens_lib.load_delta(delta)
        tokens_lib.merge_into_css(tokens_css, [delta], language_name=brief.get("meta", {}).get("name", ""))
        tokens_lib.export_json(tokens_css, root / "tokens" / "design-tokens.json")

    def _as_int(v):
        try:
            return int(v)
        except (TypeError, ValueError):
            return v

    brief.setdefault("decisions", {})[dimension] = {
        "chosenLevel": _as_int(level),
        "tokens": delta_dict,
        "safeness": _as_int(safeness),
        "rationale": rationale,
    }
    meta = brief.setdefault("meta", {})
    completed = meta.setdefault("completedDimensions", [])
    if dimension not in completed:
        completed.append(dimension)
    if phase:
        meta["lastPhase"] = phase

    (root / ".state" / "brief.json").write_text(json.dumps(brief, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True, "dimension": dimension, "safeness": safeness,
        "completedDimensions": completed,
    }))
    return 0


def _main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Scaffold or inspect a ./design-system state folder.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_status = sub.add_parser("status", help="Report fresh-vs-resume for an existing folder")
    p_status.add_argument("--dir", default="./design-system")

    p_scaffold = sub.add_parser("scaffold", help="Create dirs, tokens.css, brief.json")
    p_scaffold.add_argument("--dir", default="./design-system")
    p_scaffold.add_argument("--name", default="")
    p_scaffold.add_argument("--force", action="store_true", help="Overwrite tokens.css with defaults")

    p_set = sub.add_parser("set-brief", help="Deep-merge a JSON patch into brief.json")
    p_set.add_argument("--dir", default="./design-system")
    p_set.add_argument("--json", required=True, help="path to a JSON object to merge")

    p_commit = sub.add_parser("commit", help="Commit a dimension's decision + merge its token delta")
    p_commit.add_argument("--dir", default="./design-system")
    p_commit.add_argument("--dimension", required=True)
    p_commit.add_argument("--level", default=None, help="chosen safeness-spectrum level")
    p_commit.add_argument("--safeness", default=None, help="INTENDED safeness 1-5 for this dimension")
    p_commit.add_argument("--rationale", default="")
    p_commit.add_argument("--delta", default=None, help="path to delta.json to merge into tokens.css")
    p_commit.add_argument("--phase", default="", help="phase id to record as lastPhase")

    args = parser.parse_args(argv)
    if args.cmd == "status":
        return cmd_status(args.dir)
    if args.cmd == "scaffold":
        return cmd_scaffold(args.dir, args.name, args.force)
    if args.cmd == "set-brief":
        return cmd_set_brief(args.dir, args.json)
    if args.cmd == "commit":
        return cmd_commit(args.dir, args.dimension, args.level, args.safeness,
                          args.rationale, args.delta, args.phase)
    return 2


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
