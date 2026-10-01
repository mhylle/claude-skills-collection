# Diagram catalog

> **All example content below is illustrative filler** (sourdough, commuting, reservoirs…),
> chosen to be unrelated to any real video. Copy the *markup*, never the labels or
> numbers. Every label and value on a page must come from the video you are explaining.

Every component below is pure HTML + CSS and is already styled by
`assets/template.html`. Put each one inside a figure:

```html
<figure class="diagram">            <!-- add class="diagram wide" to break out of the text column -->
  <p class="diagram-title">What this shows</p>
  …component…
  <figcaption>What to notice. Source: narration at <a class="ts" href="…&t=95s">1:35</a>.</figcaption>
</figure>
```

Colour any part with `.c1`–`.c6` (blue, orange, green, raspberry, violet, teal),
`.good`, `.bad`, `.warn`, `.muted`. Use colour to *mean* something (same colour =
same actor/category across the page), not for decoration.

Components respond to the **figure's** width (container queries), so a flow turns
vertical inside a narrow figure or on a phone automatically.

## Contents

| Idea in the video | Component |
|---|---|
| Steps in order, a pipeline, a workflow, "first… then…" | [flow](#flow) |
| A causes B causes C (with the *why* on each arrow) | [flow.labeled](#flow-with-labeled-arrows) |
| Events in time, history, a story with dates | [timeline](#timeline) |
| Comparing amounts across categories | [bars](#bars) |
| A long list / a data table shown on screen (10–20 rows) | [bars.compact](#barscompact) |
| "From X to Y" per category, before/after values | [range](#range) |
| A value over time (≤ 12 points), year-by-year | [columns](#columns) |
| A trend/curve over time, many points, a threshold being crossed | [plot](#plot) |
| Where a value sits relative to a threshold / danger zone | [scale](#scale) |
| Two things that move in opposite directions | [seesaw](#seesaw) |
| A vs B, before vs after, old way vs new way | [versus](#versus) |
| A loop, feedback, a vicious/virtuous circle | [cycle](#cycle) |
| Layers, a tech stack, parts of a system, levels | [stack](#stack) |
| Categories and sub-categories, a taxonomy | [tree](#tree) |
| Two dimensions / trade-off quadrants | [matrix](#matrix) |
| A few headline numbers | [stats](#stats) |
| Several options / attempts / items side by side | [cards](#cards) |

None fits? Build a custom diagram from flex/grid boxes, `.pill`, `.arrow-down`,
borders, `clip-path` and `color-mix()`, and put its CSS in `custom.css` (see
`build_page.py`). Keep it HTML+CSS (no SVG, canvas, JS or chart libraries).

---

## flow

```html
<div class="flow numbered">
  <div class="step c1"><b>Mix the dough</b><span>flour, water, starter</span></div>
  <div class="step c2"><b>Bulk ferment</b><span>4–6 h at room temperature</span></div>
  <div class="step c3 key"><b>Shape and proof</b><span>overnight in the fridge</span></div>
  <div class="step c4"><b>Bake</b><span>hot oven, lid on first</span></div>
</div>
```

2–4 steps fit side by side in the text column; with 5 or more the flow stacks
vertically unless the figure is `wide`. Split longer processes into two flows or use
a timeline. `.key` highlights the crucial step; `.ghost` = optional/failed/hypothetical
step. Drop `numbered` if order numbers add nothing.

## flow with labeled arrows

```html
<div class="flow labeled">
  <div class="step c1"><b>Dry summer</b></div>
  <div class="step c2" data-via="smaller harvest"><b>Less grain to sell</b></div>
  <div class="step c4" data-via="buyers compete"><b>Bread costs more</b></div>
</div>
```

`data-via` on a step labels the arrow *leading into* it. Keep labels ≤ 4 words.

## timeline

```html
<ol class="timeline">
  <li class="c1"><time>Year 1</time><b>Prototype built</b><p>Tested by ten volunteers.</p></li>
  <li class="c2 key"><time>Year 2</time><b>First paying customers</b><p>The turning point.</p></li>
  <li class="c3"><time>Year 4</time><b>Breaks even</b><p>Costs finally covered.</p></li>
</ol>
```

`.key` fills the dot. Times can be dates, years, or video timestamps.

## bars

`--v` = bar length in % of the axis range. Compute with
`python scripts/chart_math.py --values 42 31 27 --min 0 --max 50`.

```html
<div class="bars" style="--mark:80">
  <div class="bar c1" style="--v:84"><span class="label">Bike</span><span class="track"></span><span class="value">42%</span></div>
  <div class="bar c2" style="--v:62"><span class="label">Bus</span><span class="track"></span><span class="value">31%</span></div>
  <div class="bar c3" style="--v:54"><span class="label">Car</span><span class="track"></span><span class="value">27%</span></div>
  <div class="axis"><span style="--at:0">0%</span><span style="--at:50">25%</span><span style="--at:100">50%</span></div>
</div>
<div class="legend"><span class="dash">target: 40%</span></div>
```

`--mark` on `.bars` (optional) draws a dashed reference line at that %; explain it
in a `.legend`. `.bar.ghost` = projected/estimated value. The `.axis` row is
optional (`--at` = position in % of the track).

## bars.compact

For a long list (10–20 rows), e.g. a data table shown on screen rebuilt as bars. A
`.divider` row splits the list at a meaningful boundary.

```html
<div class="bars compact" style="--mark:50">
  <div class="bar c1" style="--v:18"><span class="label">18–24</span><span class="track"></span><span class="value">18%</span></div>
  <div class="bar c1" style="--v:26"><span class="label">25–34</span><span class="track"></span><span class="value">26%</span></div>
  <div class="bar c1" style="--v:35"><span class="label">35–44</span><span class="track"></span><span class="value">35%</span></div>
  <div class="divider c2">45 and older</div>
  <div class="bar c2" style="--v:57"><span class="label">45–54</span><span class="track"></span><span class="value">57%</span></div>
  <div class="bar c2" style="--v:66"><span class="label">55+</span><span class="track"></span><span class="value">66%</span></div>
</div>
```

## range

Dumbbell chart: "from X to Y" per category (before/after, then/now, min/max). Hollow
dot = start, filled dot = end; works for rises and falls. Positions are % of the axis
range, from `chart_math.py --values …` (pass all starts and ends with one `--min/--max`):
`python scripts/chart_math.py --values -4 17 8 25 14 29 --min -10 --max 30`.

```html
<div class="range">
  <div class="span c1" style="--from:15; --to:67.5"><span class="label">City A</span><span class="track"></span><span class="value">−4° → 17°</span></div>
  <div class="span c2" style="--from:45; --to:87.5"><span class="label">City B</span><span class="track"></span><span class="value">8° → 25°</span></div>
  <div class="span c3" style="--from:60; --to:97.5"><span class="label">City C</span><span class="track"></span><span class="value">14° → 29°</span></div>
  <div class="axis"><span style="--at:0">−10°</span><span style="--at:25">0°</span><span style="--at:50">10°</span><span style="--at:75">20°</span><span style="--at:100">30°</span></div>
</div>
<div class="legend"><span class="from c1">winter average</span><span class="to c1">summer average</span></div>
```

Optional `--mark` on `.range` draws a solid reference line (legend: `<span class="line">…</span>`).

## columns

```html
<div class="columns" style="--mark:87.5" data-mark="capacity">
  <div class="col c1" style="--v:30"><span class="value">1.2k</span><span class="label">Year 1</span></div>
  <div class="col c1" style="--v:45"><span class="value">1.8k</span><span class="label">Year 2</span></div>
  <div class="col c1" style="--v:65"><span class="value">2.6k</span><span class="label">Year 3</span></div>
  <div class="col c2" style="--v:77.5"><span class="value">3.1k</span><span class="label">Year 4</span></div>
</div>
```

Up to ~12 columns; keep labels short so they don't collide on phones.
Options on `.columns`: `--h` (plot height, default 13rem), `--mark` + `data-mark`.

## plot

Area/line chart for trends. Don't hand-compute the polygons: `scripts/chart_math.py`
prints ready-to-paste `.area` and `.stroke` divs plus every `--x/--y/--mark` value:

```
python scripts/chart_math.py --values 80 72 55 41 38 52 70 --xs 1 2 3 4 5 6 7 --min 0 --max 100 --mark 40
```

```html
<div class="plot c6" style="--mark:40; --rows:4" data-mark="low-water alert">
  <div class="area" style="clip-path: polygon(0% 100%, 0% 20%, 16.7% 28%, 33.3% 45%, 50% 59%, 66.7% 62%, 83.3% 48%, 100% 30%, 100% 100%)"></div>
  <div class="stroke" style="clip-path: polygon(0.04% 19.3%, 16.7% 27.3%, 33.4% 44.3%, 50% 58.3%, 66.6% 61.3%, 83.3% 47.3%, 99.9% 29.3%, 100.1% 30.7%, 83.4% 48.7%, 66.7% 62.7%, 50% 59.7%, 33.3% 45.7%, 16.6% 28.7%, -0.04% 20.7%)"></div>
  <span class="pt below" style="--x:66.7; --y:38"><span>lowest: 38%</span></span>
  <span class="y" style="--y:0">0%</span><span class="y" style="--y:50">50%</span><span class="y" style="--y:100">100%</span>
  <span class="x" style="--x:0">Mar</span><span class="x" style="--x:50">Jun</span><span class="x" style="--x:100">Sep</span>
</div>
```

- Line only: drop the `.area`. Fill only: drop the `.stroke`. `.stroke.dashed` = projection.
- Two series: a second `.area`/`.stroke` pair with another colour class (`class="stroke c2"`), plus a `.legend`.
- Pass `--aspect` = plot width ÷ height on screen (≈3 in the text column, ≈4 in a `.wide`
  figure) so the line has the same thickness on steep and flat stretches.
- `.pt` = labelled dot; label position modifiers `.left`, `.right`, `.below`.
- `.band` shades a horizontal zone: `<div class="band bad" style="--from:0; --to:40"></div>` (put it first).
- `--rows` = number of gridline bands; chart_math prints the value that matches its ticks.
  Label only the x points that matter (start, end, turning points), not every one.
- Only plot numbers the video actually gives (said or shown). Reading a curve off an
  on-screen chart: take 8–15 points at readable spots (gridlines, labelled dates, peaks,
  troughs, the latest value) from a full-resolution grab. That's enough to show the
  shape, and you don't need pixel-perfect tracing. Say "approximate, read from the
  chart at 2:10" in the caption.

## scale

All positions in real units (no maths needed).

```html
<div class="scale" style="--min:0; --max:100">
  <span class="zone bad" style="--from:0; --to:20">low</span>
  <span class="zone good" style="--from:20; --to:80">healthy</span>
  <span class="zone warn end" style="--from:80; --to:100">wear</span>
  <span class="marker c1" style="--at:64">Now 64%</span>
  <span class="tick" style="--at:0">0%</span><span class="tick" style="--at:20">20%</span>
  <span class="tick" style="--at:80">80%</span><span class="tick" style="--at:100">100%</span>
</div>
```

Add `end` to the last zone for its rounded corner. A marker near either end needs
`.edge-left` / `.edge-right` so its label stays inside the figure.

## seesaw

```html
<div class="seesaw" style="--tilt:-10deg">
  <div class="beam">
    <div class="c4">Price ↓<small>more stock on the shelves</small></div>
    <div class="c1">Supply ↑<small>a bumper harvest</small></div>
  </div>
</div>
```

Negative `--tilt` puts the left end down. Put the end that "goes down" on the low side.
Keep the sub-labels short; on phones each box gets under half the width.

## versus

```html
<div class="versus">
  <div class="side c4"><h4>Renting</h4>
    <ul><li>Flexible: move any time</li><li>Nothing builds up</li></ul></div>
  <div class="side c3"><h4>Buying</h4>
    <ul><li>Big upfront cost</li><li>Equity grows over time</li></ul></div>
</div>
```

`data-vs="→"` on `.versus` changes the badge (e.g. → for before/after, ⇄ for exchange);
arrow badges turn to point down automatically when the panels stack on phones.

## cycle

```html
<div class="cycle" style="--n:4">
  <div class="node c6" style="--i:0"><b>Evaporation</b></div>
  <div class="node c1" style="--i:1"><b>Condensation</b></div>
  <div class="node c5" style="--i:2"><b>Rain</b></div>
  <div class="node c3" style="--i:3"><b>Runoff</b></div>
  <div class="hub">The water cycle</div>
</div>
```

3–5 nodes; ≤ 4 words per node (they get narrow on phones). `--i` counts clockwise
from the top. Chevrons on the ring show the direction.

## stack

```html
<div class="stack">
  <div class="layer c1"><b>Web page</b><span>what the user sees</span></div>
  <div class="layer c2"><b>Server</b><span>business rules</span></div>
  <div class="layer c3"><b>Database</b><span>stored records</span></div>
</div>
```

Pyramid: `<div class="stack pyramid">` and give each layer `style="--w:40"`, `--w:65`, `--w:90`…

## tree

```html
<ul class="tree">
  <li class="c1"><b>Renewable energy</b>
    <ul>
      <li class="c2"><b>Solar</b><span>sunlight</span>
        <ul><li class="c2"><b>Panels</b></li><li class="c2"><b>Thermal</b></li></ul></li>
      <li class="c6"><b>Wind</b><span>onshore and offshore</span></li>
    </ul>
  </li>
</ul>
```

## matrix

```html
<div class="matrix" data-x="Urgency →" data-y="Importance →">
  <div class="cell c3"><b>Schedule it</b>important, not urgent</div>
  <div class="cell c4 key"><b>Do it now</b>important and urgent</div>
  <div class="cell muted"><b>Drop it</b>neither</div>
  <div class="cell c2"><b>Delegate it</b>urgent, not important</div>
</div>
```

Cells in reading order: top-left, top-right, bottom-left, bottom-right.

## stats

```html
<div class="stats">
  <div class="stat c1"><b>3</b><span>ingredients</span></div>
  <div class="stat c2"><b>18 h</b><span>from mixing to baking</span></div>
  <div class="stat c3"><b>~240 °C</b><span>oven temperature</span></div>
</div>
```

## cards

```html
<div class="cards">
  <div class="c4"><b>Plan A · Repair</b><p>Cheapest, but only buys a year or two.</p></div>
  <div class="c2"><b>Plan B · Replace</b><p>Costs more now, lasts much longer.</p></div>
  <div class="c3"><b>Plan C · Share</b><p>Split the cost with a neighbour.</p></div>
</div>
```

Exactly four cards (or takeaways) lay out 2×2 automatically instead of 3+1.

---

## Other building blocks

- Timestamp link: `<a class="ts" href="https://www.youtube.com/watch?v=ID&t=95s">1:35</a>`
  (use `meta.json` → `timestamp_url_template`; for local files use `<span class="ts">1:35</span>`).
- Explainer's own background (not from the video): `<aside class="note context"><b>Background</b>…</aside>`.
- Highlighted point from the video: `<aside class="note c1"><b>Key point</b>…</aside>`.
- Quote: `<blockquote class="quote">“…”<footer>Narrator, <a class="ts" href="…">3:12</a></footer></blockquote>`.
- Screenshot: `<figure class="shot"><img src="shots/shot_02m14_0s.jpg" alt="Describe what it shows"><figcaption>… <a class="ts" href="…">2:14</a></figcaption></figure>`;
  several side by side: wrap figures in `<div class="shots">`. Images of different shapes
  get uneven heights; fix with `style="--ratio: 16/9"` on `.shots` (crops all to one shape)
  or `style="grid-template-columns: 1.78fr 1.33fr"` (each image's width ÷ height: equal
  heights, no cropping). Both collapse to one column on phones.
- Screenshot next to a diagram: put a `figure.shot` and a `figure.diagram` in one
  `<div class="shots">` (e.g. the video's frame beside the CSS rebuild of what it shows).
- Video map in the contents: one element per section in `.videomap`, `--len` = its
  length in seconds. Show skipped parts (sponsor reads, intros) as
  `<span class="skip" style="--len:80" title="Sponsor (skipped)"></span>`, and optionally
  as `<li class="skip">Sponsor segment (skipped)<time>6:38</time></li>` in the list.
- Legend item without a colour swatch: `<span class="plain">…</span>`.
- Make any figure wider than the text column: add `wide` to its class.
