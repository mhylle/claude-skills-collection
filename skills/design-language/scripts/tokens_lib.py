#!/usr/bin/env python3
"""tokens_lib — the single shared model for a design language's tokens.

Everything in the design-language skill that touches tokens goes through this
module, so the dashboard, the spectrum renderer, the questionnaire previews and
the token-tweak merge can never disagree about what a token *is* or how it is
named. ``css/tokens.css`` is the hand-editable source of truth (spec §4
invariant); this module is the code that reads and writes it.

Representations
---------------
- **tokens.css** — ``:root { --name: value; }`` custom properties, grouped by
  section with comments. The only file a human hand-edits.
- **flat dict** — ``{"--color-bg": "#fbfcfd", ...}``. The in-memory form every
  function here passes around. Keys always include the leading ``--``.
- **delta** — a partial flat dict written by ``token-tweak`` answers and by a
  chosen spectrum variant's ``tokens`` field. Merged onto the source on commit
  so a tweak is a clean, undoable layer rather than an in-place edit (spec §15).
- **design-tokens.json** — nested W3C Design Tokens format, *generated* from the
  CSS for downstream tooling (Style Dictionary, Figma). Never hand-edited.

CLI
---
    python3 tokens_lib.py init       --out <tokens.css>
    python3 tokens_lib.py merge      --tokens <tokens.css> --delta <delta.json> [--delta ...]
    python3 tokens_lib.py export-json --tokens <tokens.css> --out <design-tokens.json>
    python3 tokens_lib.py get        --tokens <tokens.css> [--name --color-accent]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# The default token set.
#
# This is a deliberately *neutral, non-Claude* seed: cool near-white surfaces,
# a blue accent (never terracotta/clay), slate text, modest-but-not-pillowy
# radii. It is only a starting canvas — the whole point of the skill is that the
# user replaces these through the safeness-spectrum loop. It exists so that the
# very first spectrum the user reacts to is rendered against *something* coherent
# rather than the browser default, and so a brand-new design-system folder is
# already a working page.
#
# Each entry: (css var, value, W3C $type, dotted W3C path). The section grouping
# drives both the comment blocks in tokens.css and the nesting in the JSON.
# ---------------------------------------------------------------------------

TOKEN_SECTIONS: list[dict] = [
    {
        "section": "Color",
        "tokens": [
            ("--color-bg",              "#fbfcfd",                       "color",      "color.bg"),
            ("--color-surface",         "#ffffff",                       "color",      "color.surface"),
            ("--color-surface-alt",     "#eef2f7",                       "color",      "color.surface-alt"),
            ("--color-text",            "#141821",                       "color",      "color.text"),
            ("--color-text-muted",      "#5a6473",                       "color",      "color.text-muted"),
            ("--color-border",          "#d7dee8",                       "color",      "color.border"),
            ("--color-accent",          "#2f6df0",                       "color",      "color.accent"),
            ("--color-accent-hover",    "#1f57d6",                       "color",      "color.accent-hover"),
            ("--color-accent-contrast", "#ffffff",                       "color",      "color.accent-contrast"),
            ("--color-success",         "#1f9d6b",                       "color",      "color.success"),
            ("--color-warning",         "#c98a14",                       "color",      "color.warning"),
            ("--color-danger",          "#d23f4a",                       "color",      "color.danger"),
            ("--color-info",            "#2f6df0",                       "color",      "color.info"),
        ],
    },
    {
        "section": "Typography",
        "tokens": [
            ("--font-sans",       '"Inter", system-ui, -apple-system, sans-serif', "fontFamily", "font.sans"),
            ("--font-display",    '"Inter", system-ui, sans-serif',                "fontFamily", "font.display"),
            ("--font-mono",       '"JetBrains Mono", ui-monospace, monospace',     "fontFamily", "font.mono"),
            ("--text-base",       "1rem",     "dimension", "text.base"),
            ("--text-scale-ratio","1.25",     "number",    "text.scale-ratio"),
            ("--text-sm",         "0.8rem",   "dimension", "text.sm"),
            ("--text-lg",         "1.25rem",  "dimension", "text.lg"),
            ("--text-xl",         "1.563rem", "dimension", "text.xl"),
            ("--text-2xl",        "1.953rem", "dimension", "text.2xl"),
            ("--text-3xl",        "2.441rem", "dimension", "text.3xl"),
            ("--weight-normal",   "400",      "number",    "weight.normal"),
            ("--weight-medium",   "550",      "number",    "weight.medium"),
            ("--weight-bold",     "720",      "number",    "weight.bold"),
            ("--leading-tight",   "1.2",      "number",    "leading.tight"),
            ("--leading-normal",  "1.55",     "number",    "leading.normal"),
            ("--leading-loose",   "1.8",      "number",    "leading.loose"),
            ("--measure",         "66ch",     "dimension", "measure.base"),
            ("--tracking",        "0",        "dimension", "tracking.base"),
        ],
    },
    {
        "section": "Spacing & scale",
        "tokens": [
            ("--space-unit", "8px",  "dimension", "space.unit"),
            ("--space-1",    "4px",  "dimension", "space.1"),
            ("--space-2",    "8px",  "dimension", "space.2"),
            ("--space-3",    "12px", "dimension", "space.3"),
            ("--space-4",    "16px", "dimension", "space.4"),
            ("--space-5",    "24px", "dimension", "space.5"),
            ("--space-6",    "32px", "dimension", "space.6"),
            ("--space-7",    "48px", "dimension", "space.7"),
            ("--space-8",    "64px", "dimension", "space.8"),
        ],
    },
    {
        "section": "Shape & borders",
        "tokens": [
            ("--radius-none", "0",     "dimension", "radius.none"),
            ("--radius-sm",   "4px",   "dimension", "radius.sm"),
            ("--radius-md",   "8px",   "dimension", "radius.md"),
            ("--radius-lg",   "16px",  "dimension", "radius.lg"),
            ("--radius-full", "999px", "dimension", "radius.full"),
            ("--border-width","1px",   "dimension", "border.width"),
            ("--border-style","solid", "other",     "border.style"),
        ],
    },
    {
        "section": "Elevation & depth",
        "tokens": [
            ("--shadow-sm",       "0 1px 2px rgba(20, 24, 33, 0.06)",                          "shadow", "shadow.sm"),
            ("--shadow-md",       "0 4px 12px rgba(20, 24, 33, 0.10)",                         "shadow", "shadow.md"),
            ("--shadow-lg",       "0 12px 32px rgba(20, 24, 33, 0.16)",                        "shadow", "shadow.lg"),
            ("--elevation-style", "flat",  "other", "elevation.style"),  # flat | raised | glass
        ],
    },
    {
        "section": "Motion",
        "tokens": [
            ("--motion-duration-fast", "120ms",                       "duration",     "motion.duration.fast"),
            ("--motion-duration-base", "240ms",                       "duration",     "motion.duration.base"),
            ("--motion-duration-slow", "480ms",                       "duration",     "motion.duration.slow"),
            ("--motion-ease",          "cubic-bezier(0.2, 0, 0, 1)",  "cubicBezier",  "motion.ease"),
            ("--motion-distance",      "8px",                         "dimension",    "motion.distance"),
        ],
    },
]

# Derived lookups -----------------------------------------------------------

def _flatten() -> tuple[dict, dict]:
    tokens: dict[str, str] = {}
    meta: dict[str, dict] = {}
    for sec in TOKEN_SECTIONS:
        for var, value, wtype, wpath in sec["tokens"]:
            tokens[var] = value
            meta[var] = {"type": wtype, "path": wpath, "section": sec["section"]}
    return tokens, meta


DEFAULT_TOKENS, VAR_META = _flatten()

# Match `--name: value;` inside a CSS file. Values may contain anything but `;`.
_DECL_RE = re.compile(r"(--[A-Za-z0-9-]+)\s*:\s*([^;]+);")


# ---------------------------------------------------------------------------
# Parse / write tokens.css
# ---------------------------------------------------------------------------

def parse_tokens_css(path: str | Path) -> dict[str, str]:
    """Read a tokens.css file into a flat ``{--name: value}`` dict.

    Forgiving by design: it scans every ``--name: value;`` declaration in the
    file regardless of selector nesting, so a hand-edited file with extra
    selectors or comments still parses. Later declarations win (last value of a
    repeated name), matching CSS cascade for a single source file.
    """
    text = Path(path).read_text(encoding="utf-8")
    out: dict[str, str] = {}
    for name, value in _DECL_RE.findall(text):
        out[name] = value.strip()
    return out


def write_tokens_css(path: str | Path, tokens: dict[str, str], language_name: str = "") -> None:
    """Write a flat token dict to a grouped, commented tokens.css.

    Known tokens are emitted in their section order so the file always reads the
    same way; any extra (custom) tokens the user or skill added are preserved in
    a trailing "Custom" block rather than dropped.
    """
    lines: list[str] = []
    title = f" {language_name} —" if language_name else ""
    lines.append("/*")
    lines.append(f" * tokens.css —{title} the SINGLE SOURCE OF TRUTH for this design language.")
    lines.append(" *")
    lines.append(" * Hand-edit THIS file. Every dashboard page and the W3C JSON are")
    lines.append(" * regenerated from it (scripts/assemble_dashboard.py), so they can never")
    lines.append(" * drift. Token names are stable contracts — future UI is built against them.")
    lines.append(" */")
    lines.append(":root {")

    seen: set[str] = set()
    for sec in TOKEN_SECTIONS:
        section_vars = [(v, val, t, p) for (v, val, t, p) in sec["tokens"] if v in tokens]
        if not section_vars:
            continue
        lines.append("")
        lines.append(f"  /* {sec['section']} */")
        for var, _default, _t, _p in sec["tokens"]:
            if var in tokens:
                lines.append(f"  {var}: {tokens[var]};")
                seen.add(var)

    extras = [v for v in tokens if v not in seen]
    if extras:
        lines.append("")
        lines.append("  /* Custom (added beyond the standard token set) */")
        for var in extras:
            lines.append(f"  {var}: {tokens[var]};")

    lines.append("}")
    lines.append("")
    Path(path).write_text("\n".join(lines), encoding="utf-8")


# ---------------------------------------------------------------------------
# Deltas (token-tweak / chosen spectrum variant)
# ---------------------------------------------------------------------------

def _normalize_key(key: str) -> str:
    """Allow delta keys with or without the leading ``--``."""
    return key if key.startswith("--") else f"--{key}"


def apply_delta(tokens: dict[str, str], delta: dict[str, str]) -> dict[str, str]:
    """Return a NEW dict with ``delta`` merged over ``tokens`` (immutable)."""
    merged = dict(tokens)
    for key, value in delta.items():
        merged[_normalize_key(key)] = str(value)
    return merged


def load_delta(path: str | Path) -> dict[str, str]:
    """Load a delta JSON file ({name: value}) with normalized keys."""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return {_normalize_key(k): str(v) for k, v in raw.items()}


def merge_into_css(tokens_css: str | Path, deltas: list[str | Path], language_name: str = "") -> dict[str, str]:
    """Apply one or more delta files onto tokens.css IN PLACE; return merged dict."""
    tokens = parse_tokens_css(tokens_css)
    for d in deltas:
        tokens = apply_delta(tokens, load_delta(d))
    write_tokens_css(tokens_css, tokens, language_name=language_name)
    return tokens


# ---------------------------------------------------------------------------
# W3C Design Tokens export
# ---------------------------------------------------------------------------

def _set_path(tree: dict, dotted: str, leaf: dict) -> None:
    parts = dotted.split(".")
    node = tree
    for part in parts[:-1]:
        node = node.setdefault(part, {})
    node[parts[-1]] = leaf


def to_w3c(tokens: dict[str, str]) -> dict:
    """Build a nested W3C Design Tokens document from a flat token dict.

    Known tokens use their declared ``$type`` and dotted path; unknown tokens
    land under ``custom.<name>`` with no type so the export is lossless.
    """
    tree: dict = {}
    for var, value in tokens.items():
        meta = VAR_META.get(var)
        if meta:
            leaf = {"$value": value, "$type": meta["type"]}
            _set_path(tree, meta["path"], leaf)
        else:
            name = var.lstrip("-")
            _set_path(tree, f"custom.{name}", {"$value": value})
    return tree


def export_json(tokens_css: str | Path, out: str | Path) -> None:
    tokens = parse_tokens_css(tokens_css)
    doc = to_w3c(tokens)
    Path(out).write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Read/write a design language's tokens.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_init = sub.add_parser("init", help="Write the default token set to a new tokens.css")
    p_init.add_argument("--out", required=True)
    p_init.add_argument("--name", default="")

    p_merge = sub.add_parser("merge", help="Apply delta file(s) onto tokens.css in place")
    p_merge.add_argument("--tokens", required=True)
    p_merge.add_argument("--delta", action="append", required=True)
    p_merge.add_argument("--name", default="")

    p_export = sub.add_parser("export-json", help="Write W3C design-tokens.json from tokens.css")
    p_export.add_argument("--tokens", required=True)
    p_export.add_argument("--out", required=True)

    p_get = sub.add_parser("get", help="Print one token value, or all as JSON")
    p_get.add_argument("--tokens", required=True)
    p_get.add_argument("--name", default="")

    args = parser.parse_args(argv)

    if args.cmd == "init":
        write_tokens_css(args.out, DEFAULT_TOKENS, language_name=args.name)
        print(f"Wrote default tokens -> {args.out}")
    elif args.cmd == "merge":
        merged = merge_into_css(args.tokens, args.delta, language_name=args.name)
        print(f"Merged {len(args.delta)} delta(s) into {args.tokens} ({len(merged)} tokens)")
    elif args.cmd == "export-json":
        export_json(args.tokens, args.out)
        print(f"Wrote W3C tokens -> {args.out}")
    elif args.cmd == "get":
        tokens = parse_tokens_css(args.tokens)
        if args.name:
            key = _normalize_key(args.name)
            if key not in tokens:
                print(f"(not set) {key}", file=sys.stderr)
                return 1
            print(tokens[key])
        else:
            print(json.dumps(tokens, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
