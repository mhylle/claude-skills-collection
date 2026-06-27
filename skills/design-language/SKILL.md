---
name: design-language
description: >-
  Design and manufacture someone's OWN reusable visual design language and save it as
  durable files — design tokens (css/tokens.css + a W3C design-tokens.json), a
  DESIGN_LANGUAGE.md contract, and a living multi-page styleguide — that future sessions
  and other projects read to build UI in one consistent, ownable style. Use this whenever
  the goal is to create, define, set up, or establish a design language, design system,
  house style, visual identity, or brand look captured once as files and reused across many
  UIs or projects; to make apps stop looking templated, generic, or like every other
  Claude/Anthropic app (the default warm-beige + terracotta + pillowy-card look); or to get
  tokens plus a contract that tells Claude how to build in that style every time. It is
  reaction-first — it researches real references, renders live options the user reacts to,
  and dials each dimension (color, typography, spacing, shape, elevation, motion, imagery,
  components, patterns, voice) from conventional to experimental. This produces durable,
  cross-project infrastructure — NOT styling, prettifying, unifying, or picking a font for a
  single screen, component, or one-off piece of copy in the moment, which is the
  frontend-design skill.
---

# design-language — a design-brief → living-styleguide compiler

You help the user **design and manufacture their own reusable visual design language** and
emit it as a self-contained `./design-system/` folder that future Claude sessions read and
build from. You are not styling one screen — you are compiling a durable *language*.

The whole point is to land somewhere that is **genuinely the user's own**, deliberately
*away* from the default Anthropic/Claude aesthetic. Read
[references/anthropic-anti-reference.md](references/anthropic-anti-reference.md) so you know
exactly what you are steering away from and can detect regression toward it.

> **`SKILL_DIR`** below means the directory containing this SKILL.md. The scripts import a
> shared `tokens_lib` sibling, so always invoke them by their real path
> (`python3 "$SKILL_DIR/scripts/<name>.py" …`) — Python puts the script's own dir on the
> path, so the import resolves no matter what the user's working directory is. The
> `./design-system/` output is created in the user's **current working directory**.

## The non-negotiables (read once, hold throughout)

1. **`./design-system/css/tokens.css` is the single source of truth.** Every dashboard page
   and the W3C JSON are *regenerated from it*. Never hand-author a page; change tokens, then
   regenerate. (Invariant from the spec — it is why the visual styleguide can never drift
   from the machine-readable tokens.)
2. **Reaction-first.** Don't interrogate the user with abstract taste questions up front.
   Show them things — researched real references, and live archetypes rendered *in their own
   emerging tokens* — let them react, then refine with targeted questions. People know what
   they like when they see it far better than they can specify it cold.
3. **Real divergent thinking, every session.** The experimental end of each dimension's
   spectrum must be reasoned freshly from *this* user's north star. The spinning 3D image
   cloud in the imagery seed is **one illustration** of thinking outside the box — it must
   NOT become the answer every time. If every language you help build ends with the same
   experimental gimmick, you have failed the core promise. See "Authoring the spectrum".
4. **Phasing is for resumability, never scope-cutting.** The v1 scope is the *entire* system.
   Never quietly drop a dimension to finish faster.
5. **Portable output.** Everything under `./design-system/` uses relative paths only, no
   CDNs, works offline — so the folder can be moved, zipped, and committed to any repo.

## On every invocation: resume or start fresh

Check for an existing system FIRST:

```bash
python3 "$SKILL_DIR/scripts/init_state.py" status --dir ./design-system
```

- `{"fresh": true}` → new build. Confirm a working name with the user, then scaffold:
  ```bash
  python3 "$SKILL_DIR/scripts/init_state.py" scaffold --dir ./design-system --name "<name>"
  ```
  This creates the folder tree, seeds `css/tokens.css` with a deliberately neutral non-Claude
  starter palette, and writes `.state/brief.json`.
- `{"fresh": false, ...}` → offer **resume** (continue at `nextPhase`) or **revisit**
  (re-open an already-committed dimension to change it). Show `completedDimensions` so the
  user sees where things stand. Run `scaffold` again too (it is idempotent and won't clobber
  an existing `tokens.css` or brief).

## The loop — every dimension flows through the same five steps

For each dimension (color, typography, spacing, shape, elevation, motion, imagery,
components, patterns, voice): **research → present spectrum + targeted questions → user
reacts → tweak → commit → regenerate.**

### 1 · Research (delegate, keep your context clean)

Spawn the `design-researcher` subagent ([agents/design-researcher.md](agents/design-researcher.md))
for the dimension. Give it the dimension + the user's north-star adjectives, use-cases, and
the anti-reference (from `brief.json`). It returns a cached manifest of real references with
local screenshots under `./design-system/.state/research/<dimension>/manifest.json`. If a
phase was already researched (same adjectives), it returns the cache without re-fetching.
Graceful fallback is built in — thin results are fine because you also render your own live
archetypes next.

### 2 · Author and present the spectrum (the signature step)

The safeness spectrum is N live variants from conventional (1) → experimental (5), each
rendered **in the user's current tokens** so they react to *their* emerging language.

**Authoring the spectrum — where your judgment matters most.** Prefer writing your own
per-session variants and rendering them with `--spec`, rather than leaning on the built-in
seed ladders:

```bash
# You author variants.json for THIS user: each variant has a level, a name, a token-delta,
# and a small sampleHtml written with var(--token) references. render_spectrum bakes the
# effective (current+delta) token values onto each sample so it renders live & standalone.
python3 "$SKILL_DIR/scripts/render_spectrum.py" --spec ./variants.json \
    --tokens ./design-system/css/tokens.css \
    --out ./design-system/.state/phases/<phase>/spectrum.json
```

When you invent the experimental rungs, reason from the user's adjectives, use-cases, and the
researched references — not from a stock list. For an "editorial, archival, print-rooted"
brief the imagery experiment might be a hand-torn paper collage or a contact-sheet wall; for
a "kinetic, nightlife, neon" brief it might be a marquee ticker or a strobing mosaic. The 3D
cloud is fine *if it genuinely fits this user* — but it is never the default. Choose N per
dimension: some warrant only 3 honestly-different steps; imagery may warrant 5+.

**Make each rung unmistakably different — the single most important authoring rule.** A
spectrum the user can't *see* the difference in is useless and wastes a whole cycle. So:
isolate **one** property per spectrum (a color spectrum varies color, not also corners and
shadows); **exaggerate** the steps so adjacent rungs are obviously distinct at a glance (three
near-identical blues or 6→3→1px corners read as identical — push them wide); and keep the
*same* sample content across rungs so the user compares the treatment. `render_spectrum`
auto-captions every rung with its exact token change (e.g. `radius-md 8px → 0`), but a caption
never excuses an invisible difference. Full guidance:
[references/question-types.md](references/question-types.md).

The built-in seed ladders (`--dimension <name>` instead of `--spec`) exist as an offline
fallback and a starting point to adapt — they are generic by design. Use them to bootstrap,
then diverge.

Pre-select around the user's per-dimension safeness baseline (Phase 0) but always let them
widen or override.

**Assemble the questionnaire** for the phase — combine the spectrum question with a
`rate-grid` built from the research manifest (so they also react to real references) and a
`constraint` "must never" box. Every 1–5 control is auto-labelled with its endpoints, and
`safeness-spectrum`/`this-or-that` carry an inline optional **note** — so the user can say
"this one, but with orange" without you pre-empting it; read those notes back from
`responses.json` alongside the picks, as they often carry the best decisions. See
[references/question-types.md](references/question-types.md) for every question type and its
exact JSON. Write it to the phase dir as `questionnaire.json`.

### 3 · Serve it and let the user react

```bash
python3 "$SKILL_DIR/scripts/serve_questionnaire.py" \
    --questionnaire ./design-system/.state/phases/<phase>/questionnaire.json \
    --responses    ./design-system/.state/phases/<phase>/responses.json \
    --tokens       ./design-system/css/tokens.css \
    --research-dir ./design-system/.state/research \
    --port 3119
```

Give the user the printed `QUESTIONNAIRE_URL`. The page renders every question, shows live
previews in their current tokens, and auto-saves. **Do not poll** — wait until the user says
they're done, then read `responses.json`. (Headless/Cowork/CI: add `--static
./design-system/.state/phases/<phase>/questionnaire.html`; the page downloads `responses.json`
on submit and the user points you at it. Same schema either way.)

**Stop the server cleanly between phases — never `pkill -f`** (its pattern can match the
user's own shell). The server prints `QUESTIONNAIRE_PID <n>` and records a pidfile beside
`responses.json`; stop it with the same `--responses` path before serving the next phase:

```bash
python3 "$SKILL_DIR/scripts/serve_questionnaire.py" --stop \
    --responses ./design-system/.state/phases/<phase>/responses.json
```

(Or `kill <the printed PID>`. Reusing the default port `3119` is fine once the previous server
is stopped; if it is still up, the server just auto-picks a free port rather than failing.)

### 4 · Tweak (optional fine-tune)

If the user chose a level but wants to nudge it, serve a short `token-tweak` follow-up
(live color pickers / sliders seeded from current tokens). Its answer is a token delta.

### 5 · Commit and regenerate

Combine the chosen variant's token delta (and any tweak delta) into one `delta.json`, then
commit the dimension — this folds the delta onto `tokens.css` (the source of truth),
re-derives the W3C JSON, and records the decision **with its intended safeness level** so the
contract and future work match the intended adventurousness:

```bash
python3 "$SKILL_DIR/scripts/init_state.py" commit --dir ./design-system \
    --dimension color --level 3 --safeness 4 \
    --rationale "duotone violet/teal — deliberately far from terracotta" \
    --delta ./design-system/.state/phases/foundations/color.delta.json \
    --phase foundations

python3 "$SKILL_DIR/scripts/assemble_dashboard.py" --dir ./design-system
```

`assemble_dashboard.py` regenerates `index.html` and every page **from the new tokens**, so
the styleguide always reflects reality. Show the user the updated page and move on.

> To record Phase 0 / north-star data (adjectives, use-cases, references, anti-references,
> hard constraints, per-dimension safeness baselines) into `brief.json`, write a small JSON
> patch and merge it: `init_state.py set-brief --dir ./design-system --json patch.json`.
> Don't hand-edit `brief.json` — let the helper keep it valid.

## The phases (resumable; the whole system, in order)

| Phase | Dimensions / output | Dashboard page |
|-------|---------------------|----------------|
| **0 · Discovery / North Star** | adjectives, use-cases, north-star references **and** the user's own anti-references, hard constraints, **per-dimension safeness baselines** | `moodboard.html` |
| **1 · Foundations** | color, typography, spacing, shape, elevation | `tokens.html` |
| **2 · Motion & Imagery** | motion principles + live demos; imagery treatment | `motion.html`, `imagery.html` |
| **3 · Components** | buttons, inputs, cards, nav … derived from foundations | `components.html` |
| **4 · Patterns / Layouts** | grids, page templates, composition | `patterns.html` |
| **5 · Voice & Tone** | content principles, microcopy, do/don't | `voice.html` |
| **6 · Assemble & Contract** | parent dashboard, machine tokens, contract, compare page | `index.html`, `compare.html` |

**Phase 0 is reaction-first too.** Seed it with 3–5 contrasting *archetype directions* (you
render small samples) plus researched references, and have the user react (`this-or-that`,
`rate-grid`, `adjective-pick`) rather than asking them to describe their taste in a vacuum.
Capture their hard "must never" constraints here — these become part of the anti-reference.
Record per-dimension safeness baselines so each later spectrum centers sensibly.

**Phase 6** finalizes the contract and the comparison. `assemble_dashboard.py` generates
`DESIGN_LANGUAGE.md` (structure in [references/contract-format.md](references/contract-format.md))
and `compare.html` — a side-by-side of the **default Claude/Anthropic look vs. theirs** — so
"did we actually escape the default?" is visible. Walk the user through the pre-ship checklist
in the contract before declaring done.

## What "done" looks like

A self-contained `./design-system/` the user can drop into any project:

- `index.html` + `pages/*.html` — the living, navigable styleguide (regenerated from tokens).
- `css/tokens.css` — the single hand-editable source of truth.
- `tokens/design-tokens.json` — W3C format for downstream tooling.
- `DESIGN_LANGUAGE.md` — the contract a future session reads before building any UI: identity,
  the explicit anti-reference, the token map, per-dimension rules with intended safeness, and
  the pre-ship checklist (token-schema details in
  [references/token-schema.md](references/token-schema.md)).

Tell the user how to use it later: "In a future session, point Claude at
`./design-system/DESIGN_LANGUAGE.md` and `css/tokens.css` and ask it to build UI in this
language — it will read the contract and stay on-language."

## Tooling reference (all stdlib, all under `$SKILL_DIR/scripts/`)

| Script | Role |
|--------|------|
| `init_state.py` | scaffold / status / `set-brief` / `commit` — owns `brief.json` & the folder |
| `tokens_lib.py` | the shared tokens model (parse/write `tokens.css`, deltas, W3C export) |
| `render_spectrum.py` | render N live variants for a dimension — prefer `--spec` (your variants) |
| `serve_questionnaire.py` | the reusable stdlib feedback server (+ `--static` headless mode) |
| `assemble_dashboard.py` | regenerate every page + the contract FROM `tokens.css` |

Detailed references live in [references/](references/): `question-types.md`,
`token-schema.md`, `contract-format.md`, `anthropic-anti-reference.md`.

## Boundaries

- This is **not** `frontend-design`. If the user just wants one button/page/screen styled in
  the moment, that's frontend-design — this skill is for building a durable, reusable
  *language as files*. If they ask for a one-off style, say so and offer the right tool.
- Don't fabricate taste on the user's behalf. Your job is to give them rich, live material to
  react to and to faithfully compile their reactions into tokens — not to impose a look.
