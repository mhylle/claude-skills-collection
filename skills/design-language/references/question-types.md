# Questionnaire question types

This is the authoring spec for the `design-language` feedback engine. A
*questionnaire* is a `questionnaire.json` file the orchestrator writes and
`scripts/serve_questionnaire.py` serves; the user's reactions come back as a
`responses.json` keyed by question `id`. This document describes each of the six
question `type`s: its purpose, the **questionnaire.json** shape that declares it,
and the exact **responses.json** answer shape it produces.

Where this file and `docs/design-language-skill-spec.md` disagree, the
`scratchpad/BUILD_CONTRACT.md` schemas win (they reflect build-time decisions).

## Contents
- [The envelope](#the-envelope)
- [`this-or-that`](#this-or-that)
- [`rate-grid`](#rate-grid)
- [`adjective-pick`](#adjective-pick)
- [`safeness-spectrum`](#safeness-spectrum-signature)
- [`token-tweak`](#token-tweak)
- [`constraint`](#constraint)
- [Conventions shared by all types](#conventions-shared-by-all-types)

---

## The envelope

Every questionnaire is one object:

```jsonc
{
  "phase": "foundations.color",          // namespaces localStorage + tags responses
  "title": "Color — pick your direction",
  "intro": "Light **markdown** shown above the questions.\n\nParagraphs and line\nbreaks, `code`, and **bold** are supported.",
  "tokensHref": "../../css/tokens.css",  // optional, informational; the server inlines current tokens itself
  "questions": [ /* one object per question, see below */ ]
}
```

The server renders `intro` as light markdown (paragraphs split on blank lines;
single newlines become `<br>`; `**bold**` and `` `code` `` inline marks). Every
question object has at least `{ "id", "type", "prompt" }` and may add an optional
`"help"` string (shown as a sub-line under the prompt).

The matching response envelope:

```jsonc
{
  "phase": "foundations.color",
  "status": "complete",                  // or "in-progress"
  "answers": { "<question id>": { /* type-specific shape */ } },
  "timestamp": "2026-06-27T12:00:00.000Z"
}
```

---

## `this-or-that`

**Purpose.** Fast A/B taste elicitation — force a single binary choice between
two rendered directions.

**Declaration.** Provide either an `options` array (preferred — each option
carries an optional `previewHtml`) or the shorthand `a`/`b` objects.

```jsonc
{
  "id": "serif-or-sans",
  "type": "this-or-that",
  "prompt": "Which headline voice feels right?",
  "options": [
    { "key": "A", "name": "Grotesk sans", "previewHtml": "<h1 style='font-family:Inter,sans-serif'>Build it bold</h1>" },
    { "key": "B", "name": "Transitional serif", "previewHtml": "<h1 style='font-family:Georgia,serif'>Build it bold</h1>" }
  ]
}
```

**Response shape.** `{ "picked": "A", "note": "" }` — the `key` of the chosen
option, plus an optional free-text `note`. The page always shows a small
"Note (optional)" box so the user can qualify a pick ("B, but tighter") without
needing a separate question — taste work is full of "this one, but…". `note` is
omitted-as-empty-string when untouched.

```jsonc
"serif-or-sans": { "picked": "B", "note": "yes, but a touch less contrast" }
```

---

## `rate-grid`

**Purpose.** Rate a wall of researched references (real screenshots from the
research subagent, or any image) 1–5, so the skill learns what the user is drawn
to.

**Declaration.** An `items` array. Each item should carry an `id` (else its
`img` path / index is used), an optional `img` thumbnail, an optional `name`, and
an optional `source` link. `img` may be a `/research/<dimension>/<file>` path the
server serves, or any reachable URL.

The page renders a **legend stating what 1 and 5 mean** above the grid (default
`1 = not me … 5 = yes, this is me`) so the scale can never be read backwards.
Override the endpoints with `scaleLabels: { "low": "...", "high": "..." }` when a
question's scale means something else.

```jsonc
{
  "id": "react-refs",
  "type": "rate-grid",
  "prompt": "Rate each for vibe",
  "scaleLabels": { "low": "not me", "high": "yes, this is me" },
  "items": [
    { "id": "stripe",  "name": "Stripe docs", "img": "research/color/stripe.png",  "source": "https://stripe.com" },
    { "id": "linear",  "name": "Linear",      "img": "research/color/linear.png",  "source": "https://linear.app" }
  ]
}
```

**Response shape.** `{ "ratings": { "<itemId>": n } }` with `n` in 1–5. Only
rated items appear.

```jsonc
"react-refs": { "ratings": { "stripe": 5, "linear": 2 } }
```

---

## `adjective-pick`

**Purpose.** Choose and optionally rank mood words that describe the target
language ("calm", "technical", "playful"…). Ranking falls out of click order.

**Declaration.** An `options` array of strings (or `{ "word": "..." }`).

```jsonc
{
  "id": "mood",
  "type": "adjective-pick",
  "prompt": "Pick the words that fit — earliest picks rank highest",
  "options": ["calm", "technical", "playful", "editorial", "bold", "minimal", "warm", "precise"]
}
```

**Response shape.** `{ "picked": [], "ranked": [] }`. `picked` is the unordered
selection; `ranked` is the same words in the order they were chosen (rank 1 =
first chosen).

```jsonc
"mood": { "picked": ["technical", "minimal", "precise"], "ranked": ["minimal", "technical", "precise"] }
```

---

## `safeness-spectrum` (signature)

**Purpose.** The signature type. For one dimension, present an ordered set of
**live-rendered** variants from conventional (level 1) to experimental (level 5).
Each variant is a real, renderable configuration — *not* a description. The user
picks one `chosenLevel` and may rate each level 1–5. The chosen variant's
`tokens` delta is what the skill later merges into `tokens.css`.

**Declaration.** A `variants` array. Each variant needs a `level` (1–5), a
`name`, a `previewHtml` snippet (rendered live, inheriting the current tokens),
and optionally a `tokens` delta (merged on commit). Set `"sandbox": true` on a
variant whose `previewHtml` is risky/experimental (level-5 WebGL, animation,
arbitrary script) — it is rendered inside a sandboxed `<iframe srcdoc>` so it
cannot break the questionnaire.

You normally produce this whole object with `scripts/render_spectrum.py`, which
also attaches a **`caption`** to each variant — the exact token change for that
rung (e.g. `radius-md 8px → 0`) — shown under the variant name so adjacent rungs
are always tellable apart even when the visual difference is subtle. You can
override it with your own `caption` per variant.

> **Make the difference unmissable (this is the #1 readability lesson from real
> use).** A spectrum is worthless if the user can't *see* the difference between
> rungs. When you author variants:
> - **Isolate one property per spectrum.** A color spectrum varies color; a shape
>   spectrum varies corners. Don't change five things at once — the user can't
>   tell what they're reacting to.
> - **Exaggerate.** Adjacent rungs must be *obviously* distinct at a glance.
>   Three near-identical blues or 6→3→1px corners read as identical. Push the
>   steps wide enough that the change is undeniable.
> - **Same content, different treatment.** Every rung shows the *same* sample so
>   the user compares the treatment, not the content.
> - Rely on the auto-`caption` to name the change, but never let it substitute for
>   a visible one.

The page shows two labels so neither scale is ambiguous: the **axis rail**
(`1 — conventional … 5 — experimental`) explains what the levels mean, and a
**rating legend** (default `1 = not me … 5 = love it`, override via
`scaleLabels`) explains the per-rung 1–5 rating.

```jsonc
{
  "id": "imagery-spectrum",
  "type": "safeness-spectrum",
  "prompt": "How adventurous should image layout be?",
  "dimension": "imagery",
  "variants": [
    { "level": 1, "name": "Fixed grid",     "previewHtml": "<div class='grid'>…</div>",         "tokens": { "--radius-md": "4px" } },
    { "level": 3, "name": "Overlap collage", "previewHtml": "<div class='collage'>…</div>",       "tokens": {} },
    { "level": 5, "name": "WebGL image cloud", "previewHtml": "<canvas id='cloud'></canvas><script>…</script>", "tokens": {}, "sandbox": true }
  ]
}
```

**Response shape.** `{ "chosenLevel": n, "ratings": { "<level>": n }, "note": "" }`.
`chosenLevel` is the single picked level; `ratings` maps each rated *level* (as a
string key) to 1–5; `note` is the optional free-text qualifier (the box is always
shown — "level 2, but push the accent toward orange" is exactly the kind of
decision it captures).

```jsonc
"imagery-spectrum": { "chosenLevel": 3, "ratings": { "1": 2, "3": 5, "5": 4 }, "note": "3, but warmer" }
```

> The variant's `level` is the response key, not its array index — so a
> spectrum that only ships levels 1, 3, 5 produces `ratings` keyed `"1","3","5"`.

---

## `token-tweak`

**Purpose.** Fine-tune a chosen direction live. Seeded from current tokens, the
page renders a control per token (color picker for colors, number input + unit
for dimensions/durations, text input otherwise) and updates a live preview as
the user drags.

**Declaration.** A `tokens` object mapping token name → seed value (keys may omit
the leading `--`; values follow tokens_lib conventions). An optional
`previewHtml` provides the sample the tweaks restyle (the controls set the
matching CSS custom properties on it).

```jsonc
{
  "id": "color-tune",
  "type": "token-tweak",
  "prompt": "Nudge the accent and corner radius",
  "tokens": { "--color-accent": "#2f6df0", "--color-accent-hover": "#1f57d6", "--radius-md": "8px" },
  "previewHtml": "<button style='background:var(--color-accent);border-radius:var(--radius-md);color:#fff;padding:10px 18px;border:0'>Primary</button>"
}
```

**Response shape.** `{ "tokens": { "<name>": "<value>" } }` — a flat delta ready
for `tokens_lib.apply_delta`. The seed values are recorded even if untouched, so
a no-edit submit still carries the chosen baseline.

```jsonc
"color-tune": { "tokens": { "--color-accent": "#7c3aed", "--radius-md": "12px" } }
```

---

## `constraint`

**Purpose.** Free-text hard rules — the "must NEVER" anti-reference. These become
explicit do-not lines in `DESIGN_LANGUAGE.md`.

**Declaration.** Just a prompt; optional `placeholder`.

```jsonc
{
  "id": "must-never",
  "type": "constraint",
  "prompt": "Colors / combos this language must NEVER use",
  "placeholder": "e.g. no terracotta; no pure black on white; no all-caps headings"
}
```

**Response shape.** `{ "text": "" }`.

```jsonc
"must-never": { "text": "no terracotta accent; never pure #000 on #fff" }
```

---

## Conventions shared by all types

- **IDs are the contract.** `answers` is keyed by question `id`; keep ids stable
  across a phase so resume (`GET /api/responses`) repopulates the right answers.
- **Auto-save.** The page writes answers to `localStorage` (namespaced by
  `phase`) as the user goes, and on load it merges any server-side
  `responses.json`, so an interrupted session resumes where it left off.
- **Live previews track the language.** The server inlines the *current*
  `tokens.css` on every request, so `previewHtml` in `this-or-that`,
  `safeness-spectrum`, and `token-tweak` always reflects the language as it
  stands — the user reacts to *their* emerging system.
- **Previews are author-trusted HTML** rendered as-is; only `safeness-spectrum`
  variants marked `"sandbox": true` are isolated in an iframe. Author previews
  accordingly.
- **Images** referenced by `img` resolve under the server's `--research-dir`
  (with `../` traversal blocked); a broken image degrades to an "image
  unavailable" placeholder rather than a blank cell.
- **Submission.** A single "Submit all" assembles the response envelope and
  `POST`s it to `/api/responses` (server mode) or downloads `responses.json`
  (static/headless mode). After a successful submit the page tells the user they
  can return to the skill and say "done".
- **Rating scales are always labelled.** Any 1–5 control (`rate-grid`,
  `safeness-spectrum`) shows an endpoint legend so the scale cannot be read
  backwards; override the wording with `scaleLabels: {low, high}`.
- **Pickers carry an optional note.** `this-or-that` and `safeness-spectrum`
  always offer a free-text note that rides along in the same answer object, so a
  qualified choice ("this, but with orange") is captured in one place. (If you
  prefer, you can still interleave a standalone `constraint` box — both work.)
- **Unknown types** render a visible "Unknown question type" notice rather than
  failing silently, so an authoring typo is obvious.
