"""tokens.html — every token visualized straight from tokens.css.

Each token section gets a renderer suited to its kind (swatches for color, live
specimens for type, bars for spacing, …) so the page is a true visual readout of
the source of truth, not a restatement of it.
"""

from __future__ import annotations

from pathlib import Path

import tokens_lib

from dashboard.render import _esc, _page_shell


def page_tokens(root: Path, brief: dict, tokens: dict) -> str:
    sections = []
    for sec in tokens_lib.TOKEN_SECTIONS:
        name = sec["section"]
        present = [(v, val, t, p) for (v, _d, t, p) in sec["tokens"]
                   if v in tokens for val in [tokens[v]]]
        if not present:
            continue
        sections.append(f'<section class="stack"><h2>{_esc(name)}</h2>'
                         + _token_section_body(name, present, tokens) + "</section>")
    body = f"""
<section class="stack">
  <span class="eyebrow">Foundations</span>
  <h1>Tokens</h1>
  <p class="muted">Every value visualized directly from <code>css/tokens.css</code>, so this page always matches the source of truth.</p>
</section>
{''.join(sections)}
"""
    return _page_shell("Tokens", "Tokens", body, from_root=False)


def _token_section_body(name: str, present: list, tokens: dict) -> str:
    if name == "Color":
        return _swatches(present)
    if name == "Typography":
        return _type_specimens(present, tokens)
    if name == "Spacing & scale":
        return _spacing_bars(present)
    if name == "Shape & borders":
        return _radii_samples(present)
    if name == "Elevation & depth":
        return _shadow_samples(present)
    if name == "Motion":
        return _motion_table(present)
    return _generic_table(present)


def _swatches(present) -> str:
    cards = []
    for var, val, _t, _p in present:
        cards.append(
            f'<div class="swatch"><div class="swatch__chip" style="background:{_esc(val)}"></div>'
            f'<div class="swatch__meta"><strong>{_esc(var)}</strong><code>{_esc(val)}</code></div></div>'
        )
    return '<div class="grid-auto">' + "".join(cards) + "</div>"


def _type_specimens(present, tokens) -> str:
    rows = []
    # font families
    for var, val, t, _p in present:
        if t == "fontFamily":
            rows.append(
                f'<div class="specimen"><div class="specimen__label">{_esc(var)}: {_esc(val)}</div>'
                f'<div style="font-family:{_esc(val)};font-size:var(--text-2xl)">The quick brown fox</div></div>'
            )
    # size scale specimens
    for var, val, t, _p in present:
        if var.startswith("--text-") and var not in ("--text-scale-ratio",):
            rows.append(
                f'<div class="specimen"><div class="specimen__label">{_esc(var)} = {_esc(val)}</div>'
                f'<div style="font-size:{_esc(val)};font-family:var(--font-display)">Specimen text</div></div>'
            )
    return "".join(rows) + _generic_table(
        [p for p in present if p[2] not in ("fontFamily",) and not p[0].startswith("--text-")]
    )


def _spacing_bars(present) -> str:
    rows = []
    for var, val, _t, _p in present:
        rows.append(
            f'<div class="specimen"><div class="specimen__label">{_esc(var)} = {_esc(val)}</div>'
            f'<div class="space-bar" style="width:{_esc(val)}"></div></div>'
        )
    return "".join(rows)


def _radii_samples(present) -> str:
    cards = []
    for var, val, t, _p in present:
        if var.startswith("--radius"):
            cards.append(
                f'<div class="swatch"><div class="swatch__chip" '
                f'style="background:var(--color-accent);border-radius:{_esc(val)};margin:8px"></div>'
                f'<div class="swatch__meta"><strong>{_esc(var)}</strong><code>{_esc(val)}</code></div></div>'
            )
    table = _generic_table([p for p in present if not p[0].startswith("--radius")])
    return '<div class="grid-auto">' + "".join(cards) + "</div>" + table


def _shadow_samples(present) -> str:
    cards = []
    for var, val, t, _p in present:
        if var.startswith("--shadow"):
            cards.append(
                f'<div class="card" style="box-shadow:{_esc(val)}">'
                f'<div class="card__title">{_esc(var)}</div>'
                f'<div class="card__body"><code>{_esc(val)}</code></div></div>'
            )
    table = _generic_table([p for p in present if not p[0].startswith("--shadow")])
    return '<div class="grid-auto">' + "".join(cards) + "</div>" + table


def _motion_table(present) -> str:
    return _generic_table(present)


def _generic_table(present) -> str:
    if not present:
        return ""
    rows = "".join(
        f"<tr><td><code>{_esc(var)}</code></td><td>{_esc(val)}</td></tr>"
        for var, val, _t, _p in present
    )
    return ('<table class="table"><thead><tr><th>Token</th><th>Value</th></tr></thead>'
            f'<tbody>{rows}</tbody></table>')
