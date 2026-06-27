# Token schema — what the skill emits

This is the authoring spec for the token system the `design-language` skill
produces. It documents the **two representations** of a language's tokens, the
**invariant** that keeps them from drifting, and the **exact token set** (names,
W3C types, and dotted paths) emitted by `scripts/tokens_lib.py`. The names and
types below are pulled directly from `tokens_lib.TOKEN_SECTIONS` / `VAR_META` —
if you change one, change the other.

Where this file and `docs/design-language-skill-spec.md` disagree, the code in
`tokens_lib.py` and the `scratchpad/BUILD_CONTRACT.md` schemas win.

## Contents
- [The two representations & the invariant](#the-two-representations--the-invariant)
- [Token groups (the full set)](#token-groups-the-full-set)
- [Custom tokens](#custom-tokens)
- [The delta layer](#the-delta-layer)
- [How future UI should consume these](#how-future-ui-should-consume-these)
- [Provenance](#provenance)

---

## The two representations & the invariant

A language's tokens exist in exactly two forms:

| File | Form | Authored or generated? |
|------|------|------------------------|
| `css/tokens.css` | `:root { --name: value; }` CSS custom properties, grouped & commented | **Hand-edited source of truth.** The *only* token file a human touches. |
| `tokens/design-tokens.json` | Nested [W3C Design Tokens](#provenance) format | **Generated** from `tokens.css`. Never hand-edited. |

**The invariant (spec §4):** `tokens.css` is *authored*; the JSON **and every
dashboard page** are *generated* from it by `scripts/assemble_dashboard.py`
(which calls `tokens_lib.export_json` / `to_w3c`). Because generation is
one-directional and deterministic, the machine-readable JSON, the visual
dashboard, and the source CSS **can never disagree** — there is no second place
to edit a value, so there is nothing to keep in sync by hand. If a value looks
wrong on a page, you fix `tokens.css` and regenerate; you never patch a page or
the JSON directly.

`tokens_lib.parse_tokens_css` reads the CSS into a flat dict
(`{"--color-accent": "#2f6df0", ...}`), and `write_tokens_css` writes a flat dict
back out grouped by section. The parser is forgiving: it scans every
`--name: value;` declaration regardless of selector or comments, so a
hand-tuned file still round-trips.

---

## Token groups (the full set)

Six groups, in the order `tokens.css` emits them. For each token: its CSS
variable name, the W3C **`$type`** it exports as, and its **dotted path** in
`design-tokens.json`. (Default seed values come from `tokens_lib.DEFAULT_TOKENS`;
they are a deliberately *neutral, non-Claude* canvas the user replaces — see the
anti-reference.)

### Color
W3C `$type`: **`color`** for all.

| Token | Path |
|-------|------|
| `--color-bg` | `color.bg` |
| `--color-surface` | `color.surface` |
| `--color-surface-alt` | `color.surface-alt` |
| `--color-text` | `color.text` |
| `--color-text-muted` | `color.text-muted` |
| `--color-border` | `color.border` |
| `--color-accent` | `color.accent` |
| `--color-accent-hover` | `color.accent-hover` |
| `--color-accent-contrast` | `color.accent-contrast` |
| `--color-success` | `color.success` |
| `--color-warning` | `color.warning` |
| `--color-danger` | `color.danger` |
| `--color-info` | `color.info` |

### Typography

| Token | `$type` | Path |
|-------|---------|------|
| `--font-sans` | `fontFamily` | `font.sans` |
| `--font-display` | `fontFamily` | `font.display` |
| `--font-mono` | `fontFamily` | `font.mono` |
| `--text-base` | `dimension` | `text.base` |
| `--text-scale-ratio` | `number` | `text.scale-ratio` |
| `--text-sm` | `dimension` | `text.sm` |
| `--text-lg` | `dimension` | `text.lg` |
| `--text-xl` | `dimension` | `text.xl` |
| `--text-2xl` | `dimension` | `text.2xl` |
| `--text-3xl` | `dimension` | `text.3xl` |
| `--weight-normal` | `number` | `weight.normal` |
| `--weight-medium` | `number` | `weight.medium` |
| `--weight-bold` | `number` | `weight.bold` |
| `--leading-tight` | `number` | `leading.tight` |
| `--leading-normal` | `number` | `leading.normal` |
| `--leading-loose` | `number` | `leading.loose` |
| `--measure` | `dimension` | `measure.base` |
| `--tracking` | `dimension` | `tracking.base` |

### Spacing & scale
W3C `$type`: **`dimension`** for all. `--space-unit` is the base; `--space-1`
through `--space-8` are the scale steps future UI must lay out on.

| Token | Path |
|-------|------|
| `--space-unit` | `space.unit` |
| `--space-1` | `space.1` |
| `--space-2` | `space.2` |
| `--space-3` | `space.3` |
| `--space-4` | `space.4` |
| `--space-5` | `space.5` |
| `--space-6` | `space.6` |
| `--space-7` | `space.7` |
| `--space-8` | `space.8` |

### Shape & borders

| Token | `$type` | Path |
|-------|---------|------|
| `--radius-none` | `dimension` | `radius.none` |
| `--radius-sm` | `dimension` | `radius.sm` |
| `--radius-md` | `dimension` | `radius.md` |
| `--radius-lg` | `dimension` | `radius.lg` |
| `--radius-full` | `dimension` | `radius.full` |
| `--border-width` | `dimension` | `border.width` |
| `--border-style` | `other` | `border.style` |

### Elevation & depth

| Token | `$type` | Path |
|-------|---------|------|
| `--shadow-sm` | `shadow` | `shadow.sm` |
| `--shadow-md` | `shadow` | `shadow.md` |
| `--shadow-lg` | `shadow` | `shadow.lg` |
| `--elevation-style` | `other` | `elevation.style` |

`--elevation-style` is a keyword token: `flat` \| `raised` \| `glass`. It tells
future UI *which depth model* the language uses, so components don't invent their
own.

### Motion

| Token | `$type` | Path |
|-------|---------|------|
| `--motion-duration-fast` | `duration` | `motion.duration.fast` |
| `--motion-duration-base` | `duration` | `motion.duration.base` |
| `--motion-duration-slow` | `duration` | `motion.duration.slow` |
| `--motion-ease` | `cubicBezier` | `motion.ease` |
| `--motion-distance` | `dimension` | `motion.distance` |

---

## Custom tokens

The set above is the **standard contract** — stable names future UI is built
against. A language may need tokens beyond it (a second accent, a brand gradient,
a bespoke layer). Those are **preserved, not dropped**:

- In `tokens.css`, `write_tokens_css` emits any non-standard token in a trailing
  `/* Custom (added beyond the standard token set) */` block.
- In `design-tokens.json`, `to_w3c` places any token it doesn't recognize under
  **`custom.<name>`** (with `$value` but no `$type`, since the type is unknown),
  so the export is lossless.

Example: a hand-added `--color-accent-2: #f59e0b;` round-trips through the Custom
CSS block and exports as `custom.color-accent-2 = { "$value": "#f59e0b" }`.

---

## The delta layer

Tokens are *committed* via **deltas**, never by direct in-place edits — this
gives a clean, undoable history (spec §15 build decision).

- A **delta** is a flat partial dict, `{ "name": "value" }`. **Keys may omit the
  leading `--`** — `tokens_lib._normalize_key` adds it. So
  `{ "radius-md": "12px", "--color-accent": "#7c3aed" }` is valid.
- Two things produce deltas:
  1. a **`token-tweak`** answer (`responses.json` → `{ "tokens": {...} }`), and
  2. a **chosen `safeness-spectrum` variant's** `tokens` field.
- On commit, the delta is written to `.state/phases/<phase>/delta.json` (and/or
  `.state/deltas/`) and merged onto `tokens.css` with
  `tokens_lib.merge_into_css` (which applies each delta with the **immutable**
  `apply_delta` — it returns a *new* dict, never mutating the input) and
  rewrites the grouped CSS.

Because the delta is a separate artifact, an undo is just "don't apply this
delta" — the source of truth is reconstructed from `tokens.css` + the deltas you
choose to keep, rather than from a destructively edited file.

---

## How future UI should consume these

The whole point of tokens is that downstream UI references them, so a later tweak
to `tokens.css` propagates everywhere for free.

- **Always** style against `var(--token)`:
  `color: var(--color-text); padding: var(--space-4); border-radius: var(--radius-md);`
- **Never** hardcode a literal that a token already names. A raw `#2f6df0`,
  `16px`, or `8px` in component CSS is a bug — it silently forks from the
  language and won't follow future edits.
- Lay spacing out **on the scale** (`--space-1`…`--space-8`), not on arbitrary
  pixel values.
- Use the **keyword tokens** (`--elevation-style`, `--border-style`) to pick the
  right model rather than inventing a one-off.

This rule is also a line in the `DESIGN_LANGUAGE.md` pre-ship checklist
(contract-format.md §6): *uses only palette tokens; spacing on the scale; no
hardcoded values.*

---

## Provenance

`design-tokens.json` follows the **W3C Design Tokens Community Group** format
(`$value` / `$type`, nested groups). That standard exists so the language can
later feed downstream tooling — Style Dictionary, Figma, Tokens Studio — without
a custom adapter. Reference:
<https://www.w3.org/community/design-tokens/> (format draft:
<https://tr.designtokens.org/format/>).
