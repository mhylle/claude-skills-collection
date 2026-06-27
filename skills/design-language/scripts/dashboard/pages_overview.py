"""Brief-driven pages: the parent dashboard, the moodboard, and voice.

These three read directly from brief.json — identity, north star, progress, and
the committed voice decision — rather than from tokens, so they show *intent*
alongside the token-driven pages.
"""

from __future__ import annotations

from pathlib import Path

from dashboard.brief import lang_name
from dashboard.render import DIMENSIONS, NAV, _esc, _list_items, _page_shell


# ---------------------------------------------------------------------------
# index.html — parent dashboard (identity + nav + progress)
# ---------------------------------------------------------------------------


def page_index(root: Path, brief: dict, tokens: dict) -> str:
    north = brief.get("northStar", {})
    adjectives = north.get("adjectives", [])
    decisions = brief.get("decisions", {})
    completed = set(brief.get("meta", {}).get("completedDimensions", []))

    adj_html = (
        " ".join(f'<span class="badge badge--accent">{_esc(a)}</span>' for a in adjectives)
        if adjectives else '<span class="muted">north-star adjectives not set yet</span>'
    )

    # Progress table: every dimension, done?/committed safeness level.
    rows = []
    for dim in DIMENSIONS:
        done = dim in completed
        dec = decisions.get(dim, {})
        level = dec.get("safeness", dec.get("chosenLevel"))
        status = ('<span class="badge badge--success">done</span>' if done
                  else '<span class="badge">pending</span>')
        lvl_txt = f"{level}/5" if level is not None else "—"
        rows.append(
            f"<tr><td>{_esc(dim)}</td><td>{status}</td><td>{_esc(lvl_txt)}</td></tr>"
        )
    progress = (
        '<table class="table"><thead><tr><th>Dimension</th><th>Status</th>'
        '<th>Intended safeness</th></tr></thead><tbody>'
        + "".join(rows) + "</tbody></table>"
    )
    n_done = len(completed)

    body = f"""
<section class="stack">
  <span class="eyebrow">Identity</span>
  <h1>{_esc(lang_name(brief))}</h1>
  <div class="cluster">{adj_html}</div>
  <p class="muted">A reusable visual design language, deliberately its own — not the default assistant look.
  Every page below is regenerated from <code>css/tokens.css</code>.</p>
</section>

<section class="stack">
  <h2>Progress</h2>
  <p class="muted">{n_done} of {len(DIMENSIONS)} dimensions committed.</p>
  {progress}
</section>

<section class="stack">
  <h2>Explore the language</h2>
  <div class="grid-auto">
    {''.join(_index_card(href, label) for href, label in NAV if label != 'Overview')}
  </div>
</section>
"""
    return _page_shell(lang_name(brief), "Overview", body, from_root=True)


def _index_card(href: str, label: str) -> str:
    return (
        f'<a class="card card--interactive" href="pages/{href}" '
        f'style="text-decoration:none;color:inherit">'
        f'<div class="card__title">{_esc(label)}</div>'
        f'<div class="card__body">Open the {_esc(label.lower())} page.</div></a>'
    )


# ---------------------------------------------------------------------------
# moodboard.html — north star
# ---------------------------------------------------------------------------


def page_moodboard(root: Path, brief: dict, tokens: dict) -> str:
    north = brief.get("northStar", {})
    body = f"""
<section class="stack">
  <span class="eyebrow">North star</span>
  <h1>Moodboard</h1>
  <p class="muted">The taste, intent and hard limits that govern every decision.</p>
</section>

<section class="stack">
  <h2>Adjectives</h2>
  <div class="cluster">
    {''.join(f'<span class="badge badge--accent">{_esc(a)}</span>' for a in north.get('adjectives', [])) or '<span class="muted">— not set —</span>'}
  </div>
</section>

<section class="stack"><h2>Use cases</h2>{_list_items(north.get('useCases', []))}</section>

<section class="stack">
  <h2>References (what to lean toward)</h2>
  {_refs_html(north.get('references', []))}
</section>

<section class="stack">
  <h2>Anti-references (what to avoid)</h2>
  {_antirefs_html(north.get('antiReferences', []))}
</section>

<section class="stack"><h2>Hard constraints</h2>{_list_items(north.get('hardConstraints', []))}</section>
"""
    return _page_shell("Moodboard", "Moodboard", body, from_root=False)


def _refs_html(refs) -> str:
    if not refs:
        return '<p class="muted">— none recorded yet —</p>'
    cards = []
    for r in refs:
        src = r.get("source", "")
        like = r.get("whatILike", "")
        cards.append(
            f'<div class="card"><div class="card__title">{_esc(src) or "Reference"}</div>'
            f'<div class="card__body">{_esc(like)}</div></div>'
        )
    return '<div class="grid-auto">' + "".join(cards) + "</div>"


def _antirefs_html(refs) -> str:
    if not refs:
        return '<p class="muted">— none recorded yet —</p>'
    cards = []
    for r in refs:
        what = r.get("what", "")
        why = r.get("why", "")
        cards.append(
            f'<div class="card" style="border-left:4px solid var(--color-danger)">'
            f'<div class="card__title">{_esc(what)}</div>'
            f'<div class="card__body">{_esc(why)}</div></div>'
        )
    return '<div class="grid-auto">' + "".join(cards) + "</div>"


# ---------------------------------------------------------------------------
# voice.html — content principles / microcopy do & don't
# ---------------------------------------------------------------------------


def page_voice(root: Path, brief: dict, tokens: dict) -> str:
    voice = brief.get("decisions", {}).get("voice", {})
    principles = voice.get("principles", [])
    dos = voice.get("do", [])
    donts = voice.get("dont", [])
    rationale = voice.get("rationale", "")
    body = f"""
<section class="stack">
  <span class="eyebrow">Voice &amp; tone</span>
  <h1>Voice</h1>
  <p class="muted">Content principles and microcopy rules. {_esc(rationale)}</p>
</section>

<section class="stack"><h2>Principles</h2>{_list_items(principles)}</section>

<section class="stack">
  <h2>Do &amp; don't</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
    <div class="card" style="border-left:4px solid var(--color-success)">
      <div class="card__title">Do</div>{_list_items(dos)}</div>
    <div class="card" style="border-left:4px solid var(--color-danger)">
      <div class="card__title">Don't</div>{_list_items(donts)}</div>
  </div>
</section>
"""
    return _page_shell("Voice", "Voice", body, from_root=False)
