#!/usr/bin/env python3
"""ship-issue run-state engine — the SINGLE WRITER of run state.

Maintains .ship-issue/runs/<run_id>/state.json (atomic snapshot, the resume
source of truth) and events.jsonl (strictly append-only audit log) per
skills/ship-issue/references/run-state-schema.md and ADR-0009: one
orchestrator writes run state; every other tool only reads.

Subcommands: init, stage-start, stage-end, gate-reached, gate-decision,
resume-check, validate, summary. All mutating commands accept
--ts YYYY-MM-DDTHH:MM:SSZ (default: now UTC).

validate: violations are printed to stdout, one per line; exit 0 = valid,
exit 1 = violations found. (Errors from other subcommands go to stderr.)

stdlib only.
"""

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone

STAGES = ("preflight", "plan", "implement", "review", "ci",
          "cloud_review", "deploy", "e2e", "logs")
GATES = ("gate_1", "gate_2")
STAGE_STATUSES = ("pending", "running", "passed", "failed", "blocked")
GATE_STATES = ("not_reached", "waiting", "approved", "rejected")
TS_FORMAT = "%Y-%m-%dT%H:%M:%SZ"

EVENT_REQUIRED_FIELDS = {
    "run_started": ("run_id", "issue_number", "issue_url"),
    "stage_started": ("stage",),
    "stage_passed": ("stage",),
    "stage_failed": ("stage", "reason"),
    "stage_blocked": ("stage", "reason"),
    "timer_started": ("stage",),
    "timer_stopped": ("stage", "work_seconds"),
    "gate_reached": ("gate",),
    "gate_wait_started": ("gate", "at"),
    "gate_wait_ended": ("gate", "at", "wait_seconds"),
    "gate_decision": ("gate", "decision", "feedback"),
    "fix_task_dispatched": ("stage", "target_agent", "model", "evidence_summary"),
    "implement_evidence": ("red_evidence", "green_evidence"),
    "crash_gap_recorded": ("stage", "from", "to", "gap_seconds"),
    "decision_recorded": ("decision", "rationale", "conflicting_evidence"),
    "run_completed": ("merged_pr_url",),
    "run_aborted": ("reason",),
}

TIER_MAP = (
    ("claude-fable-5", ("preflight", "plan", "review")),
    ("claude-opus-4-8", ("implement",)),
    ("claude-sonnet-4-6", ("e2e", "logs")),
    ("external", ("ci", "cloud_review", "deploy")),
)

# The merge-gate review loop is bounded: after this many FIX verdicts the run
# exits BLOCKED with a consolidated report (an ERROR PATH, not a third human
# gate). The bound guarantees an unattended run terminates by design rather
# than burning cycles forever — see references/stage-contracts.md, Stage 4.
MAX_REVIEW_CYCLES = 3

# Fix work is always a FRESH task on the SAME pinned tier as the work it
# repairs (references/model-tiering.md, Rule 3). Every dispatched fix — whether
# triggered by a review FIX verdict, a CI failure, a cloud-review finding, or a
# staging verifier — is implementation work, so it goes to tdd-implementer on
# claude-opus-4-8. This pairing is enforced mechanically: a fix-dispatched call
# naming any other agent/model pair dies, so a mid-task downgrade cannot be
# logged as if it were legitimate (model-tiering.md Rule 4: no fallback).
FIX_AGENT = "tdd-implementer"
FIX_MODEL = "claude-opus-4-8"

# Exit code the 3rd merge-gate FIX uses to signal the bound is exhausted, so
# the orchestrator can branch to the consolidated-report BLOCKED path. Distinct
# from die()'s exit 3 (a usage/state error) and from 0/1/2.
REVIEW_EXHAUSTED_EXIT = 4


def die(message):
    print("run_state.py: error: %s" % message, file=sys.stderr)
    sys.exit(3)


def parse_ts(text):
    try:
        return datetime.strptime(text, TS_FORMAT).replace(tzinfo=timezone.utc)
    except ValueError:
        die("invalid timestamp %r (expected YYYY-MM-DDTHH:MM:SSZ)" % text)


def default_ts():
    return datetime.now(timezone.utc).strftime(TS_FORMAT)


def seconds_between(start_ts, end_ts):
    return int((parse_ts(end_ts) - parse_ts(start_ts)).total_seconds())


def state_path(run_dir):
    return os.path.join(run_dir, "state.json")


def events_path(run_dir):
    return os.path.join(run_dir, "events.jsonl")


def read_state(run_dir):
    path = state_path(run_dir)
    if not os.path.isfile(path):
        die("no state.json in %s" % run_dir)
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except ValueError as ex:
        die("state.json in %s does not parse: %s" % (run_dir, ex))


def write_state(run_dir, state, ts):
    """Atomically replace state.json; refreshes updated_at on every mutation."""
    state["updated_at"] = ts
    fd, tmp_path = tempfile.mkstemp(dir=run_dir, prefix=".state-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
            f.write("\n")
        os.replace(tmp_path, state_path(run_dir))
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def append_event(run_dir, event):
    """Append-only: one JSON object per line, never rewritten."""
    with open(events_path(run_dir), "a", encoding="utf-8") as f:
        f.write(json.dumps(event) + "\n")


def read_events(run_dir):
    path = events_path(run_dir)
    if not os.path.isfile(path):
        die("no events.jsonl in %s" % run_dir)
    events = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                events.append(json.loads(line))
    return events


def make_event(event_type, ts, **fields):
    event = {"event": event_type, "ts": ts}
    event.update(fields)
    return event


def new_stage_entry():
    return {"status": "pending", "started_at": None, "ended_at": None,
            "duration_seconds": None}


def new_gate_entry():
    return {"state": "not_reached", "reached_at": None, "decided_at": None,
            "wait_seconds": None}


# ---------------------------------------------------------------------------
# Subcommands
# ---------------------------------------------------------------------------

def cmd_init(args):
    run_dir = os.path.join(args.repo, ".ship-issue", "runs", args.run_id)
    if os.path.exists(state_path(run_dir)):
        die("run %s already initialized at %s" % (args.run_id, run_dir))
    os.makedirs(run_dir, exist_ok=True)
    ts = args.ts

    stages = {name: new_stage_entry() for name in STAGES}
    stages["preflight"]["status"] = "running"
    stages["preflight"]["started_at"] = ts
    state = {
        "run_id": args.run_id,
        "issue": {"number": args.issue_number, "url": args.issue_url,
                  "title": args.issue_title},
        "branch": args.branch,
        "pr": None,
        "review_cycles": 0,
        "stages": stages,
        "gates": {name: new_gate_entry() for name in GATES},
        "timing": {"work_seconds": 0, "gate_wait_seconds": 0, "crash_gap_seconds": 0},
        "created_at": ts,
        "updated_at": ts,
    }
    write_state(run_dir, state, ts)
    append_event(run_dir, make_event("run_started", ts, run_id=args.run_id,
                                     issue_number=args.issue_number,
                                     issue_url=args.issue_url))
    append_event(run_dir, make_event("stage_started", ts, stage="preflight"))
    append_event(run_dir, make_event("timer_started", ts, stage="preflight"))
    print(run_dir)


def has_open_window(events, stage):
    """True if the stage has more timer_started than timer_stopped events."""
    starts = sum(1 for e in events
                 if e.get("event") == "timer_started" and e.get("stage") == stage)
    stops = sum(1 for e in events
                if e.get("event") == "timer_stopped" and e.get("stage") == stage)
    return starts > stops


def cmd_stage_start(args):
    state = read_state(args.run_dir)
    events = read_events(args.run_dir)
    if has_open_window(events, args.stage):
        die("stage %s already has an open work window (timer_started without "
            "timer_stopped); close it with stage-end, or use resume-check after "
            "a crash" % args.stage)
    ts = args.ts
    stage = state["stages"][args.stage]
    stage["status"] = "running"
    if stage["started_at"] is None:
        stage["started_at"] = ts
    write_state(args.run_dir, state, ts)
    append_event(args.run_dir, make_event("stage_started", ts, stage=args.stage))
    append_event(args.run_dir, make_event("timer_started", ts, stage=args.stage))


def latest_timer_started_ts(events, stage):
    """The ts of the stage's open work window (its latest timer_started)."""
    for event in reversed(events):
        if event.get("event") == "timer_started" and event.get("stage") == stage:
            return event.get("ts")
    return None


def cmd_stage_end(args):
    state = read_state(args.run_dir)
    events = read_events(args.run_dir)
    ts = args.ts
    window_start = latest_timer_started_ts(events, args.stage)
    if window_start is None:
        die("stage %s has no open work window (no timer_started found)" % args.stage)
    window = seconds_between(window_start, ts)

    stage = state["stages"][args.stage]
    stage["duration_seconds"] = (stage["duration_seconds"] or 0) + window
    stage["ended_at"] = ts
    stage["status"] = args.result
    state["timing"]["work_seconds"] += window
    write_state(args.run_dir, state, ts)

    append_event(args.run_dir, make_event("timer_stopped", ts, stage=args.stage,
                                          work_seconds=window))
    if args.result == "passed":
        append_event(args.run_dir, make_event("stage_passed", ts, stage=args.stage))
    elif args.result == "failed":
        append_event(args.run_dir, make_event("stage_failed", ts, stage=args.stage,
                                              reason=args.reason or ""))
    else:
        append_event(args.run_dir, make_event("stage_blocked", ts, stage=args.stage,
                                              reason=args.reason or ""))


def cmd_gate_reached(args):
    state = read_state(args.run_dir)
    ts = args.ts
    gate = state["gates"][args.gate]
    gate["state"] = "waiting"
    gate["reached_at"] = ts
    write_state(args.run_dir, state, ts)
    append_event(args.run_dir, make_event("gate_reached", ts, gate=args.gate))
    append_event(args.run_dir, make_event("gate_wait_started", ts, gate=args.gate, at=ts))


def cmd_gate_decision(args):
    state = read_state(args.run_dir)
    ts = args.ts
    gate = state["gates"][args.gate]
    if gate["state"] != "waiting":
        die("gate %s state is %r, not 'waiting': decision refused (reach the "
            "gate via gate-reached first; a decided gate must be re-reached "
            "before a new decision)" % (args.gate, gate["state"]))
    wait = seconds_between(gate["reached_at"], ts)
    gate["decided_at"] = ts
    gate["wait_seconds"] = wait
    gate["state"] = args.decision
    state["timing"]["gate_wait_seconds"] += wait
    write_state(args.run_dir, state, ts)
    append_event(args.run_dir, make_event("gate_wait_ended", ts, gate=args.gate,
                                          at=ts, wait_seconds=wait))
    append_event(args.run_dir, make_event("gate_decision", ts, gate=args.gate,
                                          decision=args.decision,
                                          feedback=args.feedback))


def cmd_set_pr(args):
    """Record the PR opened by the implement stage — the ONLY sanctioned path
    that mutates state.pr."""
    state = read_state(args.run_dir)
    ts = args.ts
    state["pr"] = {"number": args.number, "url": args.url}
    write_state(args.run_dir, state, ts)


def cmd_implement_evidence(args):
    """Append an implement_evidence event carrying the RED and GREEN summaries.
    Placed before the stage's stage_passed, it evidences tests-first ordering
    in the run events (requirement c163650c AC1). Both summaries are required:
    a green-only "evidence" would not evidence that RED was observed first."""
    read_state(args.run_dir)  # fail fast if the run is not initialized
    ts = args.ts
    append_event(args.run_dir, make_event("implement_evidence", ts,
                                          red_evidence=args.red,
                                          green_evidence=args.green))


def cmd_review_verdict(args):
    """Record a merge-gate-reviewer verdict.

    approve: print an approval line carrying the current cycle count; no
             dispatch, no counter change.
    fix:     increment state.review_cycles. For cycles 1..MAX_REVIEW_CYCLES-1,
             append a fix_task_dispatched (fresh tdd-implementer / claude-opus-4-8
             task carrying the reviewer's blockers VERBATIM) and print
             REVIEW_CYCLE: n/MAX + DISPATCH_FIX. The MAX-th FIX appends NO
             dispatch, prints REVIEW_CYCLES_EXHAUSTED: MAX/MAX, and exits
             REVIEW_EXHAUSTED_EXIT so the orchestrator branches to the
             consolidated-report BLOCKED path (an error exit, not a third gate).
    A FIX once the bound is already exhausted is refused (the cap cannot be
    silently exceeded)."""
    state = read_state(args.run_dir)
    ts = args.ts
    cycles = state.get("review_cycles", 0)

    if args.verdict == "approve":
        write_state(args.run_dir, state, ts)
        print("REVIEW_APPROVE: approved after %d fix cycle(s)" % cycles)
        return

    # verdict == "fix"
    if cycles >= MAX_REVIEW_CYCLES:
        die("review bound already exhausted (%d/%d FIX verdicts); no further "
            "review cycle is permitted — the run is BLOCKED pending human "
            "intervention" % (cycles, MAX_REVIEW_CYCLES))

    cycles += 1
    state["review_cycles"] = cycles
    write_state(args.run_dir, state, ts)

    if cycles >= MAX_REVIEW_CYCLES:
        # The bound is now exhausted: NO fresh fix dispatch — the run stops
        # burning cycles and pulls in the human via the consolidated report.
        # Record the exhaustion in the audit log (every transition is logged):
        # this is the error-exit transition, so it is a stage_blocked on review,
        # NOT a fix_task_dispatched (no fresh task is dispatched here).
        append_event(args.run_dir, make_event(
            "stage_blocked", ts, stage="review",
            reason="review cycles exhausted (%d/%d FIX verdicts)"
                   % (cycles, MAX_REVIEW_CYCLES)))
        print("REVIEW_CYCLES_EXHAUSTED: %d/%d" % (cycles, MAX_REVIEW_CYCLES))
        sys.exit(REVIEW_EXHAUSTED_EXIT)

    append_event(args.run_dir, make_event(
        "fix_task_dispatched", ts, stage="review",
        target_agent=FIX_AGENT, model=FIX_MODEL,
        evidence_summary=args.evidence_summary))
    print("REVIEW_CYCLE: %d/%d" % (cycles, MAX_REVIEW_CYCLES))
    print("DISPATCH_FIX")


def cmd_fix_dispatched(args):
    """Append a fix_task_dispatched for a non-review fix cycle (ci / cloud_review
    / e2e / logs). The fix is a fresh task on the same pinned tier as the work
    it repairs; the agent/model pair is VALIDATED against the fix tier
    (tdd-implementer / claude-opus-4-8). Any other pairing dies, so a mid-task
    downgrade cannot be recorded as legitimate (model-tiering.md Rule 4)."""
    read_state(args.run_dir)  # fail fast if the run is not initialized
    ts = args.ts
    if args.target_agent != FIX_AGENT or args.model != FIX_MODEL:
        die("fix dispatch tier mismatch: fix work for stage %s must go to %s on "
            "%s (got %s on %s); fresh-task-same-tier is enforced — no fallback "
            "or downgrade" % (args.stage, FIX_AGENT, FIX_MODEL,
                              args.target_agent, args.model))
    append_event(args.run_dir, make_event(
        "fix_task_dispatched", ts, stage=args.stage,
        target_agent=args.target_agent, model=args.model,
        evidence_summary=args.evidence_summary))


def cmd_record_decision(args):
    """Append a decision_recorded event — the Fable orchestrator's explicit
    ship-or-fix ruling on conflicting stage evidence (e.g. a cloud-review
    timeout consolidated as an INPUT, never a hard failure)."""
    read_state(args.run_dir)  # fail fast if the run is not initialized
    ts = args.ts
    append_event(args.run_dir, make_event(
        "decision_recorded", ts, decision=args.decision,
        rationale=args.rationale,
        conflicting_evidence=args.conflicting_evidence))


def open_window_stage(events):
    """The stage with more timer_started than timer_stopped events, if any."""
    starts = {}
    stops = {}
    for event in events:
        stage = event.get("stage")
        if event.get("event") == "timer_started":
            starts[stage] = starts.get(stage, 0) + 1
        elif event.get("event") == "timer_stopped":
            stops[stage] = stops.get(stage, 0) + 1
    for stage in STAGES:
        if starts.get(stage, 0) > stops.get(stage, 0):
            return stage
    return None


def cmd_resume_check(args):
    state = read_state(args.run_dir)
    events = read_events(args.run_dir)
    ts = args.ts

    for gate_name in GATES:
        if state["gates"][gate_name]["state"] == "waiting":
            # The gate-wait window already covers the gap: record NOTHING.
            print("RESUME_AT: gate:%s" % gate_name)
            return

    stage = open_window_stage(events)
    if stage is not None:
        gap_from = events[-1].get("ts")
        gap = seconds_between(gap_from, ts)
        append_event(args.run_dir, make_event("crash_gap_recorded", ts, stage=stage,
                                              **{"from": gap_from, "to": ts,
                                                 "gap_seconds": gap}))
        state["timing"]["crash_gap_seconds"] += gap
        write_state(args.run_dir, state, ts)
        # Reopen the work window: fresh timer_started, NO new stage_started.
        append_event(args.run_dir, make_event("timer_started", ts, stage=stage))
        print("RESUME_AT: stage:%s" % stage)
        return

    for stage_name in STAGES:
        if state["stages"][stage_name]["status"] != "passed":
            print("RESUME_AT: stage:%s" % stage_name)
            return
    print("RESUME_AT: done")


# ---------------------------------------------------------------------------
# validate
# ---------------------------------------------------------------------------

def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def validate_state(state, violations):
    review_cycles = state.get("review_cycles")
    if not isinstance(review_cycles, int) or isinstance(review_cycles, bool) \
            or review_cycles < 0 or review_cycles > MAX_REVIEW_CYCLES:
        violations.append(
            "review_cycles must be an integer in 0..%d" % MAX_REVIEW_CYCLES)
    pr = state.get("pr")
    if pr is not None and not isinstance(pr, dict):
        violations.append("pr must be null or an object with number/url")
    stages = state.get("stages")
    if not isinstance(stages, dict) or set(stages.keys()) != set(STAGES):
        violations.append("stages keys must be exactly the nine pipeline stages")
        stages = {}
    for name, entry in stages.items():
        if not isinstance(entry, dict) or entry.get("status") not in STAGE_STATUSES:
            violations.append("stage %s: status must be one of %s"
                              % (name, "/".join(STAGE_STATUSES)))
    gates = state.get("gates")
    if not isinstance(gates, dict) or set(gates.keys()) != set(GATES):
        violations.append("gates keys must be exactly gate_1 and gate_2")
        gates = {}
    for name, entry in gates.items():
        if not isinstance(entry, dict) or entry.get("state") not in GATE_STATES:
            violations.append("gate %s: state must be one of %s"
                              % (name, "/".join(GATE_STATES)))
    timing = state.get("timing")
    if not isinstance(timing, dict):
        violations.append("timing must be an object")
        return
    for field in ("work_seconds", "gate_wait_seconds", "crash_gap_seconds"):
        value = timing.get(field)
        if not is_number(value) or value < 0:
            violations.append("timing.%s must be a non-negative number" % field)


def validate_events(lines, violations):
    """Parse events lines; returns the parseable events."""
    events = []
    for index, line in enumerate(lines, start=1):
        try:
            event = json.loads(line)
        except ValueError:
            violations.append("events.jsonl line %d does not parse as JSON" % index)
            continue
        if not isinstance(event, dict):
            violations.append("events.jsonl line %d is not a JSON object" % index)
            continue
        event_type = event.get("event")
        if event_type not in EVENT_REQUIRED_FIELDS:
            violations.append("events.jsonl line %d: unknown event type %r"
                              % (index, event_type))
            continue
        if not event.get("ts"):
            violations.append("events.jsonl line %d: missing ts" % index)
        for field in EVENT_REQUIRED_FIELDS[event_type]:
            if field not in event:
                violations.append("events.jsonl line %d: %s missing required field %s"
                                  % (index, event_type, field))
        events.append(event)
    return events


def validate_timing_consistency(state, events, violations):
    stages = state.get("stages")
    if not isinstance(stages, dict):
        return
    starts = {}
    stops = {}
    work_sums = {}
    for event in events:
        stage = event.get("stage")
        if event.get("event") == "timer_started":
            starts[stage] = starts.get(stage, 0) + 1
        elif event.get("event") == "timer_stopped":
            stops[stage] = stops.get(stage, 0) + 1
            work = event.get("work_seconds")
            if is_number(work):
                work_sums[stage] = work_sums.get(stage, 0) + work
    for name in STAGES:
        if stops.get(name, 0) > starts.get(name, 0):
            violations.append("stage %s: more timer_stopped than timer_started events" % name)
        entry = stages.get(name)
        if not isinstance(entry, dict):
            continue
        duration = entry.get("duration_seconds")
        if duration is None:
            continue
        if not is_number(duration) or duration != work_sums.get(name, 0):
            violations.append(
                "stage %s: duration_seconds=%r != sum of timer_stopped work_seconds (%r)"
                % (name, duration, work_sums.get(name, 0)))


def validate_work_total(state, violations):
    """Run-level cross-check: timing.work_seconds == sum of all per-stage
    duration_seconds (null counted as 0)."""
    stages = state.get("stages")
    timing = state.get("timing")
    if not isinstance(stages, dict) or not isinstance(timing, dict):
        return  # shape violations already reported by validate_state
    work = timing.get("work_seconds")
    if not is_number(work):
        return  # already reported by validate_state
    total = 0
    for entry in stages.values():
        duration = entry.get("duration_seconds") if isinstance(entry, dict) else None
        if duration is None:
            continue
        if not is_number(duration):
            return  # malformed duration already reported by the per-stage check
        total += duration
    if work != total:
        violations.append(
            "timing.work_seconds=%r != sum of stage duration_seconds (%r)"
            % (work, total))


def cmd_validate(args):
    """Violations are printed to stdout, one per line; exit 0 = valid,
    exit 1 = violations found."""
    violations = []
    try:
        with open(state_path(args.run_dir), encoding="utf-8") as f:
            state = json.load(f)
    except (OSError, ValueError) as ex:
        print("state.json unreadable or unparseable: %s" % ex)
        sys.exit(1)
    try:
        with open(events_path(args.run_dir), encoding="utf-8") as f:
            lines = [line for line in f.read().splitlines() if line.strip()]
    except OSError as ex:
        print("events.jsonl unreadable: %s" % ex)
        sys.exit(1)

    validate_state(state, violations)
    events = validate_events(lines, violations)
    validate_timing_consistency(state, events, violations)
    validate_work_total(state, violations)

    if violations:
        for violation in violations:
            print(violation)
        sys.exit(1)
    sys.exit(0)


# ---------------------------------------------------------------------------
# summary
# ---------------------------------------------------------------------------

def format_number(value):
    """Integers print without decimals; null prints as '-'."""
    if value is None:
        return "-"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def cmd_summary(args):
    state = read_state(args.run_dir)
    stages = state["stages"]
    for name in STAGES:
        print("STAGE %s %s" % (name, format_number(stages[name].get("duration_seconds"))))
    timing = state["timing"]
    print("TOTAL work %s" % format_number(timing.get("work_seconds")))
    print("TOTAL gate_wait %s" % format_number(timing.get("gate_wait_seconds")))
    print("TOTAL crash_gap %s" % format_number(timing.get("crash_gap_seconds")))
    for tier, tier_stages in TIER_MAP:
        total = sum(stages[s].get("duration_seconds") or 0 for s in tier_stages)
        print("TIER %s %s" % (tier, format_number(total)))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def add_ts_argument(parser):
    parser.add_argument("--ts", default=None,
                        help="ISO8601 UTC timestamp YYYY-MM-DDTHH:MM:SSZ (default: now)")


def build_parser():
    parser = argparse.ArgumentParser(description="ship-issue run-state engine")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init", help="initialize a new run")
    p.add_argument("--repo", required=True)
    p.add_argument("--run-id", required=True)
    p.add_argument("--issue-number", required=True, type=int)
    p.add_argument("--issue-url", required=True)
    p.add_argument("--issue-title", required=True)
    p.add_argument("--branch", required=True)
    add_ts_argument(p)
    p.set_defaults(func=cmd_init)

    p = sub.add_parser("stage-start", help="mark a stage running, open a work window")
    p.add_argument("--run-dir", required=True)
    p.add_argument("--stage", required=True, choices=STAGES)
    add_ts_argument(p)
    p.set_defaults(func=cmd_stage_start)

    p = sub.add_parser("stage-end", help="close the stage's work window with a result")
    p.add_argument("--run-dir", required=True)
    p.add_argument("--stage", required=True, choices=STAGES)
    p.add_argument("--result", required=True, choices=("passed", "failed", "blocked"))
    p.add_argument("--reason", default=None)
    add_ts_argument(p)
    p.set_defaults(func=cmd_stage_end)

    p = sub.add_parser("gate-reached", help="open a gate-wait window")
    p.add_argument("--run-dir", required=True)
    p.add_argument("--gate", required=True, choices=GATES)
    add_ts_argument(p)
    p.set_defaults(func=cmd_gate_reached)

    p = sub.add_parser("gate-decision", help="record the human's gate decision")
    p.add_argument("--run-dir", required=True)
    p.add_argument("--gate", required=True, choices=GATES)
    p.add_argument("--decision", required=True, choices=("approved", "rejected"))
    p.add_argument("--feedback", default=None)
    add_ts_argument(p)
    p.set_defaults(func=cmd_gate_decision)

    p = sub.add_parser("set-pr", help="record the PR opened by the implement stage")
    p.add_argument("--run-dir", required=True)
    p.add_argument("--number", required=True, type=int)
    p.add_argument("--url", required=True)
    add_ts_argument(p)
    p.set_defaults(func=cmd_set_pr)

    p = sub.add_parser("implement-evidence",
                       help="record RED+GREEN evidence (tests-first ordering)")
    p.add_argument("--run-dir", required=True)
    p.add_argument("--red", required=True,
                   help="summary of the observed failing (RED) tests")
    p.add_argument("--green", required=True,
                   help="summary of the passing (GREEN) suite")
    add_ts_argument(p)
    p.set_defaults(func=cmd_implement_evidence)

    p = sub.add_parser("review-verdict",
                       help="record a merge-gate-reviewer APPROVE/FIX verdict")
    p.add_argument("--run-dir", required=True)
    p.add_argument("--verdict", required=True, choices=("approve", "fix"))
    p.add_argument("--evidence-summary", default="",
                   help="on fix: the reviewer's itemized blockers, VERBATIM")
    add_ts_argument(p)
    p.set_defaults(func=cmd_review_verdict)

    p = sub.add_parser("fix-dispatched",
                       help="record a non-review fix-cycle dispatch (ci/cloud_review/e2e/logs)")
    p.add_argument("--run-dir", required=True)
    p.add_argument("--stage", required=True,
                   choices=("ci", "cloud_review", "e2e", "logs"))
    p.add_argument("--evidence-summary", required=True)
    p.add_argument("--target-agent", default=FIX_AGENT,
                   help="defaults to the fix tier's agent; a mismatch dies")
    p.add_argument("--model", default=FIX_MODEL,
                   help="defaults to the fix tier's model; a mismatch dies")
    add_ts_argument(p)
    p.set_defaults(func=cmd_fix_dispatched)

    p = sub.add_parser("record-decision",
                       help="record an explicit ship-or-fix ruling on conflicting evidence")
    p.add_argument("--run-dir", required=True)
    p.add_argument("--decision", required=True, choices=("ship", "fix"))
    p.add_argument("--rationale", required=True)
    p.add_argument("--conflicting-evidence", required=True)
    add_ts_argument(p)
    p.set_defaults(func=cmd_record_decision)

    p = sub.add_parser("resume-check", help="find the resume point; record crash gaps")
    p.add_argument("--run-dir", required=True)
    add_ts_argument(p)
    p.set_defaults(func=cmd_resume_check)

    p = sub.add_parser(
        "validate",
        help="check run state conformance to the schema; violations are "
             "printed to stdout, one per line; exit 0 = valid, exit 1 = "
             "violations found",
        description="Check run state conformance to the schema. Violations "
                    "are printed to stdout, one per line; exit 0 = valid, "
                    "exit 1 = violations found.")
    p.add_argument("--run-dir", required=True)
    p.set_defaults(func=cmd_validate)

    p = sub.add_parser("summary", help="print the greppable time summary")
    p.add_argument("--run-dir", required=True)
    p.set_defaults(func=cmd_summary)

    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    if getattr(args, "ts", None) is None and hasattr(args, "ts"):
        args.ts = default_ts()
    elif hasattr(args, "ts"):
        parse_ts(args.ts)  # reject malformed timestamps up front
    args.func(args)


if __name__ == "__main__":
    main()
