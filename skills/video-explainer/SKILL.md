---
name: video-explainer
argument-hint: "<video-url-or-path> [what to focus on]"
description: Turn a video (YouTube or any yt-dlp URL, or a local file) into a self-contained HTML explainer page whose diagrams are built in pure CSS (flows, timelines, charts, comparisons, cycles, layers), adding screenshots only where the video's own visuals are the point. Uses the watch plugin to download the video, sample frames and pull the transcript, then genuinely looks at the frames. Use this whenever someone wants a video explained, summarized or broken down as a web page, visual notes, an explainer, a one-pager, study notes or a diagram-based summary, e.g. "make an HTML page explaining this YouTube video", "turn this talk into visual notes", "explain this video with diagrams", "I don't have time to watch this, give me a page I can skim", even if they don't say HTML or CSS. For a quick question about a video, use /watch directly instead.
---

# Video → visual explainer page

The goal: someone who has not watched the video reads the page in about five
minutes and understands what the video said **and showed**: the argument, the
mechanisms, the numbers, the results. Most of that understanding should come from
diagrams built in HTML + CSS, with prose that explains rather than transcribes.

Scripts live in `scripts/` next to this file. Run them with `python` on Windows
(`python3` is the Microsoft Store stub there) and `python3` elsewhere. On Windows,
any ad-hoc Python you write that prints video titles or descriptions needs
`PYTHONIOENCODING=utf-8`, or emoji crash the console.

## 1. Prepare the video

```bash
python "<skill-dir>/scripts/prepare.py" "<url-or-path>" --work "<work-dir>"
```

Pick a work dir in your scratch/temp area (e.g. `<tmp>/video-explainer-<id>`); the
script creates it. It finds the installed **watch** plugin and runs its pipeline
(yt-dlp download, ffmpeg frames, captions), retrying the download with fallback
yt-dlp settings when YouTube answers 403. Then it writes:

- `transcript.md`: the de-duplicated transcript in ~30 s paragraphs with `[MM:SS]`
  stamps, under the video's own chapter headings when it has chapters. (Raw YouTube
  auto-captions repeat every line; this file doesn't.) Read this one.
- `captions.txt`: the same words, one caption cue per line with `[MM:SS.s]`. Grep it
  when you need the exact moment a phrase is said, for a timestamp link or a grab.
- `meta.json`: title, channel, upload date, duration, chapters, description, tags,
  `video_path`, `timestamp_url_template` (YouTube deep links), and the frame list.
- It prints the frame paths (≈80 frames at 512 px for a 3–10 min video) with exact
  times: `grab.py --times <that time>` returns the same picture at full resolution.
  (`report.md` is the watch plugin's raw report; you don't need it.)

Useful flags: `--start/--end` (focus on a section), `--max-frames N`.

If it fails: missing watch plugin → tell the user to install it
(`/plugin marketplace add bradautomates/claude-video`, then
`/plugin install watch@claude-video`). Persistent 403s → `pip install -U yt-dlp`,
and make sure `node` or `deno` is on PATH. No transcript (no captions, no Whisper
key) → carry on frames-only, and tell the user that adding a Groq key to
`~/.config/watch/.env` would give the page the narration too.

## 2. Watch it properly

1. **Read `transcript.md` in full.** It's the backbone of what was *said*.
2. **Read every frame** the script listed, in parallel batches of ~20. The frames
   show what the narration leaves out: chart values and axes, dates, labels,
   on-screen text, diagrams, code, UI, and above all *results* (what the demo
   actually produced). If on-screen text matters but is unreadable at 512 px, grab
   that moment at full resolution (step 4's `grab.py`) and read it.
3. For a long video (>15 min) frames are sparse. Use the transcript to find the
   visual moments ("as you can see", "look at this chart", "here's the result"),
   then sample them densely: `grab.py <video> --out <work>/look --start 12:00 --end 12:30 --every 3 --width 768`.

4. **Fix names.** Auto-captions mangle proper nouns, so product, tool, people and
   place names often come out wrong, sometimes spelled three different ways in one
   video (think "Kubernetes" as "cooper netties"). Check every name against the description and
   tags in `meta.json` and the on-screen text, and use the correct spelling on the
   page.

Jot working notes in `<work>/notes.md` as you go: section boundaries with
timestamps, every claim and number with the timestamp it came from, and things
that are only visible on screen. This keeps facts tied to evidence when you write
the page, and you'll cite those timestamps.

## 3. Find the explanation, not the transcript

Before writing HTML, decide:

- **The thesis**: what is this video *about*, in one sentence? That becomes the
  headline (a clear statement, not just the video's clickbait title) and the TL;DR.
- **3–6 key takeaways**: what someone should remember a week later.
- **Sections**: follow the video's own structure (chapters, if it has them), merging
  tiny ones and dropping sponsor reads, intros and outros. Typically 4–7 sections.
- **For each section, the shape of the idea**: is it a process? a cause-and-effect
  chain? a change over time? a comparison? a threshold? a loop? a hierarchy? That
  shape picks the diagram (next step).

Fidelity matters more than polish. Everything on the page should come from the
video. Attribute arguments ("the video argues…", "the narrator's claim is…") rather
than presenting them as settled fact. When you add your own context, such as a
definition the video assumes, put it in a clearly marked
`<aside class="note context">` so readers can tell the video's content from yours.
Never invent numbers; if you read values off an on-screen chart, call them
approximate and cite the timestamp.

## 4. Choose diagrams

A diagram earns its place when it shows a *relationship* the reader would otherwise
have to hold in their head: sequence, causality, proportion, contrast, structure,
change. A single fact doesn't need a diagram; use a `.stat` or a sentence. Aim for
roughly one diagram per section (typically 5–10 for a 10-minute video; a request
about a process or workflow can justify more), each with a caption saying what to
notice.

`references/diagrams.md` is the component catalog: read it before building. It maps
idea shapes to ready-made components (flow, labeled cause-chain, timeline, bars,
compact bars, range/dumbbell, columns, area/line plot, threshold scale, seesaw,
versus, cycle, stack, tree, 2×2 matrix, stats, cards) with copy-ready markup. The CSS
for all of them is already in the template. For charts, get the numbers right with
`python scripts/chart_math.py --values … --min … --max …`; it prints `--v`, point
positions, ready-made `clip-path` polygons and gridline-aligned ticks, so lengths
stay proportional to the real data.

When the video shows a data table or chart on screen, rebuilding it as a CSS chart
is usually better than a screenshot: it becomes readable on a phone, searchable,
and consistent with the rest of the page. Read values from a full-resolution grab,
and say in the caption that they were read off the screen (and are approximate,
where they are).

All diagrams are **HTML elements styled with CSS**: flex/grid boxes, borders,
pseudo-element arrows, `clip-path`, gradients, `color-mix()`. No SVG, canvas,
JavaScript or chart libraries. The user wants CSS diagrams, and HTML elements stay
selectable, searchable and responsive. If no catalog component fits, compose a
custom one from the same building blocks and add its CSS at the "page-specific CSS"
marker.

Use colour consistently: one colour per actor or category across the whole page
(e.g. one company always `.c1`, its rival always `.c2`), red/green only for bad/good.

## 5. Screenshots: only when they earn it

Default to **zero** screenshots, and add one only when the video's own image *is*
the information and no diagram can stand in for it:

| Take a screenshot | Don't |
|---|---|
| The result of a demo: generated output, an animation, a model, a UI, a game | Talking heads, presenters, reaction shots |
| A specific real-world thing the narration points at ("look at this crack") | Title cards, logos, channel branding, subscribe prompts |
| A before/after or side-by-side comparison whose look is the point | Stock footage and b-roll |
| A dense chart whose exact shape matters and can't be rebuilt from stated numbers | Simple charts and slides you can rebuild as a CSS diagram or text (rebuild them; that's the point of the page) |
| Code, terminal or settings that are central and shown, not spoken | Sponsor segments |

Rough expectation: news/explainer videos with motion graphics → 0–2; demos,
showcases and tutorials with visual results → 3–8. Each screenshot needs a caption
that says what to look at, plus a timestamp link.

```bash
python "<skill-dir>/scripts/grab.py" "<video_path from meta.json>" --out "<work>/shots" --times 2:14 3:05
```

Grabs are full resolution. Add `--width 960` if the source is larger, and
`--crop W:H:X:Y` (source pixels) to cut letterbox margins or isolate the panel that
matters. **Read every grabbed image before using it**: frames near cuts or fades
are often blurry or mid-transition; shift by ±0.5–1 s and re-grab. Pick the moment
that best shows the point, not just the first one.

## 6. Build the page

Write the page content as `<work>/body.html` (everything inside `<body>`: one
`<main class="page">…</main>`), and any CSS for custom diagrams as
`<work>/custom.css`. Then assemble:

```bash
python "<skill-dir>/scripts/build_page.py" --body "<work>/body.html" --css "<work>/custom.css" -o "<work>/page.html"
```

It drops your body and CSS into `assets/template.html`, which holds the full
stylesheet (light and dark themes, responsive layout, all diagram components), sets
the `<title>` from your `<h1>`, and warns about unbalanced tags, leftover
placeholders and any SVG/canvas/script. Re-run it after every edit. Read the
template's skeleton `<body>` once for the expected structure:

1. **Header**: eyebrow (channel · duration), your headline, the TL;DR dek, and a
   link to the video with the original title and upload date.
2. **Contents**: one `.videomap` segment per section with `--len` set to the
   section's length in seconds (a proportional map of the video; parts you dropped,
   such as sponsor reads, appear as hatched `.skip` segments), plus the numbered
   list with start times.
3. **Key takeaways**: `.takeaways` cards.
4. **Sections**: `h2` with number and timestamp link, 1–3 short paragraphs, the
   diagram, and optional screenshot, `.note` or `.quote`.
5. **Glossary**: only if the video uses jargon.
6. **Footer**: source credit and date.

Reference screenshots relatively (`shots/shot_02m14_0s.jpg`) so the draft renders
from the work dir. Timestamp links come from `timestamp_url_template` in meta.json
(`…&t=134s`); for local files use `<span class="ts">2:14</span>`. Write in the
language of the user's request. Keep diagram labels short (≤ ~6 words per box):
the prose carries the nuance, the diagram carries the structure.

## 7. Render, look, fix

```bash
python "<skill-dir>/scripts/render_check.py" "<work>/page.html" --out "<work>/render" --dark --figures
```

This renders the page in headless Chrome/Edge at 1280 px and at a true 400 px phone
width (light and dark). It reports horizontal overflow, text overlapping other text
inside figures, clipped text and broken images. It saves page slices (cut between
figures, so a diagram is never split) plus, with `--figures`, one image per diagram
named after its title; add `--scale 2` for a sharper close-up. `index.txt` in the
output folder maps every image to the diagrams it shows. On re-runs after a small
fix, render only what you need (e.g. `--widths 400 --figures`) rather than
re-reading every slice.

**Read the images**, the figure crops above all. The automatic checks catch only
some failures, and CSS diagrams fail silently. Look for labels colliding with
lines or dots, arrows pointing the wrong way, bars that don't match their numbers,
cramped boxes on the phone width, and unreadable colours in dark mode. Fix and
re-run until both the report and your eyes are happy. This step is what separates
a page that looks right from one that is right.

## 8. Deliver

Inline the screenshots so the result is one self-contained file, written to where
the user asked (default: the current working directory, named after the video):

```bash
python "<skill-dir>/scripts/inline_assets.py" "<work>/page.html" -o "<output>/<slug>.html"
```

Then tell the user where the page is, and in a few lines: the sections, how many
diagrams, and which screenshots you included and why (or that none were needed and
why). The work dir holds the downloaded video and frames (tens of MB). Mention it,
and delete it once the user is done with the video.
