# Video Explainer Guide

`/devflow:video-explainer` turns a video (a YouTube link, any URL `yt-dlp` can download,
or a local file) into **one self-contained HTML page** that explains it: a headline and
TL;DR, key takeaways, a section per part of the video, and **diagrams built in pure
HTML + CSS** (flows, timelines, bar/line charts, threshold scales, comparisons, cycles,
layers). Screenshots from the video are added **only** when the video's own image is the
information, such as a demo's result or a real object the narrator points at. Talking
heads, title cards, and charts that can be rebuilt as CSS diagrams are left out.

The skill builds on the [watch plugin](https://github.com/bradautomates/claude-video),
which downloads the video, samples frames, and pulls the transcript. Install it first
(see [Prerequisites](#prerequisites)).

---

## Quick start

```
/devflow:video-explainer https://www.youtube.com/watch?v=<id>
```

or just ask in plain language; the skill triggers on requests like:

- "Make me an HTML explainer page for this video: <url>"
- "Turn this talk into visual notes with diagrams"
- "I don't have time to watch this, give me a page I can skim: <url>"
- "Explain the workflow in this video as a web page, focus on the part from 3:00 to 6:00"

You get a single `.html` file in your current working directory (or wherever you ask).
It works offline, needs no assets folder, and adapts to light/dark mode and phone width.

---

## Prerequisites

### 1. The watch plugin

The skill calls the watch plugin's `watch.py` to download the video, extract frames and
fetch captions. Install it inside Claude Code:

```
/plugin marketplace add bradautomates/claude-video
/plugin install watch@claude-video
```

Then run `/reload-plugins` (or restart Claude Code) if the install summary asks for it.

Check that it works:

```
/watch https://www.youtube.com/watch?v=<id> what is this video about?
```

On its first run the watch plugin checks its dependencies (step 2 below), prints install
commands for anything missing, and creates `~/.config/watch/.env` for the optional
Whisper key.

**How the skill finds it:** `scripts/prepare.py` reads
`~/.claude/plugins/installed_plugins.json` for a `watch@…` entry, then falls back to the
plugin cache and to `~/.claude/skills/watch`. If you installed watch somewhere else (e.g. a
git checkout), point the skill at it:

```bash
export WATCH_PLUGIN_DIR=/path/to/claude-video        # the folder that contains scripts/watch.py
```

Other ways to install watch (from its README): on claude.ai, download `watch.skill` from
the [releases page](https://github.com/bradautomates/claude-video/releases/latest); for a
manual/dev install, `git clone https://github.com/bradautomates/claude-video.git ~/.claude/skills/watch`.

### 2. System tools

| Tool | Why | Install |
|---|---|---|
| **Python 3.10+** | all scripts (standard library only, no pip packages) | python.org / `winget install Python.Python.3.12` / `brew install python` |
| **ffmpeg + ffprobe** | frame extraction, screenshots, image slicing | `winget install Gyan.FFmpeg` / `brew install ffmpeg` / `sudo apt install ffmpeg` |
| **yt-dlp (recent!)** | video + caption download | `pip install -U "yt-dlp[default]"` / `brew install yt-dlp` |
| **deno or node** | YouTube now requires a JavaScript runtime for yt-dlp | `winget install DenoLand.Deno` or Node.js (already present on most dev machines) |
| **Chrome, Edge or Chromium** | headless rendering to check the page's layout | any recent install; set `CHROME_PATH` if it isn't found |

Keep **yt-dlp up to date**. YouTube changes often, and an old yt-dlp is the most common
cause of `HTTP Error 403: Forbidden`. `pip install -U "yt-dlp[default]"` also installs the
`yt-dlp-ejs` challenge solver it needs.

### 3. Optional: a Whisper API key

Most YouTube videos have captions (free). For videos without captions (local files,
some TikToks or Vimeos), the watch plugin can transcribe the audio through Groq
(preferred, cheap) or OpenAI. Add a key to `~/.config/watch/.env`:

```
GROQ_API_KEY=gsk_...
# or
OPENAI_API_KEY=sk-...
```

Without a key, caption-less videos are explained from the frames only; the skill tells
you when that happens.

---

## Usage

### What to ask for

- **A whole video:** just give the URL or path.
- **One part:** "only the section from 12:00 to 18:30". The skill runs the watch pipeline
  focused on that range (denser frames).
- **A focus:** "I want to understand the workflow / the argument / the numbers". The page
  emphasises that.
- **Where to save:** "save it to `docs/explainers/`". Default: the current working
  directory, named after the video.
- **Language:** the page is written in the language of your request.

Best results are on videos up to ~20 minutes. Longer videos work (the transcript is
always complete), but frames are sparser; the skill then samples the visual moments
densely on its own.

### What you get

1. **Header**: a clear headline (not the clickbait title), a 2–3 sentence TL;DR, and a link
   to the video.
2. **Contents**: a proportional map of the video (each segment's width is its length;
   skipped sponsor reads are hatched) and a numbered list with start times.
3. **Key takeaways** (3–6 cards).
4. **Sections** following the video's structure, each with short prose, a CSS diagram with
   a caption, and timestamp links (`▶ 2:14`) that open the video at that moment.
5. **Screenshots** only where they earn it, each with a caption saying what to look at.
6. **Glossary** if the video uses jargon, then a footer with the source credit.

Fidelity rules the skill follows: everything comes from the video; numbers carry the
timestamp they came from; values read off an on-screen chart are marked approximate;
anything the skill adds itself (a definition, background) is boxed as *Background*;
sponsor segments are left out; and auto-caption misspellings of names are corrected
against the video description and on-screen text.

### Work files and cleanup

Intermediate files (the downloaded video, frames, captions, drafts, renders) go into a
work directory in your temp/scratch area, typically 20–60 MB per video. The skill tells you
where it is. Delete it when you are done with the video (keep it if you want revisions).

---

## How it works

```
prepare.py ──► read transcript + every frame ──► outline the ideas ──► pick a diagram per idea
   (watch)                                                                     │
                                                                               ▼
inline_assets.py ◄── render_check.py (look, fix, repeat) ◄── build_page.py ◄── grab.py (screenshots, only if needed)
```

| Script | What it does |
|---|---|
| `scripts/prepare.py` | Runs the watch plugin. If YouTube answers 403 it retries the download with other yt-dlp clients. Writes `transcript.md` (de-duplicated, under the video's chapter headings), `captions.txt` (one cue per line, for exact timestamps), and `meta.json`. Picks the best caption track: a manual (human) track first, then the original auto-captions (`en-orig`), then other English tracks. Prints frame paths with corrected exact times. |
| `scripts/grab.py` | Full-resolution stills at exact times (`--times`), dense sampling (`--start/--end/--every`), `--crop`, `--width`. |
| `scripts/chart_math.py` | Turns real numbers into bar lengths, plot coordinates, `clip-path` polygons (constant-thickness lines), and gridline-aligned ticks, so charts stay true to the data. |
| `scripts/build_page.py` | Drops `body.html` + `custom.css` into `assets/template.html`; warns on unbalanced tags, leftover placeholders, and SVG/canvas/script. |
| `scripts/render_check.py` | Renders in headless Chrome/Edge at 1280 px and a true 400 px phone width (light and dark). Reports overflow, overlapping text inside diagrams, clipped text, and broken images. Saves page slices (never cutting through a diagram), per-diagram crops (`--figures`, `--scale 2`), and an `index.txt`. |
| `scripts/inline_assets.py` | Embeds screenshots as data URIs → one self-contained file. |

`assets/template.html` holds the stylesheet (design tokens, light/dark, responsive layout)
and 17 diagram components. `references/diagrams.md` is the catalog: which component fits
which kind of idea, with copy-ready markup.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `HTTP Error 403: Forbidden` during download | `pip install -U "yt-dlp[default]"`; make sure `deno` or `node` is on PATH. `prepare.py` already retries with fallback clients (the `mweb` fallback may only offer 360p, which is fine for frames). |
| `Could not find the watch plugin` | Install it (see above) or set `WATCH_PLUGIN_DIR`. |
| "No transcript available" | The video has no captions and no Whisper key is set. Add `GROQ_API_KEY` to `~/.config/watch/.env`, or accept a frames-only page. |
| Windows: `python3` opens the Microsoft Store | Use `python`. The skill already does this on Windows. |
| Windows: `UnicodeEncodeError` when printing titles | Set `PYTHONIOENCODING=utf-8` for ad-hoc scripts (the bundled scripts handle it themselves). |
| `No Chrome/Edge/Chromium found` | Install one, or set `CHROME_PATH` to the browser executable. |
| Login-required, private, or region-locked video | The download fails by design; use a local file instead. |

---

## Evaluation

`skills/video-explainer/evals/evals.json` holds the two test prompts used while building the
skill (a finance news explainer and an AI-animation workflow demo) and their
assertions. Each config was run once per prompt, so the numbers below show a
direction, not a precise measurement:

| | With skill | Without skill (Claude + watch plugin) |
|---|---|---|
| Assertions passed | 100% (25/25) | 80% (20/25) |
| Mean time | ~17 min | ~22 min |
| Tokens | ~255–270k | ~275–280k |

Content coverage was equal. The difference is in what the skill is for: diagrams in pure
CSS (the baselines used SVG and JavaScript), a single self-contained file (the baselines
used asset folders and web fonts), and screenshot restraint. The skill used 0 screenshots
for the news video, with every chart rebuilt in CSS, and 6 targeted ones for the demo;
the baselines used 4 and 25.
