# The default Anthropic / Claude aesthetic — the anti-reference

This file documents the **default look** that the `design-language` skill exists
to escape (spec §1, §13). It is the *baseline* — the warm, literary,
handcrafted-notebook aesthetic that Claude and Anthropic surfaces gravitate
toward, and that an LLM left to its own taste will quietly reproduce. The skill
keeps this description on hand for two jobs:

1. **Steer away from it.** Phase 0 reads this so the very first directions it
   offers the user are *not* warm-beige-and-clay by default.
2. **Detect regression toward it.** Phase 6 builds `compare.html`
   (default-Claude vs. yours, side by side) from this description, and writes the
   **never-regress rule** into the `DESIGN_LANGUAGE.md` pre-ship checklist.

This is a description of a *specific* aesthetic, not a value judgement. The
default look is genuinely pleasant; that is exactly why it is the gravity well
the skill has to fight. Everything here is "the thing to move away from" — being
**off** this list is the goal.

> Hex values are **approximate** — eyeballed from the published Anthropic/Claude
> surfaces, not pulled from an official token file. They are precise enough to
> *recognize* and *avoid* the family, not to reproduce it exactly.

## Contents
- [Where the user-specific anti-reference lives](#where-the-user-specific-anti-reference-lives)
- [Color](#color)
- [Typography](#typography)
- [Shape & borders](#shape--borders)
- [Elevation & shadow](#elevation--shadow)
- [Spacing & rhythm](#spacing--rhythm)
- [Overall tone](#overall-tone)
- ["You are drifting back toward the default if…" checklist](#you-are-drifting-back-toward-the-default-if-checklist)

---

## Where the user-specific anti-reference lives

This file is the **shared, generic** anti-reference. It is *not* the whole story.
Phase 0 records a **user-specific** anti-reference into `brief.json`
(`northStar.antiReferences` + `northStar.hardConstraints`) — the particular
things *this* user never wants (a competitor's look, a color they hate, a past
project they're escaping). The contract's Anti-reference section (spec §12.2) is
the **union of the two**: the default Claude look described here, *plus* the
user's hard constraints. Both are non-negotiable because escaping the default is
the entire point of the skill — if the output drifts back here, the skill failed.

---

## Color

The signature is **warm and low-contrast**, built on paper-like neutrals with a
single earthy accent.

| Role | Approx. hex | Description |
|------|-------------|-------------|
| Page background | `#F5F1EB`, `#EFE9DD`, `#FAF7F0` | Warm beige / cream / "paper". Never a cool white. |
| Surface / card | `#FBF8F2`, `#FFFFFF` warmed | Slightly lighter than the page, still warm-tinted. |
| Primary accent | `#CC785C` (~"book cloth"), `#BD5D3A`, `#D4A27F` | **Clay / terracotta / rust.** The single most recognizable tell. |
| Text | `#2B2A27`, `#3D3929`, `#1F1E1C` | Warm near-black / dark espresso, never pure `#000`. |
| Muted text | `#6B6557`, `#807A6B` | Warm taupe-gray. |
| Secondary tints | soft sage `#B5BCA9`, dusty blue `#9FB0C3`, muted ochre | Desaturated, "natural-dye" secondary hues. |

Defining traits:
- **Warm undertone everywhere** — backgrounds, surfaces, even the grays carry a
  yellow/orange cast. Nothing is truly neutral or cool.
- **One earthy accent** doing all the work (the clay/terracotta), occasionally
  supported by desaturated naturals (sage, clay-pink, slate-blue).
- **Low contrast on purpose** — text-on-background sits in a calm, gentle range
  rather than crisp black-on-white. Reads as soft and "easy on the eyes."
- **No high-chroma, no neon, no electric blue, no pure black, no pure white.**

## Typography

A deliberately **editorial, literary** pairing — the "Claude writes like a
thoughtful book" feel.

- **Display / headings:** a humanist or transitional **serif** with warmth and a
  hand-set, editorial character — the Tiempos / Styrene-display / "Copernicus"
  family of feel. Conveys craft, calm, authorship.
- **Body / UI:** a quiet **humanist sans** (the Styrene / Inter-but-softer
  register) — neutral, friendly, unobtrusive, never grotesk-industrial.
- **The serif-display + humanist-sans pairing is itself a tell** — the contrast
  between a literary serif headline and a calm sans body is core to the look.
- Generous line-height, comfortable measure, restrained weights. Reads like
  prose, not like a dashboard.

## Shape & borders

- **Large, soft, "pillowy" border-radius** on cards, buttons, inputs, and
  containers — roughly `12px`–`24px`, sometimes more. Corners feel rounded and
  gentle, never sharp.
- **Borders are faint or absent** — separation comes from warm fills and soft
  shadow, not crisp `1px` lines.
- Overall corner language: **rounded, friendly, cushioned.** Nothing angular,
  technical, or hard-edged.

## Elevation & shadow

- **Soft, warm, diffuse shadows** — low-opacity, large-blur, often with a warm
  (brownish) tint rather than neutral gray. They make cards feel like they're
  resting on paper.
- **No hard shadows, no crisp drop-shadows, no glassmorphism, no neon glow, no
  heavy skeuomorphic depth.** The depth is gentle and atmospheric.
- The effect is "handmade / tactile / cushioned," not "engineered / layered."

## Spacing & rhythm

- **Generous, calm, airy spacing** — lots of breathing room, unhurried padding,
  wide margins. Nothing feels dense, packed, or utilitarian.
- The rhythm signals *relaxed and considered*, reinforcing the literary tone.
- (Note: airy spacing is not *exclusively* a Claude trait — it's the *combination*
  with warm color, serif, and pillowy radius that makes it the default look.)

## Overall tone

Put together, the default reads as: **warm, literary, handcrafted-notebook.**
Calm, bookish, artisanal, "natural materials," gentle, human. It evokes a
well-made paper notebook, a letterpress page, a cozy reading nook. It is
intentionally *anti-corporate-tech* and *anti-clinical* — which is precisely the
trap, because it is so coherent and pleasant that an LLM reaches for it by
default whenever asked to "make it look nice."

---

## "You are drifting back toward the default if…" checklist

Run this against any UI the language governs. **Every box ticked is a regression
toward the default.** A language built with this skill should tick *none* of
them (unless the user deliberately chose a warm/literary direction *and* it does
not collapse into the specific clay-and-cream signature).

- [ ] Background is **warm beige / cream / paper** rather than the language's own
      background token.
- [ ] The accent is **clay / terracotta / rust / "book cloth"** (anything near
      `#CC785C`) instead of the language's chosen accent.
- [ ] Grays and neutrals carry a **warm yellow/orange undertone** rather than
      being the language's own neutrals.
- [ ] Headings use an **editorial/literary serif** purely as a default "make it
      feel crafted" move (rather than a deliberate, documented type choice).
- [ ] The type pairing is **literary-serif headline + humanist-sans body** by
      reflex.
- [ ] Cards/buttons have **large pillowy radius** (~`16px`+) when the language's
      radius tokens say otherwise.
- [ ] Shadows are **soft, warm-tinted, diffuse** "resting on paper" shadows
      instead of the language's elevation style.
- [ ] Contrast is **deliberately low / muted** when the language calls for
      crispness.
- [ ] The overall vibe lands as **"cozy handcrafted notebook / literary /
      artisanal"** when that is not the language's identity.
- [ ] Any value is **hardcoded to a warm/clay hex** instead of referencing a
      `var(--token)` from the language.

If two or more boxes are ticked, the output has collapsed toward the Anthropic
default and must be redone against the language's own tokens. This checklist is
the source material for the contract's **never-regress** pre-ship gate (spec §12.6)
and for the `compare.html` side-by-side (spec §13).
