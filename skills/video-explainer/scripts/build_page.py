#!/usr/bin/env python3
"""Assemble the explainer page: template stylesheet + your body (+ custom CSS).

Write the page content as body.html (everything that goes inside <body>,
normally a single <main class="page">…</main>) and any page-specific CSS as
custom.css, then:

    python build_page.py --body work/body.html [--css work/custom.css] -o work/page.html

Re-run after every edit; the template itself is never modified. The <title> is
taken from --title or from the first <h1>. Warnings are printed for unbalanced
tags, leftover {{placeholders}}, and <svg>/<canvas>/<script> (diagrams should
be HTML + CSS).
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "template.html"
CSS_MARKER = "/* ---- page-specific CSS (custom diagrams) goes below this line ---- */"
TRACKED = {"div", "section", "figure", "main", "nav", "aside", "ul", "ol", "dl", "blockquote",
           "header", "footer", "figcaption", "p", "span", "a", "b", "strong", "em", "h1", "h2", "h3", "h4"}


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
                    if t != "p":  # <p> may legally be left open
                        self.problems.append(f"<{t}> opened on line {line} is not closed before </{tag}> (line {self.getpos()[0]})")
                del self.stack[i:]
                return
        self.problems.append(f"stray </{tag}> on line {self.getpos()[0]}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--body", required=True, help="HTML for inside <body>")
    ap.add_argument("--css", help="page-specific CSS (custom diagrams)")
    ap.add_argument("--title", help="page <title> (default: first <h1> + ' — explained')")
    ap.add_argument("-o", "--output", required=True)
    args = ap.parse_args()

    tpl = TEMPLATE.read_text(encoding="utf-8")
    body = Path(args.body).read_text(encoding="utf-8").strip()
    css = Path(args.css).read_text(encoding="utf-8").strip() if args.css else ""
    if "<main" not in body:
        body = f'<main class="page">\n{body}\n</main>'

    title = args.title
    if not title:
        m = re.search(r"<h1\b[^>]*>(.*?)</h1>", body, re.S | re.I)
        title = (html.unescape(re.sub(r"<[^>]+>|\s+", " ", m.group(1))).strip() + " — explained") if m else "Video explainer"

    head, _, rest = tpl.partition("<body>")
    head = re.sub(r"<title>.*?</title>", f"<title>{html.escape(title)}</title>", head, count=1, flags=re.S)
    if css:
        if CSS_MARKER not in head:
            raise SystemExit("template is missing the page-specific CSS marker")
        head = head.replace(CSS_MARKER, f"{CSS_MARKER}\n{css}\n", 1)
    page = f"{head}<body>\n{body}\n</body>\n</html>\n"

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding="utf-8")

    warnings = []
    checker = Balance()
    checker.feed(body)
    checker.close()
    warnings += checker.problems[:10]
    warnings += [f"<{t}> still open at end of body" for t, _ in checker.stack if t != "p"][:5]
    for tag in ("svg", "canvas", "script"):
        if re.search(rf"<{tag}\b", body, re.I):
            warnings.append(f"<{tag}> found - diagrams should be HTML + CSS only")
    for ph in sorted(set(re.findall(r"\{\{[^}]{0,60}\}\}", body)))[:5]:
        warnings.append(f"placeholder left in page: {ph}")

    n_fig = len(re.findall(r'<figure\b[^>]*class="[^"]*\bdiagram\b', body))
    n_img = len(re.findall(r"<img\b", body))
    print(f"[build] {out} ({out.stat().st_size / 1024:.0f} KB) - title: {title!r}; "
          f"{n_fig} diagram figure(s), {n_img} image(s), {len(css.splitlines())} line(s) of custom CSS")
    for w in warnings:
        print(f"[build] WARNING {w}")
    return 1 if warnings else 0


if __name__ == "__main__":
    raise SystemExit(main())
