"""compare.html — the default Claude look vs. yours (spec §13).

The left sample is a HARDCODED representative of the default Anthropic/Claude
aesthetic; the right is the SAME component rendered with the user's live tokens.
Putting them side by side makes "did we actually escape the default?" a visible
check rather than a claim.
"""

from __future__ import annotations

from pathlib import Path

from dashboard.render import _page_shell


def _default_claude_sample() -> str:
    """A small, HARDCODED representative default-Anthropic/Claude sample.

    Warm beige bg, terracotta/clay accent, pillowy rounded cards, serif+sans.
    Inlined so it never depends on the user's tokens — it is the fixed baseline
    the user is escaping (spec §13).
    """
    return """
<div style="background:#F4F0E8;color:#2b2723;font-family:Georgia,'Times New Roman',serif;
  padding:24px;border-radius:24px">
  <h3 style="font-family:Georgia,serif;color:#2b2723;margin:0 0 8px">Default Claude look</h3>
  <p style="font-family:-apple-system,system-ui,sans-serif;color:#5a5248;max-width:none;margin:0 0 16px">
    Warm beige, clay accent, pillowy corners, serif headings.</p>
  <div style="background:#fff;border-radius:20px;padding:20px;box-shadow:0 8px 24px rgba(120,90,60,.12);margin-bottom:16px">
    <strong style="font-family:Georgia,serif">A pillowy card</strong>
    <p style="font-family:-apple-system,system-ui,sans-serif;color:#6b6256;margin:6px 0 0">Rounded, soft, beige-on-white.</p>
  </div>
  <button style="background:#CC785C;color:#fff;border:0;padding:12px 20px;border-radius:999px;
    font-family:-apple-system,system-ui,sans-serif;font-weight:600">Terracotta button</button>
</div>"""


def _yours_sample() -> str:
    """The SAME component, rendered with the user's live tokens."""
    return """
<div style="background:var(--color-bg);color:var(--color-text);font-family:var(--font-sans);
  padding:var(--space-5);border-radius:var(--radius-lg)">
  <h3 style="font-family:var(--font-display);color:var(--color-text);margin:0 0 var(--space-2)">Your language</h3>
  <p style="color:var(--color-text-muted);max-width:none;margin:0 0 var(--space-4)">
    The same component, your tokens.</p>
  <div class="card" style="margin-bottom:var(--space-4)">
    <strong>A card</strong>
    <p style="color:var(--color-text-muted);margin:var(--space-1) 0 0">Your surface, radius and shadow.</p>
  </div>
  <button class="btn btn--primary">Your button</button>
</div>"""


def page_compare(root: Path, brief: dict, tokens: dict) -> str:
    body = f"""
<section class="stack">
  <span class="eyebrow">Did we escape the default?</span>
  <h1>Compare</h1>
  <p class="muted">Left: the default Claude/Anthropic look (hardcoded baseline). Right: the same component in <strong>your</strong> language. If they look the same, you have not escaped the default.</p>
</section>

<section>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-5);align-items:start">
    <div>
      <h2 style="font-size:var(--text-lg);margin-bottom:var(--space-3)">Default Claude</h2>
      {_default_claude_sample()}
    </div>
    <div>
      <h2 style="font-size:var(--text-lg);margin-bottom:var(--space-3)">Yours</h2>
      {_yours_sample()}
    </div>
  </div>
</section>
"""
    return _page_shell("Compare", "Compare", body, from_root=False)
