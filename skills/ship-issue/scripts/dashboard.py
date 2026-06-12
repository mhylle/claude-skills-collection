#!/usr/bin/env python3
"""ship-issue pipeline dashboard — single-file, stdlib-only, read-only.

Serves a live view of ship-issue runs by reading each run's ``state.json`` and
``events.jsonl``. It is a pure reader: it NEVER writes run state. The
orchestrator is the single writer of run state (ADR-0009); the dashboard and
any other tooling only read.

Endpoints
---------
``GET /``                      HTML page; polls ``/api/runs`` every 2 seconds.
``GET /api/runs``              JSON: every run with per-stage status, model
                               tier, and duration; gate states; run totals; the
                               per-model-tier rollup; and — for the in-flight
                               stage — a computed ``live_elapsed_seconds``
                               (``now - last timer_started``), never stored.
``GET /api/runs/<id>/events``  JSON: the run's ``events.jsonl`` as a list.

Usage
-----
``python3 dashboard.py --dir <runs-root> --port <port>``

``--dir`` defaults to ``.ship-issue/runs`` (the fixed run-state location from
run-state-schema.md). ``--port 0`` binds an ephemeral port; the chosen port is
printed as ``DASHBOARD_PORT <n>`` on startup.
"""

import argparse
import datetime
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

# The nine pipeline stages, in order (run-state-schema.md / stage-contracts.md).
STAGES = [
    "preflight", "plan", "implement", "review", "ci",
    "cloud_review", "deploy", "e2e", "logs",
]

# Model-tier attribution per stage (run-state-schema.md "Time summary" table).
# ci / cloud_review / deploy are externally executed waits — an explicit
# "external" bucket, never silently attributed to a model tier.
STAGE_TIER = {
    "preflight": "claude-fable-5",
    "plan": "claude-fable-5",
    "review": "claude-fable-5",
    "implement": "claude-opus-4-8",
    "e2e": "claude-sonnet-4-6",
    "logs": "claude-sonnet-4-6",
    "ci": "external",
    "cloud_review": "external",
    "deploy": "external",
}

TIER_LABEL = {
    "claude-fable-5": "Fable 5",
    "claude-opus-4-8": "Opus 4.8",
    "claude-sonnet-4-6": "Sonnet 4.6",
    "external": "external",
}


def _parse_ts(value):
    """Parse an ISO-8601 timestamp (accepting a trailing ``Z``) to aware UTC."""
    if not value:
        return None
    text = value.replace("Z", "+00:00")
    try:
        dt = datetime.datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def _read_events(run_dir):
    """Read events.jsonl into a list of dicts (skipping blank/garbage lines)."""
    path = os.path.join(run_dir, "events.jsonl")
    events = []
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except OSError:
        pass
    return events


def _live_elapsed_seconds(run_dir, stage, started_at):
    """Compute ``now - last timer_started`` for an in-flight stage.

    Live elapsed is computed by the reader, never stored (ADR-0009). Prefer the
    most recent ``timer_started`` for the stage (it tracks the current work
    window, including post-crash resumes); fall back to the stage's
    ``started_at`` when events are unavailable.
    """
    start = None
    for event in _read_events(run_dir):
        if event.get("event") == "timer_started" and event.get("stage") == stage:
            ts = _parse_ts(event.get("ts"))
            if ts is not None:
                start = ts  # keep the latest
    if start is None:
        start = _parse_ts(started_at)
    if start is None:
        return None
    return max(0, int((_now() - start).total_seconds()))


def _build_run(run_dir):
    """Assemble the reader-facing view of one run from its state.json."""
    try:
        with open(os.path.join(run_dir, "state.json"), "r", encoding="utf-8") as handle:
            state = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None

    raw_stages = state.get("stages", {}) or {}
    stages = []
    tiers = {"claude-fable-5": 0, "claude-opus-4-8": 0, "claude-sonnet-4-6": 0, "external": 0}
    running_stage = None
    for name in STAGES:
        info = raw_stages.get(name, {}) or {}
        status = info.get("status", "pending")
        duration = info.get("duration_seconds")
        tier = STAGE_TIER[name]
        entry = {
            "name": name,
            "status": status,
            "tier": tier,
            "tier_label": TIER_LABEL[tier],
            "duration_seconds": duration,
            "live_elapsed_seconds": None,
        }
        if isinstance(duration, (int, float)):
            tiers[tier] += int(duration)
        if status == "running":
            running_stage = name
            entry["live_elapsed_seconds"] = _live_elapsed_seconds(
                run_dir, name, info.get("started_at")
            )
        stages.append(entry)

    gates = state.get("gates", {}) or {}
    gate_1 = gates.get("gate_1", {}) or {}
    gate_2 = gates.get("gate_2", {}) or {}

    # Derived overall verdict and the current in-flight pointer.
    if any(s["status"] == "blocked" for s in stages):
        overall = "blocked"
    elif gate_2.get("state") == "approved":
        overall = "complete"
    else:
        overall = "in_flight"

    if running_stage is not None:
        current = running_stage
    elif gate_1.get("state") == "waiting":
        current = "gate_1"
    elif gate_2.get("state") == "waiting":
        current = "gate_2"
    else:
        current = None

    return {
        "run_id": state.get("run_id", os.path.basename(run_dir)),
        "issue": state.get("issue"),
        "branch": state.get("branch"),
        "pr": state.get("pr"),
        "review_cycles": state.get("review_cycles", 0),
        "overall": overall,
        "current": current,
        "stages": stages,
        "gates": {"gate_1": gate_1, "gate_2": gate_2},
        "totals": state.get(
            "timing",
            {"work_seconds": 0, "gate_wait_seconds": 0, "crash_gap_seconds": 0},
        ),
        "tiers": tiers,
        "updated_at": state.get("updated_at"),
    }


def _scan_runs(runs_dir):
    """Return every run under ``runs_dir`` that has a readable state.json."""
    runs = []
    try:
        names = sorted(os.listdir(runs_dir))
    except OSError:
        return runs
    for name in names:
        run_dir = os.path.join(runs_dir, name)
        if not os.path.isdir(run_dir):
            continue
        if not os.path.isfile(os.path.join(run_dir, "state.json")):
            continue
        run = _build_run(run_dir)
        if run is not None:
            runs.append(run)
    return runs


def _find_run_dir(runs_dir, run_id):
    """Resolve a run id to its directory, guarding against path traversal."""
    for name in os.listdir(runs_dir) if os.path.isdir(runs_dir) else []:
        if name == run_id and os.path.isdir(os.path.join(runs_dir, name)):
            return os.path.join(runs_dir, name)
    return None


INDEX_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ship-issue pipeline dashboard</title>
<style>
  :root { color-scheme: dark; }
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; background: #0f1115; color: #e6e6e6; }
  header { padding: 14px 20px; border-bottom: 1px solid #232733; display: flex; align-items: baseline; gap: 12px; }
  header h1 { font-size: 16px; margin: 0; }
  header .meta { color: #8a93a6; font-size: 12px; }
  main { padding: 16px 20px; display: grid; gap: 16px; }
  .run { border: 1px solid #232733; border-radius: 8px; padding: 14px 16px; background: #151823; }
  .run .top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .run .title { font-weight: 600; }
  .run .sub { color: #8a93a6; font-size: 12px; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .b-complete { background: #16361f; color: #7ee2a8; }
  .b-in_flight { background: #2a2410; color: #ecd07a; }
  .b-blocked { background: #3a1418; color: #f0a0a8; }
  .lanes { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .lane { border: 1px solid #232733; border-radius: 6px; padding: 6px 8px; min-width: 96px; }
  .lane .s { font-weight: 600; font-size: 12px; }
  .lane .tier { font-size: 10px; color: #8a93a6; }
  .lane .dur { font-size: 11px; margin-top: 2px; }
  .st-passed { border-left: 3px solid #2ea96a; }
  .st-running { border-left: 3px solid #d8b850; }
  .st-failed { border-left: 3px solid #c25; }
  .st-blocked { border-left: 3px solid #c2455a; }
  .st-pending { border-left: 3px solid #39414f; opacity: .7; }
  .gates { margin-top: 10px; display: flex; gap: 16px; font-size: 12px; color: #b8c0d0; }
  .totals { margin-top: 8px; font-size: 12px; color: #8a93a6; }
  .empty { color: #8a93a6; }
</style>
</head>
<body>
<header>
  <h1>ship-issue pipeline</h1>
  <span class="meta" id="meta">loading…</span>
</header>
<main id="runs"></main>
<script>
// Nine stages in pipeline order; mirrors the server's STAGES.
// (preflight plan implement review ci cloud_review deploy e2e logs)
const STAGES = ["preflight","plan","implement","review","ci","cloud_review","deploy","e2e","logs"];

function fmt(sec) {
  if (sec === null || sec === undefined) return "—";
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? (m + "m" + String(s).padStart(2, "0") + "s") : (s + "s");
}

function laneHTML(st) {
  const dur = st.status === "running"
    ? ("live " + fmt(st.live_elapsed_seconds))
    : fmt(st.duration_seconds);
  return '<div class="lane st-' + st.status + '">'
    + '<div class="s">' + st.name + '</div>'
    + '<div class="tier">' + st.tier_label + '</div>'
    + '<div class="dur">' + st.status + " · " + dur + '</div>'
    + '</div>';
}

function gateHTML(label, g) {
  return label + ": <strong>" + (g && g.state ? g.state : "not_reached") + "</strong>"
    + (g && g.wait_seconds != null ? " (" + fmt(g.wait_seconds) + " wait)" : "");
}

function runHTML(run) {
  const issue = run.issue || {};
  const lanes = run.stages.map(laneHTML).join("");
  const t = run.totals || {};
  return '<section class="run">'
    + '<div class="top">'
    +   '<div><span class="title">#' + (issue.number || "?") + " " + (issue.title || run.run_id) + '</span>'
    +     ' <span class="sub">' + run.run_id + (run.current ? " · at " + run.current : "") + '</span></div>'
    +   '<span class="badge b-' + run.overall + '">' + run.overall + '</span>'
    + '</div>'
    + '<div class="lanes">' + lanes + '</div>'
    + '<div class="gates">' + gateHTML("Gate 1", run.gates.gate_1) + " &nbsp; " + gateHTML("Gate 2", run.gates.gate_2) + '</div>'
    + '<div class="totals">work ' + fmt(t.work_seconds) + " · gate-wait " + fmt(t.gate_wait_seconds)
    +   " · crash-gap " + fmt(t.crash_gap_seconds) + " · cycles " + (run.review_cycles || 0) + '</div>'
    + '</section>';
}

async function refresh() {
  try {
    const res = await fetch("/api/runs", { cache: "no-store" });
    const data = await res.json();
    const runs = data.runs || [];
    document.getElementById("meta").textContent =
      runs.length + " run" + (runs.length === 1 ? "" : "s") + " · updated " + new Date().toLocaleTimeString();
    document.getElementById("runs").innerHTML =
      runs.length ? runs.map(runHTML).join("") : '<p class="empty">No runs found.</p>';
  } catch (e) {
    document.getElementById("meta").textContent = "error fetching /api/runs";
  }
}

refresh();
setInterval(refresh, 2000);
</script>
</body>
</html>
"""


class DashboardHandler(BaseHTTPRequestHandler):
    runs_dir = "."  # overridden per-server below

    def log_message(self, *args):  # keep stdout clean (only the port line)
        return

    def _send(self, code, body, content_type):
        payload = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_json(self, code, obj):
        self._send(code, json.dumps(obj), "application/json; charset=utf-8")

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/" or path == "/index.html":
            self._send(200, INDEX_HTML, "text/html; charset=utf-8")
            return
        if path == "/api/runs":
            self._send_json(200, {"runs": _scan_runs(self.runs_dir)})
            return
        if path.startswith("/api/runs/") and path.endswith("/events"):
            run_id = path[len("/api/runs/"):-len("/events")]
            run_dir = _find_run_dir(self.runs_dir, run_id)
            if run_dir is None:
                self._send_json(404, {"error": "run not found", "run_id": run_id})
                return
            self._send_json(200, {"run_id": run_id, "events": _read_events(run_dir)})
            return
        self._send_json(404, {"error": "not found", "path": path})


def main(argv=None):
    parser = argparse.ArgumentParser(description="ship-issue pipeline dashboard (read-only)")
    parser.add_argument("--dir", default=os.path.join(".ship-issue", "runs"),
                        help="runs root to scan (default: .ship-issue/runs)")
    parser.add_argument("--port", type=int, default=8770,
                        help="port to bind; 0 picks a free ephemeral port (default: 8770)")
    parser.add_argument("--host", default="127.0.0.1", help="bind host (default: 127.0.0.1)")
    args = parser.parse_args(argv)

    runs_dir = os.path.abspath(args.dir)
    handler = type("BoundHandler", (DashboardHandler,), {"runs_dir": runs_dir})
    server = ThreadingHTTPServer((args.host, args.port), handler)
    port = server.server_address[1]
    print("DASHBOARD_PORT %d" % port, flush=True)
    print("ship-issue dashboard reading %s on http://%s:%d/" % (runs_dir, args.host, port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
