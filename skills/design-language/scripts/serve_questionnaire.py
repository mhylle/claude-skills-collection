#!/usr/bin/env python3
"""serve_questionnaire.py — the design-language feedback engine.

A reusable, stdlib-only questionnaire server. It renders a data-driven HTML page
(``assets/questionnaire.html.tmpl``) against the CURRENT ``questionnaire.json``
and the CURRENT ``tokens.css``, collects the user's reactions, and writes them
back as a ``responses.json`` the orchestrator reads when the user says "done".

Why re-read everything on every request
---------------------------------------
The skill edits ``questionnaire.json`` and ``tokens.css`` *as the design
language emerges* (the spectrum renderer rewrites previews, token-tweaks merge
into tokens.css). If we cached either file, the live previews in the page would
drift from the language as it actually stands. So every ``GET /`` and every
``GET /api/questionnaire`` reads from disk fresh: a browser refresh always shows
the user *their* current language, not a stale snapshot. Cheap and correct.

Endpoints
---------
``GET  /``                  Render the template against current questionnaire +
                            tokens (re-read per request). Also linkable as
                            ``/index.html``.
``GET  /api/questionnaire`` The current questionnaire.json (the page fetches it).
``GET  /api/responses``     Existing responses.json if present (resume), else {}.
``POST /api/responses``     Validate the body against the responses schema, write
                            it to ``--responses``, return ``{"ok":true}``. 400 +
                            a clear message on a malformed body.
``GET  /research/...``      Serve a local research image under ``--research-dir``
                            (path-traversal guarded). Also handles the raw
                            ``img`` paths a questionnaire item may reference.

Modes
-----
Server (default)::

    python3 serve_questionnaire.py --questionnaire q.json --responses r.json \\
        [--tokens tokens.css] [--template questionnaire.html.tmpl] \\
        [--port 3119] [--research-dir DIR]

Headless / no display (Cowork, CI) — write ONE standalone HTML file whose
"Submit all" downloads ``responses.json`` (same schema), no server::

    python3 serve_questionnaire.py --questionnaire q.json --responses r.json \\
        [--tokens tokens.css] --static out.html

No polling: the server just waits. The orchestrator reads responses.json when
the user says "done". Ctrl-C shuts down cleanly.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import signal
import socket
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

# Default port. skill-creator uses 3117; we use 3119 to avoid clashing (spec §6).
DEFAULT_PORT = 3119

# The six question types the contract defines. Used only to validate that an
# answer object's *shape* is plausible for its type; the server stays forgiving.
QUESTION_TYPES = {
    "this-or-that", "rate-grid", "adjective-pick",
    "safeness-spectrum", "token-tweak", "constraint",
}

# Template placeholders the server substitutes (see questionnaire.html.tmpl).
PH_TOKENS_LINK = "<!--TOKENS_LINK-->"
PH_QUESTIONNAIRE_JSON = "/*__QUESTIONNAIRE_JSON__*/ null /*__END__*/"
PH_STATIC_MODE = "/*__STATIC_MODE__*/ false /*__END__*/"

DEFAULT_TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "questionnaire.html.tmpl"


# ---------------------------------------------------------------------------
# Reading inputs (always fresh from disk)
# ---------------------------------------------------------------------------

def read_questionnaire(path: str | Path) -> dict:
    """Load the current questionnaire.json. Raises on missing/invalid JSON."""
    return json.loads(Path(path).read_text(encoding="utf-8"))


def read_tokens_css(path: str | Path | None) -> str:
    """Return the current tokens.css text, or '' if no tokens file is configured.

    Read fresh so previews reflect token-tweaks/spectrum merges as they happen.
    """
    if not path:
        return ""
    try:
        return Path(path).read_text(encoding="utf-8")
    except OSError:
        return ""  # tokens.css may not exist yet on the very first phase


def read_template(path: str | Path) -> str:
    return Path(path).read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Rendering the page
# ---------------------------------------------------------------------------

def render_page(template: str, questionnaire: dict, tokens_css: str,
                static_mode: bool, tokens_inline: bool) -> str:
    """Fill the template's injection points.

    ``tokens_inline`` controls whether tokens.css is embedded as a <style>
    block (required in --static mode, since there is no server to serve a
    stylesheet) or linked. In server mode we inline too — it keeps the page a
    single self-contained document and tokens are tiny.

    The questionnaire JSON is always made available to the page as
    ``window.__QUESTIONNAIRE__``; in server mode the page would otherwise fetch
    /api/questionnaire, but injecting it as well is harmless and lets a saved
    page work standalone.
    """
    page = template

    # 1) tokens: a <style> block applied to the whole page so non-sandboxed
    #    previews inherit the language, plus a JS copy for sandboxed iframes
    #    (which have no network and need the CSS inlined into their srcdoc).
    tokens_block = ""
    if tokens_css:
        tokens_block = "<style id=\"language-tokens\">\n" + tokens_css + "\n</style>"
    tokens_js = "<script>window.__TOKENS_CSS__ = " + json.dumps(tokens_css) + ";</script>"
    page = page.replace(PH_TOKENS_LINK, tokens_block + "\n" + tokens_js)

    # 2) questionnaire JSON + static flag. json.dumps is safe to embed in a
    #    <script> as long as we neutralize the </script> sequence.
    q_literal = json.dumps(questionnaire).replace("</", "<\\/")
    page = page.replace(PH_QUESTIONNAIRE_JSON, q_literal)
    page = page.replace(PH_STATIC_MODE, "true" if static_mode else "false")
    return page


# ---------------------------------------------------------------------------
# Validating a POSTed responses body (BUILD_CONTRACT "responses.json")
# ---------------------------------------------------------------------------

def validate_responses(body: object) -> tuple[bool, str]:
    """Validate the responses.json shape. Returns (ok, message).

    Forgiving where the contract is loose, strict on the bits the orchestrator
    relies on: it must be an object with an ``answers`` object, each answer
    keyed by question id mapping to an object. ``phase``/``status``/``timestamp``
    are checked for type when present but not required to be non-empty.
    """
    if not isinstance(body, dict):
        return False, "body must be a JSON object"
    answers = body.get("answers")
    if not isinstance(answers, dict):
        return False, "'answers' must be an object keyed by question id"
    for qid, ans in answers.items():
        if not isinstance(ans, dict):
            return False, f"answer for '{qid}' must be an object"
    status = body.get("status", "complete")
    if status not in (None, "complete", "in-progress", "in_progress"):
        return False, "'status' must be 'complete' or 'in-progress'"
    for key in ("phase", "timestamp"):
        if key in body and body[key] is not None and not isinstance(body[key], str):
            return False, f"'{key}' must be a string"
    return True, "ok"


# ---------------------------------------------------------------------------
# Research image serving (path-traversal guarded)
# ---------------------------------------------------------------------------

def resolve_research_file(research_dir: str | Path | None, rel: str) -> Path | None:
    """Resolve ``rel`` under ``research_dir``, refusing to escape that root.

    Returns the resolved path only if it exists, is a file, and is genuinely
    inside research_dir (defends against ``../`` traversal and symlink escapes).
    """
    if not research_dir:
        return None
    root = Path(research_dir).resolve()
    # Strip a leading "research/" so both /research/<x> and item img paths work.
    rel = unquote(rel).lstrip("/")
    if rel.startswith("research/"):
        rel = rel[len("research/"):]
    candidate = (root / rel).resolve()
    try:
        candidate.relative_to(root)  # raises ValueError if outside root
    except ValueError:
        return None
    if candidate.is_file():
        return candidate
    return None


# ---------------------------------------------------------------------------
# The request handler
# ---------------------------------------------------------------------------

class QuestionnaireHandler(BaseHTTPRequestHandler):
    # Bound per-server in main() via a subclass with these set.
    questionnaire_path: str = ""
    responses_path: str = ""
    tokens_path: str | None = None
    template_path: str = str(DEFAULT_TEMPLATE)
    research_dir: str | None = None

    def log_message(self, *args):  # keep stdout clean (only the URL line)
        return

    # -- low-level senders --------------------------------------------------
    def _send(self, code: int, body, content_type: str):
        payload = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")  # always serve fresh
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def _send_json(self, code: int, obj):
        self._send(code, json.dumps(obj), "application/json; charset=utf-8")

    # -- GET ----------------------------------------------------------------
    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            return self._serve_index()
        if path == "/api/questionnaire":
            return self._serve_questionnaire_json()
        if path == "/api/responses":
            return self._serve_existing_responses()
        if path.startswith("/research/") or self._looks_like_research_img(path):
            return self._serve_research_image(path)
        self._send_json(404, {"error": "not found", "path": path})

    def do_HEAD(self):
        self.do_GET()

    def _looks_like_research_img(self, path: str) -> bool:
        """A questionnaire item's img may be a bare relative path (e.g.
        ``color/abc.png``). Treat any GET that resolves under research-dir as an
        image request so those thumbnails load without a /research/ prefix."""
        return resolve_research_file(self.research_dir, path) is not None

    def _serve_index(self):
        try:
            template = read_template(self.template_path)
            questionnaire = read_questionnaire(self.questionnaire_path)
        except (OSError, json.JSONDecodeError) as exc:
            return self._send(500, f"Cannot render: {exc}", "text/plain; charset=utf-8")
        tokens_css = read_tokens_css(self.tokens_path)
        page = render_page(template, questionnaire, tokens_css,
                           static_mode=False, tokens_inline=True)
        self._send(200, page, "text/html; charset=utf-8")

    def _serve_questionnaire_json(self):
        try:
            questionnaire = read_questionnaire(self.questionnaire_path)
        except (OSError, json.JSONDecodeError) as exc:
            return self._send_json(500, {"error": f"cannot read questionnaire: {exc}"})
        self._send_json(200, questionnaire)

    def _serve_existing_responses(self):
        # Resume support: return prior responses if any, else {} (never 404 —
        # the page treats {} as "nothing saved yet").
        try:
            data = json.loads(Path(self.responses_path).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = {}
        self._send_json(200, data)

    def _serve_research_image(self, path: str):
        resolved = resolve_research_file(self.research_dir, path)
        if resolved is None:
            return self._send_json(404, {"error": "image not found", "path": path})
        ctype = mimetypes.guess_type(str(resolved))[0] or "application/octet-stream"
        self._send(200, resolved.read_bytes(), ctype)

    # -- POST ---------------------------------------------------------------
    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/api/responses":
            return self._send_json(404, {"error": "not found", "path": path})
        body = self._read_json_body()
        if body is _BAD_JSON:
            return self._send_json(400, {"ok": False, "error": "body is not valid JSON"})
        ok, message = validate_responses(body)
        if not ok:
            return self._send_json(400, {"ok": False, "error": message})
        try:
            out = Path(self.responses_path)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
        except OSError as exc:
            return self._send_json(500, {"ok": False, "error": f"could not write: {exc}"})
        self._send_json(200, {"ok": True, "path": os.path.relpath(self.responses_path)})

    def _read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except (TypeError, ValueError):
            return _BAD_JSON
        raw = self.rfile.read(length) if length > 0 else b""
        try:
            return json.loads(raw.decode("utf-8") or "null")
        except (UnicodeDecodeError, json.JSONDecodeError):
            return _BAD_JSON


# Sentinel distinguishing "valid JSON null" from "could not parse".
_BAD_JSON = object()


# ---------------------------------------------------------------------------
# Static (headless) mode
# ---------------------------------------------------------------------------

def write_static(out_path: str | Path, template: str, questionnaire: dict,
                 tokens_css: str) -> None:
    """Write ONE standalone HTML file (no server).

    Mirrors skill-creator's ``--static``: the questionnaire JSON and tokens are
    inlined, and the page is put in static mode so "Submit all" downloads
    responses.json client-side. The result works offline by double-click.
    """
    page = render_page(template, questionnaire, tokens_css,
                       static_mode=True, tokens_inline=True)
    Path(out_path).write_text(page, encoding="utf-8")


# ---------------------------------------------------------------------------
# Port selection
# ---------------------------------------------------------------------------

def pick_port(host: str, preferred: int) -> int:
    """Return ``preferred`` if free, else an OS-assigned free port.

    We probe the preferred port first so the stable default (3119) is used when
    available; only when it is taken do we fall back to an ephemeral port. The
    chosen port is what the caller binds and prints.
    """
    if preferred and preferred > 0:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind((host, preferred))
                return preferred
            except OSError:
                pass  # taken — fall through to ephemeral
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind((host, 0))
        return probe.getsockname()[1]


# ---------------------------------------------------------------------------
# Server lifecycle (clean stop/reuse — avoid the pkill -f foot-gun)
# ---------------------------------------------------------------------------

def default_pidfile(pidfile: str | None, responses: str | None) -> Path | None:
    """Where this server records its PID so it can be stopped cleanly.

    Defaults to a dotfile beside responses.json, so each phase's server is
    addressable without the caller having to remember a port or PID — and
    ``--stop`` can target exactly that server instead of a broad ``pkill -f``
    that can take out the user's own shell.
    """
    if pidfile:
        return Path(pidfile)
    if responses:
        return Path(responses).resolve().parent / ".questionnaire-server.pid"
    return None


def stop_server(pidfile: Path | None) -> int:
    """Stop a server previously started with the same --responses/--pidfile."""
    if not pidfile or not pidfile.exists():
        print("no running questionnaire server found (no pidfile) — nothing to stop", flush=True)
        return 0
    try:
        pid = int(pidfile.read_text().strip())
    except (OSError, ValueError):
        pidfile.unlink(missing_ok=True)
        print("stale pidfile removed; nothing running", flush=True)
        return 0
    try:
        os.kill(pid, signal.SIGTERM)
        print(f"stopped questionnaire server (pid {pid})", flush=True)
    except ProcessLookupError:
        print(f"no process {pid} (already stopped); cleaned up pidfile", flush=True)
    except PermissionError as exc:
        print(f"error: cannot stop pid {pid}: {exc}", file=sys.stderr)
        return 1
    pidfile.unlink(missing_ok=True)
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="design-language questionnaire feedback server")
    parser.add_argument("--questionnaire", help="path to questionnaire.json (required unless --stop)")
    parser.add_argument("--responses", help="path to write responses.json (required unless --stop)")
    parser.add_argument("--tokens", default=None, help="path to current tokens.css (live previews)")
    parser.add_argument("--template", default=str(DEFAULT_TEMPLATE),
                        help="path to questionnaire.html.tmpl")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT,
                        help=f"port (default {DEFAULT_PORT}; auto-picks a free one if taken)")
    parser.add_argument("--host", default="127.0.0.1", help="bind host (default 127.0.0.1)")
    parser.add_argument("--research-dir", default=None,
                        help="dir whose images may be served at /research/<...>")
    parser.add_argument("--static", default=None, metavar="OUT.html",
                        help="headless: write a standalone HTML file instead of serving")
    parser.add_argument("--pidfile", default=None,
                        help="where to record the server PID (default: beside --responses)")
    parser.add_argument("--stop", action="store_true",
                        help="stop the server for this --responses/--pidfile, then exit")
    args = parser.parse_args(argv)

    # ---- stop a previously-started server (clean alternative to pkill -f) ----
    if args.stop:
        return stop_server(default_pidfile(args.pidfile, args.responses))

    if not args.questionnaire or not args.responses:
        parser.error("--questionnaire and --responses are required (unless --stop)")

    try:
        template = read_template(args.template)
    except OSError as exc:
        print(f"error: cannot read template {args.template}: {exc}", file=sys.stderr)
        return 2
    try:
        questionnaire = read_questionnaire(args.questionnaire)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"error: cannot read questionnaire {args.questionnaire}: {exc}", file=sys.stderr)
        return 2
    tokens_css = read_tokens_css(args.tokens)

    # ---- headless / static mode: no server ----
    if args.static:
        write_static(args.static, template, questionnaire, tokens_css)
        print(f"Wrote standalone questionnaire -> {os.path.relpath(args.static)}", flush=True)
        print("Open it, answer, click 'Submit all' to download responses.json.", flush=True)
        return 0

    # ---- server mode ----
    research_dir = os.path.abspath(args.research_dir) if args.research_dir else None
    handler = type("BoundHandler", (QuestionnaireHandler,), {
        "questionnaire_path": os.path.abspath(args.questionnaire),
        "responses_path": os.path.abspath(args.responses),
        "tokens_path": os.path.abspath(args.tokens) if args.tokens else None,
        "template_path": os.path.abspath(args.template),
        "research_dir": research_dir,
    })

    port = pick_port(args.host, args.port)
    server = ThreadingHTTPServer((args.host, port), handler)
    url = f"http://localhost:{port}/"

    # Record the PID so the server can be stopped cleanly (`--stop`) or by the
    # orchestrator killing this exact PID — never a broad `pkill -f`, which can
    # take out the user's own shell.
    pidfile = default_pidfile(args.pidfile, args.responses)
    if pidfile:
        try:
            pidfile.parent.mkdir(parents=True, exist_ok=True)
            pidfile.write_text(str(os.getpid()), encoding="utf-8")
        except OSError:
            pidfile = None  # non-fatal: serving still works without a pidfile

    # The orchestrator parses these exact lines to show the URL and track the PID.
    print(f"QUESTIONNAIRE_URL {url}", flush=True)
    print(f"QUESTIONNAIRE_PID {os.getpid()}", flush=True)
    print(f"Serving {os.path.relpath(args.questionnaire)} at {url}", flush=True)
    print(f"Stop with: python3 {Path(__file__).name} --stop --responses "
          f"{os.path.relpath(args.responses)}  (or Ctrl-C / kill {os.getpid()})", flush=True)
    # Treat SIGTERM (what --stop sends) like Ctrl-C so shutdown is graceful and
    # the finally block below runs.
    def _graceful(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, _graceful)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.", flush=True)
    finally:
        server.server_close()
        if pidfile:
            pidfile.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
