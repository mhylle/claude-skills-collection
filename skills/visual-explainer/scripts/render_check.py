#!/usr/bin/env python3
"""Render every page of a visual-explainer file in headless Chrome/Edge, save
screenshots you can Read, and run automatic layout checks.

Usage:
    python render_check.py page.html --out DIR [--pages short how] [--widths 1280 400]
                           [--dark] [--figures] [--motion] [--scale 2] [--slice PX]

Each page (the <section class="page"> elements) is opened on its own through the
URL hash, in its finished state: reduced motion is forced, so every diagram shows
its final frame and players rest on step 1 (--motion renders mid-animation
instead). Pages with walkthroughs are rendered a second time with every player on
its last step (images tagged "-last"), so later screens get checked too.
Writes, per page, width and colour scheme:
    DIR/<w>[-dark]_<page>_NN.png          slices about one screen tall, cut between figures
    DIR/<w>[-dark]_<page>_figNN_<t>.png   with --figures: one image per figure
    DIR/index.txt                         which figures each image shows
Automatic checks: horizontal overflow, text overlapping text inside a figure,
clipped text, broken images. Exit code 1 if problems were found, but the checks
only catch some failures: always Read the images too. Needs ffmpeg for cropping.
Set CHROME_PATH to override browser discovery.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

FIGURES = "figure, .walk-stage, .x-card, .x-scrolly, .x-exploded, .x-zoom, .d-seq"

PROBE_JS = r"""
<script id="__rc_probe">
addEventListener('load', () => setTimeout(() => {
  const de = document.documentElement, vw = de.clientWidth;
  const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const clipsX = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true; } return false; };
  const shown = el => el.getClientRects().length > 0 && !el.closest('[hidden]');
  const overflow = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.id === '__rc_probe' || !shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if ((r.right > vw + 1 || r.left < -1) && !clipsX(el)) {
      const p = el.parentElement, pr = p && p.getBoundingClientRect();
      if (pr && (pr.right > vw + 1 || pr.left < -1) && !clipsX(p)) continue;
      overflow.push(desc(el) + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + 'px, viewport ' + vw + ']');
    }
  }
  const clipped = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!shown(el)) continue;
    const cs = getComputedStyle(el);
    if (/(hidden|clip)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0
        && !el.matches('.shot, .shot-in, .ui, .xz-view, .tabs, .table-wrap, pre, .hero, .msg .lbl, .ui-terminal'))
      clipped.push(desc(el) + ' (content ' + el.scrollWidth + 'px in ' + el.clientWidth + 'px box)');
  }
  const figs = [...document.querySelectorAll(FIGSEL)].filter(f => shown(f) && !f.parentElement.closest(FIGSEL));
  const figLabel = f => {
    const w = f.closest('.walk'), k = w && w.querySelector('.kicker');
    const el = (f.matches('.walk-stage') && k) || f.querySelector('.fig-title > span, .fig-title') || f.querySelector('figcaption, h3, .x-q') || f;
    return ((el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').replace(/Replay$/, '').slice(0, 70)) || 'walkthrough';
  };
  for (const el of document.querySelectorAll('.table-wrap, table, pre.code')) {
    const box = el.matches('table') ? el.parentElement : el;
    if (shown(el) && box && box.scrollWidth > box.clientWidth + 2 && !overflow.some(o => o.startsWith(desc(box))))
      overflow.push(desc(box) + ': content is ' + box.scrollWidth + 'px wide in a ' + box.clientWidth + 'px box (readers must scroll sideways)');
  }
  for (const el of document.querySelectorAll('.ui, .ui-terminal')) {
    if (shown(el) && el.scrollHeight > el.clientHeight + 2)
      overflow.push(desc(el) + ': content is taller than the drawn screen (' + el.scrollHeight + 'px in ' + el.clientHeight + 'px); raise --ui-h or show less');
  }
  const overlaps = [];
  figs.forEach((fig, fi) => {
    const boxes = [];
    const tw = document.createTreeWalker(fig, NodeFilter.SHOW_TEXT,
      { acceptNode: n => n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    for (let n; (n = tw.nextNode());) {
      const pe = n.parentElement, cs = getComputedStyle(pe);
      if (cs.visibility === 'hidden' || +cs.opacity === 0 || !shown(pe) || pe.closest('.ui, .shot, svg')) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      for (const r of range.getClientRects())
        if (r.width > 1 && r.height > 1) boxes.push({ r, el: pe, t: n.textContent.trim().slice(0, 28) });
    }
    for (let i = 0; i < boxes.length && overlaps.length < 12; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 3 && h > 3) { overlaps.push('figure ' + (fi + 1) + ' (' + figLabel(fig).slice(0, 40) + '): "' + a.t + '" overlaps "' + b.t + '"'); break; }
    }
  });
  const brokenImages = [...document.images].filter(i => shown(i) && (!i.complete || !i.naturalWidth)).map(i => (i.getAttribute('alt') || i.src || '').slice(0, 80));
  const figRects = figs.map(f => { const r = f.getBoundingClientRect();
    return [Math.floor(r.top + scrollY), Math.ceil(r.bottom + scrollY), Math.floor(r.left), Math.ceil(r.right)]; });
  const figInfo = figs.map(f => ({ label: figLabel(f) }));
  const height = Math.ceil(Math.max(...[...document.body.children].map(c => c.getBoundingClientRect().bottom + scrollY)));
  parent.postMessage(JSON.stringify({ height, scrollWidth: de.scrollWidth, viewport: vw,
    overflow: overflow.slice(0, 15), clipped: clipped.slice(0, 15), overlaps, brokenImages, figRects, figInfo,
    page: (document.querySelector('.page:not([hidden])') || {}).id || '',
    walks: document.querySelectorAll('.page:not([hidden]) .walk').length,
    dark: matchMedia('(prefers-color-scheme: dark)').matches }), '*');
}, 400));
</script>
""".replace("FIGSEL", json.dumps(FIGURES))

# Headless Chrome will not lay a window out narrower than ~512px, so pages are
# rendered inside an iframe of the exact target width (an iframe has its own
# viewport, so media and container queries behave as on a real phone).
WRAPPER = """<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#888;overflow:hidden">
<iframe src="{src}" style="position:absolute;left:0;top:{top}px;width:{w}px;height:{h}px;border:0" scrolling="no"></iframe>
<script>addEventListener('message', e => {{ const p = document.createElement('pre'); p.id = '__rc';
  p.textContent = e.data; document.body.appendChild(p); }});</script>
</body></html>"""


def find_browser() -> str:
    env = os.environ.get("CHROME_PATH")
    if env and Path(env).exists():
        return env
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]
    for c in candidates:
        if Path(c).exists():
            return c
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "chrome"):
        found = shutil.which(name)
        if found:
            return found
    raise SystemExit("No Chrome/Edge/Chromium found. Set CHROME_PATH to a Chromium-based browser.")


class Renderer:
    def __init__(self, browser: str, page: Path, dark: bool, scale: float, motion: bool):
        self.browser, self.page, self.dark, self.scale, self.motion = browser, page, dark, scale, motion
        self.profile = tempfile.mkdtemp(prefix="vx-render-profile-")

    def close(self) -> None:
        shutil.rmtree(self.profile, ignore_errors=True)

    def _cmd(self, win_w: int, win_h: int) -> list[str]:
        cmd = [self.browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
               "--hide-scrollbars", f"--user-data-dir={self.profile}", f"--window-size={win_w},{win_h}",
               "--virtual-time-budget=6000", "--allow-file-access-from-files",
               f"--force-device-scale-factor={self.scale}"]
        if not self.motion:
            cmd.append("--force-prefers-reduced-motion")
        if self.dark:
            cmd.append("--force-dark-mode")
        return cmd

    def _wrapper(self, src: str, width: int, height: int, top: int) -> Path:
        w = self.page.parent / f".__vx_wrap_{os.getpid()}.html"
        w.write_text(WRAPPER.format(src=html.escape(src), w=width, h=height, top=-top), encoding="utf-8")
        return w

    @staticmethod
    def win_w(width: int) -> int:
        return max(width + 100, 800)

    def measure(self, width: int, page_id: str, query: str = "") -> dict:
        text = self.page.read_text(encoding="utf-8")
        i = text.lower().rfind("</body>")
        probed = text[:i] + PROBE_JS + text[i:] if i != -1 else text + PROBE_JS
        probe = self.page.parent / f".__vx_probe_{os.getpid()}.html"
        probe.write_text(probed, encoding="utf-8")
        wrapper = self._wrapper(f"{probe.name}{'?' + query if query else ''}#{page_id}", width, 30000, 0)
        try:
            proc = subprocess.run(self._cmd(self.win_w(width), 900) + ["--dump-dom", wrapper.as_uri()],
                                  capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
        finally:
            probe.unlink(missing_ok=True)
            wrapper.unlink(missing_ok=True)
        out = proc.stdout or ""
        start = out.find('<pre id="__rc">')
        if start == -1:
            raise SystemExit(f"Could not measure page {page_id} (browser output: {(proc.stderr or '')[-300:]})")
        return json.loads(html.unescape(out[start + len('<pre id="__rc">'): out.find("</pre>", start)]))

    def capture(self, width: int, height: int, page_id: str, out_dir: Path, tag: str, query: str = "") -> list[tuple[int, int, Path]]:
        chunk = int(8000 / self.scale)
        chunks = []
        for y0 in range(0, height, chunk):
            h = min(chunk, height - y0)
            dest = out_dir / f".{tag}_chunk{y0}.png"
            wrapper = self._wrapper(f"{self.page.name}{'?' + query if query else ''}#{page_id}", width, height, y0)
            try:
                subprocess.run(self._cmd(self.win_w(width), h) + [f"--screenshot={dest}", wrapper.as_uri()],
                               capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
            finally:
                wrapper.unlink(missing_ok=True)
            if not dest.exists():
                raise SystemExit(f"Screenshot failed for page {page_id} at width {width}, y={y0}")
            chunks.append((y0, y0 + h, dest))
        return chunks


def crop_region(chunks, x0: int, x1: int, y0: int, y1: int, scale: float, dest: Path) -> bool:
    pieces = []
    for c0, c1, png in chunks:
        a, b = max(y0, c0), min(y1, c1)
        if b - a < 1:
            continue
        piece = dest.with_name(f".{dest.stem}_p{len(pieces)}.png")
        s = scale
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(png), "-vf",
                        f"crop={int((x1 - x0) * s)}:{int((b - a) * s)}:{int(x0 * s)}:{int((a - c0) * s)}", str(piece)],
                       capture_output=True)
        if piece.exists():
            pieces.append(piece)
    if not pieces:
        return False
    if len(pieces) == 1:
        pieces[0].replace(dest)
    else:
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
        for p in pieces:
            cmd += ["-i", str(p)]
        cmd += ["-filter_complex", f"vstack=inputs={len(pieces)}", str(dest)]
        subprocess.run(cmd, capture_output=True)
        for p in pieces:
            p.unlink(missing_ok=True)
    return dest.exists()


def slug(text: str, n: int = 32) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in text)
    return "-".join(part for part in out.split("-") if part)[:n].strip("-") or "figure"


def cut_points(height: int, slice_h: int, figs: list[list[int]]) -> list[int]:
    cuts, y = [0], 0
    while y + slice_h < height:
        target = y + slice_h
        inside = [f for f in figs if f[0] < target < f[1]]
        if inside:
            top = min(f[0] for f in inside) - 12
            if top > y + 0.35 * slice_h:
                target = top
        cuts.append(target)
        y = target
    if height - cuts[-1] > 40 or len(cuts) == 1:
        cuts.append(height)
    else:
        cuts[-1] = height
    return cuts


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("html")
    ap.add_argument("--out", required=True)
    ap.add_argument("--pages", nargs="*", help="page ids to render (default: all)")
    ap.add_argument("--widths", nargs="*", type=int, default=[1280, 400])
    ap.add_argument("--dark", action="store_true", help="also render with prefers-color-scheme: dark")
    ap.add_argument("--figures", action="store_true", help="also save one image per figure")
    ap.add_argument("--motion", action="store_true", help="do not force reduced motion (shows animations mid-way)")
    ap.add_argument("--no-last-step", action="store_true",
                    help="skip the extra render of each walkthrough at its final step")
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--slice", type=int, default=0, help="slice height in CSS px (default ~one screen)")
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg is needed to crop the screenshots; install it and retry.")
    page = Path(args.html).resolve()
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    ids = re.findall(r'<section\b[^>]*\bclass="[^"]*\bpage\b[^"]*"[^>]*\bid="([^"]+)"', page.read_text(encoding="utf-8"))
    ids += [i for i in re.findall(r'<section\b[^>]*\bid="([^"]+)"[^>]*\bclass="[^"]*\bpage\b', page.read_text(encoding="utf-8")) if i not in ids]
    pages = args.pages or ids or [""]   # "": a document without page sections, rendered whole
    browser = find_browser()
    problems = 0
    index: list[str] = []
    for dark in ([False, True] if args.dark else [False]):
        r = Renderer(browser, page, dark, args.scale, args.motion)
        try:
            jobs = [(pid, w, "") for pid in pages for w in args.widths]
            while jobs:
                pid, w, query = jobs.pop(0)
                m = r.measure(w, pid, query)
                if not query and m.get("walks") and not args.no_last_step:
                    jobs.insert(0, (pid, w, "vxstep=last"))   # also check every walkthrough's final step
                tag = f"{w}{'-dark' if dark else ''}_{pid or 'page'}{'-last' if query else ''}"
                height = int(m["height"])
                figs, info = m["figRects"], m["figInfo"]
                index.append(f"\n## {tag}")
                print(f"\n== page {pid}{' (walkthroughs at their last step)' if query else ''} · {w}px{' · dark' if dark else ''}: height {height}px, {len(figs)} figure(s)")
                if m.get("page") and m["page"] != pid:
                    print(f"   note: browser showed page {m['page']!r}, not {pid!r}")
                if m["scrollWidth"] > m["viewport"] + 1:
                    problems += 1
                    print(f"   PROBLEM: page scrolls horizontally ({m['scrollWidth']}px > {m['viewport']}px)")
                for item in m["overflow"]:
                    problems += 1
                    print(f"   PROBLEM overflow: {item}")
                for item in m["overlaps"]:
                    problems += 1
                    print(f"   PROBLEM text overlap: {item}")
                for item in m["clipped"]:
                    print(f"   check clipped text: {item}")
                for src in m["brokenImages"]:
                    problems += 1
                    print(f"   PROBLEM broken image: {src}")
                chunks = r.capture(w, height, pid, out_dir, tag, query)
                slice_h = args.slice or (1000 if w >= 900 else 1500)
                cuts = cut_points(height, slice_h, figs)
                for n, (y0, y1) in enumerate(zip(cuts, cuts[1:]), 1):
                    dest = out_dir / f"{tag}_{n:02d}.png"
                    if crop_region(chunks, 0, w, y0, y1, args.scale, dest):
                        print(f"   {dest}")
                        inside = [f"fig{i:02d} {info[i - 1]['label'][:50]!r}" for i, f in enumerate(figs, 1) if y0 <= f[0] < y1]
                        index.append(f"{dest.name}: y {y0}-{y1}" + (f"; {', '.join(inside)}" if inside else ""))
                if args.figures:
                    for n, (t, b, left, right) in enumerate(figs, 1):
                        dest = out_dir / f"{tag}_fig{n:02d}_{slug(info[n - 1]['label'])}.png"
                        if crop_region(chunks, max(0, left - 8), min(w, right + 8), max(0, t - 8), min(height, b + 8), args.scale, dest):
                            print(f"   {dest}")
                            index.append(f"{dest.name}: {info[n - 1]['label']}")
                for _, _, png in chunks:
                    png.unlink(missing_ok=True)
        finally:
            r.close()
    (out_dir / "index.txt").write_text("\n".join(index).strip() + "\n", encoding="utf-8")
    print(f"\nindex of images: {out_dir / 'index.txt'}")
    print(f"\n{'No automatic problems found' if not problems else f'{problems} problem(s) found'} - "
          "now Read the images: these checks miss many visual problems.")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
