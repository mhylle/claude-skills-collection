# `design-language` — Skill Design Spec

> **Status:** Brainstorm deliverable, ready to hand to `skill-creator` for building.
> **Date:** 2026-06-27
> **Author:** Brainstormed with Claude Code.
> **Not yet built.** This document captures the agreed design so construction can start from a settled spec.

---

## 1. Purpose

A skill that helps a user **design and manufacture their own reusable visual design language** — deliberately *away* from the default Anthropic/Claude aesthetic (warm beige, clay/terracotta accent, rounded cards, that serif/sans pairing) and toward something genuinely their own.

It is a **guided design-brief → living-styleguide compiler**: it elicits taste, researches inspiration, lets the user dial how adventurous each part of the system is, and emits a self-contained set of artifacts that *future Claude sessions read and build from*.

### What it is NOT
- Not the built-in `frontend-design` skill. That styles *a* UI in the moment. This **produces a durable, reusable language as files** that outlive the session and govern many future UIs.
- Not a one-shot generator. It is an interactive, resumable, multi-phase process with a human-in-the-loop feedback loop.

---

## 2. Locked decisions (brainstorm outcomes)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Elicitation spine | **Reaction-first** — research + real references + archetypes → user reacts → refine with targeted questions. (All three techniques used; reaction is the spine.) |
| 2 | Safeness gradient | **Per-dimension baseline + every option tagged 1–5.** Spectrum width **N chosen dynamically** per dimension (override allowed). |
| 3 | Session shape | **Progressive & resumable** phases. Phasing exists for resumability, **never** for scope-cutting. |
| 4 | Output contract | **Tokens + prose + rules** (CSS custom properties + `DESIGN_LANGUAGE.md` + explicit do/don't checklist). No auto-linter in v1 — it is the first extensibility hook. |
| 5 | Scope | **The entire system**, v1. No deferral of any dimension. |
| 6 | Inspiration sources | **Both** real Playwright screenshots **and** AI-generated mockups **and** linked references, with graceful fallback. |
| 7 | Output location | Self-contained **`./design-system/`** created in the directory where the skill is run. Portable by construction (relative paths only). |

---

## 3. The dimensions of the "entire system"

Every dimension flows through the same loop: **research → safeness-spectrum → react → token-tweak → commit → dashboard page updates.**

1. **Color** — palette, accents, semantic colors, dark/light.
2. **Typography** — families, scale, weights, leading, measure.
3. **Spacing & scale** — base unit, spacing scale, rhythm.
4. **Shape & borders** — radii, border styles, corner language.
5. **Elevation / depth** — shadows, layering, glass/flat/skeuomorphic.
6. **Motion** — easing, duration, what animates and how.
7. **Imagery treatment** — how images are framed/shown (the user's explicit case: standard grid → … → 3D image cloud).
8. **Components** — buttons, inputs, cards, nav, etc., derived from foundations.
9. **Patterns / layouts** — grids, page templates, composition.
10. **Voice & tone** — content principles, microcopy, do/don't. (In scope, v1.)
11. **Accessibility** — contrast, focus, motion-reduction, target sizes (cross-cutting, validated per dimension).

---

## 4. Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  SKILL ORCHESTRATOR (SKILL.md)                                │
│  drives phases, owns state, calls engine + research subagents │
└───────────────┬───────────────────────────┬──────────────────┘
                │                            │
   ┌────────────▼───────────┐    ┌───────────▼───────────────┐
   │  FEEDBACK ENGINE        │    │  RESEARCH SUBAGENT(S)      │
   │  serve_questionnaire.py │    │  WebSearch + Playwright    │
   │  (stdlib http.server)   │    │  + AI mockups, cached      │
   └────────────┬───────────┘    └───────────┬───────────────┘
                │                            │
        responses.json                  research cache
                │                            │
        ┌───────▼────────────────────────────▼──────┐
        │  STATE  .state/brief.json (resumable)       │
        └───────────────────┬─────────────────────────┘
                            │ regenerate-from-tokens
        ┌───────────────────▼─────────────────────────┐
        │  OUTPUT  ./design-system/ (dashboard + css + │
        │  json tokens + DESIGN_LANGUAGE.md contract)  │
        └─────────────────────────────────────────────┘
```

**Key invariant:** `css/tokens.css` is the **single hand-editable source of truth**. Every dashboard page is *regenerated from the tokens*, so the visual dashboard can never drift from the machine-readable tokens.

---

## 5. Skill file layout (what gets built into `skills/design-language/`)

```
skills/design-language/
  SKILL.md                       # orchestrator + phase instructions
  scripts/
    serve_questionnaire.py       # the reusable feedback server (stdlib only)
    render_spectrum.py           # builds N live-rendered variants for a dimension
    assemble_dashboard.py        # (re)generates design-system/ pages from tokens
    init_state.py                # scaffolds ./design-system/ + .state/brief.json
  assets/
    questionnaire.html.tmpl      # the page the server renders (data-driven)
    dashboard/                   # static base templates + base.css the output builds on
  references/
    anthropic-anti-reference.md  # what the default Claude look IS (so we avoid it)
    token-schema.md              # W3C design-tokens format we emit
    contract-format.md           # the structure of DESIGN_LANGUAGE.md
    question-types.md            # spec for each questionnaire question type
  agents/
    design-researcher.md         # subagent prompt for per-dimension web research
  evals/
    evals.json                   # trigger evals for skill-creator's optimizer
```

---

## 6. The feedback engine

Generalizes skill-creator's proven loop (Python stdlib `http.server`, zero deps, port configurable, default e.g. 3119 to avoid clashing with skill-creator's 3117).

### Endpoints
- `GET /` — renders `questionnaire.html.tmpl` against the **current** `questionnaire.json` *and* current tokens, so any live previews reflect the language as it stands. Regenerated on each request.
- `POST /api/responses` — validates JSON body, writes `responses.json` to the active phase's state dir.
- `GET /api/responses` — returns existing responses (resume an in-progress questionnaire).

### Headless fallback
If no server/display (Cowork, CI), the page **downloads `responses.json`** and the user points the skill at it. Same schema either way. Mirror skill-creator's `--static` flag.

### No polling
Skill reads `responses.json` when the user says "done." (Same convention as skill-creator.)

### `questionnaire.json` schema (input to the server)
```jsonc
{
  "phase": "foundations.color",
  "title": "Color — pick your direction",
  "intro": "Markdown shown above the questions.",
  "questions": [
    {
      "id": "color-spectrum",
      "type": "safeness-spectrum",   // see §7
      "prompt": "Which color approach feels like you?",
      "dimension": "color",
      "variants": [
        { "level": 1, "name": "Neutral + single accent", "previewHtml": "<...>", "tokens": { /* token deltas */ } },
        { "level": 3, "name": "Duotone with warm/cool split", "previewHtml": "<...>", "tokens": {} },
        { "level": 5, "name": "High-chroma gradient system", "previewHtml": "<...>", "tokens": {} }
      ]
    },
    { "id": "react-refs", "type": "rate-grid", "prompt": "Rate these for vibe", "items": [ { "img": "research/abc.png", "source": "url" } ] },
    { "id": "must-never", "type": "constraint", "prompt": "Colors / combos this must NEVER use" }
  ]
}
```

### `responses.json` schema (output from the browser)
```jsonc
{
  "phase": "foundations.color",
  "status": "complete",
  "answers": {
    "color-spectrum": { "chosenLevel": 3, "ratings": { "1": 2, "3": 5, "5": 4 } },
    "react-refs": { "ratings": { "abc.png": 5, "def.png": 1 } },
    "must-never": { "text": "no pure black on white; no terracotta" }
  },
  "timestamp": "ISO-8601"
}
```

### Question types (`references/question-types.md`)
| Type | Purpose | Response shape |
|------|---------|----------------|
| `this-or-that` | Fast A/B taste elicitation | `{ "picked": "A" }` |
| `rate-grid` | Rate a wall of researched references 1–5 | `{ "ratings": { itemId: n } }` |
| `adjective-pick` | Choose / rank mood words | `{ "picked": [], "ranked": [] }` |
| `safeness-spectrum` | **Signature.** Pick / rate N live-rendered real variants | `{ "chosenLevel": n, "ratings": {} }` |
| `token-tweak` | Fine-tune a chosen variant (color pickers, sliders) live | `{ "tokens": { name: value } }` |
| `constraint` | Free text — hard "must never" rules (the anti-reference) | `{ "text": "" }` |

---

## 7. The safeness-spectrum subsystem (signature feature)

This is the concrete realization of "1 = what people expect → 5 = a 3D cloud of images."

- **Per dimension, the skill defines an ordered set of named *approaches*** from conventional → experimental. Each approach is a real, renderable configuration of tokens/markup — **not a description.**
- **N is chosen dynamically:** the skill picks how many distinct, meaningfully-different levels that dimension supports (spacing may only warrant 3; imagery may warrant 5+). The user's per-dimension safeness *baseline* (set in Phase 0) pre-selects/centers the spectrum, and the user can widen/override.
- **`render_spectrum.py`** produces each variant as live HTML/CSS using the *current* committed tokens, so the user always reacts to *their* emerging language, not a stranger's site.
- The user picks (or rates) levels via the `safeness-spectrum` question; the chosen variant's token deltas are merged into `tokens.css`, then optionally fine-tuned with a `token-tweak` question.
- **Every committed decision stores its safeness level** in `brief.json`, so the final contract can say e.g. "color is intentionally adventurous (4/5); layout is intentionally conventional (2/5)."

**Example — imagery dimension levels:** 1 = standard fixed grid; 2 = masonry; 3 = overlap/collage; 4 = parallax/scroll-driven reveal; 5 = WebGL/3D image cloud. The skill renders a working sample of each.

---

## 8. The research subsystem

Delegated to a `design-researcher` subagent (keeps orchestrator context clean) per dimension.

**Tiers (layered, with graceful fallback):**
1. **WebSearch** → candidate inspiration URLs for the dimension + the user's adjectives/use-cases.
2. **Playwright** (`browser_navigate` + `browser_take_screenshot`) → real screenshots saved to `.state/research/<dimension>/`, embedded as thumbnails in `rate-grid` questions. *Personal-use inspiration.* If a site blocks capture → fall back to a linked (un-captured) reference card.
3. **AI-generated mockups** — the skill writes its own small rendered samples for the safeness spectrum (§7), so reaction material is never solely third-party.

**Caching:** all research keyed by `(dimension, adjectives-hash)` in state; resuming a phase never re-fetches.

**Subagent contract (`agents/design-researcher.md`):** input = dimension + adjectives + use-cases + anti-reference; output = a manifest of `{ source, localScreenshot|link, oneLineWhyRelevant, observedTechniques[] }`, no edits to repo, read-only beyond its research dir.

---

## 9. State model (resumability)

`./design-system/.state/brief.json`:
```jsonc
{
  "meta": { "name": "", "createdAt": "", "lastPhase": "foundations.color", "completedDimensions": [] },
  "northStar": {
    "adjectives": [], "useCases": [],
    "references": [ { "source": "", "screenshot": "", "whatILike": "" } ],
    "antiReferences": [ { "what": "default Claude look", "why": "" } ],
    "hardConstraints": []
  },
  "safeness": { "default": 3, "perDimension": { "color": 4, "layout": 2 } },
  "decisions": {
    "color": { "chosenLevel": 3, "tokens": {}, "safeness": 4, "rationale": "" }
    // one entry per committed dimension
  }
}
```
On invocation the skill reads `brief.json`; if present it offers **resume** (next incomplete dimension) or **revisit** (re-open a committed dimension). `completedDimensions` drives the progress shown in the dashboard.

---

## 10. Phase flow

Each phase: **research → safeness-spectrum + targeted questions (served) → user reacts → tweak → commit tokens → `assemble_dashboard.py` regenerates the relevant page.**

| Phase | Produces | Dashboard page |
|-------|----------|----------------|
| **0 · Discovery / North Star** | adjectives, use-cases, north-star + anti-references, hard constraints, **per-dimension safeness baselines** | `moodboard.html` |
| **1 · Foundations** | color, typography, spacing, shape, elevation tokens | `tokens.html` |
| **2 · Motion & Imagery** | motion principles + live demos; imagery treatment | `motion.html`, `imagery.html` |
| **3 · Components** | buttons, inputs, cards, nav… from foundations | `components.html` |
| **4 · Patterns / Layouts** | grids, page templates, composition | `patterns.html` |
| **5 · Voice & Tone** | content principles, microcopy, do/don't | `voice.html` |
| **6 · Assemble & Contract** | parent dashboard, machine tokens, `DESIGN_LANGUAGE.md`, compare page | `index.html`, `compare.html` |

---

## 11. Output artifacts (`./design-system/`)

```
design-system/
  index.html                 # parent dashboard: identity overview + nav + progress
  pages/
    moodboard.html  tokens.html  components.html  patterns.html
    motion.html     imagery.html voice.html       compare.html
  css/
    tokens.css               # ← SINGLE SOURCE OF TRUTH (custom properties, hand-tunable)
    base.css                 # reset + structural base
    components.css           # component styles built on tokens
  js/
    demos.js                 # motion/imagery interactive demos
  tokens/
    design-tokens.json       # W3C Design Tokens format — for future tooling
  DESIGN_LANGUAGE.md         # the contract future Claude reads
  .state/
    brief.json               # resumable session state
    research/                # cached screenshots + manifests
```

- **`tokens.css`** = the only file a human hand-edits. Pages are disposable/regenerated.
- **`design-tokens.json`** in [W3C Design Tokens](https://www.w3.org/community/design-tokens/) format so the language can later feed Style Dictionary, Figma, etc.

---

## 12. The contract — `DESIGN_LANGUAGE.md` (`references/contract-format.md`)

The artifact that makes future Claude build in *this* language. Structure:

1. **Identity** — north-star adjectives; one-paragraph "what this language is."
2. **Anti-reference** — "This language must NEVER look like: [the default Claude/Anthropic aesthetic + the user's hard constraints]." Explicit, because escaping the default is the whole point.
3. **Token map** — pointer to `css/tokens.css` + `tokens/design-tokens.json` as the source of truth, with the headline tokens inlined.
4. **Per-dimension rules** — for each dimension: the chosen approach, its **intended safeness level** (so future work matches the intended adventurousness), and do/don't bullets.
5. **Component & pattern rules.**
6. **Pre-ship checklist** — concrete gate a future session runs before delivering UI ("uses only palette tokens; spacing on the scale; no banned patterns; matches intended safeness per dimension; not the default look").

---

## 13. The anti-Anthropic mechanism (explicit)

- `references/anthropic-anti-reference.md` documents the default look so the skill can *actively steer away* and detect regression.
- Phase 0 records a user-specific anti-reference alongside it.
- Phase 6 emits **`compare.html`** — "default-Claude vs. yours" side-by-side — and writes the "never regress" rule into the contract checklist.

---

## 14. Draft `SKILL.md` frontmatter

```yaml
---
name: design-language
description: >-
  Design and manufacture a reusable, personal visual design language — deliberately
  away from the default Anthropic/Claude look — and emit it as self-contained artifacts
  (interactive dashboard + tokens.css + design-tokens.json + DESIGN_LANGUAGE.md contract)
  that future sessions build from. Reaction-first elicitation with web research, a
  per-dimension 1–5 "safeness" gradient (conventional→experimental), and a resumable
  multi-phase flow covering color, type, spacing, shape, elevation, motion, imagery,
  components, patterns, layout, and voice & tone. Triggers on "design my own design
  language", "create my design system", "build my visual language", "I want my own
  look, not the Claude default". Different from frontend-design (which styles one UI in
  the moment) — this produces a durable, reusable language as files.
---
```

---

## 15. Genuine build-time decisions (small, deferred to construction)

- **Server port** (avoid 3117; propose 3119) and whether to auto-pick a free port.
- **Exact archetype seed list** for Phase 0 (the starting "directions" shown for reaction).
- **`render_spectrum.py` rendering strategy** for level-5 experimental variants (e.g. when WebGL is involved) — likely a sandboxed iframe sample.
- **How `token-tweak` writes back** — direct edit of `tokens.css` vs. a token-delta layer merged on commit (recommend delta-on-commit for clean undo).

## 16. Extensibility hooks (post-v1, per user's plan)
- **Apply-mode** — "apply my language to *this* project" (copy `tokens.css` + `DESIGN_LANGUAGE.md` in).
- **Auto-linter** — script that flags UI violating the language (off-palette, off-scale, banned patterns). This is decision #4's deferred third option.
- **Multiple named languages** — keep/evolve more than one (e.g. "editorial" vs "dashboard").
```
