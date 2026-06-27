"""Static showcase pages: components, patterns, motion, imagery.

These demonstrate the language in use. They are intentionally token-driven (their
markup references var(--token) and the components.css classes) but their content
is fixed sample copy — they show *how* the language behaves, not brief data. The
motion and imagery pages load demos.js for their interactive switches.
"""

from __future__ import annotations

from pathlib import Path

from dashboard.render import _page_shell


# ---------------------------------------------------------------------------
# components.html — live components styled by components.css
# ---------------------------------------------------------------------------


def page_components(root: Path, brief: dict, tokens: dict) -> str:
    body = """
<section class="stack">
  <span class="eyebrow">Components</span>
  <h1>Components</h1>
  <p class="muted">All styled purely through tokens via <code>components.css</code> — change a token and every component restyles.</p>
</section>

<section class="stack">
  <h2>Buttons</h2>
  <div class="cluster">
    <button class="btn btn--primary">Primary</button>
    <button class="btn btn--secondary">Secondary</button>
    <button class="btn btn--ghost">Ghost</button>
    <button class="btn btn--primary" disabled>Disabled</button>
  </div>
</section>

<section class="stack">
  <h2>Form controls</h2>
  <div class="grid-auto">
    <div class="field"><label class="label" for="i1">Text input</label>
      <input class="input" id="i1" placeholder="Type here…"></div>
    <div class="field"><label class="label" for="i2">Select</label>
      <select class="select" id="i2"><option>Option A</option><option>Option B</option></select></div>
    <div class="field" style="grid-column:1/-1"><label class="label" for="i3">Textarea</label>
      <textarea class="textarea" id="i3" placeholder="Longer text…"></textarea></div>
  </div>
</section>

<section class="stack">
  <h2>Cards</h2>
  <div class="grid-auto">
    <div class="card card--interactive"><div class="card__title">Interactive card</div>
      <div class="card__body">Hover me — lift uses motion tokens.</div></div>
    <div class="card card--raised"><div class="card__title">Raised card</div>
      <div class="card__body">Uses the large shadow token.</div></div>
    <div class="card"><div class="card__title">Flat card</div>
      <div class="card__body">Default surface + small shadow.</div></div>
  </div>
</section>

<section class="stack">
  <h2>Badges</h2>
  <div class="cluster">
    <span class="badge">Default</span>
    <span class="badge badge--accent">Accent</span>
    <span class="badge badge--success">Success</span>
    <span class="badge badge--warning">Warning</span>
    <span class="badge badge--danger">Danger</span>
  </div>
</section>

<section class="stack">
  <h2>Table</h2>
  <table class="table"><thead><tr><th>Name</th><th>Role</th><th>Status</th></tr></thead>
  <tbody>
    <tr><td>Row one</td><td>Example</td><td><span class="badge badge--success">Active</span></td></tr>
    <tr><td>Row two</td><td>Example</td><td><span class="badge badge--warning">Pending</span></td></tr>
  </tbody></table>
</section>
"""
    return _page_shell("Components", "Components", body, from_root=False)


# ---------------------------------------------------------------------------
# patterns.html — layout / grid samples
# ---------------------------------------------------------------------------


def page_patterns(root: Path, brief: dict, tokens: dict) -> str:
    body = """
<section class="stack">
  <span class="eyebrow">Patterns</span>
  <h1>Patterns &amp; layouts</h1>
  <p class="muted">Composition samples built on the spacing scale and grid helpers.</p>
</section>

<section class="stack">
  <h2>Centered reading column</h2>
  <div style="max-width:var(--measure);margin:0 auto;background:var(--color-surface);
    border:var(--border-width) var(--border-style) var(--color-border);
    border-radius:var(--radius-lg);padding:var(--space-5)">
    <h3>A column at the measure</h3>
    <p>Body text constrained to <code>--measure</code> for comfortable reading.</p>
  </div>
</section>

<section class="stack">
  <h2>Asymmetric two-column</h2>
  <div style="display:grid;grid-template-columns:2fr 1fr;gap:var(--space-4)">
    <div class="card"><div class="card__title">Lead</div>
      <div class="card__body">The dominant column carries the primary content.</div></div>
    <div class="card" style="background:var(--color-surface-alt)"><div class="card__title">Aside</div>
      <div class="card__body">A lighter secondary column.</div></div>
  </div>
</section>

<section class="stack">
  <h2>Auto card grid</h2>
  <div class="grid-auto">
    <div class="card"><div class="card__title">Tile 1</div><div class="card__body">Auto-fit grid.</div></div>
    <div class="card"><div class="card__title">Tile 2</div><div class="card__body">Wraps responsively.</div></div>
    <div class="card"><div class="card__title">Tile 3</div><div class="card__body">Spacing from tokens.</div></div>
    <div class="card"><div class="card__title">Tile 4</div><div class="card__body">On the scale.</div></div>
  </div>
</section>

<section class="stack">
  <h2>Hero band</h2>
  <div style="background:var(--color-accent);color:var(--color-accent-contrast);
    border-radius:var(--radius-lg);padding:var(--space-7) var(--space-5);text-align:center">
    <h2 style="color:inherit;margin-bottom:var(--space-3)">A confident hero</h2>
    <p style="max-width:none;margin:0 auto">Full-bleed accent band using the spacing scale for vertical rhythm.</p>
  </div>
</section>
"""
    return _page_shell("Patterns", "Patterns", body, from_root=False)


# ---------------------------------------------------------------------------
# motion.html — interactive demos via demos.js
# ---------------------------------------------------------------------------


def page_motion(root: Path, brief: dict, tokens: dict) -> str:
    body = """
<section class="stack">
  <span class="eyebrow">Motion</span>
  <h1>Motion</h1>
  <p class="muted">Transitions driven by the live <code>--motion-*</code> tokens. Respects <em>prefers-reduced-motion</em>.</p>
</section>

<section class="stack">
  <h2>Replay a transition</h2>
  <p>The box below animates using the current motion tokens. Replay to watch it again.</p>
  <div style="overflow:hidden;padding:var(--space-5);background:var(--color-surface);
    border:var(--border-width) var(--border-style) var(--color-border);border-radius:var(--radius-lg)">
    <div id="motion-demo" style="display:inline-block;background:var(--color-accent);
      color:var(--color-accent-contrast);padding:var(--space-4) var(--space-5);
      border-radius:var(--radius-md);
      transition:transform var(--motion-duration-slow) var(--motion-ease),
        opacity var(--motion-duration-base) var(--motion-ease)">Animated element</div>
  </div>
  <style>
    /* The animation is defined here with motion tokens; demos.js just retriggers it. */
    #motion-demo.is-animated { transform: translateX(var(--space-8)) scale(1.05); opacity: .85; }
  </style>
  <div class="cluster">
    <button class="btn btn--primary" data-motion-replay="#motion-demo">Replay transition</button>
  </div>
</section>

<section class="stack">
  <h2>Hover lift</h2>
  <div class="card card--interactive" style="max-width:280px">
    <div class="card__title">Hover me</div>
    <div class="card__body">Lift distance &amp; easing are token-driven.</div>
  </div>
</section>

<section class="stack">
  <h2>Live token values</h2>
  <table class="table"><thead><tr><th>Token</th><th>Current value</th></tr></thead><tbody>
    <tr><td><code>--motion-duration-fast</code></td><td data-token-readout="--motion-duration-fast"></td></tr>
    <tr><td><code>--motion-duration-base</code></td><td data-token-readout="--motion-duration-base"></td></tr>
    <tr><td><code>--motion-duration-slow</code></td><td data-token-readout="--motion-duration-slow"></td></tr>
    <tr><td><code>--motion-ease</code></td><td data-token-readout="--motion-ease"></td></tr>
    <tr><td><code>--motion-distance</code></td><td data-token-readout="--motion-distance"></td></tr>
  </tbody></table>
</section>

<script src="../js/demos.js"></script>
"""
    return _page_shell("Motion", "Motion", body, from_root=False)


# ---------------------------------------------------------------------------
# imagery.html — interactive treatment switcher via demos.js
# ---------------------------------------------------------------------------


def page_imagery(root: Path, brief: dict, tokens: dict) -> str:
    tiles = "".join(
        f'<div class="img-tile" style="background:hsl({(i*43)%360} 65% 55%)">{i+1}</div>'
        for i in range(9)
    )
    body = f"""
<section class="stack">
  <span class="eyebrow">Imagery</span>
  <h1>Imagery treatments</h1>
  <p class="muted">Switch how images are presented — from a standard grid to an experimental 3D cloud.</p>
</section>

<section class="stack">
  <div class="cluster" data-imagery-toolbar data-for="img-gallery" role="group" aria-label="Imagery treatment">
    <button class="btn btn--secondary" data-imagery="grid" aria-pressed="true">Grid</button>
    <button class="btn btn--secondary" data-imagery="masonry" aria-pressed="false">Masonry</button>
    <button class="btn btn--secondary" data-imagery="collage" aria-pressed="false">Collage</button>
    <button class="btn btn--secondary" data-imagery="cloud" aria-pressed="false">3D cloud</button>
  </div>
  <div id="img-gallery" class="img-gallery treatment-grid" data-imagery-gallery>
    {tiles}
  </div>
</section>

<style>
  .img-gallery {{ position:relative; }}
  .img-tile {{ display:flex;align-items:center;justify-content:center;color:#fff;
    font-weight:700;border-radius:var(--radius-md);aspect-ratio:1; }}
  /* grid */
  .treatment-grid {{ display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-3); }}
  /* masonry via CSS columns */
  .treatment-masonry {{ columns:3; column-gap:var(--space-3); display:block; }}
  .treatment-masonry .img-tile {{ break-inside:avoid;margin-bottom:var(--space-3);aspect-ratio:auto; }}
  .treatment-masonry .img-tile:nth-child(3n) {{ height:160px; }}
  .treatment-masonry .img-tile:nth-child(3n+1) {{ height:110px; }}
  .treatment-masonry .img-tile:nth-child(3n+2) {{ height:200px; }}
  /* collage */
  .treatment-collage {{ display:block;height:320px; }}
  .treatment-collage .img-tile {{ position:absolute;width:130px;height:130px;
    border:4px solid var(--color-surface);box-shadow:var(--shadow-md); }}
  .treatment-collage .img-tile:nth-child(1){{left:0;top:10px;transform:rotate(-6deg);}}
  .treatment-collage .img-tile:nth-child(2){{left:120px;top:60px;transform:rotate(4deg);}}
  .treatment-collage .img-tile:nth-child(3){{left:240px;top:0;transform:rotate(-3deg);}}
  .treatment-collage .img-tile:nth-child(4){{left:360px;top:70px;transform:rotate(7deg);}}
  .treatment-collage .img-tile:nth-child(5){{left:60px;top:160px;transform:rotate(3deg);}}
  .treatment-collage .img-tile:nth-child(6){{left:200px;top:170px;transform:rotate(-5deg);}}
  .treatment-collage .img-tile:nth-child(n+7){{display:none;}}
  /* 3D cloud — CSS transforms only, no libs */
  .treatment-cloud {{ display:flex;align-items:center;justify-content:center;
    height:320px;perspective:1000px; }}
  .treatment-cloud .img-tile {{ position:absolute;width:70px;height:70px;margin:-35px; }}
  .treatment-cloud {{ --i:0; }}
  .treatment-cloud .img-tile:nth-child(1){{transform:rotateY(0deg) translateZ(150px);}}
  .treatment-cloud .img-tile:nth-child(2){{transform:rotateY(40deg) translateZ(150px);}}
  .treatment-cloud .img-tile:nth-child(3){{transform:rotateY(80deg) translateZ(150px);}}
  .treatment-cloud .img-tile:nth-child(4){{transform:rotateY(120deg) translateZ(150px);}}
  .treatment-cloud .img-tile:nth-child(5){{transform:rotateY(160deg) translateZ(150px);}}
  .treatment-cloud .img-tile:nth-child(6){{transform:rotateY(200deg) translateZ(150px);}}
  .treatment-cloud .img-tile:nth-child(7){{transform:rotateY(240deg) translateZ(150px);}}
  .treatment-cloud .img-tile:nth-child(8){{transform:rotateY(280deg) translateZ(150px);}}
  .treatment-cloud .img-tile:nth-child(9){{transform:rotateY(320deg) translateZ(150px);}}
  /* wrap tiles in a spinning stage */
  .treatment-cloud::before {{ content:none; }}
  @keyframes cloud-spin {{ from{{transform:rotateY(0) rotateX(-10deg);}} to{{transform:rotateY(360deg) rotateX(-10deg);}} }}
  .treatment-cloud {{ transform-style:preserve-3d; }}
  /* animate the gallery itself when in cloud mode */
  .treatment-cloud:not(.treatment-cloud--static) {{ animation:cloud-spin 20s linear infinite; transform-style:preserve-3d; }}
  @media (prefers-reduced-motion: reduce) {{ .treatment-cloud {{ animation:none !important; }} }}
</style>

<script src="../js/demos.js"></script>
"""
    return _page_shell("Imagery", "Imagery", body, from_root=False)
