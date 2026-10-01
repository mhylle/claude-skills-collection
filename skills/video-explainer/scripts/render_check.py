#!/usr/bin/env python3
"""Render an HTML page in headless Chrome/Edge, save screenshots you can Read,
and run automatic layout checks.

Usage:
    python render_check.py page.html --out DIR [--widths 1280 400] [--dark]
                           [--figures] [--scale 2] [--slice PX]

Writes, per width (and per colour scheme with --dark):
    DIR/<w>[-dark]_NN.png      page slices about one screen tall; cuts are moved
                               to gaps between figures so diagrams stay whole
    DIR/<w>[-dark]_figNN_<title>.png
                               with --figures: one image per diagram figure
                               (screenshots are skipped), named after its
                               .diagram-title; add --scale 2 to zoom
    DIR/index.txt              which diagrams each image shows
Automatic checks: horizontal overflow, text that overlaps other text inside a
figure, clipped text, broken images. Exit code 1 if problems were found - but
the checks only catch some failures: always Read the images too.
Set CHROME_PATH to override browser discovery.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PROBE_JS = r"""
<script id="__rc_probe">
addEventListener('load', () => setTimeout(() => {
  const de = document.documentElement, vw = de.clientWidth;
  const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const clipsX = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true; } return false; };
  const overflow = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.id === '__rc_probe') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if ((r.right > vw + 1 || r.left < -1) && !clipsX(el)) {
      const p = el.parentElement, pr = p && p.getBoundingClientRect();
      if (pr && (pr.right > vw + 1 || pr.left < -1) && !clipsX(p)) continue; // report outermost only
      overflow.push(desc(el) + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + 'px, viewport ' + vw + ']');
    }
  }
  const clipped = [];
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (/(hidden|clip)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0)
      clipped.push(desc(el) + ' (content ' + el.scrollWidth + 'px in ' + el.clientWidth + 'px box)');
  }
  // Text colliding with other text inside diagrams (labels on top of labels).
  const overlaps = [];
  const figs = [...document.querySelectorAll('figure')];
  const figLabel = f => ((f.querySelector('.diagram-title') || f.querySelector('figcaption') || f).textContent || '')
    .trim().replace(/\s+/g, ' ').slice(0, 70);
  figs.forEach((fig, fi) => {
    const boxes = [];
    const tw = document.createTreeWalker(fig, NodeFilter.SHOW_TEXT,
      { acceptNode: n => n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    for (let n; (n = tw.nextNode());) {
      const cs = getComputedStyle(n.parentElement);
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const range = document.createRange(); range.selectNodeContents(n);
      for (const r of range.getClientRects())
        if (r.width > 1 && r.height > 1) boxes.push({ r, el: n.parentElement, t: n.textContent.trim().slice(0, 28) });
    }
    for (let i = 0; i < boxes.length && overlaps.length < 12; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el === b.el) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 3 && h > 3) { overlaps.push('figure ' + (fi + 1) + ' (' + figLabel(fig).slice(0, 40) + '): "' + a.t + '" overlaps "' + b.t + '"'); break; }
    }
  });
  const brokenImages = [...document.images].filter(i => !i.complete || !i.naturalWidth)
    .map(i => (i.getAttribute('src') || '').slice(0, 100));
  const figRects = figs.map(f => { const r = f.getBoundingClientRect();
    return [Math.floor(r.top + scrollY), Math.ceil(r.bottom + scrollY), Math.floor(r.left), Math.ceil(r.right)]; });
  const figInfo = figs.map(f => ({ diagram: f.classList.contains('diagram'), label: figLabel(f) }));
  const bs = getComputedStyle(document.body);
  const contentHeight = Math.ceil(document.body.getBoundingClientRect().bottom + parseFloat(bs.marginBottom || 0));
  parent.postMessage(JSON.stringify({ height: contentHeight,
    scrollWidth: de.scrollWidth, viewport: vw, overflow: overflow.slice(0, 15),
    clipped: clipped.slice(0, 15), overlaps, brokenImages, figRects, figInfo,
    images: document.images.length, dark: matchMedia('(prefers-color-scheme: dark)').matches }), '*');
}, 50));
</script>
"""

# Headless Chrome will not lay a window out narrower than ~512px, so pages are
# rendered inside an iframe of the exact target width (an iframe has its own
# viewport, so media and container queries behave as on a real phone). Tall
# pages are captured in chunks by shifting the iframe up.
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
    def __init__(self, browser: str, page: Path, dark: bool, scale: float):
        self.browser, self.page, self.dark, self.scale = browser, page, dark, scale
        self.profile = tempfile.mkdtemp(prefix="render-check-profile-")

    def close(self) -> None:
        shutil.rmtree(self.profile, ignore_errors=True)

    def _cmd(self, win_w: int, win_h: int) -> list[str]:
        cmd = [self.browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
               "--hide-scrollbars", f"--user-data-dir={self.profile}", f"--window-size={win_w},{win_h}",
               "--virtual-time-budget=5000", "--allow-file-access-from-files",
               f"--force-device-scale-factor={self.scale}"]
        if self.dark:
            cmd.append("--force-dark-mode")
        return cmd

    def _wrapper(self, src: str, width: int, height: int, top: int) -> Path:
        # Temp files live next to the page so its relative image paths resolve.
        w = self.page.parent / f".__render_check_wrap_{os.getpid()}.html"
        w.write_text(WRAPPER.format(src=html.escape(src), w=width, h=height, top=-top), encoding="utf-8")
        return w

    @staticmethod
    def win_w(width: int) -> int:
        return max(width + 100, 800)

    def measure(self, width: int) -> dict:
        text = self.page.read_text(encoding="utf-8")
        i = text.lower().rfind("</body>")
        probed = text[:i] + PROBE_JS + text[i:] if i != -1 else text + PROBE_JS
        probe = self.page.parent / f".__render_check_{os.getpid()}.html"
        probe.write_text(probed, encoding="utf-8")
        wrapper = self._wrapper(probe.name, width, 60000, 0)
        try:
            proc = subprocess.run(self._cmd(self.win_w(width), 900) + ["--dump-dom", wrapper.as_uri()],
                                  capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
        finally:
            probe.unlink(missing_ok=True)
            wrapper.unlink(missing_ok=True)
        out = proc.stdout or ""
        start = out.find('<pre id="__rc">')
        if start == -1:
            raise SystemExit(f"Could not measure page (browser output: {(proc.stderr or '')[-300:]})")
        return json.loads(html.unescape(out[start + len('<pre id="__rc">'): out.find("</pre>", start)]))

    def capture(self, width: int, height: int, out_dir: Path, tag: str) -> list[tuple[int, int, Path]]:
        """Screenshot the whole page as vertical chunks: [(y0, y1, png)] in CSS px."""
        chunk = int(8000 / self.scale)
        chunks = []
        for y0 in range(0, height, chunk):
            h = min(chunk, height - y0)
            dest = out_dir / f".{tag}_chunk{y0}.png"
            wrapper = self._wrapper(self.page.name, width, height, y0)
            try:
                subprocess.run(self._cmd(self.win_w(width), h) + [f"--screenshot={dest}", wrapper.as_uri()],
                               capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
            finally:
                wrapper.unlink(missing_ok=True)
            if not dest.exists():
                raise SystemExit(f"Screenshot failed for width {width} at y={y0}")
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
    """Slice boundaries ~slice_h apart, nudged up to the gap above a figure
    instead of cutting through it (unless the figure is taller than a slice)."""
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
    ap = argparse.ArgumentParser()
    ap.add_argument("html")
    ap.add_argument("--out", required=True)
    ap.add_argument("--widths", nargs="*", type=int, default=[1280, 400])
    ap.add_argument("--dark", action="store_true", help="also render with prefers-color-scheme: dark")
    ap.add_argument("--figures", action="store_true", help="also save one image per <figure>")
    ap.add_argument("--scale", type=float, default=1.0, help="device pixel ratio for sharper zoomed images (e.g. 2)")
    ap.add_argument("--slice", type=int, default=0, help="slice height in CSS px (default ~one screen)")
    args = ap.parse_args()

    page = Path(args.html).resolve()
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    browser = find_browser()
    problems = 0
    index: list[str] = []
    for dark in ([False, True] if args.dark else [False]):
        r = Renderer(browser, page, dark, args.scale)
        try:
            for w in args.widths:
                m = r.measure(w)
                tag = f"{w}{'-dark' if dark else ''}"
                height = int(m["height"])
                figs = m["figRects"]
                info = m.get("figInfo") or [{"diagram": True, "label": ""} for _ in figs]
                index.append(f"\n## {tag}")
                print(f"\n== width {w}px{' (dark)' if dark else ''}: page height {height}px, "
                      f"{len(figs)} figure(s), {m['images']} image(s)")
                if dark and not m.get("dark"):
                    print("   note: browser did not report dark mode; dark render may equal light")
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

                chunks = r.capture(w, height, out_dir, tag)
                slice_h = args.slice or (1000 if w >= 900 else 1500)
                cuts = cut_points(height, slice_h, figs)
                for n, (y0, y1) in enumerate(zip(cuts, cuts[1:]), 1):
                    dest = out_dir / f"{tag}_{n:02d}.png"
                    if crop_region(chunks, 0, w, y0, y1, args.scale, dest):
                        print(f"   {dest}")
                        inside = [f"fig{i:02d} {info[i - 1]['label'][:50]!r}" for i, f in enumerate(figs, 1)
                                  if y0 <= f[0] < y1]
                        index.append(f"{dest.name}: y {y0}-{y1}" + (f"; {', '.join(inside)}" if inside else ""))
                if args.figures:
                    for n, (t, b, left, right) in enumerate(figs, 1):
                        if not info[n - 1]["diagram"]:
                            continue  # screenshots: the image itself needs no layout check
                        dest = out_dir / f"{tag}_fig{n:02d}_{slug(info[n - 1]['label'])}.png"
                        x0, x1 = max(0, left - 8), min(w, right + 8)
                        if crop_region(chunks, x0, x1, max(0, t - 8), min(height, b + 8), args.scale, dest):
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
