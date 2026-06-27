"""DESIGN_LANGUAGE.md — the contract a future session reads (spec §12).

Generated from brief.json + tokens so the contract always reflects the committed
decisions: identity, the explicit anti-reference, the token map, per-dimension
rules with their intended safeness level, and a pre-ship checklist.
"""

from __future__ import annotations

from dashboard.brief import lang_name
from dashboard.render import DIMENSIONS


def _headline_tokens(tokens: dict) -> str:
    headline = ["--color-bg", "--color-surface", "--color-text", "--color-accent",
                "--font-sans", "--font-display", "--radius-md", "--space-4",
                "--shadow-md", "--motion-ease"]
    lines = [f"- `{k}`: `{tokens[k]}`" for k in headline if k in tokens]
    return "\n".join(lines)


def _dimension_rules(brief: dict) -> str:
    decisions = brief.get("decisions", {})
    safeness = brief.get("safeness", {}).get("perDimension", {})
    out = []
    for dim in DIMENSIONS:
        dec = decisions.get(dim, {})
        level = dec.get("safeness", dec.get("chosenLevel", safeness.get(dim)))
        approach = dec.get("name") or dec.get("rationale") or "_to be decided_"
        lvl_txt = f"{level}/5" if level is not None else "_unset_"
        out.append(f"### {dim}\n\n"
                   f"- **Chosen approach:** {approach}\n"
                   f"- **Intended safeness:** {lvl_txt}\n"
                   f"- **Do:** stay on this dimension's committed tokens / approach.\n"
                   f"- **Don't:** drift toward the default Claude look for this dimension.\n")
    return "\n".join(out)


def design_language_md(brief: dict, tokens: dict) -> str:
    name = lang_name(brief)
    north = brief.get("northStar", {})
    adjectives = ", ".join(north.get("adjectives", [])) or "_not set_"
    antis = north.get("antiReferences", [])
    anti_lines = "\n".join(f"- {a.get('what','')} — {a.get('why','')}" for a in antis) or "- (none recorded)"
    constraints = "\n".join(f"- {c}" for c in north.get("hardConstraints", [])) or "- (none recorded)"
    return f"""# {name} — Design Language Contract

> This is the contract future sessions read before building any UI. The single
> source of truth is `css/tokens.css`; this file explains how to use it.

## 1. Identity

**North-star adjectives:** {adjectives}

{name} is a reusable visual design language, deliberately its own — built to be
distinct from the default assistant aesthetic.

## 2. Anti-reference — this language must NEVER look like

{anti_lines}

**Hard constraints:**

{constraints}

## 3. Token map

- **Source of truth:** `css/tokens.css` (hand-edit this).
- **Machine format:** `tokens/design-tokens.json` (W3C Design Tokens; generated).
- Every page is regenerated from the CSS via `scripts/assemble_dashboard.py`.

**Headline tokens:**

{_headline_tokens(tokens)}

## 4. Per-dimension rules

{_dimension_rules(brief)}

## 5. Component & pattern rules

- Build components from `components.css` classes (`.btn`, `.card`, `.input`, `.badge`, `.nav`, `.table`).
- Every component value comes from a token — never hardcode a colour, radius, space or shadow.
- Layouts use the spacing scale (`--space-*`) and the grid/stack/cluster helpers in `base.css`.

## 6. Pre-ship checklist

Before delivering any UI in this language, confirm:

- [ ] Uses ONLY palette tokens (no off-palette colours).
- [ ] All spacing is on the `--space-*` scale.
- [ ] No banned / anti-reference patterns (see §2).
- [ ] Matches the intended safeness level per dimension (see §4).
- [ ] It is **NOT** the default Claude look — verify against `pages/compare.html`.
"""
