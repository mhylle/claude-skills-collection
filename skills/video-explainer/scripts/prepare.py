#!/usr/bin/env python3
"""Prepare a video for the video-explainer skill.

Runs the installed `watch` plugin (download via yt-dlp, frame extraction via
ffmpeg, captions / Whisper transcript) and then writes skill-friendly outputs
into the work dir:

    report.md       raw watch report (frame list + transcript as watch prints it)
    meta.json       title, channel, duration, chapters, description, ids, frames
    transcript.md   de-duplicated transcript in ~30 s paragraphs with [MM:SS]

If the watch download fails (YouTube frequently answers 403 to some yt-dlp
player clients), the video is fetched with a series of fallback yt-dlp settings
and watch is re-run - yt-dlp then skips the already-present file and still
fetches captions + metadata.

Usage:
    python prepare.py <url-or-path> [--work DIR] [--start T] [--end T]
                      [--max-frames N] [--resolution W] [--no-whisper]
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
from urllib.parse import parse_qs, urlparse

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# --------------------------------------------------------------------------- #
# Locating the watch plugin
# --------------------------------------------------------------------------- #

def _version_key(path: Path) -> tuple:
    """Sort key for .../watch/<version>/scripts/watch.py - newest first."""
    version = path.parent.parent.name
    parts = re.findall(r"\d+", version)
    return tuple(int(p) for p in parts) or (0,), path.stat().st_mtime


def find_watch_script(explicit: str | None = None) -> Path:
    candidates: list[Path] = []
    if explicit:
        p = Path(explicit).expanduser()
        candidates.append(p if p.suffix == ".py" else p / "scripts" / "watch.py")
    env = os.environ.get("WATCH_PLUGIN_DIR")
    if env:
        candidates.append(Path(env).expanduser() / "scripts" / "watch.py")

    plugins = Path.home() / ".claude" / "plugins"
    installed = plugins / "installed_plugins.json"
    if installed.is_file():
        try:
            data = json.loads(installed.read_text(encoding="utf-8"))
            for key, entries in (data.get("plugins") or {}).items():
                if key.split("@")[0] == "watch":
                    for entry in entries:
                        if entry.get("installPath"):
                            candidates.append(Path(entry["installPath"]) / "scripts" / "watch.py")
        except Exception:
            pass

    cached = [p for p in (plugins / "cache").glob("*/watch/*/scripts/watch.py") if p.is_file()]
    candidates += sorted(cached, key=_version_key, reverse=True)
    candidates += sorted((plugins / "marketplaces").glob("*/scripts/watch.py"))
    candidates.append(Path.home() / ".claude" / "skills" / "watch" / "scripts" / "watch.py")

    for c in candidates:
        if c.is_file():
            return c
    raise SystemExit(
        "Could not find the watch plugin (scripts/watch.py).\n"
        "Install it in Claude Code with:\n"
        "  /plugin marketplace add bradautomates/claude-video\n"
        "  /plugin install watch@claude-video\n"
        "or point WATCH_PLUGIN_DIR at a checkout of github.com/bradautomates/claude-video."
    )


# --------------------------------------------------------------------------- #
# Running watch (+ download fallback)
# --------------------------------------------------------------------------- #

def is_url(source: str) -> bool:
    return urlparse(source).scheme in ("http", "https")


def child_env() -> dict:
    # UTF-8 mode: watch reads info.json with the platform default encoding and
    # prints titles to stdout; on Windows (cp1252) both break on non-ASCII.
    return {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}


def run_watch(watch_py: Path, source: str, work: Path, extra: list[str]) -> subprocess.CompletedProcess:
    cmd = [sys.executable, str(watch_py), source, "--out-dir", str(work), *extra]
    return subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", env=child_env()
    )


def find_video(download_dir: Path) -> Path | None:
    for ext in (".mp4", ".mkv", ".webm", ".mov"):
        for c in sorted(download_dir.glob(f"video*{ext}")):
            return c
    return None


def js_runtime_args() -> list[str]:
    """yt-dlp needs a JS runtime for YouTube; it only auto-enables deno."""
    try:
        help_text = subprocess.run(
            ["yt-dlp", "--help"], capture_output=True, text=True, encoding="utf-8", errors="replace"
        ).stdout
    except FileNotFoundError:
        return []
    if "--js-runtimes" not in help_text:
        return []
    for runtime in ("deno", "node", "bun"):
        if shutil.which(runtime):
            return ["--js-runtimes", runtime]
    return []


FALLBACK_ATTEMPTS = [
    # (label, extra yt-dlp args). The mweb client's progressive 360p stream is
    # the one most often still reachable without a PO token.
    ("default clients", ["-f", "bv*[height<=720]+ba/b[height<=720]/bv+ba/b"]),
    ("mweb client", ["--extractor-args", "youtube:player_client=mweb", "-f", "b[height<=720]/bv*[height<=720]+ba/b"]),
    ("web_safari client", ["--extractor-args", "youtube:player_client=web_safari", "-f", "b[height<=720]/bv*[height<=720]+ba/b"]),
    ("tv client", ["--extractor-args", "youtube:player_client=tv", "-f", "b[height<=720]/bv*[height<=720]+ba/b"]),
    ("any format", ["-f", "b/bv*+ba"]),
]


def fallback_download(url: str, download_dir: Path) -> Path | None:
    if shutil.which("yt-dlp") is None:
        return None
    download_dir.mkdir(parents=True, exist_ok=True)
    js = js_runtime_args()
    for label, extra in FALLBACK_ATTEMPTS:
        print(f"[prepare] fallback download: {label}…", file=sys.stderr)
        cmd = [
            "yt-dlp", "--no-update", "--no-playlist", *js, *extra,
            "--merge-output-format", "mp4", "--remux-video", "mp4",
            "-o", str(download_dir / "video.%(ext)s"), url,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        video = find_video(download_dir)
        if video:
            print(f"[prepare] fallback succeeded with {label}: {video.name}", file=sys.stderr)
            return video
        last = (proc.stderr or "").strip().splitlines()[-1:] or ["(no output)"]
        print(f"[prepare]   failed: {last[0][:200]}", file=sys.stderr)
    return None


# --------------------------------------------------------------------------- #
# Parsing watch output
# --------------------------------------------------------------------------- #

FRAME_RE = re.compile(r"^- `(?P<path>[^`]+)` \(t=(?P<t>[\d:]+)\)\s*$")
TS_LINE_RE = re.compile(r"^\[(?P<t>\d+:\d{2}(?::\d{2})?)\]\s*(?P<text>.*)$")


def to_seconds(stamp: str) -> float:
    parts = [float(p) for p in stamp.replace(",", ".").split(":")]
    total = 0.0
    for p in parts:
        total = total * 60 + p
    return total


def fmt(seconds: float) -> str:
    s = int(seconds)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m:02d}:{sec:02d}"


def fmt_precise(seconds: float) -> str:
    m, s = divmod(max(0.0, seconds), 60)
    return f"{int(m):02d}:{s:04.1f}"


def parse_frames(report: str, start: float = 0.0, duration: float | None = None) -> list[dict]:
    """Frame list with *corrected* timestamps.

    watch labels frame k as start + k/fps, but ffmpeg's fps filter (round=near)
    keeps the last source frame of each 1/fps slot, so the image is really from
    about start + (k + 0.5)/fps - measured ~3 s later at 0.15 fps. Corrected
    times let grab.py land on the same moment as the overview frame.
    """
    fps_m = re.search(r"\*\*Frames:\*\* \d+ @ ([\d.]+) fps", report)
    fps = float(fps_m.group(1)) if fps_m else None
    frames = []
    for line in report.splitlines():
        m = FRAME_RE.match(line.strip())
        if not m:
            continue
        k = len(frames)
        if fps:
            sec = start + (k + 0.5) / fps
            if duration:
                sec = min(sec, max(0.0, duration - 0.1))
        else:
            sec = to_seconds(m["t"])
        frames.append({"t": fmt_precise(sec), "seconds": round(sec, 2), "path": m["path"]})
    return frames


def parse_report_field(report: str, name: str) -> str | None:
    m = re.search(rf"^- \*\*{re.escape(name)}:\*\* (.+)$", report, re.M)
    return m.group(1).strip() if m else None


def report_transcript_segments(report: str) -> list[dict]:
    """Fallback when there is no VTT (e.g. Whisper transcript)."""
    m = re.search(r"## Transcript.*?```\n(.*?)```", report, re.S)
    if not m:
        return []
    segs = []
    for line in m.group(1).splitlines():
        lm = TS_LINE_RE.match(line.strip())
        if lm and lm["text"].strip():
            segs.append({"start": to_seconds(lm["t"]), "text": lm["text"].strip()})
    return segs


# --------------------------------------------------------------------------- #
# VTT -> clean transcript
# --------------------------------------------------------------------------- #

CUE_TIME_RE = re.compile(r"(\d+:\d{2}:\d{2}[.,]\d+|\d+:\d{2}[.,]\d+)\s*-->\s*(\S+)")
INLINE_TS_RE = re.compile(r"<\d+:\d{2}:\d{2}[.,]\d+>|<\d+:\d{2}[.,]\d+>")
TAG_RE = re.compile(r"</?[^>]+>")


def _clean(text: str) -> str:
    text = TAG_RE.sub("", INLINE_TS_RE.sub("", text))
    text = html.unescape(text).replace(" ", " ")
    return re.sub(r"\s+", " ", text).strip()


def parse_vtt(path: Path) -> list[dict]:
    raw = path.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n")
    karaoke = "<c>" in raw or bool(INLINE_TS_RE.search(raw))
    segments: list[dict] = []
    prev_text = ""
    # Cues are separated by truly empty lines. YouTube puts whitespace-only
    # lines *inside* cues, so "\n \n" must not count as a separator.
    for block in re.split(r"\n{2,}", raw):
        lines = block.strip("\n").split("\n")
        idx = next((i for i, l in enumerate(lines) if CUE_TIME_RE.search(l)), None)
        if idx is None:
            continue
        timing = CUE_TIME_RE.search(lines[idx])
        start = to_seconds(timing.group(1))
        body = [l for l in lines[idx + 1:] if l.strip()]
        if karaoke:
            # YouTube auto-captions: a real cue shows [previous line, new line];
            # short "snapshot" cues (10-60 ms) just repeat the line that was
            # finished. Only the last line of a real cue is new speech (it may
            # lack word-timing tags when it is a single word), so take that line
            # and skip it when it merely repeats what was already emitted.
            text = _clean(body[-1]) if body else ""
            if text and text == prev_text:
                continue
            if text:
                prev_text = text
        else:
            text = _clean(" ".join(body))
            if text == prev_text:
                continue
            if prev_text and text.startswith(prev_text):
                text = text[len(prev_text):].strip()
            prev_text = _clean(" ".join(body))
        if text:
            segments.append({"start": start, "text": text})
    return segments


def pick_vtt(download_dir: Path) -> Path | None:
    """Best caption track: a manual (human) track, then the original
    auto-captions (en-orig), then any other English track (YouTube's plain
    "en" auto track can be machine-translated and garbles words), then anything."""
    if not download_dir.exists():
        return None
    vtts = sorted(download_dir.glob("video*.vtt"), key=lambda p: p.name.lower())
    if not vtts:
        return None
    lang = lambda p: p.name[len("video."):-len(".vtt")]  # noqa: E731
    manual: set[str] = set()
    info_path = download_dir / "video.info.json"
    if info_path.is_file():
        try:
            info = json.loads(info_path.read_text(encoding="utf-8"))
            manual = {k for k in (info.get("subtitles") or {}) if k != "live_chat"}
        except Exception:
            pass
    for pick in (
        lambda p: lang(p) in manual and lang(p).startswith("en"),
        lambda p: lang(p) in manual,
        lambda p: lang(p) == "en-orig",
        lambda p: lang(p) == "en",
        lambda p: lang(p).startswith("en"),
    ):
        found = next((v for v in vtts if pick(v)), None)
        if found:
            return found
    return vtts[0]


def paragraphs(segments: list[dict], chapters: list[dict], target: float = 30.0, hard: float = 50.0) -> list[dict]:
    """Merge caption fragments into readable paragraphs, breaking at chapters."""
    bounds = sorted({c["start_time"] for c in chapters if c.get("start_time")})
    out: list[dict] = []
    cur: dict | None = None
    for seg in segments:
        crosses_chapter = cur is not None and any(cur["start"] < b <= seg["start"] for b in bounds)
        if cur is not None:
            span = seg["start"] - cur["start"]
            sentence_end = cur["text"].rstrip().endswith((".", "?", "!", '"', "”"))
            if crosses_chapter or span >= hard or (span >= target and sentence_end):
                out.append(cur)
                cur = None
        if cur is None:
            cur = {"start": seg["start"], "text": seg["text"]}
        else:
            cur["text"] += " " + seg["text"]
    if cur:
        out.append(cur)
    return out


def write_transcript(path: Path, meta: dict, paras: list[dict]) -> int:
    chapters = meta.get("chapters") or []
    lines = [f"# Transcript: {meta.get('title') or meta.get('source')}", ""]
    lines.append(f"_Source: {meta.get('transcript_source') or 'none'}. "
                 "Timestamps are [MM:SS] from the start of the video._")
    lines.append("")
    if not paras:
        lines.append("_No transcript available - work from the frames only._")
    ci = 0
    for p in paras:
        while ci < len(chapters) and chapters[ci].get("start_time", 0) <= p["start"] + 0.5:
            ch = chapters[ci]
            lines += ["", f"## {ch.get('title', 'Chapter')} ({fmt(ch.get('start_time', 0))})", ""]
            ci += 1
        lines.append(f"[{fmt(p['start'])}] {p['text']}")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")
    return sum(len(p["text"].split()) for p in paras)


# --------------------------------------------------------------------------- #
# Metadata
# --------------------------------------------------------------------------- #

def youtube_id(url: str) -> str | None:
    u = urlparse(url)
    host = (u.hostname or "").lower()
    if host.endswith("youtu.be"):
        return u.path.strip("/").split("/")[0] or None
    if "youtube" in host:
        if u.path.startswith(("/shorts/", "/live/", "/embed/")):
            return u.path.split("/")[2]
        return (parse_qs(u.query).get("v") or [None])[0]
    return None


def build_meta(source: str, work: Path, report: str, frames: list[dict]) -> dict:
    info: dict = {}
    info_path = work / "download" / "video.info.json"
    if info_path.is_file():
        try:
            info = json.loads(info_path.read_text(encoding="utf-8"))
        except Exception:
            info = {}

    url = info.get("webpage_url") or (source if is_url(source) else None)
    yt = youtube_id(url) if url else None
    ts_template = f"https://www.youtube.com/watch?v={yt}&t={{seconds}}s" if yt else None

    duration = info.get("duration")
    if not duration:
        d = parse_report_field(report, "Duration")
        m = re.search(r"\(([\d.]+)s\)", d or "")
        duration = float(m.group(1)) if m else None

    upload = info.get("upload_date")
    if upload and len(upload) == 8:
        upload = f"{upload[:4]}-{upload[4:6]}-{upload[6:]}"

    chapters = [
        {"title": c.get("title"), "start_time": c.get("start_time"), "end_time": c.get("end_time"),
         "start": fmt(c.get("start_time") or 0)}
        for c in (info.get("chapters") or [])
    ]

    video = find_video(work / "download") if (work / "download").exists() else None
    if video is None and not is_url(source):
        video = Path(source).expanduser().resolve()

    return {
        "source": source,
        "url": url,
        "youtube_id": yt,
        "timestamp_url_template": ts_template,
        "title": info.get("title") or parse_report_field(report, "Title") or (Path(source).stem if not is_url(source) else None),
        "channel": info.get("channel") or info.get("uploader") or parse_report_field(report, "Uploader"),
        "upload_date": upload,
        "duration_seconds": duration,
        "duration": fmt(duration) if duration else None,
        "resolution": parse_report_field(report, "Resolution"),
        "language": info.get("language"),
        "chapters": chapters,
        "description": (info.get("description") or "")[:4000],
        "tags": (info.get("tags") or [])[:20],
        "video_path": str(video) if video else None,
        "work_dir": str(work),
        "frames": frames,
    }


# --------------------------------------------------------------------------- #

def main() -> int:
    ap = argparse.ArgumentParser(description="Prepare a video for the video-explainer skill.")
    ap.add_argument("source", help="Video URL or local file path")
    ap.add_argument("--work", help="Work directory (default: new temp dir)")
    ap.add_argument("--watch-dir", help="Path to the watch plugin (default: auto-detect)")
    ap.add_argument("--start")
    ap.add_argument("--end")
    ap.add_argument("--max-frames", type=int)
    ap.add_argument("--resolution", type=int)
    ap.add_argument("--no-whisper", action="store_true")
    args = ap.parse_args()

    watch_py = find_watch_script(args.watch_dir)
    work = Path(args.work).expanduser().resolve() if args.work else Path(tempfile.mkdtemp(prefix="video-explainer-"))
    work.mkdir(parents=True, exist_ok=True)

    extra: list[str] = []
    for flag, value in (("--start", args.start), ("--end", args.end),
                        ("--max-frames", args.max_frames), ("--resolution", args.resolution)):
        if value is not None:
            extra += [flag, str(value)]
    if args.no_whisper:
        extra.append("--no-whisper")

    print(f"[prepare] watch plugin: {watch_py}", file=sys.stderr)
    print(f"[prepare] work dir: {work}", file=sys.stderr)
    proc = run_watch(watch_py, args.source, work, extra)

    if proc.returncode != 0 and is_url(args.source) and find_video(work / "download") is None:
        tail = "\n".join((proc.stderr or "").strip().splitlines()[-3:])
        print(f"[prepare] watch download failed:\n{tail}", file=sys.stderr)
        if fallback_download(args.source, work / "download"):
            proc = run_watch(watch_py, args.source, work, extra)

    if proc.returncode != 0:
        sys.stderr.write(proc.stderr or "")
        raise SystemExit(
            f"[prepare] watch failed (exit {proc.returncode}). If this is a YouTube 403, try "
            "`pip install -U yt-dlp` and make sure deno or node is on PATH."
        )

    report = proc.stdout
    (work / "report.md").write_text(report, encoding="utf-8")
    meta = build_meta(args.source, work, report, [])
    frames = parse_frames(report, to_seconds(args.start) if args.start else 0.0, meta["duration_seconds"])
    meta["frames"] = frames

    # Transcript: prefer the original VTT (lets us undo YouTube's rolling
    # duplication); otherwise use whatever watch printed (Whisper).
    download_dir = work / "download"
    vtt = pick_vtt(download_dir)
    segments: list[dict] = []
    watch_source = parse_report_field(report, "Transcript") or ""
    if vtt:
        try:
            segments = parse_vtt(vtt)
            meta["transcript_source"] = f"captions ({vtt.name})"
        except Exception as exc:
            print(f"[prepare] VTT parse failed ({exc}); using watch transcript", file=sys.stderr)
    if not segments:
        segments = report_transcript_segments(report)
        meta["transcript_source"] = re.sub(r"^\d+ segments\s*", "", watch_source) or None if segments else None
    if args.start or args.end:
        lo = to_seconds(args.start) if args.start else 0
        hi = to_seconds(args.end) if args.end else float("inf")
        segments = [s for s in segments if lo <= s["start"] <= hi]

    # Fine-grained caption lines for looking up the exact time of a phrase.
    caption_lines = [f"[{fmt_precise(seg['start'])}] {seg['text']}" for seg in segments]
    (work / "captions.txt").write_text("\n".join(caption_lines) + "\n", encoding="utf-8")
    paras = paragraphs(segments, meta["chapters"])
    words = write_transcript(work / "transcript.md", meta, paras)
    meta["transcript_words"] = words
    (work / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")

    print("# video-explainer: prepared")
    print()
    print(f"- title: {meta['title']}")
    print(f"- channel: {meta['channel']}  |  uploaded: {meta['upload_date']}  |  duration: {meta['duration']}")
    print(f"- video resolution: {meta['resolution']}  |  video file: {meta['video_path']}")
    print(f"- chapters: {len(meta['chapters'])}  |  timestamp links: {meta['timestamp_url_template'] or 'n/a (not YouTube)'}")
    print(f"- transcript: {work / 'transcript.md'}  ({words} words, {len(paras)} paragraphs, "
          f"source: {meta.get('transcript_source') or 'NONE - frames only'})")
    print(f"- captions: {work / 'captions.txt'}  (one line per caption cue - grep it for exact timestamps)")
    print(f"- metadata: {work / 'meta.json'}")
    print(f"- work dir: {work}")
    if meta["duration_seconds"] and meta["duration_seconds"] > 600 and not (args.start or args.end):
        print("- NOTE: long video - frames are sparse; use grab.py for dense looks at visual sections.")
    print()
    print(f"## Frames ({len(frames)}) - Read all of these (times are exact; grab.py --times <t> returns the same image)")
    print()
    for f in frames:
        print(f"- {f['path']} (t={f['t']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
