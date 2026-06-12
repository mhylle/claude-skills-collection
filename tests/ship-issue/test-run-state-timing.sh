#!/bin/bash
# test-run-state-timing.sh — RED-phase tests for the ship-issue run-state/timing engine.
#
# Targets skills/ship-issue/scripts/run_state.py (python3, stdlib only), per
# skills/ship-issue/references/run-state-schema.md: state.json shape, events.jsonl
# audit log, pause semantics (work / gate-wait / crash-gap are disjoint windows),
# validate, and the greppable time summary incl. the per-model-tier rollup.
#
# Plain bash, no framework. Collects ALL failures (no set -e).
# Output: one line per test "PASS|FAIL Tn: <desc>", then "X/Y passed".
# Exit 0 only if every test passes.

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNSTATE="$REPO_ROOT/skills/ship-issue/scripts/run_state.py"

PASS_COUNT=0
TOTAL_COUNT=0

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

record() {
  # record <PASS|FAIL> <test-id> <description>
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  if [ "$1" = "PASS" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
  printf '%s %s: %s\n' "$1" "$2" "$3"
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Run a run_state.py subcommand, discarding output (rc preserved for callers).
rs() {
  python3 "$RUNSTATE" "$@" >/dev/null 2>&1
}

ISSUE_URL="https://github.com/acme/widgets/issues/142"

# init_run <repo-dir> <run-id> — init a fresh run at the canonical T0.
init_run() {
  rs init --repo "$1" --run-id "$2" \
    --issue-number 142 --issue-url "$ISSUE_URL" \
    --issue-title "Add CSV export to the reports page" \
    --branch "ship-issue/142-csv-export" \
    --ts 2026-06-11T09:14:02Z
}

# write_fixture_state <file> <plan_status> <plan_duration> <work_seconds> <include_logs yes|no>
# Hand-built minimal-valid state.json (preflight passed 18s, plan ended, rest
# pending) with knobs for the T8 planted defects.
write_fixture_state() {
  local file="$1" plan_status="$2" plan_dur="$3" work="$4" include_logs="$5"
  local logs_json=""
  if [ "$include_logs" = "yes" ]; then
    logs_json=',
    "logs":         { "status": "pending", "started_at": null, "ended_at": null, "duration_seconds": null }'
  fi
  cat > "$file" <<EOF
{
  "run_id": "run-fixture",
  "issue": { "number": 1, "url": "https://example.com/issues/1", "title": "Fixture issue" },
  "branch": "ship-issue/1-fixture",
  "pr": null,
  "review_cycles": 0,
  "stages": {
    "preflight":    { "status": "passed", "started_at": "2026-06-11T09:00:00Z", "ended_at": "2026-06-11T09:00:18Z", "duration_seconds": 18 },
    "plan":         { "status": "${plan_status}", "started_at": "2026-06-11T09:00:19Z", "ended_at": "2026-06-11T09:05:19Z", "duration_seconds": ${plan_dur} },
    "implement":    { "status": "pending", "started_at": null, "ended_at": null, "duration_seconds": null },
    "review":       { "status": "pending", "started_at": null, "ended_at": null, "duration_seconds": null },
    "ci":           { "status": "pending", "started_at": null, "ended_at": null, "duration_seconds": null },
    "cloud_review": { "status": "pending", "started_at": null, "ended_at": null, "duration_seconds": null },
    "deploy":       { "status": "pending", "started_at": null, "ended_at": null, "duration_seconds": null },
    "e2e":          { "status": "pending", "started_at": null, "ended_at": null, "duration_seconds": null }${logs_json}
  },
  "gates": {
    "gate_1": { "state": "not_reached", "reached_at": null, "decided_at": null, "wait_seconds": null },
    "gate_2": { "state": "not_reached", "reached_at": null, "decided_at": null, "wait_seconds": null }
  },
  "timing": { "work_seconds": ${work}, "gate_wait_seconds": 0, "crash_gap_seconds": 0 },
  "created_at": "2026-06-11T09:00:00Z",
  "updated_at": "2026-06-11T09:05:19Z"
}
EOF
}

# write_fixture_events <file> <variant good|nowork>
# Matching minimal-valid events.jsonl; "nowork" drops work_seconds from the
# plan timer_stopped (the T8f planted defect).
write_fixture_events() {
  local file="$1" variant="$2"
  local plan_stop='{"event":"timer_stopped","ts":"2026-06-11T09:05:19Z","stage":"plan","work_seconds":300}'
  if [ "$variant" = "nowork" ]; then
    plan_stop='{"event":"timer_stopped","ts":"2026-06-11T09:05:19Z","stage":"plan"}'
  fi
  cat > "$file" <<EOF
{"event":"run_started","ts":"2026-06-11T09:00:00Z","run_id":"run-fixture","issue_number":1,"issue_url":"https://example.com/issues/1"}
{"event":"stage_started","ts":"2026-06-11T09:00:00Z","stage":"preflight"}
{"event":"timer_started","ts":"2026-06-11T09:00:00Z","stage":"preflight"}
{"event":"timer_stopped","ts":"2026-06-11T09:00:18Z","stage":"preflight","work_seconds":18}
{"event":"stage_passed","ts":"2026-06-11T09:00:18Z","stage":"preflight"}
{"event":"stage_started","ts":"2026-06-11T09:00:19Z","stage":"plan"}
{"event":"timer_started","ts":"2026-06-11T09:00:19Z","stage":"plan"}
${plan_stop}
{"event":"stage_passed","ts":"2026-06-11T09:05:19Z","stage":"plan"}
EOF
}

# ---------------------------------------------------------------------------
# T1 — init shape: state.json + 3-line events.jsonl
# ---------------------------------------------------------------------------
REPO_A="$WORK_DIR/repo-a"
mkdir -p "$REPO_A"
init_run "$REPO_A" run-a
RUN_A="$REPO_A/.ship-issue/runs/run-a"

t1_out="$(python3 - "$RUN_A" <<'PY'
import json, sys
errs = []
STAGES = ["preflight", "plan", "implement", "review", "ci", "cloud_review", "deploy", "e2e", "logs"]
def main():
    rd = sys.argv[1]
    try:
        with open(rd + "/state.json") as f:
            s = json.load(f)
    except Exception as ex:
        errs.append("state.json unreadable: %s" % ex)
        return
    stages = s.get("stages")
    if not isinstance(stages, dict) or sorted(stages.keys()) != sorted(STAGES):
        errs.append("stages keys != exactly the 9 pipeline stages: %r"
                    % (sorted(stages.keys()) if isinstance(stages, dict) else stages))
    else:
        p = stages["preflight"]
        if p.get("status") != "running":
            errs.append("preflight.status=%r (want running)" % p.get("status"))
        if p.get("started_at") != "2026-06-11T09:14:02Z":
            errs.append("preflight.started_at=%r" % p.get("started_at"))
        if p.get("ended_at") is not None or p.get("duration_seconds") is not None:
            errs.append("preflight ended_at/duration_seconds not null: %r" % p)
        for name in STAGES[1:]:
            st = stages[name]
            if (st.get("status") != "pending" or st.get("started_at") is not None
                    or st.get("ended_at") is not None or st.get("duration_seconds") is not None):
                errs.append("%s not pending/all-null: %r" % (name, st))
    if s.get("pr") is not None:
        errs.append("pr=%r (want null)" % s.get("pr"))
    gates = s.get("gates") or {}
    for g in ("gate_1", "gate_2"):
        gv = gates.get(g) or {}
        if (gv.get("state") != "not_reached" or gv.get("reached_at") is not None
                or gv.get("decided_at") is not None or gv.get("wait_seconds") is not None):
            errs.append("%s not not_reached/all-null: %r" % (g, gv))
    t = s.get("timing") or {}
    if t.get("work_seconds") != 0 or t.get("gate_wait_seconds") != 0 or t.get("crash_gap_seconds") != 0:
        errs.append("timing != zeros: %r" % t)
    if s.get("run_id") != "run-a":
        errs.append("run_id=%r" % s.get("run_id"))
    if s.get("branch") != "ship-issue/142-csv-export":
        errs.append("branch=%r" % s.get("branch"))
    if s.get("created_at") != "2026-06-11T09:14:02Z":
        errs.append("created_at=%r" % s.get("created_at"))
    if not s.get("updated_at"):
        errs.append("missing updated_at")
    iss = s.get("issue") or {}
    if iss.get("number") != 142 or not iss.get("url") or not iss.get("title"):
        errs.append("issue=%r" % iss)
    try:
        with open(rd + "/events.jsonl") as f:
            evs = [json.loads(l) for l in f.read().splitlines() if l.strip()]
    except Exception as ex:
        errs.append("events.jsonl unreadable: %s" % ex)
        return
    if len(evs) != 3:
        errs.append("events.jsonl has %d events, want exactly 3" % len(evs))
        return
    e0, e1, e2 = evs
    if (e0.get("event") != "run_started" or e0.get("run_id") != "run-a"
            or e0.get("issue_number") != 142 or not e0.get("issue_url")):
        errs.append("event[0] not run_started(run_id, issue_number, issue_url): %r" % e0)
    if e1.get("event") != "stage_started" or e1.get("stage") != "preflight":
        errs.append("event[1] not stage_started(preflight): %r" % e1)
    if e2.get("event") != "timer_started" or e2.get("stage") != "preflight":
        errs.append("event[2] not timer_started(preflight): %r" % e2)
    for i, ev in enumerate(evs):
        if not ev.get("ts"):
            errs.append("event[%d] missing ts" % i)
try:
    main()
except Exception as ex:
    errs.append("exception: %r" % (ex,))
print("; ".join(errs) if errs else "OK")
PY
)"
if [ "$t1_out" = "OK" ]; then
  record PASS T1 "init creates schema-shaped state.json and 3-event events.jsonl"
else
  record FAIL T1 "init creates schema-shaped state.json and 3-event events.jsonl (${t1_out})"
fi

# ---------------------------------------------------------------------------
# T2 — stage transition timing (REQ-10 AC1)
# ---------------------------------------------------------------------------
REPO_B="$WORK_DIR/repo-b"
mkdir -p "$REPO_B"
init_run "$REPO_B" run-b
RUN_B="$REPO_B/.ship-issue/runs/run-b"

rs stage-end --run-dir "$RUN_B" --stage preflight --result passed --ts 2026-06-11T09:14:20Z
cp "$RUN_B/state.json" "$WORK_DIR/run-b-state.snap.json" 2>/dev/null
cp "$RUN_B/events.jsonl" "$WORK_DIR/run-b-events.snap.jsonl" 2>/dev/null
rs stage-start --run-dir "$RUN_B" --stage plan --ts 2026-06-11T09:14:21Z
rs stage-end --run-dir "$RUN_B" --stage plan --result passed --ts 2026-06-11T09:21:40Z

t2_out="$(python3 - "$WORK_DIR/run-b-state.snap.json" "$WORK_DIR/run-b-events.snap.jsonl" "$RUN_B" <<'PY'
import json, sys
errs = []
def load(p):
    with open(p) as f:
        return json.load(f)
def load_events(p):
    with open(p) as f:
        return [json.loads(l) for l in f.read().splitlines() if l.strip()]
def has(evs, **kw):
    return any(all(e.get(k) == v for k, v in kw.items()) for e in evs)
def main():
    snap_state, snap_events, run_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    try:
        s1 = load(snap_state)
        e1 = load_events(snap_events)
    except Exception as ex:
        errs.append("after-preflight snapshot unreadable: %s" % ex)
        return
    p = s1["stages"]["preflight"]
    if p.get("status") != "passed":
        errs.append("preflight.status=%r (want passed)" % p.get("status"))
    if p.get("ended_at") != "2026-06-11T09:14:20Z":
        errs.append("preflight.ended_at=%r" % p.get("ended_at"))
    if p.get("duration_seconds") != 18:
        errs.append("preflight.duration_seconds=%r (want 18)" % p.get("duration_seconds"))
    if s1["timing"].get("work_seconds") != 18:
        errs.append("timing.work_seconds=%r after preflight end (want 18)" % s1["timing"].get("work_seconds"))
    stops = [i for i, e in enumerate(e1) if e.get("event") == "timer_stopped" and e.get("stage") == "preflight"]
    passes = [i for i, e in enumerate(e1) if e.get("event") == "stage_passed" and e.get("stage") == "preflight"]
    if len(stops) != 1 or e1[stops[0]].get("work_seconds") != 18:
        errs.append("want one timer_stopped(preflight, work_seconds=18), got %r" % [e1[i] for i in stops])
    if len(passes) != 1:
        errs.append("want one stage_passed(preflight), got %d" % len(passes))
    if stops and passes and not stops[0] < passes[0]:
        errs.append("timer_stopped(preflight) must precede stage_passed(preflight)")
    try:
        s2 = load(run_dir + "/state.json")
        e2 = load_events(run_dir + "/events.jsonl")
    except Exception as ex:
        errs.append("final run state unreadable: %s" % ex)
        return
    pl = s2["stages"]["plan"]
    if pl.get("status") != "passed":
        errs.append("plan.status=%r (want passed)" % pl.get("status"))
    if pl.get("started_at") != "2026-06-11T09:14:21Z":
        errs.append("plan.started_at=%r" % pl.get("started_at"))
    if pl.get("ended_at") != "2026-06-11T09:21:40Z":
        errs.append("plan.ended_at=%r" % pl.get("ended_at"))
    if pl.get("duration_seconds") != 439:
        errs.append("plan.duration_seconds=%r (want 439)" % pl.get("duration_seconds"))
    if s2["timing"].get("work_seconds") != 457:
        errs.append("timing.work_seconds=%r (want 457 = 18+439)" % s2["timing"].get("work_seconds"))
    if not has(e2, event="stage_started", stage="plan"):
        errs.append("missing stage_started(plan)")
    if not has(e2, event="timer_started", stage="plan"):
        errs.append("missing timer_started(plan)")
    if not has(e2, event="timer_stopped", stage="plan", work_seconds=439):
        errs.append("missing timer_stopped(plan, work_seconds=439)")
    if not has(e2, event="stage_passed", stage="plan"):
        errs.append("missing stage_passed(plan)")
try:
    main()
except Exception as ex:
    errs.append("exception: %r" % (ex,))
print("; ".join(errs) if errs else "OK")
PY
)"
if [ "$t2_out" = "OK" ]; then
  record PASS T2 "stage-end records duration/work and timer_stopped+stage_passed events (REQ-10 AC1)"
else
  record FAIL T2 "stage-end records duration/work and timer_stopped+stage_passed events (REQ-10 AC1) (${t2_out})"
fi

# ---------------------------------------------------------------------------
# T3 — gate wait excluded from work (REQ-10 AC2)
# ---------------------------------------------------------------------------
rs gate-reached --run-dir "$RUN_B" --gate gate_1 --ts 2026-06-11T09:21:41Z
rs gate-decision --run-dir "$RUN_B" --gate gate_1 --decision approved --ts 2026-06-11T09:40:12Z

t3_out="$(python3 - "$RUN_B" <<'PY'
import json, sys
errs = []
def main():
    rd = sys.argv[1]
    try:
        with open(rd + "/state.json") as f:
            s = json.load(f)
        with open(rd + "/events.jsonl") as f:
            evs = [json.loads(l) for l in f.read().splitlines() if l.strip()]
    except Exception as ex:
        errs.append("run state unreadable: %s" % ex)
        return
    g = s["gates"]["gate_1"]
    if g.get("state") != "approved":
        errs.append("gate_1.state=%r (want approved)" % g.get("state"))
    if g.get("reached_at") != "2026-06-11T09:21:41Z":
        errs.append("gate_1.reached_at=%r" % g.get("reached_at"))
    if g.get("decided_at") != "2026-06-11T09:40:12Z":
        errs.append("gate_1.decided_at=%r" % g.get("decided_at"))
    if g.get("wait_seconds") != 1111:
        errs.append("gate_1.wait_seconds=%r (want 1111)" % g.get("wait_seconds"))
    t = s["timing"]
    if t.get("gate_wait_seconds") != 1111:
        errs.append("timing.gate_wait_seconds=%r (want 1111)" % t.get("gate_wait_seconds"))
    if t.get("work_seconds") != 457:
        errs.append("timing.work_seconds=%r (want STILL 457; gate wait must not fold into work)" % t.get("work_seconds"))
    if s["stages"]["plan"].get("duration_seconds") != 439:
        errs.append("plan.duration_seconds=%r (want STILL 439; gate wait must not fold into the stage)"
                    % s["stages"]["plan"].get("duration_seconds"))
    def find(**kw):
        return [e for e in evs if all(e.get(k) == v for k, v in kw.items())]
    if not find(event="gate_reached", gate="gate_1"):
        errs.append("missing gate_reached(gate_1)")
    if not find(event="gate_wait_started", gate="gate_1", at="2026-06-11T09:21:41Z"):
        errs.append("missing gate_wait_started(gate_1, at=09:21:41Z)")
    if not find(event="gate_wait_ended", gate="gate_1", at="2026-06-11T09:40:12Z", wait_seconds=1111):
        errs.append("missing gate_wait_ended(gate_1, at=09:40:12Z, wait_seconds=1111)")
    decisions = find(event="gate_decision", gate="gate_1", decision="approved")
    if not decisions:
        errs.append("missing gate_decision(gate_1, approved)")
    elif not ("feedback" in decisions[0] and decisions[0]["feedback"] is None):
        errs.append("gate_decision feedback should be explicit null: %r" % decisions[0])
try:
    main()
except Exception as ex:
    errs.append("exception: %r" % (ex,))
print("; ".join(errs) if errs else "OK")
PY
)"
if [ "$t3_out" = "OK" ]; then
  record PASS T3 "gate wait is tracked separately and never folded into work time (REQ-10 AC2)"
else
  record FAIL T3 "gate wait is tracked separately and never folded into work time (REQ-10 AC2) (${t3_out})"
fi

# ---------------------------------------------------------------------------
# T4 — crash gap excluded from work (REQ-10 AC2)
# ---------------------------------------------------------------------------
REPO_C="$WORK_DIR/repo-c"
mkdir -p "$REPO_C"
init_run "$REPO_C" run-c
RUN_C="$REPO_C/.ship-issue/runs/run-c"
rs stage-end --run-dir "$RUN_C" --stage preflight --result passed --ts 2026-06-11T09:14:20Z
rs stage-start --run-dir "$RUN_C" --stage plan --ts 2026-06-11T10:00:00Z
# no stage-end: simulate a crash, then resume
t4_resume_out="$(python3 "$RUNSTATE" resume-check --run-dir "$RUN_C" --ts 2026-06-11T10:45:19Z 2>/dev/null)"
rs stage-end --run-dir "$RUN_C" --stage plan --result passed --ts 2026-06-11T10:50:19Z

t4_ok=1
t4_reason=""
if [ "$t4_resume_out" != "RESUME_AT: stage:plan" ]; then
  t4_ok=0
  t4_reason="resume-check printed [${t4_resume_out}] not [RESUME_AT: stage:plan];"
fi
t4_out="$(python3 - "$RUN_C" <<'PY'
import json, sys
errs = []
def main():
    rd = sys.argv[1]
    try:
        with open(rd + "/state.json") as f:
            s = json.load(f)
        with open(rd + "/events.jsonl") as f:
            evs = [json.loads(l) for l in f.read().splitlines() if l.strip()]
    except Exception as ex:
        errs.append("run state unreadable: %s" % ex)
        return
    gaps = [(i, e) for i, e in enumerate(evs) if e.get("event") == "crash_gap_recorded"]
    if len(gaps) != 1:
        errs.append("want exactly one crash_gap_recorded, got %d" % len(gaps))
    else:
        gi, gap = gaps[0]
        if gap.get("stage") != "plan":
            errs.append("crash_gap_recorded.stage=%r (want plan)" % gap.get("stage"))
        if gap.get("from") != "2026-06-11T10:00:00Z":
            errs.append("crash_gap_recorded.from=%r (want last event ts 10:00:00Z)" % gap.get("from"))
        if gap.get("to") != "2026-06-11T10:45:19Z":
            errs.append("crash_gap_recorded.to=%r (want resume ts 10:45:19Z)" % gap.get("to"))
        if gap.get("gap_seconds") != 2719:
            errs.append("crash_gap_recorded.gap_seconds=%r (want 2719)" % gap.get("gap_seconds"))
        fresh = [i for i, e in enumerate(evs)
                 if e.get("event") == "timer_started" and e.get("stage") == "plan"
                 and e.get("ts") == "2026-06-11T10:45:19Z"]
        if not fresh or fresh[-1] < gi:
            errs.append("missing fresh timer_started(plan) at 10:45:19Z after the crash gap")
    if s["timing"].get("crash_gap_seconds") != 2719:
        errs.append("timing.crash_gap_seconds=%r (want 2719)" % s["timing"].get("crash_gap_seconds"))
    dur = s["stages"]["plan"].get("duration_seconds")
    if dur != 300:
        hint = ""
        if dur == 3019:
            hint = " — crash gap was folded into the stage duration"
        elif dur == 3319:
            hint = " — crash gap AND second window double-counted"
        errs.append("plan.duration_seconds=%r (want exactly 300: only the 10:45:19->10:50:19 window)%s" % (dur, hint))
    if s["timing"].get("work_seconds") != 318:
        errs.append("timing.work_seconds=%r (want 318 = 18+300)" % s["timing"].get("work_seconds"))
try:
    main()
except Exception as ex:
    errs.append("exception: %r" % (ex,))
print("; ".join(errs) if errs else "OK")
PY
)"
if [ "$t4_out" != "OK" ]; then
  t4_ok=0
  t4_reason="${t4_reason} ${t4_out}"
fi
if [ "$t4_ok" -eq 1 ]; then
  record PASS T4 "crash gap is recorded separately and never folded into stage work (REQ-10 AC2)"
else
  record FAIL T4 "crash gap is recorded separately and never folded into stage work (REQ-10 AC2) (${t4_reason})"
fi

# ---------------------------------------------------------------------------
# T5 — multi-window accumulation: 2x timer_started, 1x stage_started, 1x timer_stopped(300)
# ---------------------------------------------------------------------------
t5_out="$(python3 - "$RUN_C" <<'PY'
import json, sys
errs = []
def main():
    rd = sys.argv[1]
    try:
        with open(rd + "/events.jsonl") as f:
            evs = [json.loads(l) for l in f.read().splitlines() if l.strip()]
    except Exception as ex:
        errs.append("events.jsonl unreadable: %s" % ex)
        return
    starts = [e for e in evs if e.get("event") == "timer_started" and e.get("stage") == "plan"]
    sstarts = [e for e in evs if e.get("event") == "stage_started" and e.get("stage") == "plan"]
    stops = [e for e in evs if e.get("event") == "timer_stopped" and e.get("stage") == "plan"]
    if len(starts) != 2:
        errs.append("want TWO timer_started(plan) (one per work window), got %d" % len(starts))
    if len(sstarts) != 1:
        errs.append("want ONE stage_started(plan) (resume opens no new stage), got %d" % len(sstarts))
    if len(stops) != 1:
        errs.append("want ONE timer_stopped(plan), got %d" % len(stops))
    elif stops[0].get("work_seconds") != 300:
        errs.append("timer_stopped(plan).work_seconds=%r (want 300)" % stops[0].get("work_seconds"))
try:
    main()
except Exception as ex:
    errs.append("exception: %r" % (ex,))
print("; ".join(errs) if errs else "OK")
PY
)"
if [ "$t5_out" = "OK" ]; then
  record PASS T5 "post-crash resume yields two work windows but a single stage_started(plan)"
else
  record FAIL T5 "post-crash resume yields two work windows but a single stage_started(plan) (${t5_out})"
fi

# ---------------------------------------------------------------------------
# T6 — gate-waiting resume: gate wait is NOT a crash gap
# ---------------------------------------------------------------------------
REPO_D="$WORK_DIR/repo-d"
mkdir -p "$REPO_D"
init_run "$REPO_D" run-d
RUN_D="$REPO_D/.ship-issue/runs/run-d"
rs stage-end --run-dir "$RUN_D" --stage preflight --result passed --ts 2026-06-11T09:14:20Z
rs stage-start --run-dir "$RUN_D" --stage plan --ts 2026-06-11T09:14:21Z
rs stage-end --run-dir "$RUN_D" --stage plan --result passed --ts 2026-06-11T09:21:40Z
rs gate-reached --run-dir "$RUN_D" --gate gate_1 --ts 2026-06-11T09:21:41Z
t6_resume_out="$(python3 "$RUNSTATE" resume-check --run-dir "$RUN_D" --ts 2026-06-11T11:00:00Z 2>/dev/null)"

t6_ok=1
t6_reason=""
if [ "$t6_resume_out" != "RESUME_AT: gate:gate_1" ]; then
  t6_ok=0
  t6_reason="resume-check printed [${t6_resume_out}] not [RESUME_AT: gate:gate_1];"
fi
t6_out="$(python3 - "$RUN_D" <<'PY'
import json, sys
errs = []
def main():
    rd = sys.argv[1]
    try:
        with open(rd + "/state.json") as f:
            s = json.load(f)
        with open(rd + "/events.jsonl") as f:
            evs = [json.loads(l) for l in f.read().splitlines() if l.strip()]
    except Exception as ex:
        errs.append("run state unreadable: %s" % ex)
        return
    if s["gates"]["gate_1"].get("state") != "waiting":
        errs.append("gate_1.state=%r (want waiting)" % s["gates"]["gate_1"].get("state"))
    gaps = [e for e in evs if e.get("event") == "crash_gap_recorded"]
    if gaps:
        errs.append("crash_gap_recorded emitted while waiting at a gate: %r (that window is gate wait)" % gaps)
    if s["timing"].get("crash_gap_seconds") != 0:
        errs.append("timing.crash_gap_seconds=%r (want 0)" % s["timing"].get("crash_gap_seconds"))
try:
    main()
except Exception as ex:
    errs.append("exception: %r" % (ex,))
print("; ".join(errs) if errs else "OK")
PY
)"
if [ "$t6_out" != "OK" ]; then
  t6_ok=0
  t6_reason="${t6_reason} ${t6_out}"
fi
if [ "$t6_ok" -eq 1 ]; then
  record PASS T6 "resume at a waiting gate reports gate:gate_1 and records no crash gap"
else
  record FAIL T6 "resume at a waiting gate reports gate:gate_1 and records no crash gap (${t6_reason})"
fi

# ---------------------------------------------------------------------------
# T7 — validate accepts a real engine-produced run (T3's run)
# ---------------------------------------------------------------------------
python3 "$RUNSTATE" validate --run-dir "$RUN_B" >/dev/null 2>&1
t7_rc=$?
if [ "$t7_rc" -eq 0 ]; then
  record PASS T7 "validate exits 0 on an engine-produced conformant run"
else
  record FAIL T7 "validate exits 0 on an engine-produced conformant run (rc=${t7_rc})"
fi

# ---------------------------------------------------------------------------
# T8 — validate rejects planted defects (each fixture minimal-valid otherwise)
# ---------------------------------------------------------------------------
F="$WORK_DIR/fixtures"

mkdir -p "$F/baseline"
write_fixture_state "$F/baseline/state.json" passed 300 318 yes
write_fixture_events "$F/baseline/events.jsonl" good

# (a) only 8 stage keys: logs missing
mkdir -p "$F/bad-a-missing-logs"
write_fixture_state "$F/bad-a-missing-logs/state.json" passed 300 318 no
write_fixture_events "$F/bad-a-missing-logs/events.jsonl" good

# (b) invalid status enum: plan status "done"
mkdir -p "$F/bad-b-bad-enum"
write_fixture_state "$F/bad-b-bad-enum/state.json" done 300 318 yes
write_fixture_events "$F/bad-b-bad-enum/events.jsonl" good

# (c) duration mismatch: state says plan 3019, events sum to 300
#     (timing.work_seconds kept internally consistent at 18+3019 so the ONLY
#      defect is state-vs-events duration disagreement)
mkdir -p "$F/bad-c-duration-mismatch"
write_fixture_state "$F/bad-c-duration-mismatch/state.json" passed 3019 3037 yes
write_fixture_events "$F/bad-c-duration-mismatch/events.jsonl" good

# (d) events.jsonl contains an unparseable line
mkdir -p "$F/bad-d-invalid-json"
write_fixture_state "$F/bad-d-invalid-json/state.json" passed 300 318 yes
write_fixture_events "$F/bad-d-invalid-json/events.jsonl" good
printf '%s\n' 'this is not valid json {{{' >> "$F/bad-d-invalid-json/events.jsonl"

# (e) unknown event type "timer_paused"
mkdir -p "$F/bad-e-unknown-event"
write_fixture_state "$F/bad-e-unknown-event/state.json" passed 300 318 yes
write_fixture_events "$F/bad-e-unknown-event/events.jsonl" good
printf '%s\n' '{"event":"timer_paused","ts":"2026-06-11T09:06:00Z","stage":"plan"}' >> "$F/bad-e-unknown-event/events.jsonl"

# (f) timer_stopped without work_seconds
mkdir -p "$F/bad-f-no-work-seconds"
write_fixture_state "$F/bad-f-no-work-seconds/state.json" passed 300 318 yes
write_fixture_events "$F/bad-f-no-work-seconds/events.jsonl" nowork

t8_ok=1
t8_reason=""
python3 "$RUNSTATE" validate --run-dir "$F/baseline" >/dev/null 2>&1
t8_rc=$?
if [ "$t8_rc" -ne 0 ]; then
  t8_ok=0
  t8_reason="$t8_reason baseline-rejected(rc=$t8_rc)"
fi
T8_BAD_FIXTURES=(bad-a-missing-logs bad-b-bad-enum bad-c-duration-mismatch bad-d-invalid-json bad-e-unknown-event bad-f-no-work-seconds)
for fix in "${T8_BAD_FIXTURES[@]}"; do
  python3 "$RUNSTATE" validate --run-dir "$F/$fix" >/dev/null 2>&1
  t8_rc=$?
  if [ "$t8_rc" -ne 1 ]; then
    t8_ok=0
    t8_reason="$t8_reason ${fix}:rc=${t8_rc}(want 1)"
  fi
done
if [ "$t8_ok" -eq 1 ]; then
  record PASS T8 "validate accepts the minimal-valid baseline and exits 1 on each planted defect"
else
  record FAIL T8 "validate accepts the minimal-valid baseline and exits 1 on each planted defect (${t8_reason# })"
fi

# ---------------------------------------------------------------------------
# T9 — summary on a completed run (REQ-10 AC3)
# ---------------------------------------------------------------------------
RUN_T9="$F/completed"
mkdir -p "$RUN_T9"
cat > "$RUN_T9/state.json" <<'EOF'
{
  "run_id": "run-2026-06-11-issue-142-c0de",
  "issue": {
    "number": 142,
    "url": "https://github.com/acme/widgets/issues/142",
    "title": "Add CSV export to the reports page"
  },
  "branch": "ship-issue/142-csv-export",
  "pr": { "number": 187, "url": "https://github.com/acme/widgets/pull/187" },
  "stages": {
    "preflight":    { "status": "passed", "started_at": "2026-06-11T09:14:02Z", "ended_at": "2026-06-11T09:14:20Z", "duration_seconds": 18 },
    "plan":         { "status": "passed", "started_at": "2026-06-11T09:14:21Z", "ended_at": "2026-06-11T09:21:40Z", "duration_seconds": 439 },
    "implement":    { "status": "passed", "started_at": "2026-06-11T09:40:15Z", "ended_at": "2026-06-11T10:52:30Z", "duration_seconds": 4335 },
    "review":       { "status": "passed", "started_at": "2026-06-11T10:52:35Z", "ended_at": "2026-06-11T11:10:00Z", "duration_seconds": 1045 },
    "ci":           { "status": "passed", "started_at": "2026-06-11T11:10:05Z", "ended_at": "2026-06-11T11:31:00Z", "duration_seconds": 1255 },
    "cloud_review": { "status": "passed", "started_at": "2026-06-11T11:31:10Z", "ended_at": "2026-06-11T11:41:10Z", "duration_seconds": 600 },
    "deploy":       { "status": "passed", "started_at": "2026-06-11T11:41:15Z", "ended_at": "2026-06-11T11:43:15Z", "duration_seconds": 120 },
    "e2e":          { "status": "passed", "started_at": "2026-06-11T11:43:20Z", "ended_at": "2026-06-11T11:56:40Z", "duration_seconds": 800 },
    "logs":         { "status": "passed", "started_at": "2026-06-11T11:56:45Z", "ended_at": "2026-06-11T11:57:45Z", "duration_seconds": 60 }
  },
  "gates": {
    "gate_1": { "state": "approved", "reached_at": "2026-06-11T09:21:41Z", "decided_at": "2026-06-11T09:40:12Z", "wait_seconds": 1111 },
    "gate_2": { "state": "approved", "reached_at": "2026-06-11T11:57:46Z", "decided_at": "2026-06-11T11:57:46Z", "wait_seconds": 0 }
  },
  "timing": { "work_seconds": 8672, "gate_wait_seconds": 1111, "crash_gap_seconds": 0 },
  "created_at": "2026-06-11T09:14:02Z",
  "updated_at": "2026-06-11T11:58:00Z"
}
EOF
cat > "$RUN_T9/events.jsonl" <<'EOF'
{"event":"run_started","ts":"2026-06-11T09:14:02Z","run_id":"run-2026-06-11-issue-142-c0de","issue_number":142,"issue_url":"https://github.com/acme/widgets/issues/142"}
{"event":"stage_started","ts":"2026-06-11T09:14:02Z","stage":"preflight"}
{"event":"timer_started","ts":"2026-06-11T09:14:02Z","stage":"preflight"}
{"event":"timer_stopped","ts":"2026-06-11T09:14:20Z","stage":"preflight","work_seconds":18}
{"event":"stage_passed","ts":"2026-06-11T09:14:20Z","stage":"preflight"}
{"event":"stage_started","ts":"2026-06-11T09:14:21Z","stage":"plan"}
{"event":"timer_started","ts":"2026-06-11T09:14:21Z","stage":"plan"}
{"event":"timer_stopped","ts":"2026-06-11T09:21:40Z","stage":"plan","work_seconds":439}
{"event":"stage_passed","ts":"2026-06-11T09:21:40Z","stage":"plan"}
{"event":"gate_reached","ts":"2026-06-11T09:21:41Z","gate":"gate_1"}
{"event":"gate_wait_started","ts":"2026-06-11T09:21:41Z","gate":"gate_1","at":"2026-06-11T09:21:41Z"}
{"event":"gate_wait_ended","ts":"2026-06-11T09:40:12Z","gate":"gate_1","at":"2026-06-11T09:40:12Z","wait_seconds":1111}
{"event":"gate_decision","ts":"2026-06-11T09:40:12Z","gate":"gate_1","decision":"approved","feedback":null}
{"event":"stage_started","ts":"2026-06-11T09:40:15Z","stage":"implement"}
{"event":"timer_started","ts":"2026-06-11T09:40:15Z","stage":"implement"}
{"event":"timer_stopped","ts":"2026-06-11T10:52:30Z","stage":"implement","work_seconds":4335}
{"event":"stage_passed","ts":"2026-06-11T10:52:30Z","stage":"implement"}
{"event":"stage_started","ts":"2026-06-11T10:52:35Z","stage":"review"}
{"event":"timer_started","ts":"2026-06-11T10:52:35Z","stage":"review"}
{"event":"timer_stopped","ts":"2026-06-11T11:10:00Z","stage":"review","work_seconds":1045}
{"event":"stage_passed","ts":"2026-06-11T11:10:00Z","stage":"review"}
{"event":"stage_started","ts":"2026-06-11T11:10:05Z","stage":"ci"}
{"event":"timer_started","ts":"2026-06-11T11:10:05Z","stage":"ci"}
{"event":"timer_stopped","ts":"2026-06-11T11:31:00Z","stage":"ci","work_seconds":1255}
{"event":"stage_passed","ts":"2026-06-11T11:31:00Z","stage":"ci"}
{"event":"stage_started","ts":"2026-06-11T11:31:10Z","stage":"cloud_review"}
{"event":"timer_started","ts":"2026-06-11T11:31:10Z","stage":"cloud_review"}
{"event":"timer_stopped","ts":"2026-06-11T11:41:10Z","stage":"cloud_review","work_seconds":600}
{"event":"stage_passed","ts":"2026-06-11T11:41:10Z","stage":"cloud_review"}
{"event":"stage_started","ts":"2026-06-11T11:41:15Z","stage":"deploy"}
{"event":"timer_started","ts":"2026-06-11T11:41:15Z","stage":"deploy"}
{"event":"timer_stopped","ts":"2026-06-11T11:43:15Z","stage":"deploy","work_seconds":120}
{"event":"stage_passed","ts":"2026-06-11T11:43:15Z","stage":"deploy"}
{"event":"stage_started","ts":"2026-06-11T11:43:20Z","stage":"e2e"}
{"event":"timer_started","ts":"2026-06-11T11:43:20Z","stage":"e2e"}
{"event":"timer_stopped","ts":"2026-06-11T11:56:40Z","stage":"e2e","work_seconds":800}
{"event":"stage_passed","ts":"2026-06-11T11:56:40Z","stage":"e2e"}
{"event":"stage_started","ts":"2026-06-11T11:56:45Z","stage":"logs"}
{"event":"timer_started","ts":"2026-06-11T11:56:45Z","stage":"logs"}
{"event":"timer_stopped","ts":"2026-06-11T11:57:45Z","stage":"logs","work_seconds":60}
{"event":"stage_passed","ts":"2026-06-11T11:57:45Z","stage":"logs"}
{"event":"gate_reached","ts":"2026-06-11T11:57:46Z","gate":"gate_2"}
{"event":"gate_wait_started","ts":"2026-06-11T11:57:46Z","gate":"gate_2","at":"2026-06-11T11:57:46Z"}
{"event":"gate_wait_ended","ts":"2026-06-11T11:57:46Z","gate":"gate_2","at":"2026-06-11T11:57:46Z","wait_seconds":0}
{"event":"gate_decision","ts":"2026-06-11T11:57:46Z","gate":"gate_2","decision":"approved","feedback":null}
{"event":"run_completed","ts":"2026-06-11T11:58:00Z","merged_pr_url":"https://github.com/acme/widgets/pull/187"}
EOF

t9_summary="$(python3 "$RUNSTATE" summary --run-dir "$RUN_T9" 2>/dev/null)"

t9_ok=1
t9_reason=""
T9_STAGE_NAMES=(preflight plan implement review ci cloud_review deploy e2e logs)
T9_STAGE_DURS=(18 439 4335 1045 1255 600 120 800 60)
for i in "${!T9_STAGE_NAMES[@]}"; do
  if ! printf '%s\n' "$t9_summary" | grep -qE "^STAGE[[:space:]]+${T9_STAGE_NAMES[$i]}[[:space:]]+${T9_STAGE_DURS[$i]}[[:space:]]*$"; then
    t9_ok=0
    t9_reason="$t9_reason no-STAGE-${T9_STAGE_NAMES[$i]}-${T9_STAGE_DURS[$i]}"
  fi
done
t9_stage_order="$(printf '%s\n' "$t9_summary" | awk '$1=="STAGE"{printf "%s ", $2}')"
if [ "$t9_stage_order" != "preflight plan implement review ci cloud_review deploy e2e logs " ]; then
  t9_ok=0
  t9_reason="$t9_reason stage-order:[${t9_stage_order}]"
fi
for want in \
  "^TOTAL[[:space:]]+work[[:space:]]+8672[[:space:]]*$" \
  "^TOTAL[[:space:]]+gate_wait[[:space:]]+1111[[:space:]]*$" \
  "^TOTAL[[:space:]]+crash_gap[[:space:]]+0[[:space:]]*$" \
  "^TIER[[:space:]]+claude-fable-5[[:space:]]+1502[[:space:]]*$" \
  "^TIER[[:space:]]+claude-opus-4-8[[:space:]]+4335[[:space:]]*$" \
  "^TIER[[:space:]]+claude-sonnet-4-6[[:space:]]+860[[:space:]]*$" \
  "^TIER[[:space:]]+external[[:space:]]+1975[[:space:]]*$" \
; do
  if ! printf '%s\n' "$t9_summary" | grep -qE "$want"; then
    t9_ok=0
    t9_reason="$t9_reason missing:[${want}]"
  fi
done
if [ "$t9_ok" -eq 1 ]; then
  record PASS T9 "summary prints all nine STAGE lines in order, TOTALs, and per-tier rollup (REQ-10 AC3)"
else
  record FAIL T9 "summary prints all nine STAGE lines in order, TOTALs, and per-tier rollup (REQ-10 AC3) (${t9_reason# })"
fi

# ---------------------------------------------------------------------------
# T10 — distractor (REQ-10 AC3): external stages never join a model tier
# ---------------------------------------------------------------------------
t10_ok=1
t10_reason=""
t10_fable="$(printf '%s\n' "$t9_summary" | awk '$1=="TIER" && $2=="claude-fable-5"{print $3; exit}')"
t10_tier_count="$(printf '%s\n' "$t9_summary" | awk '$1=="TIER"{n++} END{print n+0}')"
t10_tier_sum="$(printf '%s\n' "$t9_summary" | awk '$1=="TIER"{s+=$3} END{print s+0}')"
t10_total_work="$(printf '%s\n' "$t9_summary" | awk '$1=="TOTAL" && $2=="work"{print $3; exit}')"
if [ "$t10_fable" != "1502" ]; then
  t10_ok=0
  t10_reason="$t10_reason fable-5=[${t10_fable}] want 1502 (3477 would mean external work was folded into the fable tier)"
fi
if [ "$t10_tier_count" != "4" ]; then
  t10_ok=0
  t10_reason="$t10_reason tier-line-count=${t10_tier_count} want 4"
fi
if ! [[ "$t10_total_work" =~ ^[0-9]+$ ]]; then
  t10_ok=0
  t10_reason="$t10_reason TOTAL-work-not-numeric:[${t10_total_work}]"
elif [ "$t10_tier_sum" -ne "$t10_total_work" ]; then
  t10_ok=0
  t10_reason="$t10_reason tier-sum=${t10_tier_sum} != TOTAL-work=${t10_total_work}"
fi
if [ "$t10_ok" -eq 1 ]; then
  record PASS T10 "tier rollup is partition-exact: fable-5 stays 1502 and the four TIER lines sum to TOTAL work"
else
  record FAIL T10 "tier rollup is partition-exact: fable-5 stays 1502 and the four TIER lines sum to TOTAL work (${t10_reason# })"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf '%d/%d passed\n' "$PASS_COUNT" "$TOTAL_COUNT"
if [ "$PASS_COUNT" -eq "$TOTAL_COUNT" ]; then
  exit 0
fi
exit 1
