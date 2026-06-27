#!/usr/bin/env python3
"""render_spectrum — render N live variants for one design dimension.

This is the mechanical half of the signature feature (spec §7): the "1 = what
people expect → 5 = experimental" safeness spectrum. It emits a single
``safeness-spectrum`` QUESTION object (the BUILD_CONTRACT questionnaire schema)
whose variants each carry:

- ``previewHtml`` — a real, self-contained HTML snippet rendering a
  representative sample of that dimension, rendered against the *current
  committed tokens* (read via tokens_lib) with the variant's deltas applied and
  the effective values baked inline, so the user reacts to THEIR emerging
  language at each safeness level — not a stranger's site.
- ``tokens`` — the token-delta dict that would be committed if that level wins.
- optional ``sandbox: true`` — for experimental variants better shown isolated
  in an ``<iframe srcdoc>`` (e.g. heavy 3D/scroll-driven samples).

Where the *creativity* lives (read this before changing ladders)
----------------------------------------------------------------
A Python script cannot think divergently — so the genuinely original,
session-specific experimental ideas must come from the ORCHESTRATOR's reasoning
about *this* user's north star, not from frozen code here. There are two modes:

1. ``--spec <variants.json>`` (PREFERRED) — the orchestrator authors the
   variants for this session (their names, token deltas, and a small
   ``sampleHtml`` written with ``var(--token)`` references). This script's only
   job is to bake the effective (current + delta) token values onto each sample
   so it renders live and standalone. This is how every dimension's
   experimental end stays fresh: the high-safeness variant is reasoned anew each
   time from the brief, never a canned gimmick.

2. ``--dimension <name>`` — falls back to a built-in **seed library** of example
   ladders. These exist so the tool works offline and gives the orchestrator a
   starting point to react to and adapt. They are deliberately generic. Treat
   them as illustrations, NOT a fixed menu. In particular the imagery seed's
   top rung (a 3D image cloud) is ONE example of experimental thinking; do not
   let it become the answer every time — that is the opposite of the divergent
   thinking this skill is for.

CLI
---
    # Preferred: render the orchestrator's own per-session variants
    python3 render_spectrum.py --spec ./variants.json \
        --tokens ./design-system/css/tokens.css --out ./q.json

    # Fallback: render a built-in seed ladder for a dimension
    python3 render_spectrum.py --dimension imagery \
        --tokens ./design-system/css/tokens.css \
        --out ./q.json [--levels 1,2,3,4,5] [--baseline 3]

``--spec`` schema (orchestrator-authored):
    { "dimension": "imagery",
      "prompt": "How should images be presented?",
      "variants": [
        { "level": 2, "name": "...", "tokens": {"--radius-md":"0"},
          "sampleHtml": "<div class=card>… uses var(--color-accent) etc …</div>",
          "sandbox": false }
      ] }

Stdlib only.
"""

from __future__ import annotations

import argparse
import html
import json
import sys
from pathlib import Path

import tokens_lib

# ---------------------------------------------------------------------------
# Rendering helpers
# ---------------------------------------------------------------------------


def _effective(base: dict, delta: dict) -> dict:
    """Merge a variant's delta over the current tokens (immutably)."""
    return tokens_lib.apply_delta(base, delta)


def _short(value: str, limit: int = 24) -> str:
    s = str(value)
    return s if len(s) <= limit else s[: limit - 1] + "…"


def _caption_from_delta(base: dict, delta: dict, limit: int = 4) -> str:
    """One-line 'what actually changed' summary built from the variant's delta.

    Every rung is labelled with the exact change (e.g. ``accent #2f6df0 → #ff3366
    · radius-md 8px → 0``) so a user can always tell rungs apart even when the
    rendered difference is subtle — the single biggest readability gap reported
    from real use. Shows old → new when the base has the token, else just the new
    value; long values (gradients) are truncated.
    """
    parts = []
    for key, new in list(delta.items())[:limit]:
        full = key if key.startswith("--") else f"--{key}"
        name = full[2:].replace("color-", "").replace("space-", "space ")
        old = base.get(full)
        if old is not None and str(old) != str(new):
            parts.append(f"{name} {_short(old)} → {_short(new)}")
        else:
            parts.append(f"{name} {_short(new)}")
    if len(delta) > limit:
        parts.append(f"+{len(delta) - limit} more")
    return " · ".join(parts) if parts else "baseline (no token change)"


def _v(tokens: dict, name: str, fallback: str = "") -> str:
    """Look up an effective token value (name may omit the leading --)."""
    key = name if name.startswith("--") else f"--{name}"
    return tokens.get(key, fallback)


def _scope_style(tokens: dict, keys: list[str]) -> str:
    """Build a `--name: value;` declaration block for a scoped <style>.

    We bake the *effective* values inline so the previewHtml renders standalone
    inside the questionnaire even if it is shown without the live stylesheet.
    Only the keys a preview actually uses are emitted, to keep snippets small.
    """
    decls = []
    for k in keys:
        key = k if k.startswith("--") else f"--{k}"
        if key in tokens:
            decls.append(f"      {key}: {tokens[key]};")
    return "\n".join(decls)


# A small reusable sample card markup, parameterised by a scope class. Used by
# several dimensions so the user compares the *treatment*, not the content.
def _sample_card(scope: str, title: str, body: str) -> str:
    return (
        f'<div class="{scope}-card">'
        f'<h4>{html.escape(title)}</h4>'
        f'<p>{html.escape(body)}</p>'
        f'<button class="{scope}-btn">Primary action</button>'
        f"</div>"
    )


# ---------------------------------------------------------------------------
# Per-dimension ladders.
#
# Each builder returns a list of (level, name, delta, preview_builder) where
# preview_builder(effective_tokens) -> html string. We pass the *effective*
# tokens (current + delta) so the preview reflects the merged result.
# ---------------------------------------------------------------------------


def _color_levels():
    """Color: neutral+single accent → duotone warm/cool → high-chroma gradient.

    Level deltas swap the accent family and (at 5) introduce a gradient surface,
    so the change is structural, not just a hue tweak.
    """
    def preview(eff, scope):
        style = _scope_style(eff, [
            "--color-bg", "--color-surface", "--color-text", "--color-text-muted",
            "--color-border", "--color-accent", "--color-accent-hover",
            "--color-accent-contrast", "--radius-md", "--space-3", "--space-4",
            "--font-sans",
        ])
        grad = _v(eff, "--color-accent-gradient")
        accent_decl = (
            f"background: {grad};" if grad else "background: var(--color-accent);"
        )
        return f"""<style>
.{scope} {{
{style}
  font-family: var(--font-sans); background: var(--color-bg);
  padding: var(--space-4); border-radius: var(--radius-md);
}}
.{scope} h4 {{ color: var(--color-text); margin: 0 0 var(--space-3) 0; }}
.{scope} .row {{ display:flex; gap: var(--space-3); align-items:center; flex-wrap:wrap; }}
.{scope}-btn {{ {accent_decl} color: var(--color-accent-contrast);
  border: 0; padding: var(--space-3); border-radius: var(--radius-md); font: inherit; }}
.{scope}-chip {{ width:48px; height:48px; border-radius: var(--radius-md); border:1px solid var(--color-border); }}
</style>
<div class="{scope}">
  <h4>Accent &amp; surface</h4>
  <div class="row">
    <span class="{scope}-chip" style="background: var(--color-surface)"></span>
    <span class="{scope}-chip" style="{accent_decl}"></span>
    <button class="{scope}-btn">Call to action</button>
  </div>
</div>"""

    return [
        (1, "Neutral + single accent",
         {"--color-bg": "#ffffff", "--color-surface": "#ffffff",
          "--color-text": "#1a1a1a", "--color-text-muted": "#666666",
          "--color-border": "#e5e5e5", "--color-accent": "#2563eb",
          "--color-accent-hover": "#1d4ed8", "--color-accent-contrast": "#ffffff"},
         preview),
        (3, "Duotone — warm / cool split",
         {"--color-bg": "#0f1424", "--color-surface": "#19203a",
          "--color-text": "#f2f4fb", "--color-text-muted": "#9aa6c8",
          "--color-border": "#2c3556", "--color-accent": "#ff8a5c",
          "--color-accent-hover": "#ff6f3c", "--color-accent-contrast": "#1a0f0a"},
         preview),
        (5, "High-chroma gradient system",
         {"--color-bg": "#0a0612", "--color-surface": "#16102a",
          "--color-text": "#fdf4ff", "--color-text-muted": "#c4a8e8",
          "--color-border": "#3a2a5e", "--color-accent": "#d946ef",
          "--color-accent-hover": "#c026d3", "--color-accent-contrast": "#ffffff",
          "--color-accent-gradient": "linear-gradient(115deg,#d946ef,#6366f1 60%,#22d3ee)"},
         preview),
    ]


def _typography_levels():
    """Type: single neutral sans → sans+serif pairing → expressive display + big scale."""
    def preview(eff, scope):
        style = _scope_style(eff, [
            "--font-sans", "--font-display", "--text-base", "--text-3xl",
            "--text-lg", "--weight-bold", "--weight-normal", "--leading-tight",
            "--leading-normal", "--color-text", "--color-text-muted",
            "--color-surface", "--space-3",
        ])
        return f"""<style>
.{scope} {{
{style}
  background: var(--color-surface); color: var(--color-text);
  padding: var(--space-3); font-family: var(--font-sans);
}}
.{scope} .display {{ font-family: var(--font-display); font-size: var(--text-3xl);
  font-weight: var(--weight-bold); line-height: var(--leading-tight); margin:0; }}
.{scope} .sub {{ font-size: var(--text-lg); color: var(--color-text-muted); margin:.4em 0 0; }}
.{scope} .body {{ font-size: var(--text-base); line-height: var(--leading-normal); margin:.8em 0 0; }}
</style>
<div class="{scope}">
  <p class="display">Aa Big Idea</p>
  <p class="sub">A supporting subheadline</p>
  <p class="body">Body copy at the base size shows rhythm, leading and the family pairing in one glance.</p>
</div>"""

    return [
        (1, "Single neutral sans",
         {"--font-sans": '"Inter", system-ui, sans-serif',
          "--font-display": '"Inter", system-ui, sans-serif',
          "--text-scale-ratio": "1.2", "--text-3xl": "2rem", "--weight-bold": "600"},
         preview),
        (3, "Sans body + serif display pairing",
         {"--font-sans": '"Inter", system-ui, sans-serif',
          "--font-display": 'Georgia, "Times New Roman", serif',
          "--text-scale-ratio": "1.333", "--text-3xl": "2.75rem", "--weight-bold": "700",
          "--tracking": "-0.01em"},
         preview),
        (5, "Expressive display + dramatic mixed scale",
         {"--font-sans": '"Inter", system-ui, sans-serif',
          "--font-display": '"Georgia", "Palatino Linotype", "Iowan Old Style", serif',
          "--text-scale-ratio": "1.6", "--text-3xl": "4rem", "--text-lg": "1.6rem",
          "--weight-bold": "800", "--leading-tight": "0.95", "--tracking": "-0.03em"},
         preview),
    ]


def _spacing_levels():
    """Spacing: ~3 honest steps — tight → generous → architectural whitespace."""
    def preview(eff, scope):
        style = _scope_style(eff, [
            "--space-3", "--space-4", "--space-5", "--space-6", "--space-7",
            "--color-surface", "--color-surface-alt", "--color-text",
            "--color-border", "--radius-md", "--font-sans",
        ])
        return f"""<style>
.{scope} {{
{style}
  font-family: var(--font-sans); background: var(--color-surface-alt);
  padding: var(--space-6); }}
.{scope} .stack > * + * {{ margin-top: var(--space-5); }}
.{scope} .box {{ background: var(--color-surface); color: var(--color-text);
  border: 1px solid var(--color-border); border-radius: var(--radius-md);
  padding: var(--space-5); }}
</style>
<div class="{scope}"><div class="stack">
  <div class="box">Block one — note the breathing room around and between blocks.</div>
  <div class="box">Block two — spacing is the rhythm of the whole layout.</div>
</div></div>"""

    return [
        (1, "Tight & compact",
         {"--space-unit": "4px", "--space-3": "6px", "--space-4": "8px",
          "--space-5": "12px", "--space-6": "16px", "--space-7": "24px"},
         preview),
        (2, "Generous & comfortable",
         {"--space-unit": "8px", "--space-3": "12px", "--space-4": "16px",
          "--space-5": "24px", "--space-6": "32px", "--space-7": "48px"},
         preview),
        (3, "Architectural whitespace",
         {"--space-unit": "12px", "--space-3": "20px", "--space-4": "28px",
          "--space-5": "48px", "--space-6": "72px", "--space-7": "112px"},
         preview),
    ]


def _shape_levels():
    """Shape: sharp/0-radius → soft → pill/organic blob corners."""
    def preview(eff, scope):
        style = _scope_style(eff, [
            "--radius-sm", "--radius-md", "--radius-lg", "--radius-full",
            "--color-surface", "--color-accent", "--color-accent-contrast",
            "--color-text", "--color-border", "--space-3", "--space-4", "--font-sans",
        ])
        blob = _v(eff, "--radius-blob")
        card_radius = blob if blob else "var(--radius-lg)"
        return f"""<style>
.{scope} {{ {style} font-family: var(--font-sans); padding: var(--space-4);
  display:flex; gap: var(--space-4); flex-wrap:wrap; align-items:center; }}
.{scope}-card {{ background: var(--color-surface); color: var(--color-text);
  border:1px solid var(--color-border); border-radius: {card_radius};
  padding: var(--space-4); flex:1 1 140px; }}
.{scope}-btn {{ background: var(--color-accent); color: var(--color-accent-contrast);
  border:0; padding: var(--space-3) var(--space-4); border-radius: var(--radius-full);
  font: inherit; }}
</style>
<div class="{scope}">
  <div class="{scope}-card"><strong>Card corner</strong><br>Same content, different corner language.</div>
  <button class="{scope}-btn">Pill button</button>
</div>"""

    return [
        (1, "Sharp — zero radius",
         {"--radius-sm": "0", "--radius-md": "0", "--radius-lg": "0",
          "--radius-full": "0", "--border-width": "1px"},
         preview),
        (2, "Soft — modest rounding",
         {"--radius-sm": "4px", "--radius-md": "8px", "--radius-lg": "14px",
          "--radius-full": "999px"},
         preview),
        (3, "Pill & organic blobs",
         {"--radius-sm": "10px", "--radius-md": "18px", "--radius-lg": "28px",
          "--radius-full": "999px",
          "--radius-blob": "42% 58% 63% 37% / 49% 41% 59% 51%"},
         preview),
    ]


def _elevation_levels():
    """Elevation: flat → subtle raised → layered glass/skeuomorphic."""
    def preview(eff, scope):
        style = _scope_style(eff, [
            "--shadow-sm", "--shadow-md", "--shadow-lg", "--color-surface",
            "--color-bg", "--color-text", "--color-border", "--radius-lg",
            "--space-4", "--space-5", "--font-sans", "--elevation-style",
        ])
        is_glass = _v(eff, "--elevation-style") == "glass"
        glass_bg = ("background: rgba(255,255,255,0.12); backdrop-filter: blur(10px);"
                    if is_glass else "background: var(--color-surface);")
        bg = ("linear-gradient(135deg,#5b6cff,#a855f7)" if is_glass
              else "var(--color-bg)")
        return f"""<style>
.{scope} {{ {style} font-family: var(--font-sans); background: {bg};
  padding: var(--space-5); display:flex; gap: var(--space-5); flex-wrap:wrap; }}
.{scope}-card {{ {glass_bg} color: var(--color-text);
  border:1px solid var(--color-border); border-radius: var(--radius-lg);
  padding: var(--space-4); box-shadow: var(--shadow-md); flex:1 1 130px; }}
.{scope}-card.hi {{ box-shadow: var(--shadow-lg); }}
</style>
<div class="{scope}">
  <div class="{scope}-card">Base layer</div>
  <div class="{scope}-card hi">Raised layer</div>
</div>"""

    return [
        (1, "Flat — no shadows",
         {"--shadow-sm": "none", "--shadow-md": "none", "--shadow-lg": "none",
          "--elevation-style": "flat", "--border-width": "1px"},
         preview),
        (2, "Subtle raised",
         {"--shadow-sm": "0 1px 2px rgba(0,0,0,0.06)",
          "--shadow-md": "0 4px 12px rgba(0,0,0,0.10)",
          "--shadow-lg": "0 12px 32px rgba(0,0,0,0.16)",
          "--elevation-style": "raised"},
         preview),
        (3, "Layered glass / skeuomorphic",
         {"--shadow-sm": "0 2px 6px rgba(0,0,0,0.18)",
          "--shadow-md": "0 10px 30px rgba(0,0,0,0.30)",
          "--shadow-lg": "0 30px 70px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.4)",
          "--elevation-style": "glass", "--color-text": "#ffffff",
          "--color-border": "rgba(255,255,255,0.3)"},
         preview),
    ]


def _motion_levels():
    """Motion: none/instant → tasteful transitions → bold physics (sandboxed)."""
    def preview(eff, scope):
        style = _scope_style(eff, [
            "--motion-duration-base", "--motion-duration-slow", "--motion-ease",
            "--motion-distance", "--color-accent", "--color-accent-contrast",
            "--color-surface", "--color-text", "--radius-md", "--space-4", "--font-sans",
        ])
        return f"""<style>
.{scope} {{ {style} font-family: var(--font-sans); padding: var(--space-4);
  background: var(--color-surface); color: var(--color-text); }}
.{scope}-box {{ display:inline-block; background: var(--color-accent);
  color: var(--color-accent-contrast); padding: var(--space-4);
  border-radius: var(--radius-md);
  transition: transform var(--motion-duration-base) var(--motion-ease),
    box-shadow var(--motion-duration-slow) var(--motion-ease); }}
.{scope}-box:hover {{ transform: translateY(calc(-1 * var(--motion-distance))) scale(1.04); }}
.{scope} p {{ margin-top: var(--space-4); }}
</style>
<div class="{scope}">
  <span class="{scope}-box">Hover me</span>
  <p>Easing &amp; duration come straight from the motion tokens.</p>
</div>"""

    return [
        (1, "None — instant",
         {"--motion-duration-fast": "0ms", "--motion-duration-base": "0ms",
          "--motion-duration-slow": "0ms", "--motion-ease": "linear",
          "--motion-distance": "0px"},
         preview),
        (3, "Tasteful transitions",
         {"--motion-duration-fast": "120ms", "--motion-duration-base": "240ms",
          "--motion-duration-slow": "420ms",
          "--motion-ease": "cubic-bezier(0.2,0,0,1)", "--motion-distance": "8px"},
         preview),
        # Level 5 is sandboxed — bold spring/physics shown in an isolated iframe.
        (5, "Bold physics / scroll-driven",
         {"--motion-duration-fast": "200ms", "--motion-duration-base": "520ms",
          "--motion-duration-slow": "900ms",
          "--motion-ease": "cubic-bezier(0.34,1.56,0.64,1)",
          "--motion-distance": "24px"},
         preview, True),
    ]


def _imagery_levels():
    """Imagery: grid → masonry → overlap/collage → parallax reveal → 3D cloud.

    Level 5 is a CSS-3D-transform "fake" image cloud (no external libs), rendered
    in a sandboxed srcdoc iframe per the contract.
    """
    def tiles(n, scope):
        # deterministic, dependency-free coloured tiles (no external images)
        out = []
        for i in range(n):
            hue = (i * 47) % 360
            out.append(
                f'<div class="{scope}-tile" style="background:'
                f'hsl({hue} 65% 55%)">{i + 1}</div>'
            )
        return "".join(out)

    def grid(eff, scope):
        s = _scope_style(eff, ["--space-3", "--radius-md", "--color-surface", "--font-sans"])
        return f"""<style>
.{scope} {{ {s} font-family: var(--font-sans); }}
.{scope}-g {{ display:grid; grid-template-columns:repeat(3,1fr); gap:var(--space-3); }}
.{scope}-tile {{ aspect-ratio:1; border-radius:var(--radius-md); display:flex;
  align-items:center; justify-content:center; color:#fff; font-weight:700; }}
</style><div class="{scope}"><div class="{scope}-g">{tiles(6, scope)}</div></div>"""

    def masonry(eff, scope):
        s = _scope_style(eff, ["--space-3", "--radius-md", "--font-sans"])
        return f"""<style>
.{scope} {{ {s} font-family: var(--font-sans); }}
.{scope}-m {{ columns:3; column-gap:var(--space-3); }}
.{scope}-tile {{ break-inside:avoid; margin-bottom:var(--space-3);
  border-radius:var(--radius-md); display:flex; align-items:center;
  justify-content:center; color:#fff; font-weight:700; }}
.{scope}-tile:nth-child(odd) {{ height:120px; }}
.{scope}-tile:nth-child(even) {{ height:80px; }}
</style><div class="{scope}"><div class="{scope}-m">{tiles(6, scope)}</div></div>"""

    def collage(eff, scope):
        s = _scope_style(eff, ["--radius-md", "--shadow-md", "--font-sans"])
        return f"""<style>
.{scope} {{ {s} font-family: var(--font-sans); position:relative; height:220px; }}
.{scope}-tile {{ position:absolute; width:120px; height:120px;
  border-radius:var(--radius-md); box-shadow:var(--shadow-md); display:flex;
  align-items:center; justify-content:center; color:#fff; font-weight:700;
  border:3px solid #fff; }}
.{scope}-tile:nth-child(1){{left:10px;top:10px;transform:rotate(-6deg);}}
.{scope}-tile:nth-child(2){{left:90px;top:50px;transform:rotate(4deg);}}
.{scope}-tile:nth-child(3){{left:180px;top:20px;transform:rotate(-3deg);}}
.{scope}-tile:nth-child(4){{left:250px;top:70px;transform:rotate(8deg);}}
</style><div class="{scope}"><div>{tiles(4, scope)}</div></div>"""

    def parallax(eff, scope):
        s = _scope_style(eff, ["--space-3", "--radius-md", "--motion-ease", "--font-sans"])
        return f"""<style>
.{scope} {{ {s} font-family: var(--font-sans); height:200px; overflow-y:auto;
  border:1px solid #ccc; border-radius:var(--radius-md); }}
.{scope}-track {{ display:flex; flex-direction:column; gap:var(--space-3); padding:var(--space-3); }}
.{scope}-tile {{ height:140px; border-radius:var(--radius-md); position:sticky; top:8px;
  display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700;
  transition:transform .4s var(--motion-ease); }}
.{scope}:hover .{scope}-tile {{ transform:scale(1.02); }}
</style><div class="{scope}"><div class="{scope}-track">
  <p style="margin:0">Scroll inside — frames reveal as they pin.</p>{tiles(4, scope)}
</div></div>"""

    def cloud(eff, scope):
        # CSS 3D transform fake image cloud — rendered standalone in srcdoc.
        n = 12
        cells = []
        for i in range(n):
            hue = (i * 31) % 360
            ang = (360 / n) * i
            cells.append(
                f'<div class="cell" style="transform:rotateY({ang}deg) translateZ(150px);'
                f'background:hsl({hue} 70% 55%)">{i + 1}</div>'
            )
        cells_html = "".join(cells)
        # self-contained document for the iframe srcdoc
        return f"""<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{{margin:0;height:100%;background:#0b0b16;overflow:hidden;
    font-family:{_v(eff,'--font-sans','sans-serif')};}}
  .stage{{height:240px;display:flex;align-items:center;justify-content:center;perspective:900px;}}
  .cloud{{position:relative;width:1px;height:1px;transform-style:preserve-3d;
    animation:spin 18s linear infinite;}}
  @media (prefers-reduced-motion: reduce){{.cloud{{animation:none;}}}}
  .cell{{position:absolute;width:64px;height:64px;margin:-32px;border-radius:10px;
    display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;
    box-shadow:0 8px 24px rgba(0,0,0,.4);}}
  @keyframes spin{{from{{transform:rotateY(0) rotateX(-12deg);}}
    to{{transform:rotateY(360deg) rotateX(-12deg);}}}}
</style></head><body><div class="stage"><div class="cloud">{cells_html}</div></div></body></html>"""

    return [
        (1, "Standard fixed grid", {}, grid),
        (2, "Masonry", {}, masonry),
        (3, "Overlap / collage", {}, collage),
        (4, "Parallax / scroll reveal", {}, parallax),
        (5, "WebGL-style 3D image cloud", {}, cloud, True),
    ]


def _components_levels():
    """Components: conventional → distinctive → experimental button/card treatments."""
    def preview(eff, scope):
        style = _scope_style(eff, [
            "--color-accent", "--color-accent-contrast", "--color-surface",
            "--color-text", "--color-border", "--radius-md", "--radius-lg",
            "--shadow-md", "--space-3", "--space-4", "--font-sans", "--border-width",
        ])
        btn_extra = _v(eff, "--comp-btn-extra", "")
        card_extra = _v(eff, "--comp-card-extra", "")
        return f"""<style>
.{scope} {{ {style} font-family: var(--font-sans); padding: var(--space-4);
  display:flex; gap: var(--space-4); align-items:flex-start; flex-wrap:wrap; }}
.{scope}-card {{ background: var(--color-surface); color: var(--color-text);
  border: var(--border-width) solid var(--color-border); border-radius: var(--radius-lg);
  padding: var(--space-4); box-shadow: var(--shadow-md); flex:1 1 160px; {card_extra} }}
.{scope}-btn {{ background: var(--color-accent); color: var(--color-accent-contrast);
  border:0; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
  font: inherit; cursor:pointer; {btn_extra} }}
</style>
<div class="{scope}">
  <div class="{scope}-card"><strong>Card</strong><p style="margin:.4em 0 0">A representative component treatment.</p></div>
  <button class="{scope}-btn">Action</button>
</div>"""

    return [
        (1, "Conventional", {}, preview),
        (3, "Distinctive",
         {"--comp-btn-extra": "letter-spacing:.02em;box-shadow:var(--shadow-md);",
          "--comp-card-extra": "border-left:4px solid var(--color-accent);"},
         preview),
        (5, "Experimental",
         {"--comp-btn-extra": "border:2px solid var(--color-text);background:transparent;"
                              "color:var(--color-text);text-transform:uppercase;font-weight:800;",
          "--comp-card-extra": "transform:skewY(-1.5deg);outline:2px solid var(--color-text);"
                               "outline-offset:6px;"},
         preview),
    ]


def _patterns_levels():
    """Patterns: standard centered column → asymmetric grid → broken/editorial."""
    def centered(eff, scope):
        s = _scope_style(eff, ["--space-4", "--color-surface", "--color-surface-alt",
                               "--color-text", "--radius-md", "--font-sans"])
        return f"""<style>
.{scope} {{ {s} font-family:var(--font-sans); background:var(--color-surface-alt); padding:var(--space-4); }}
.{scope}-col {{ max-width:60%; margin:0 auto; background:var(--color-surface);
  color:var(--color-text); padding:var(--space-4); border-radius:var(--radius-md); }}
</style><div class="{scope}"><div class="{scope}-col"><h4 style="margin:0">Centered column</h4>
<p>Symmetric, predictable, the safe default reading layout.</p></div></div>"""

    def asymmetric(eff, scope):
        s = _scope_style(eff, ["--space-3", "--space-4", "--color-surface",
                               "--color-surface-alt", "--color-accent", "--color-text",
                               "--radius-md", "--font-sans"])
        return f"""<style>
.{scope} {{ {s} font-family:var(--font-sans); display:grid;
  grid-template-columns:2fr 1fr; gap:var(--space-3); background:var(--color-surface-alt);
  padding:var(--space-4); }}
.{scope} .a {{ background:var(--color-surface); color:var(--color-text); padding:var(--space-4); border-radius:var(--radius-md); }}
.{scope} .b {{ background:var(--color-accent); color:#fff; padding:var(--space-4); border-radius:var(--radius-md); }}
</style><div class="{scope}"><div class="a"><h4 style="margin:0">Lead</h4><p>Weighted, intentional asymmetry.</p></div>
<div class="b">Sidebar</div></div>"""

    def broken(eff, scope):
        s = _scope_style(eff, ["--space-3", "--color-surface", "--color-accent",
                               "--color-text", "--font-sans"])
        return f"""<style>
.{scope} {{ {s} font-family:var(--font-sans); position:relative; height:200px; background:#111; color:#fff; overflow:hidden; }}
.{scope} .h {{ position:absolute; top:10px; left:8px; font-size:2.4rem; font-weight:800;
  line-height:.9; transform:rotate(-4deg); }}
.{scope} .p {{ position:absolute; right:10px; bottom:14px; max-width:45%; text-align:right; }}
.{scope} .bar {{ position:absolute; left:0; top:55%; width:100%; height:14px; background:var(--color-accent); transform:rotate(-3deg); }}
</style><div class="{scope}"><div class="bar"></div><div class="h">BROKEN<br>EDITORIAL</div>
<div class="p">Rules deliberately broken — overlap, rotation, off-grid type.</div></div>"""

    return [
        (1, "Standard centered column", {}, centered),
        (2, "Asymmetric grid", {}, asymmetric),
        (3, "Broken / editorial layout", {}, broken),
    ]


# Seed library: dimension -> (prompt, builder, default-levels-to-emit).
#
# These are GENERIC starting examples used only by the --dimension fallback. The
# orchestrator should prefer --spec with variants reasoned from the user's north
# star (see module docstring). Do not treat any seed's experimental rung as the
# canonical answer — vary it per session.
DIMENSIONS = {
    "color":      ("Which colour approach feels like you?", _color_levels, [1, 3, 5]),
    "typography": ("Which type system feels like you?",     _typography_levels, [1, 3, 5]),
    "spacing":    ("How much room should the layout breathe?", _spacing_levels, [1, 2, 3]),
    "shape":      ("What is your corner & shape language?",  _shape_levels, [1, 2, 3]),
    "elevation":  ("How much depth should surfaces have?",   _elevation_levels, [1, 2, 3]),
    "motion":     ("How alive should motion feel?",          _motion_levels, [1, 3, 5]),
    "imagery":    ("How should images be presented?",        _imagery_levels, [1, 2, 3, 4, 5]),
    "components": ("How distinctive should components be?",   _components_levels, [1, 3, 5]),
    "patterns":   ("How conventional should layouts be?",    _patterns_levels, [1, 2, 3]),
}


# ---------------------------------------------------------------------------
# Build the question object
# ---------------------------------------------------------------------------


def build_question(dimension: str, tokens_path: str,
                   levels: list[int] | None = None,
                   baseline: int | None = None) -> dict:
    if dimension not in DIMENSIONS:
        raise ValueError(
            f"Unknown dimension '{dimension}'. Known: {', '.join(sorted(DIMENSIONS))}"
        )
    prompt, builder, default_levels = DIMENSIONS[dimension]
    base_tokens = tokens_lib.parse_tokens_css(tokens_path)
    ladder = builder()

    # Index the ladder by level for selection.
    by_level = {item[0]: item for item in ladder}

    # Decide which levels to emit: explicit --levels wins; else if a baseline is
    # given, center a window of 3 around it; else the dimension's default set.
    if levels:
        chosen = [lv for lv in levels if lv in by_level]
    elif baseline is not None:
        chosen = _window_around(sorted(by_level), baseline)
    else:
        chosen = [lv for lv in default_levels if lv in by_level]
    if not chosen:
        chosen = [item[0] for item in ladder]

    variants = []
    for lv in chosen:
        item = by_level[lv]
        level, name, delta = item[0], item[1], item[2]
        preview_builder = item[3]
        sandbox = item[4] if len(item) > 4 else False
        effective = _effective(base_tokens, delta)
        scope = f"sp-{dimension}-{level}"
        preview_html = preview_builder(effective, scope)
        variant = {
            "level": level,
            "name": name,
            "previewHtml": preview_html,
            "tokens": delta,
            "caption": _caption_from_delta(base_tokens, delta),
        }
        if sandbox:
            variant["sandbox"] = True
        variants.append(variant)

    return {
        "id": f"{dimension}-spectrum",
        "type": "safeness-spectrum",
        "prompt": prompt,
        "dimension": dimension,
        "variants": variants,
    }


def _inline_all_tokens(effective: dict) -> str:
    """Serialize every effective token as inline custom properties.

    Set on a wrapper element so any ``var(--anything)`` the orchestrator used in
    its sampleHtml resolves, making the snippet fully self-contained.
    """
    return "".join(f"{k}:{v};" for k, v in effective.items())


def build_question_from_spec(spec: dict, tokens_path: str) -> dict:
    """Render orchestrator-authored variants live against the current tokens.

    This is the preferred path: the divergent, north-star-specific ideas come
    from the caller; we only bake effective token values so each sample renders
    standalone. A variant may supply ``sampleHtml`` (written with var(--token)
    references); if it omits it, we fall back to the dimension's seed preview for
    the nearest level so the spectrum is never empty.
    """
    dimension = spec.get("dimension", "custom")
    prompt = spec.get("prompt") or f"Which {dimension} approach feels like you?"
    base_tokens = tokens_lib.parse_tokens_css(tokens_path)

    seed = DIMENSIONS.get(dimension)
    seed_by_level = {}
    if seed:
        seed_by_level = {item[0]: item for item in seed[1]()}

    variants = []
    for raw in spec.get("variants", []):
        level = raw.get("level")
        delta = raw.get("tokens", {}) or {}
        effective = _effective(base_tokens, delta)
        sample = raw.get("sampleHtml")
        if sample:
            scope = f"sp-{dimension}-{level}"
            preview_html = (
                f'<div class="{scope}-wrap" style="{_inline_all_tokens(effective)}'
                f'background:var(--color-bg);color:var(--color-text);'
                f'font-family:var(--font-sans);padding:var(--space-5);">{sample}</div>'
            )
        elif level in seed_by_level:
            # Graceful fallback to the seed preview for this rung.
            preview_html = seed_by_level[level][3](effective, f"sp-{dimension}-{level}")
        else:
            preview_html = (
                f'<div style="{_inline_all_tokens(effective)}padding:var(--space-5);'
                f'background:var(--color-surface);color:var(--color-text);">'
                f'<em>(no sample provided for level {level})</em></div>'
            )
        variant = {
            "level": level,
            "name": raw.get("name", f"Level {level}"),
            "previewHtml": preview_html,
            "tokens": delta,
            # Prefer an author-written caption/summary; else derive it from the delta
            # so the rung is always labelled with its exact change.
            "caption": raw.get("caption") or raw.get("summary") or _caption_from_delta(base_tokens, delta),
        }
        if raw.get("sandbox"):
            variant["sandbox"] = True
        if raw.get("summary"):
            variant["summary"] = raw["summary"]
        variants.append(variant)

    return {
        "id": f"{dimension}-spectrum",
        "type": "safeness-spectrum",
        "prompt": prompt,
        "dimension": dimension,
        "variants": variants,
    }


def _window_around(sorted_levels: list[int], baseline: int, width: int = 3) -> list[int]:
    """Pick a window of `width` levels centered on (the nearest level to) baseline."""
    if not sorted_levels:
        return []
    # nearest available level to the requested baseline
    center = min(sorted_levels, key=lambda lv: abs(lv - baseline))
    idx = sorted_levels.index(center)
    half = width // 2
    start = max(0, min(idx - half, len(sorted_levels) - width))
    return sorted_levels[start:start + width]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_levels(raw: str | None) -> list[int] | None:
    if not raw:
        return None
    return [int(x) for x in raw.split(",") if x.strip()]


def _main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description="Render N live variants for a design dimension.")
    p.add_argument("--spec", default=None,
                   help="orchestrator-authored variants JSON (PREFERRED — see docstring)")
    p.add_argument("--dimension", default=None, choices=sorted(DIMENSIONS),
                   help="built-in seed ladder to use when --spec is not given")
    p.add_argument("--tokens", required=True, help="path to tokens.css")
    p.add_argument("--out", required=True, help="path to write the question JSON")
    p.add_argument("--levels", default=None, help="comma list of levels to emit, e.g. 1,3,5")
    p.add_argument("--baseline", type=int, default=None,
                   help="center the spectrum around this per-dimension safeness level")
    args = p.parse_args(argv)

    if not args.spec and not args.dimension:
        p.error("provide either --spec (preferred) or --dimension")

    if args.spec:
        spec = json.loads(Path(args.spec).read_text(encoding="utf-8"))
        question = build_question_from_spec(spec, args.tokens)
        source = "spec"
    else:
        question = build_question(
            args.dimension, args.tokens,
            levels=_parse_levels(args.levels), baseline=args.baseline,
        )
        source = "seed"

    Path(args.out).write_text(json.dumps(question, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "wrote": args.out,
        "source": source,
        "dimension": question["dimension"],
        "variants": [v["level"] for v in question["variants"]],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
