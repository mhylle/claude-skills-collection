#!/usr/bin/env python3
"""Assemble a visual-explainer page and check it against the skill's rules.

Write the pages as body.html (the <section class="page"> elements, nothing
else) and any page-specific CSS as custom.css, then:

    python build_page.py --body work/body.html --topic "Sign in with Google" \
        [--mode full] [--css work/custom.css] -o work/page.html

Re-run after every edit; the template is never modified. The script:
  * drops the body into assets/template.html, builds the top navigation from the
    pages' data-title attributes, and adds the reveal class to figures;
  * inlines every icon you reference as <use href="#i-NAME"/> (from assets/icons)
    and every local <img>, so the output is one self-contained file;
  * checks the writing and structure rules: abbreviations spelled out at first
    use, three takeaways, at most five sections on "How it works", a figure and a
    quick check in every section, full-mode components only in full mode,
    long sentences, unbalanced tags, missing alt text, leftover placeholders.
Exit code 1 on errors (missing icon or image, broken structure); warnings are
printed but do not fail unless --strict is given.
"""
from __future__ import annotations

import argparse
import base64
import difflib
import html
import mimetypes
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SKILL = Path(__file__).resolve().parent.parent
TEMPLATE = SKILL / "assets" / "template.html"
ICONS = SKILL / "assets" / "icons"
KNOWN_PAGES = ["short", "how", "show", "deep"]
FULL_ONLY = ["x-predict", "x-whatif", "x-order", "x-explore", "x-scrolly", "x-exploded", "x-zoom"]
TRACKED = {"div", "section", "figure", "main", "nav", "aside", "ul", "ol", "dl", "header", "footer",
           "figcaption", "p", "span", "a", "b", "strong", "em", "h1", "h2", "h3", "h4", "details", "summary",
           "table", "button", "label"}
MAX_IMAGE = 1_500_000
FILLER = r"\b(?:simply|just|obviously|clearly|seamless(?:ly)?|powerful|robust|leverage[sd]?|utili[sz]e[sd]?|cutting-edge|game-chang\w*)\b"
# a class attribute holding the whole token qc, x-order or x-predict (not qc-label and friends)
QUICK_CHECK = r'class="(?:[^"]*\s)?(?:qc|x-order|x-predict)(?:\s[^"]*)?"'
ROMAN = {"II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII"}


class Balance(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.stack: list[tuple[str, int]] = []
        self.problems: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in TRACKED:
            self.stack.append((tag, self.getpos()[0]))

    def handle_endtag(self, tag):
        if tag not in TRACKED:
            return
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for t, line in self.stack[i + 1:]:
                    if t != "p":
                        self.problems.append(f"<{t}> opened on line {line} is not closed before </{tag}> (line {self.getpos()[0]})")
                del self.stack[i:]
                return
        self.problems.append(f"stray </{tag}> on line {self.getpos()[0]}")


class Text(HTMLParser):
    """Visible prose in document order. Skips code, terminals, svg, script and style."""
    SKIP = {"script", "style", "svg", "code", "pre", "kbd", "template"}
    SKIP_CLASSES = {"ui-terminal"}
    VOID = {"br", "img", "input", "hr", "meta", "link", "source", "wbr", "use", "path", "circle", "rect", "line", "polyline"}

    def __init__(self) -> None:
        super().__init__()
        self.depth = 0          # > 0 while inside something skipped; counts nested open tags
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if self.depth:
            if tag not in self.VOID:
                self.depth += 1
            return
        classes = set((dict(attrs).get("class") or "").split())
        if tag in self.SKIP or classes & self.SKIP_CLASSES:
            self.depth = 1
        elif tag in ("p", "li", "h1", "h2", "h3", "h4", "dt", "dd", "td", "th", "div", "figcaption", "summary", "br",
                     "button", "small", "label"):
            self.parts.append("\n")
        elif tag == "span":
            self.parts.append(" ")  # neighbouring labels and values must not run together

    def handle_startendtag(self, tag, attrs):
        if not self.depth:      # <use/>, <br/>: open and close at once, so nothing to count
            self.handle_starttag(tag, attrs)
            if self.depth == 1 and tag in self.SKIP:
                self.depth = 0

    def handle_endtag(self, tag):
        if self.depth:
            self.depth -= 1
            return
        if tag in ("small", "button", "label", "b", "strong"):
            self.parts.append("\n" if tag in ("small", "button", "label") else " ")
        elif tag == "span":
            self.parts.append(" ")

    def handle_data(self, data):
        if not self.depth:
            self.parts.append(data)


def visible_text(fragment: str) -> str:
    t = Text()
    t.feed(fragment)
    t.close()
    return html.unescape("".join(t.parts))


def split_pages(body: str) -> list[tuple[str, str, str]]:
    """[(id, title, html)] for each top-level <section class="page">."""
    starts = [m for m in re.finditer(r'<section\b[^>]*\bclass="[^"]*\bpage\b[^"]*"[^>]*>', body)]
    out = []
    for n, m in enumerate(starts):
        tag = m.group(0)
        pid = (re.search(r'\bid="([^"]+)"', tag) or [None, ""])[1]
        title = (re.search(r'\bdata-title="([^"]+)"', tag) or [None, ""])[1]
        end = starts[n + 1].start() if n + 1 < len(starts) else len(body)
        out.append((pid, title, body[m.start():end]))
    return out


def ensure_class(body: str, selector_class: str, add: str) -> str:
    def fix(m: re.Match) -> str:
        classes = m.group(2).split()
        if selector_class in classes and add not in classes:
            classes.append(add)
        return f'{m.group(1)}class="{" ".join(classes)}"'
    return re.sub(r'(<[a-z]+\b[^>]*?\s)class="([^"]*)"', fix, body)


def real_numbers(body: str) -> str:
    """Put the final value inside every empty .count, so screen readers and copy-paste get it."""
    pat = re.compile(r'(<span\b[^>]*\bclass="(?:[^"]*\s)?count(?:\s[^"]*)?"[^>]*\bstyle="[^"]*--to:\s*(-?\d+)[^"]*"[^>]*>)\s*(</span>)')
    return pat.sub(lambda m: f'{m.group(1)}<span class="count-n">{m.group(2)}</span>{m.group(3)}', body)


def label_table_cells(body: str) -> str:
    """Give each <td> a data-label from its column heading, so tables can stack on phones."""
    def one_table(m: re.Match) -> str:
        table = m.group(0)
        head = re.search(r"<thead\b.*?</thead>", table, re.S | re.I)
        if not head:
            return table
        labels = [html.unescape(re.sub(r"<[^>]+>|\s+", " ", h)).strip() for h in re.findall(r"<th\b[^>]*>(.*?)</th>", head.group(0), re.S | re.I)]

        def one_row(r: re.Match) -> str:
            n = -1

            def one_cell(c: re.Match) -> str:
                nonlocal n
                n += 1
                if "data-label" in c.group(0) or n >= len(labels) or not labels[n]:
                    return c.group(0)
                return f'<td{c.group(1) or ""} data-label="{html.escape(labels[n], quote=True)}">'
            return re.sub(r"<td(\s[^>]*)?>", one_cell, r.group(0))
        rest = table[head.end():]
        return table[:head.end()] + re.sub(r"<tr\b.*?</tr>", one_row, rest, flags=re.S | re.I)
    return re.sub(r"<table\b.*?</table>", one_table, body, flags=re.S | re.I)


def check_abbreviations(text: str) -> list[str]:
    problems, seen = [], set()
    for m in re.finditer(r"\b([A-Z][A-Z0-9&]{1,7})(s?)\b", text):
        abbr = m.group(1)
        if abbr in seen or abbr in ROMAN:
            continue
        seen.add(abbr)
        before = text[max(0, m.start() - 4):m.start()]
        after = text[m.end():m.end() + 5]
        defined_inline = bool(re.search(r"\(\s*$", before) or re.match(r"\s*\(", after))
        if not defined_inline:
            ctx = text[max(0, m.start() - 40):m.end() + 30].replace("\n", " ").strip()
            problems.append(f'"{abbr}" first appears without being spelled out: …{ctx}…  '
                            f'(write it as "Full words ({abbr})" the first time)')
    return problems


def long_sentences(text: str, limit: int = 28) -> list[str]:
    out = []
    for sent in re.split(r"(?<=[.!?])\s+|\n+", text):
        words = sent.split()
        if len(words) > limit:
            out.append(f"{len(words)} words: {' '.join(words[:12])}…")
    return out


def build_sprite(names: set[str]) -> tuple[str, list[str]]:
    available = {p.stem for p in ICONS.glob("*.svg")}
    symbols, errors = [], []
    for name in sorted(names):
        f = ICONS / f"{name}.svg"
        if not f.exists():
            near = difflib.get_close_matches(name, available, n=4, cutoff=0.5)
            errors.append(f'icon "{name}" is not in assets/icons' + (f" (did you mean: {', '.join(near)}?)" if near else ""))
            continue
        text = re.sub(r"<!--.*?-->", "", f.read_text(encoding="utf-8"), flags=re.S)
        inner = re.search(r"<svg[^>]*>(.*)</svg>", text, flags=re.S)
        if not inner or re.search(r"<script|\son\w+=|href", inner.group(1), re.I):
            errors.append(f"icon {name}.svg is not a plain icon")
            continue
        paths = re.sub(r"\s+", " ", inner.group(1)).strip()
        symbols.append(f'<symbol id="i-{name}" viewBox="0 0 24 24">{paths}</symbol>')
    sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">' + "".join(symbols) + "</svg>"
    return sprite, errors


def inline_images(body: str, base: Path) -> tuple[str, list[str], list[str]]:
    errors, warnings = [], []

    def fix(m: re.Match) -> str:
        src = m.group(2)
        if re.match(r"(?i)(https?:|data:|//)", src):
            if src.lower().startswith(("http", "//")):
                warnings.append(f"remote image left as a link (page will need the internet): {src[:80]}")
            return m.group(0)
        f = (base / src).resolve()
        if not f.exists():
            errors.append(f"image not found: {src}")
            return m.group(0)
        data = f.read_bytes()
        if len(data) > MAX_IMAGE:
            warnings.append(f"large image {src} ({len(data) // 1024} KB): crop or resize it")
        mime = mimetypes.guess_type(f.name)[0] or "image/png"
        return f'{m.group(1)}data:{mime};base64,{base64.b64encode(data).decode()}{m.group(3)}'

    body = re.sub(r'(<img\b[^>]*?\ssrc=")([^"]+)(")', fix, body)
    return body, errors, warnings


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--body", required=True, help="the <section class=\"page\"> elements")
    ap.add_argument("--topic", help="short topic name for the top bar (default: the first <h1>)")
    ap.add_argument("--title", help="browser tab title (default: '<topic>, explained')")
    ap.add_argument("--mode", choices=["baseline", "full"], default="baseline")
    ap.add_argument("--tempo", choices=["slow", "normal", "fast"], default="normal",
                    help="default animation pace; readers can change it with the Pace button")
    ap.add_argument("--css", help="page-specific CSS")
    ap.add_argument("--lang", default="en")
    ap.add_argument("--strict", action="store_true", help="treat warnings as errors")
    ap.add_argument("-o", "--output", required=True)
    args = ap.parse_args()

    body_path = Path(args.body).resolve()
    body = body_path.read_text(encoding="utf-8").strip()
    css = Path(args.css).read_text(encoding="utf-8").strip() if args.css else ""
    errors: list[str] = []
    warnings: list[str] = []
    notes: list[str] = []

    pages = split_pages(body)
    if not pages:
        raise SystemExit('body has no <section class="page" id="…" data-title="…"> elements')
    ids = [p[0] for p in pages]
    for pid, title, _ in pages:
        if not pid or not title:
            errors.append(f'every page needs an id and a data-title (found id="{pid}" data-title="{title}")')
        elif pid not in KNOWN_PAGES:
            warnings.append(f'unusual page id "{pid}" (expected one of {", ".join(KNOWN_PAGES)})')
    if ids[:2] != ["short", "how"]:
        warnings.append(f"pages should start with short, how (found: {', '.join(ids)})")
    order = [p for p in KNOWN_PAGES if p in ids]
    if [p for p in ids if p in KNOWN_PAGES] != order:
        warnings.append(f"pages are out of order: {', '.join(ids)} (expected {', '.join(order)})")

    by_id = {p[0]: p[2] for p in pages}
    short = by_id.get("short", "")
    if short:
        if "<h1" not in short:
            errors.append("the short version has no <h1> headline")
        if 'class="dek' not in short:
            warnings.append("the short version has no one-sentence summary (<p class=\"dek\">)")
        tk = re.search(r'<ol\b[^>]*class="[^"]*\btakeaways\b[^"]*"[^>]*>(.*?)</ol>', short, re.S)
        n_tk = len(re.findall(r"<li\b", tk.group(1))) if tk else 0
        if n_tk != 3:
            warnings.append(f"the short version should have exactly 3 takeaways (found {n_tk})")
        if "so-what" not in short:
            warnings.append('the short version has no "What this means for you" box (.so-what)')
    how = by_id.get("how", "")
    if how:
        if 'class="words' not in how:
            warnings.append('"How it works" has no "Words you\'ll meet" strip (.words)')
        sections = re.split(r'(?=<section\b[^>]*class="[^"]*\bsection\b)', how)[1:]
        if len(sections) > 5:
            warnings.append(f'"How it works" has {len(sections)} sections; keep it to 5 and move the rest to the deep dive')
        for n, sec in enumerate(sections, 1):
            h2 = re.search(r"<h2\b[^>]*>(.*?)</h2>", sec, re.S)
            name = re.sub(r"<[^>]+>|\s+", " ", h2.group(1)).strip() if h2 else f"section {n}"
            if "<figure" not in sec and "x-scrolly" not in sec and "x-exploded" not in sec and "x-zoom" not in sec:
                warnings.append(f'section "{name}" has no figure: every section explains one idea with one picture')
            if not re.search(QUICK_CHECK, sec):
                warnings.append(f'section "{name}" has no quick check (.qc, or .x-order / .x-predict in full mode)')
            if h2 and not name.rstrip().endswith("?"):
                notes.append(f'heading "{name}" is not a question (questions pull readers in)')
    if "show" in by_id and 'class="walk' not in by_id["show"] and "x-scrolly" not in by_id["show"]:
        warnings.append('the "Show me" page has no walkthrough (.walk)')
    if args.mode == "baseline":
        used = sorted({c for c in FULL_ONLY if re.search(rf'class="[^"]*\b{c}\b', body)})
        if used:
            warnings.append(f"full-mode components in a baseline page: {', '.join(used)} (use --mode full or remove them)")

    text = visible_text(body)
    warnings += check_abbreviations(text)
    filler = sorted({m.group(0).lower() for m in re.finditer(FILLER, text, re.I)})
    if filler:
        warnings.append(f"filler or hype words (writing.md rule 8): {', '.join(filler)}. Cut them or say something specific")
    raw = sorted(set(re.findall(r"#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(", re.sub(r"/\*.*?\*/", "", css, flags=re.S))))
    if raw:
        warnings.append(f"raw colours in custom CSS ({', '.join(raw[:5])}): use the colour variables (var(--accent), var(--muted), var(--on-accent)…)")
    fixed = [m.group(0).strip() for m in re.finditer(r"\banimation(?:-delay|-duration)?\s*:[^;}]*\d(?:ms|s)\b[^;}]*", re.sub(r"/\*.*?\*/", "", css, flags=re.S))
             if "var(--tempo)" not in m.group(0)]
    plain = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    first_delay = plain.find("animation-delay")
    if first_delay != -1 and re.search(r"\banimation\s*:", plain[first_delay:]):
        warnings.append("custom CSS sets animation-delay and later uses the `animation:` shorthand, which resets the delay "
                        "to 0 (everything appears at once): move the delays last, or use class=\"paced\" (layout.md, Motion)")
    if fixed:
        warnings.append(f"{len(fixed)} custom animation timing(s) ignore the pace, e.g. `{fixed[0][:70]}`: pace labelled items with "
                        "var(--beat), marks with var(--stagger), and multiply by var(--tempo) (layout.md, Motion)")
    ls = long_sentences(text)
    if ls:
        warnings.append(f"{len(ls)} sentence(s) over 28 words; split them:\n           " + "\n           ".join(ls[:5]))
    for m in re.finditer(r"<img\b[^>]*>", body):
        if not re.search(r'\salt="[^"]+"', m.group(0)):
            warnings.append(f"image without alt text: {m.group(0)[:80]}")
    for ph in sorted(set(re.findall(r"\{\{[^}]{0,60}\}\}|\bTODO\b|lorem ipsum", body, re.I)))[:5]:
        errors.append(f"placeholder left in page: {ph}")
    if re.search(r"<script\b", body, re.I):
        warnings.append("<script> in the body: the template already runs every component")
    checker = Balance()
    checker.feed(body)
    checker.close()
    errors += checker.problems[:10]
    errors += [f"<{t}> opened on line {line} is never closed" for t, line in checker.stack if t != "p"][:5]

    for cls in ("fig", "hero-grid", "takeaways"):
        body = ensure_class(body, cls, "fx")
    body = label_table_cells(real_numbers(body))
    body, img_errors, img_warnings = inline_images(body, body_path.parent)
    errors += img_errors
    warnings += img_warnings

    topic = args.topic
    if not topic:
        m = re.search(r"<h1\b[^>]*>(.*?)</h1>", body, re.S)
        topic = re.sub(r"<[^>]+>|\s+", " ", m.group(1)).strip() if m else "Explainer"
    title = args.title or f"{topic}, explained"
    nav = "".join(f'<a href="#{pid}">{html.escape(t)}</a>' for pid, t, _ in pages)

    tpl = TEMPLATE.read_text(encoding="utf-8")
    page = (tpl.replace("{{LANG}}", args.lang).replace("{{MODE}}", args.mode).replace("{{TEMPO}}", args.tempo)
               .replace("{{TITLE}}", html.escape(title)).replace("{{TOPIC}}", html.escape(topic))
               .replace("{{FIRST_PAGE}}", ids[0]).replace("{{NAV}}", nav)
               .replace("/*{{CUSTOM_CSS}}*/", css))
    page = page.replace("{{BODY}}", body)
    names = set(re.findall(r'href="#i-([a-z0-9-]+)"', page)) | set(re.findall(r"icon\('([a-z0-9-]+)'\)", page))
    sprite, icon_errors = build_sprite(names)
    errors += icon_errors
    page = page.replace("{{SPRITE}}", sprite)
    leftover = sorted(set(re.findall(r"\{\{[A-Z_]+\}\}", page)))
    if leftover:
        errors.append(f"template placeholders not filled: {', '.join(leftover)}")

    out = Path(args.output).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding="utf-8")

    n_fig = len(re.findall(r'<figure\b[^>]*class="[^"]*\bfig\b', body))
    n_img = len(re.findall(r"<img\b", body))
    n_qc = len(re.findall(QUICK_CHECK, body))
    print(f"[build] {out} ({out.stat().st_size / 1024:.0f} KB) · mode {args.mode} · pace {args.tempo} · pages: {', '.join(ids)} · "
          f"{n_fig} figure(s), {n_img} image(s), {n_qc} quick check(s), {len(names)} icon(s)")
    for e in errors:
        print(f"[build] ERROR {e}")
    for w in warnings:
        print(f"[build] WARNING {w}")
    for n in notes:
        print(f"[build] note {n}")
    if errors or (args.strict and warnings):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
