# Visual Explainer Guide

`/devflow:visual-explainer` turns any topic into **one self-contained HTML page**
that people understand and remember. It works from your own words, files, a
codebase, URLs, or its own research.

The page has up to four parts, each for a different reader:

| Page | For | What's on it |
|---|---|---|
| **The short version** | everyone, about one minute | the answer as a headline, one animated diagram, three takeaways, "what this means for you" |
| **How it works** | most readers, about five minutes | "Words you'll meet" (every term and abbreviation explained), then up to five sections, each a question with a short answer, an animated diagram, and a quick check |
| **Show me** | people who will do it | an animated walkthrough synced with written steps: drawn screens with a moving cursor, a typing terminal, messages passing between parties, or a guided tour of a real screenshot |
| **Deep dive** | the curious | edge cases, trade-offs, tables, sources |

Show me and Deep dive appear only when there's something to put on them.

---

## Quick start

```
/devflow:visual-explainer how "Sign in with Google" works
/devflow:visual-explainer how "Sign in with Google" works --full
/devflow:visual-explainer git rebase vs merge --tempo slow
```

Or ask in plain words. The skill triggers on requests like:

- "Explain how our deployment pipeline works, as a visual page"
- "I need a one-minute TLDR page for management about the new pricing model"
- "Show me how to create a personal access token in Jira"
- "Make an interactive explainer of git rebase vs merge, full visual"

You get a single `.html` file in the current folder (or wherever you ask). Open it
in any browser; share it as a file.

## Baseline and full mode

**Baseline** (the default) is calm and quick to read. Diagrams animate once as they
come into view and can be replayed, and quick checks open to show the answer.

**Full** (`--full`, or "full visual", "interactive") adds interactions that make
the reader think:

- **Guess first**: pick an answer before seeing it, which makes it stick.
- **What if…?**: a slider changes one thing, and the outcome follows.
- **Put it in order**: tap the steps in order, then check.
- **Explore**: click the parts of a diagram for their details.
- **Scroll story**: a pinned diagram changes as you read past each step.
- **Exploded view**: a layered system fans out in 3D.
- **Zoomable map**: the whole system, then zoom into each part.
- **Listen**: the browser reads the page aloud and highlights each line, and every
  walkthrough can narrate its steps.

## Animation pace

Animations are paced for reading, not for snappiness: each labelled item gets
about two-thirds of a second before the next appears, so the eye can follow the
explanation in order. Ask for `--tempo slow` (complex builds, newcomers) or
`--tempo fast` (experts) to change the default; readers can switch between slow,
normal and fast with the **Pace** button on every page, and their choice is
remembered. Walkthroughs, the cursor and typing follow the same pace.

## The look

"Nocturne": a charcoal opening screen, light pages (fully dark in dark mode), thin
lines, a quiet sans-serif (Mona Sans), Lucide line icons, and one orange accent
that marks the single most important thing on each screen. No emoji, no stock
images, no decoration: research shows decorative pictures lower learning, so the
"wow" comes from the explanation moving.

## Requirements

- **Python 3** for the build and check scripts.
- **Chrome, Edge or Chromium** for the render check (set `CHROME_PATH` if it isn't
  found) and **ffmpeg** for cropping its screenshots.
- An internet connection when viewing, for the font. Without it the page falls
  back to the system font and still works.
- Optional: a browser tool (Playwright or Claude in Chrome) lets the skill capture
  real screenshots for tours and click through the interactive parts to test them.

## Building other explainer skills on it

`skills/visual-explainer` is meant as a base. A skill that explains something
specific (a video, a codebase, an incident) gathers its material its own way, then
writes the page with the same components and runs the same scripts:

- `assets/template.html`: the Nocturne design, all components and their behaviour
- `references/`: page layout, diagram catalog, walkthroughs, interactions, writing
  rules, and the research behind them
- `scripts/build_page.py`: assembles the page, inlines icons and images, and checks
  the writing and structure rules
- `scripts/render_check.py`: renders every page at desktop and phone width, light
  and dark, and reports layout problems
- `assets/example-body.html`: a complete full-mode page to copy patterns from
