#!/usr/bin/env python3
"""ship-issue Gate 2 merge brief — a pure READER of run state.

Renders the consolidated merge brief the orchestrator presents at Gate 2:
the plan link, the PR link, every review verdict, the CI status, the E2E
evidence paths, the log verdict, any recorded ship-or-fix decisions, and the
embedded time summary (per-stage durations, the three run totals, and the
four per-model-tier rollups).

This script NEVER writes state.json or events.jsonl: the orchestrator is the
single writer of run state (ADR-0009); every other tool only reads. The time
summary it embeds reuses run_state.py's STAGES / TIER_MAP / format_number so
the brief and `run_state.py summary` cannot drift — they are the same
computation over the same state.json.

Invocation: merge_brief.py --run-dir <d>

stdlib only.
"""

import argparse
import os
import sys

# Reuse run_state.py's constants and helpers so the brief's time summary cannot
# drift from `run_state.py summary` (same dir; import the module).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run_state  # noqa: E402


def find_e2e_evidence(run_dir):
    """Relative paths of every E2E evidence file under logs/staging-e2e/.

    Paths are returned relative to the run dir so the brief points at them the
    way the run records them; a reader resolves them against the run dir (or
    absolute) — the test asserts every printed evidence path RESOLVES to a real
    file on disk."""
    evidence_dir = os.path.join(run_dir, "logs", "staging-e2e")
    if not os.path.isdir(evidence_dir):
        return []
    rels = []
    for name in sorted(os.listdir(evidence_dir)):
        full = os.path.join(evidence_dir, name)
        if os.path.isfile(full):
            rels.append(os.path.join("logs", "staging-e2e", name))
    return rels


def review_verdicts(events, state):
    """Every recorded review verdict, oldest first.

    A FIX verdict is recorded as a fix_task_dispatched on the review stage; an
    APPROVE is implied by review having passed (no terminal FIX dispatch left
    it failed). Returns a list of human-readable verdict lines."""
    lines = []
    for event in events:
        if event.get("event") == "fix_task_dispatched" \
                and event.get("stage") == "review":
            summary = event.get("evidence_summary") or ""
            lines.append("FIX (review) — %s" % summary)
    review = state.get("stages", {}).get("review", {})
    if review.get("status") == "passed":
        cycles = state.get("review_cycles", 0)
        lines.append("APPROVE (review passed after %d fix cycle(s))" % cycles)
    return lines


def decision_lines(events):
    """Every explicit ship-or-fix decision recorded for the run."""
    lines = []
    for event in events:
        if event.get("event") == "decision_recorded":
            lines.append("%s — %s (conflicting evidence: %s)" % (
                event.get("decision"), event.get("rationale"),
                event.get("conflicting_evidence")))
    return lines


def ci_status(state):
    stage = state.get("stages", {}).get("ci", {})
    return "passed (green)" if stage.get("status") == "passed" else stage.get("status")


def log_verdict(state):
    stage = state.get("stages", {}).get("logs", {})
    return "CLEAN (passed)" if stage.get("status") == "passed" else stage.get("status")


def render_time_summary(state):
    """The embedded time summary — byte-for-byte the same STAGE/TOTAL/TIER
    lines `run_state.py summary` prints, so the two producers agree."""
    stages = state["stages"]
    lines = []
    for name in run_state.STAGES:
        lines.append("STAGE %s %s"
                     % (name, run_state.format_number(stages[name].get("duration_seconds"))))
    timing = state["timing"]
    lines.append("TOTAL work %s" % run_state.format_number(timing.get("work_seconds")))
    lines.append("TOTAL gate_wait %s" % run_state.format_number(timing.get("gate_wait_seconds")))
    lines.append("TOTAL crash_gap %s" % run_state.format_number(timing.get("crash_gap_seconds")))
    for tier, tier_stages in run_state.TIER_MAP:
        total = sum(stages[s].get("duration_seconds") or 0 for s in tier_stages)
        lines.append("TIER %s %s" % (tier, run_state.format_number(total)))
    return lines


def cmd_brief(args):
    run_dir = args.run_dir
    state = run_state.read_state(run_dir)
    events = run_state.read_events(run_dir)

    issue = state.get("issue", {})
    pr = state.get("pr") or {}
    plan_path = os.path.join(run_dir, "plan.md")

    print("# Gate 2 — merge confirmation brief")
    print("")
    print("Run:   %s" % state.get("run_id"))
    print("Issue: #%s %s" % (issue.get("number"), issue.get("title")))
    print("Issue URL: %s" % issue.get("url"))
    print("")

    print("## Plan")
    print("plan: %s" % plan_path)
    print("")

    print("## Pull request")
    print("PR #%s: %s" % (pr.get("number"), pr.get("url")))
    print("")

    print("## Review verdicts")
    for line in review_verdicts(events, state):
        print("- %s" % line)
    print("")

    print("## CI status")
    print("ci: %s" % ci_status(state))
    print("")

    print("## E2E evidence")
    evidence = find_e2e_evidence(run_dir)
    if evidence:
        for rel in evidence:
            print("- %s" % rel)
    else:
        print("- (no E2E evidence files recorded)")
    print("")

    print("## Log verdict")
    print("logs: %s" % log_verdict(state))
    print("")

    decisions = decision_lines(events)
    if decisions:
        print("## Ship-or-fix decisions")
        for line in decisions:
            print("- %s" % line)
        print("")

    print("## Time summary")
    print("(work time only; gate-wait and crash-gap are reported as separate "
          "totals, never folded into the work total)")
    for line in render_time_summary(state):
        print(line)


def build_parser():
    parser = argparse.ArgumentParser(
        description="Render the ship-issue Gate 2 consolidated merge brief "
                    "(read-only; the orchestrator is the single writer of run "
                    "state).")
    parser.add_argument("--run-dir", required=True,
                        help="the run directory (.ship-issue/runs/<run_id>)")
    parser.set_defaults(func=cmd_brief)
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
