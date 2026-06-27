"""Shared HTML primitives for the generated dashboard pages.

Every page is assembled from the same head/nav/shell so they stay visually
consistent and link only the three local stylesheets with relative paths
(offline-safe, portable). These helpers are the package-internal rendering API
the page modules build on.
"""

from __future__ import annotations

import html

# The dimensions of the design language, in canonical order — used by the
# overview progress table and the contract's per-dimension rules.
DIMENSIONS = [
    "color", "typography", "spacing", "shape", "elevation",
    "motion", "imagery", "components", "patterns", "voice",
]

# Nav links shared by every page. Paths are written for the pages/ subdirectory;
# `_nav_html(from_root=True)` rewrites them for index.html at the root.
NAV = [
    ("../index.html", "Overview"),
    ("moodboard.html", "Moodboard"),
    ("tokens.html", "Tokens"),
    ("components.html", "Components"),
    ("patterns.html", "Patterns"),
    ("motion.html", "Motion"),
    ("imagery.html", "Imagery"),
    ("voice.html", "Voice"),
    ("compare.html", "Compare"),
]


def _esc(text) -> str:
    return html.escape(str(text)) if text is not None else ""


def _nav_html(active: str, *, from_root: bool) -> str:
    """Render the shared nav. `active` is a label; paths adjust for depth."""
    items = []
    for href, label in NAV:
        h = href
        if from_root:
            # index.html sits at root: pages are under pages/, overview is self
            if label == "Overview":
                h = "index.html"
            else:
                h = f"pages/{href}"
        cur = ' aria-current="page"' if label == active else ""
        items.append(f'<a href="{h}"{cur}>{_esc(label)}</a>')
    return '<nav class="nav">' + "".join(items) + "</nav>"


def _head(title: str, *, from_root: bool) -> str:
    """Document head linking ONLY the three local stylesheets (relative)."""
    prefix = "" if from_root else "../"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_esc(title)}</title>
<link rel="stylesheet" href="{prefix}css/tokens.css">
<link rel="stylesheet" href="{prefix}css/base.css">
<link rel="stylesheet" href="{prefix}css/components.css">
</head>"""


def _page_shell(title: str, active: str, body: str, *, from_root: bool) -> str:
    """Wrap body content in the standard header/footer shell."""
    nav = _nav_html(active, from_root=from_root)
    head = _head(title, from_root=from_root)
    return f"""{head}
<body>
<header class="page-header">
  <div class="container">
    <span class="eyebrow">Design language</span>
    {nav}
  </div>
</header>
<main class="container stack-lg" style="padding-block: var(--space-7)">
{body}
</main>
<footer class="page-footer">
  <div class="container">Generated from <code>css/tokens.css</code> — hand-edit that file and re-run <code>assemble_dashboard.py</code>.</div>
</footer>
</body>
</html>
"""


def _list_items(items, key=None) -> str:
    """Render a <ul> from a list of strings or dicts (pick `key` from dicts)."""
    if not items:
        return '<p class="muted">— none recorded yet —</p>'
    lis = []
    for it in items:
        val = it.get(key, "") if (key and isinstance(it, dict)) else it
        lis.append(f"<li>{_esc(val)}</li>")
    return "<ul>" + "".join(lis) + "</ul>"
