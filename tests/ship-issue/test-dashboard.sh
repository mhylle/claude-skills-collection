#!/bin/bash
# test-dashboard.sh — RED-phase tests for Phase 6 of the ship-issue pipeline:
# the single-file, stdlib-only dashboard server (skills/ship-issue/scripts/dashboard.py).
#
# The dashboard is a READ-ONLY reader of run state (ADR-0009): it scans run
# directories for state.json / events.jsonl and serves them. It never writes.
#
# Fixtures (built BEFORE the server, per the phase contract): three run dirs —
# one complete, one in-flight with a running stage (exercises live-elapsed),
# one blocked. No network beyond localhost; the server binds an ephemeral port.
#
# Plain bash, no framework. Collects ALL failures (no set -e).
# Output: one line per test "PASS|FAIL Tn: <desc>", then "X/Y passed".
# Exit 0 only if every test passes.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DASH="$REPO_ROOT/skills/ship-issue/scripts/dashboard.py"

PASS_COUNT=0
TOTAL_COUNT=0

WORK_DIR="$(mktemp -d)"
RUNS_DIR="$WORK_DIR/runs"
SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

record() {
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  if [ "$1" = "PASS" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
  printf '%s %s: %s\n' "$1" "$2" "$3"
}

# hget <url> <outfile>  → HTTP status code on stdout; body written to <outfile>.
# Uses python3 + urllib so the suite has no curl dependency.
hget() {
  python3 - "$1" "$2" <<'PY'
import sys, urllib.request
url, out = sys.argv[1], sys.argv[2]
try:
    with urllib.request.urlopen(url, timeout=10) as r:
        body = r.read()
        code = r.getcode()
except urllib.error.HTTPError as e:
    body = e.read()
    code = e.code
except Exception:
    print("000")
    sys.exit(0)
open(out, "wb").write(body)
print(code)
PY
}

# ---------------------------------------------------------------------------
# Build the three fixture run directories BEFORE touching the server.
# ---------------------------------------------------------------------------
mkdir -p "$RUNS_DIR"

# Fixture 1 — run-complete-001: every stage passed, both gates approved, merged.
mkdir -p "$RUNS_DIR/run-complete-001"
cat > "$RUNS_DIR/run-complete-001/state.json" <<'JSON'
{
  "run_id": "run-complete-001",
  "issue": {"number": 142, "url": "https://github.com/acme/widgets/issues/142", "title": "Add CSV export"},
  "branch": "ship-issue/142-csv-export",
  "pr": {"number": 57, "url": "https://github.com/acme/widgets/pull/57"},
  "review_cycles": 0,
  "stages": {
    "preflight":    {"status": "passed", "started_at": "2026-06-12T09:00:00Z", "ended_at": "2026-06-12T09:01:00Z", "duration_seconds": 60},
    "plan":         {"status": "passed", "started_at": "2026-06-12T09:02:00Z", "ended_at": "2026-06-12T09:10:00Z", "duration_seconds": 480},
    "implement":    {"status": "passed", "started_at": "2026-06-12T09:16:00Z", "ended_at": "2026-06-12T09:42:00Z", "duration_seconds": 1560},
    "review":       {"status": "passed", "started_at": "2026-06-12T09:43:00Z", "ended_at": "2026-06-12T09:46:00Z", "duration_seconds": 180},
    "ci":           {"status": "passed", "started_at": "2026-06-12T09:47:00Z", "ended_at": "2026-06-12T09:52:00Z", "duration_seconds": 300},
    "cloud_review": {"status": "passed", "started_at": "2026-06-12T09:53:00Z", "ended_at": "2026-06-12T09:58:00Z", "duration_seconds": 300},
    "deploy":       {"status": "passed", "started_at": "2026-06-12T10:00:00Z", "ended_at": "2026-06-12T10:02:00Z", "duration_seconds": 120},
    "e2e":          {"status": "passed", "started_at": "2026-06-12T10:03:00Z", "ended_at": "2026-06-12T10:08:00Z", "duration_seconds": 300},
    "logs":         {"status": "passed", "started_at": "2026-06-12T10:09:00Z", "ended_at": "2026-06-12T10:11:00Z", "duration_seconds": 120}
  },
  "gates": {
    "gate_1": {"state": "approved", "reached_at": "2026-06-12T09:11:00Z", "decided_at": "2026-06-12T09:15:00Z", "wait_seconds": 240},
    "gate_2": {"state": "approved", "reached_at": "2026-06-12T10:12:00Z", "decided_at": "2026-06-12T10:18:00Z", "wait_seconds": 360}
  },
  "timing": {"work_seconds": 3420, "gate_wait_seconds": 600, "crash_gap_seconds": 0},
  "created_at": "2026-06-12T09:00:00Z",
  "updated_at": "2026-06-12T10:18:00Z"
}
JSON
cat > "$RUNS_DIR/run-complete-001/events.jsonl" <<'JSONL'
{"event":"run_started","ts":"2026-06-12T09:00:00Z","run_id":"run-complete-001","issue_number":142,"issue_url":"https://github.com/acme/widgets/issues/142"}
{"event":"timer_started","ts":"2026-06-12T09:02:00Z","stage":"plan"}
{"event":"timer_stopped","ts":"2026-06-12T09:10:00Z","stage":"plan","work_seconds":480}
{"event":"gate_reached","ts":"2026-06-12T09:11:00Z","gate":"gate_1"}
{"event":"gate_decision","ts":"2026-06-12T09:15:00Z","gate":"gate_1","decision":"approved","feedback":null}
{"event":"gate_reached","ts":"2026-06-12T10:12:00Z","gate":"gate_2"}
{"event":"gate_decision","ts":"2026-06-12T10:18:00Z","gate":"gate_2","decision":"approved","feedback":null}
{"event":"run_completed","ts":"2026-06-12T10:18:00Z","merged_pr_url":"https://github.com/acme/widgets/pull/57"}
JSONL

# Fixture 2 — run-inflight-002: cloud_review RUNNING (no timer_stopped) so the
# reader must compute live elapsed = now - last timer_started. gate_2 unreached.
# The running stage's timer_started is generated as (now - 600s) so live
# elapsed is a positive value no matter when the suite runs (a fixed past
# timestamp would go negative if the wall clock is earlier than the literal).
mkdir -p "$RUNS_DIR/run-inflight-002"
python3 - "$RUNS_DIR/run-inflight-002" <<'PY'
import datetime, json, os, sys
run_dir = sys.argv[1]
now = datetime.datetime.now(datetime.timezone.utc)
def iso(dt):
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")
started = iso(now - datetime.timedelta(seconds=600))   # running for ~10 min
g1_reached = iso(now - datetime.timedelta(seconds=3600))
g1_decided = iso(now - datetime.timedelta(seconds=3360))
state = {
    "run_id": "run-inflight-002",
    "issue": {"number": 88, "url": "https://github.com/acme/widgets/issues/88", "title": "Dark mode toggle"},
    "branch": "ship-issue/88-dark-mode",
    "pr": {"number": 91, "url": "https://github.com/acme/widgets/pull/91"},
    "review_cycles": 1,
    "stages": {
        "preflight":    {"status": "passed",  "started_at": g1_reached, "ended_at": g1_reached, "duration_seconds": 60},
        "plan":         {"status": "passed",  "started_at": g1_reached, "ended_at": g1_decided, "duration_seconds": 480},
        "implement":    {"status": "passed",  "started_at": g1_decided, "ended_at": started,    "duration_seconds": 1560},
        "review":       {"status": "passed",  "started_at": started,    "ended_at": started,    "duration_seconds": 180},
        "ci":           {"status": "passed",  "started_at": started,    "ended_at": started,    "duration_seconds": 300},
        "cloud_review": {"status": "running", "started_at": started,    "ended_at": None,       "duration_seconds": None},
        "deploy":       {"status": "pending", "started_at": None, "ended_at": None, "duration_seconds": None},
        "e2e":          {"status": "pending", "started_at": None, "ended_at": None, "duration_seconds": None},
        "logs":         {"status": "pending", "started_at": None, "ended_at": None, "duration_seconds": None},
    },
    "gates": {
        "gate_1": {"state": "approved",    "reached_at": g1_reached, "decided_at": g1_decided, "wait_seconds": 240},
        "gate_2": {"state": "not_reached", "reached_at": None, "decided_at": None, "wait_seconds": None},
    },
    "timing": {"work_seconds": 2580, "gate_wait_seconds": 240, "crash_gap_seconds": 0},
    "created_at": g1_reached,
    "updated_at": started,
}
with open(os.path.join(run_dir, "state.json"), "w") as fh:
    json.dump(state, fh, indent=2)
events = [
    {"event": "run_started", "ts": g1_reached, "run_id": "run-inflight-002", "issue_number": 88, "issue_url": "https://github.com/acme/widgets/issues/88"},
    {"event": "gate_reached", "ts": g1_reached, "gate": "gate_1"},
    {"event": "gate_decision", "ts": g1_decided, "gate": "gate_1", "decision": "approved", "feedback": None},
    {"event": "timer_started", "ts": started, "stage": "cloud_review"},
]
with open(os.path.join(run_dir, "events.jsonl"), "w") as fh:
    for e in events:
        fh.write(json.dumps(e) + "\n")
PY

# Fixture 3 — run-blocked-003: deploy BLOCKED (infra). gate_2 unreached.
mkdir -p "$RUNS_DIR/run-blocked-003"
cat > "$RUNS_DIR/run-blocked-003/state.json" <<'JSON'
{
  "run_id": "run-blocked-003",
  "issue": {"number": 203, "url": "https://github.com/acme/widgets/issues/203", "title": "Rate-limit the API"},
  "branch": "ship-issue/203-rate-limit",
  "pr": {"number": 210, "url": "https://github.com/acme/widgets/pull/210"},
  "review_cycles": 0,
  "stages": {
    "preflight":    {"status": "passed",  "started_at": "2026-06-12T07:00:00Z", "ended_at": "2026-06-12T07:01:00Z", "duration_seconds": 60},
    "plan":         {"status": "passed",  "started_at": "2026-06-12T07:02:00Z", "ended_at": "2026-06-12T07:10:00Z", "duration_seconds": 480},
    "implement":    {"status": "passed",  "started_at": "2026-06-12T07:16:00Z", "ended_at": "2026-06-12T07:42:00Z", "duration_seconds": 1560},
    "review":       {"status": "passed",  "started_at": "2026-06-12T07:43:00Z", "ended_at": "2026-06-12T07:46:00Z", "duration_seconds": 180},
    "ci":           {"status": "passed",  "started_at": "2026-06-12T07:47:00Z", "ended_at": "2026-06-12T07:52:00Z", "duration_seconds": 300},
    "cloud_review": {"status": "passed",  "started_at": "2026-06-12T07:53:00Z", "ended_at": "2026-06-12T07:58:00Z", "duration_seconds": 300},
    "deploy":       {"status": "blocked", "started_at": "2026-06-12T08:00:00Z", "ended_at": "2026-06-12T08:05:00Z", "duration_seconds": null},
    "e2e":          {"status": "pending", "started_at": null, "ended_at": null, "duration_seconds": null},
    "logs":         {"status": "pending", "started_at": null, "ended_at": null, "duration_seconds": null}
  },
  "gates": {
    "gate_1": {"state": "approved",    "reached_at": "2026-06-12T07:11:00Z", "decided_at": "2026-06-12T07:15:00Z", "wait_seconds": 240},
    "gate_2": {"state": "not_reached", "reached_at": null, "decided_at": null, "wait_seconds": null}
  },
  "timing": {"work_seconds": 2880, "gate_wait_seconds": 240, "crash_gap_seconds": 0},
  "created_at": "2026-06-12T07:00:00Z",
  "updated_at": "2026-06-12T08:05:00Z"
}
JSON
cat > "$RUNS_DIR/run-blocked-003/events.jsonl" <<'JSONL'
{"event":"run_started","ts":"2026-06-12T07:00:00Z","run_id":"run-blocked-003","issue_number":203,"issue_url":"https://github.com/acme/widgets/issues/203"}
{"event":"stage_started","ts":"2026-06-12T08:00:00Z","stage":"deploy"}
{"event":"stage_blocked","ts":"2026-06-12T08:05:00Z","stage":"deploy","reason":"ECS service failed to stabilize"}
JSONL

# ---------------------------------------------------------------------------
# T1 — dashboard.py exists and compiles
# ---------------------------------------------------------------------------
t1_ok=1; t1_reason=""
if [ ! -f "$DASH" ]; then
  t1_ok=0; t1_reason="missing-file"
elif ! python3 -m py_compile "$DASH" 2>/dev/null; then
  t1_ok=0; t1_reason="py_compile-failed"
fi
if [ "$t1_ok" -eq 1 ]; then
  record PASS T1 "dashboard.py exists and py_compile passes"
else
  record FAIL T1 "dashboard.py exists and py_compile passes (${t1_reason})"
fi

# ---------------------------------------------------------------------------
# T2 — stdlib-only: every imported top-level module is in the stdlib allowlist
# ---------------------------------------------------------------------------
t2_ok=1; t2_bad=""
if [ -f "$DASH" ]; then
  mods="$(python3 - "$DASH" <<'PY'
import ast, sys
tree = ast.parse(open(sys.argv[1]).read())
mods = set()
for n in ast.walk(tree):
    if isinstance(n, ast.Import):
        for a in n.names:
            mods.add(a.name.split(".")[0])
    elif isinstance(n, ast.ImportFrom):
        if n.level == 0 and n.module:
            mods.add(n.module.split(".")[0])
print(" ".join(sorted(mods)))
PY
)"
  allow=" argparse json os sys datetime http urllib html socketserver functools io time re collections "
  for m in $mods; do
    case "$allow" in
      *" $m "*) : ;;
      *) t2_ok=0; t2_bad="$t2_bad $m" ;;
    esac
  done
else
  t2_ok=0; t2_bad="no-file"
fi
if [ "$t2_ok" -eq 1 ]; then
  record PASS T2 "dashboard imports are stdlib-only"
else
  record FAIL T2 "dashboard imports are stdlib-only (non-stdlib:${t2_bad})"
fi

# ---------------------------------------------------------------------------
# T3 — single file: exactly one dashboard*.py in scripts/
# ---------------------------------------------------------------------------
t3_ok=1
n="$(find "$REPO_ROOT/skills/ship-issue/scripts" -maxdepth 1 -name 'dashboard*.py' -type f 2>/dev/null | wc -l)"
[ "$n" -eq 1 ] || t3_ok=0
if [ "$t3_ok" -eq 1 ]; then
  record PASS T3 "dashboard is a single file (one dashboard*.py)"
else
  record FAIL T3 "dashboard is a single file (one dashboard*.py) (found=$n)"
fi

# ---------------------------------------------------------------------------
# Start the server on an ephemeral port (only if the file exists & compiles).
# ---------------------------------------------------------------------------
PORT=""
if [ "$t1_ok" -eq 1 ]; then
  SRV_OUT="$WORK_DIR/server.out"
  ( python3 "$DASH" --dir "$RUNS_DIR" --port 0 >"$SRV_OUT" 2>/dev/null ) &
  SERVER_PID=$!
  for _ in $(seq 1 50); do
    PORT="$(grep -oE 'DASHBOARD_PORT [0-9]+' "$SRV_OUT" 2>/dev/null | grep -oE '[0-9]+' | head -n1)"
    [ -n "$PORT" ] && break
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 0.1
  done
fi
BASE="http://127.0.0.1:${PORT:-0}"

# ---------------------------------------------------------------------------
# T4 — GET /api/runs lists all three runs, each fully shaped
# ---------------------------------------------------------------------------
t4_ok=1; t4_reason=""
if [ -z "$PORT" ]; then
  t4_ok=0; t4_reason="server-did-not-start"
else
  body="$WORK_DIR/runs.json"
  code="$(hget "$BASE/api/runs" "$body")"
  [ "$code" = "200" ] || { t4_ok=0; t4_reason="$t4_reason http=$code"; }
  python3 - "$body" <<'PY' || { t4_ok=0; t4_reason="$t4_reason shape"; }
import json, sys
d = json.load(open(sys.argv[1]))
runs = {r["run_id"]: r for r in d["runs"]}
assert set(runs) == {"run-complete-001","run-inflight-002","run-blocked-003"}, runs.keys()
STAGES = ["preflight","plan","implement","review","ci","cloud_review","deploy","e2e","logs"]
for r in runs.values():
    names = [s["name"] for s in r["stages"]]
    assert names == STAGES, names
    for s in r["stages"]:
        assert "status" in s and "tier" in s and "tier_label" in s and "duration_seconds" in s
    assert set(r["gates"]) == {"gate_1","gate_2"}
    for k in ("work_seconds","gate_wait_seconds","crash_gap_seconds"):
        assert k in r["totals"], k
    assert "tiers" in r
PY
fi
if [ "$t4_ok" -eq 1 ]; then
  record PASS T4 "GET /api/runs lists all three runs with nine stages, tiers, gates, totals"
else
  record FAIL T4 "GET /api/runs lists all three runs with nine stages, tiers, gates, totals (${t4_reason# })"
fi

# ---------------------------------------------------------------------------
# T5 — live elapsed: running stage gets a computed live_elapsed_seconds > 0,
#       and it is NOT stored in state.json (duration_seconds stays null there)
# ---------------------------------------------------------------------------
t5_ok=1; t5_reason=""
if [ -z "$PORT" ]; then
  t5_ok=0; t5_reason="server-did-not-start"
else
  python3 - "$WORK_DIR/runs.json" "$RUNS_DIR/run-inflight-002/state.json" <<'PY' || t5_ok=0
import json, sys
api = json.load(open(sys.argv[1]))
r = next(x for x in api["runs"] if x["run_id"] == "run-inflight-002")
cr = next(s for s in r["stages"] if s["name"] == "cloud_review")
assert cr["status"] == "running", cr
assert isinstance(cr.get("live_elapsed_seconds"), int) and cr["live_elapsed_seconds"] > 0, cr
assert cr["duration_seconds"] is None, cr
# never stored on disk:
disk = json.load(open(sys.argv[2]))
assert disk["stages"]["cloud_review"]["duration_seconds"] is None
assert "live_elapsed_seconds" not in disk["stages"]["cloud_review"]
PY
fi
if [ "$t5_ok" -eq 1 ]; then
  record PASS T5 "running stage exposes computed live_elapsed_seconds>0; never stored on disk"
else
  record FAIL T5 "running stage exposes computed live_elapsed_seconds>0; never stored on disk (${t5_reason})"
fi

# ---------------------------------------------------------------------------
# T6 — GET /api/runs/<id>/events returns the events list
# ---------------------------------------------------------------------------
t6_ok=1; t6_reason=""
if [ -z "$PORT" ]; then
  t6_ok=0; t6_reason="server-did-not-start"
else
  ev="$WORK_DIR/events.json"
  code="$(hget "$BASE/api/runs/run-complete-001/events" "$ev")"
  [ "$code" = "200" ] || { t6_ok=0; t6_reason="$t6_reason http=$code"; }
  python3 - "$ev" <<'PY' || { t6_ok=0; t6_reason="$t6_reason content"; }
import json, sys
d = json.load(open(sys.argv[1]))
evs = d["events"] if isinstance(d, dict) else d
types = {e["event"] for e in evs}
assert "run_started" in types and "run_completed" in types, types
PY
fi
if [ "$t6_ok" -eq 1 ]; then
  record PASS T6 "GET /api/runs/<id>/events returns the run's events (run_started..run_completed)"
else
  record FAIL T6 "GET /api/runs/<id>/events returns the run's events (${t6_reason# })"
fi

# ---------------------------------------------------------------------------
# T7 — GET / returns 200 HTML that polls every 2s and renders stage lanes
# ---------------------------------------------------------------------------
t7_ok=1; t7_reason=""
if [ -z "$PORT" ]; then
  t7_ok=0; t7_reason="server-did-not-start"
else
  page="$WORK_DIR/index.html"
  code="$(hget "$BASE/" "$page")"
  [ "$code" = "200" ] || { t7_ok=0; t7_reason="$t7_reason http=$code"; }
  grep -qF '2000' "$page" || { t7_ok=0; t7_reason="$t7_reason no-2s-poll"; }
  grep -qF 'fetch(' "$page" || { t7_ok=0; t7_reason="$t7_reason no-fetch"; }
  grep -qF '/api/runs' "$page" || { t7_ok=0; t7_reason="$t7_reason no-api-ref"; }
  grep -qiF 'cloud_review' "$page" || { t7_ok=0; t7_reason="$t7_reason no-stage-names"; }
fi
if [ "$t7_ok" -eq 1 ]; then
  record PASS T7 "GET / returns HTML that polls /api/runs every 2s and references stage lanes"
else
  record FAIL T7 "GET / returns HTML that polls /api/runs every 2s and references stage lanes (${t7_reason# })"
fi

# ---------------------------------------------------------------------------
# T8 — per-tier rollup is partition-exact on the complete run
# ---------------------------------------------------------------------------
t8_ok=1
if [ -n "$PORT" ]; then
  python3 - "$WORK_DIR/runs.json" <<'PY' || t8_ok=0
import json, sys
api = json.load(open(sys.argv[1]))
r = next(x for x in api["runs"] if x["run_id"] == "run-complete-001")
t = r["tiers"]
assert t["claude-fable-5"] == 720, t      # preflight60 + plan480 + review180
assert t["claude-opus-4-8"] == 1560, t    # implement
assert t["claude-sonnet-4-6"] == 420, t   # e2e300 + logs120
assert t["external"] == 720, t            # ci300 + cloud_review300 + deploy120
assert sum(t.values()) == r["totals"]["work_seconds"] == 3420, (t, r["totals"])
PY
else
  t8_ok=0
fi
if [ "$t8_ok" -eq 1 ]; then
  record PASS T8 "complete-run tier rollup partition-exact and sums to work_seconds (3420)"
else
  record FAIL T8 "complete-run tier rollup partition-exact and sums to work_seconds (3420)"
fi

# ---------------------------------------------------------------------------
# T9 — distractor: ci/cloud_review/deploy attributed to external, NOT a model
# ---------------------------------------------------------------------------
t9_ok=1
if [ -n "$PORT" ]; then
  python3 - "$WORK_DIR/runs.json" <<'PY' || t9_ok=0
import json, sys
api = json.load(open(sys.argv[1]))
r = next(x for x in api["runs"] if x["run_id"] == "run-complete-001")
tier = {s["name"]: s["tier"] for s in r["stages"]}
assert tier["ci"] == "external" and tier["cloud_review"] == "external" and tier["deploy"] == "external", tier
assert tier["preflight"] == "claude-fable-5" and tier["plan"] == "claude-fable-5" and tier["review"] == "claude-fable-5", tier
assert tier["implement"] == "claude-opus-4-8", tier
assert tier["e2e"] == "claude-sonnet-4-6" and tier["logs"] == "claude-sonnet-4-6", tier
PY
else
  t9_ok=0
fi
if [ "$t9_ok" -eq 1 ]; then
  record PASS T9 "stage tiers exact: ci/cloud_review/deploy=external, never a model tier"
else
  record FAIL T9 "stage tiers exact: ci/cloud_review/deploy=external, never a model tier"
fi

# ---------------------------------------------------------------------------
# T10 — blocked run: overall=blocked and deploy stage status=blocked
# ---------------------------------------------------------------------------
t10_ok=1
if [ -n "$PORT" ]; then
  python3 - "$WORK_DIR/runs.json" <<'PY' || t10_ok=0
import json, sys
api = json.load(open(sys.argv[1]))
r = next(x for x in api["runs"] if x["run_id"] == "run-blocked-003")
assert r["overall"] == "blocked", r["overall"]
dep = next(s for s in r["stages"] if s["name"] == "deploy")
assert dep["status"] == "blocked", dep
PY
else
  t10_ok=0
fi
if [ "$t10_ok" -eq 1 ]; then
  record PASS T10 "blocked run: overall=blocked, deploy stage status=blocked"
else
  record FAIL T10 "blocked run: overall=blocked, deploy stage status=blocked"
fi

# ---------------------------------------------------------------------------
# T11 — distractor: in-flight run is NOT complete and points at cloud_review
# ---------------------------------------------------------------------------
t11_ok=1
if [ -n "$PORT" ]; then
  python3 - "$WORK_DIR/runs.json" <<'PY' || t11_ok=0
import json, sys
api = json.load(open(sys.argv[1]))
r = next(x for x in api["runs"] if x["run_id"] == "run-inflight-002")
assert r["overall"] != "complete", r["overall"]
assert r["current"] == "cloud_review", r.get("current")
c = next(x for x in api["runs"] if x["run_id"] == "run-complete-001")
assert c["overall"] == "complete", c["overall"]
PY
else
  t11_ok=0
fi
if [ "$t11_ok" -eq 1 ]; then
  record PASS T11 "in-flight run overall!=complete and current=cloud_review; complete run overall=complete"
else
  record FAIL T11 "in-flight run overall!=complete and current=cloud_review; complete run overall=complete"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf '%d/%d passed\n' "$PASS_COUNT" "$TOTAL_COUNT"
[ "$PASS_COUNT" -eq "$TOTAL_COUNT" ] && exit 0
exit 1
