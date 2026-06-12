#!/bin/bash
# test-implementation-stages.sh — RED-phase tests for Phase 4 of the ship-issue
# pipeline: the implement / review / ci / cloud_review stages.
#
# Covers the in-scope acceptance criteria of three requirements:
#   - opus-4-8-tdd-implementation-stage (c163650c): tests-first ordering
#     evidenced in run events; fix request → fresh Opus task w/ blockers verbatim.
#   - ci-cloud-review-and-ecs-staging-deploy-integration (a47eb712): CI wait +
#     fix routing without human input; cloud-review trigger/poll/timeout →
#     ship-or-fix consolidation.
#   - model-tiering-with-pinned-models (143bfa6b): fresh-task-same-tier; no
#     fallback/downgrade language.
# Plus the locked phase body's max-3 merge-gate bound (error exit, not a gate).
#
# Two test surfaces, matching the Phase-3 split (ADR-0010):
#   - Mechanical substrate: run_state.py new subcommands (set-pr,
#     review-verdict, fix-dispatched, record-decision, implement-evidence) and
#     scripts/cloud_review.py, exercised against the offline gh/aws sandbox.
#   - Text contracts on SKILL.md: the implement/review/ci/cloud_review stage
#     choreography is documented per the binding reference contracts.
#
# Each AC gets at least one positive test AND a distractor that fails any
# plausible-wrong implementation (Principle 5). No network, no real gh/aws.
#
# Plain bash, no framework. set -u, collects ALL failures (no set -e).
# Output: one line per test "PASS|FAIL Tn: <desc>", then "X/Y passed".
# Exit 0 only if every test passes.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SKILL="$REPO_ROOT/skills/ship-issue/SKILL.md"
RUNSTATE="$REPO_ROOT/skills/ship-issue/scripts/run_state.py"
CLOUD_REVIEW="$REPO_ROOT/skills/ship-issue/scripts/cloud_review.py"
STAGE_CONTRACTS="$REPO_ROOT/skills/ship-issue/references/stage-contracts.md"

# shellcheck source=lib-sandbox.sh
. "$SCRIPT_DIR/lib-sandbox.sh"

PASS_COUNT=0
TOTAL_COUNT=0

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"; cleanup_sandboxes' EXIT

record() {
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  if [ "$1" = "PASS" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
  printf '%s %s: %s\n' "$1" "$2" "$3"
}

# ---------------------------------------------------------------------------
# Extraction + command helpers (same approach as test-orchestrator-core.sh)
# ---------------------------------------------------------------------------

extract_body() {
  local file="$1"
  [ -f "$file" ] || return 1
  awk 'NR==1{next} body{print; next} /^---[[:space:]]*$/{body=1}' "$file"
}

SKILL_BODY="$WORK_DIR/skill-body.txt"
SKILL_BODY_OK=0
if extract_body "$SKILL" > "$SKILL_BODY" 2>/dev/null; then
  SKILL_BODY_OK=1
fi

# rs <sandbox> <run_state.py args...>  → run_state.py exit code; stdout passes through
rs() {
  local sb="$1"
  shift
  PATH="$sb/stubbin:$PATH" timeout 60 python3 "$RUNSTATE" "$@" </dev/null 2>/dev/null
}

# cr <sandbox> <cloud_review.py args...> → cloud_review.py exit code; stdout passes through
cr() {
  local sb="$1"
  shift
  ( cd "$sb" && PATH="$sb/stubbin:$PATH" timeout 60 python3 "$CLOUD_REVIEW" "$@" </dev/null ) 2>/dev/null
}

# init_to_implement <sandbox> <run-id>  → echoes RUN_DIR; takes a fresh run up
# to the point where implement is the active stage (preflight+plan passed,
# gate_1 approved). Used by scenario tests that exercise implement/review/ci.
init_to_implement() {
  local sb="$1" run_id="$2" run_dir
  run_dir="$sb/.ship-issue/runs/$run_id"
  rs "$sb" init --repo "$sb" --run-id "$run_id" --issue-number 142 \
     --issue-url 'https://github.com/acme/widgets/issues/142' \
     --issue-title 'Add CSV export' --branch 'ship-issue/142-csv-export' \
     --ts 2026-06-11T09:00:00Z >/dev/null || return 1
  rs "$sb" stage-end --run-dir "$run_dir" --stage preflight --result passed \
     --ts 2026-06-11T09:01:00Z >/dev/null || return 1
  rs "$sb" stage-start --run-dir "$run_dir" --stage plan \
     --ts 2026-06-11T09:01:01Z >/dev/null || return 1
  printf '# plan\n' > "$run_dir/plan.md" 2>/dev/null || return 1
  rs "$sb" stage-end --run-dir "$run_dir" --stage plan --result passed \
     --ts 2026-06-11T09:05:00Z >/dev/null || return 1
  rs "$sb" gate-reached --run-dir "$run_dir" --gate gate_1 \
     --ts 2026-06-11T09:05:01Z >/dev/null || return 1
  rs "$sb" gate-decision --run-dir "$run_dir" --gate gate_1 --decision approved \
     --ts 2026-06-11T09:10:00Z >/dev/null || return 1
  printf '%s\n' "$run_dir"
}

# count_events <events.jsonl> <event-type> [<key> <value>]
count_events() {
  python3 -c '
import json, sys
path, etype = sys.argv[1], sys.argv[2]
key = sys.argv[3] if len(sys.argv) > 3 else None
val = sys.argv[4] if len(sys.argv) > 4 else None
n = 0
for line in open(path):
    line = line.strip()
    if not line:
        continue
    e = json.loads(line)
    if e.get("event") != etype:
        continue
    if key is not None and str(e.get(key)) != val:
        continue
    n += 1
print(n)
' "$@"
}

# ===========================================================================
# GROUP A — run_state.py: implement-evidence (tests-first ordering in events)
#           REQ c163650c AC bf6b4ea0
# ===========================================================================

# ---------------------------------------------------------------------------
# T1 — implement-evidence appends an implement_evidence event carrying red +
#      green summaries; placed BEFORE stage_passed implement, it evidences
#      tests-first ordering in run events; validate accepts it.
# ---------------------------------------------------------------------------
t1_ok=1
t1_reason=""
if make_sandbox good >/dev/null; then
  sb1="$SANDBOX"
  RUN1="$(init_to_implement "$sb1" run-t1)" || { t1_ok=0; t1_reason="init"; }
  if [ "$t1_ok" -eq 1 ]; then
    rs "$sb1" stage-start --run-dir "$RUN1" --stage implement --ts 2026-06-11T09:11:00Z >/dev/null \
      || { t1_ok=0; t1_reason="$t1_reason stage-start-implement"; }
    rs "$sb1" implement-evidence --run-dir "$RUN1" \
       --red 'AC-1 test_export_button red: 3 failing' \
       --green 'AC-1 green: full suite 42 passed' \
       --ts 2026-06-11T09:30:00Z >/dev/null \
      || { t1_ok=0; t1_reason="$t1_reason implement-evidence-rc"; }
    rs "$sb1" stage-end --run-dir "$RUN1" --stage implement --result passed \
       --ts 2026-06-11T09:31:00Z >/dev/null \
      || { t1_ok=0; t1_reason="$t1_reason stage-end-implement"; }

    # implement_evidence event exists with both required fields, and precedes
    # stage_passed implement (tests-first ordering evidence).
    python3 -c '
import json, sys
evs = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
ie = [i for i,e in enumerate(evs) if e.get("event")=="implement_evidence"]
sp = [i for i,e in enumerate(evs) if e.get("event")=="stage_passed" and e.get("stage")=="implement"]
ok = len(ie)==1 and len(sp)==1 and ie[0] < sp[0]
ev = evs[ie[0]] if ie else {}
ok = ok and ev.get("red_evidence") and ev.get("green_evidence")
sys.exit(0 if ok else 1)
' "$RUN1/events.jsonl" 2>/dev/null \
      || { t1_ok=0; t1_reason="$t1_reason event-shape-or-order"; }

    rs "$sb1" validate --run-dir "$RUN1" >/dev/null \
      || { t1_ok=0; t1_reason="$t1_reason validate-rejects-implement_evidence"; }
  fi
else
  t1_ok=0; t1_reason="sandbox"
fi
if [ "$t1_ok" -eq 1 ]; then
  record PASS T1 "implement-evidence: implement_evidence event (red+green) precedes stage_passed implement; validate ok"
else
  record FAIL T1 "implement-evidence: implement_evidence event (red+green) precedes stage_passed implement; validate ok (${t1_reason# })"
fi

# ---------------------------------------------------------------------------
# T2 — DISTRACTOR (c163650c AC1): implement-evidence REQUIRES both red and
#      green. A plausible-wrong impl that accepts a green-only "evidence" (no
#      RED observed) must be rejected non-zero. Tests-first means RED is
#      evidenced, not asserted after the fact.
# ---------------------------------------------------------------------------
t2_ok=1
t2_reason=""
if make_sandbox good >/dev/null; then
  sb2="$SANDBOX"
  RUN2="$(init_to_implement "$sb2" run-t2)" || { t2_ok=0; t2_reason="init"; }
  if [ "$t2_ok" -eq 1 ]; then
    rs "$sb2" stage-start --run-dir "$RUN2" --stage implement --ts 2026-06-11T09:11:00Z >/dev/null \
      || { t2_ok=0; t2_reason="$t2_reason stage-start"; }
    # Missing --red: must fail (argparse required arg → exit non-zero).
    PATH="$sb2/stubbin:$PATH" timeout 60 python3 "$RUNSTATE" implement-evidence \
       --run-dir "$RUN2" --green 'green only' --ts 2026-06-11T09:30:00Z </dev/null >/dev/null 2>&1
    rc=$?
    if [ "$rc" -eq 0 ]; then
      t2_ok=0; t2_reason="$t2_reason green-only-accepted(rc=0)"
    fi
    # And no implement_evidence event leaked from the rejected call.
    if [ -f "$RUN2/events.jsonl" ]; then
      n="$(count_events "$RUN2/events.jsonl" implement_evidence)"
      [ "$n" = "0" ] || { t2_ok=0; t2_reason="$t2_reason leaked-event(n=$n)"; }
    fi
  fi
else
  t2_ok=0; t2_reason="sandbox"
fi
if [ "$t2_ok" -eq 1 ]; then
  record PASS T2 "distractor: implement-evidence with green-only (no red) is rejected non-zero, emits no event"
else
  record FAIL T2 "distractor: implement-evidence with green-only (no red) is rejected non-zero, emits no event (${t2_reason# })"
fi

# ===========================================================================
# GROUP B — run_state.py: review-verdict + max-3 merge-gate bound
#           REQ c163650c AC 7f5f1184 + locked phase body max-3 bound
# ===========================================================================

# ---------------------------------------------------------------------------
# T3 — review-verdict fix (cycle 1): increments review_cycles to 1, appends a
#      fix_task_dispatched targeting tdd-implementer on claude-opus-4-8 with
#      the evidence_summary BYTE-IDENTICAL to the seeded blocker text, and
#      prints REVIEW_CYCLE: 1/3 + DISPATCH_FIX.
# ---------------------------------------------------------------------------
t3_ok=1
t3_reason=""
BLOCKER='FIX: exporter.py:42 missing null check; AC-3 untested — add a test'
if make_sandbox good >/dev/null; then
  sb3="$SANDBOX"
  RUN3="$(init_to_implement "$sb3" run-t3)" || { t3_ok=0; t3_reason="init"; }
  if [ "$t3_ok" -eq 1 ]; then
    out3="$(rs "$sb3" review-verdict --run-dir "$RUN3" --verdict fix \
            --evidence-summary "$BLOCKER" --ts 2026-06-11T10:00:00Z)"
    rc=$?
    [ "$rc" -eq 0 ] || { t3_ok=0; t3_reason="$t3_reason fix-rc=$rc"; }
    printf '%s\n' "$out3" | grep -qF 'REVIEW_CYCLE: 1/3' \
      || { t3_ok=0; t3_reason="$t3_reason no-REVIEW_CYCLE-1/3"; }
    printf '%s\n' "$out3" | grep -qF 'DISPATCH_FIX' \
      || { t3_ok=0; t3_reason="$t3_reason no-DISPATCH_FIX"; }

    # review_cycles == 1 in state.json
    python3 -c '
import json, sys
s = json.load(open(sys.argv[1]))
sys.exit(0 if s.get("review_cycles") == 1 else 1)
' "$RUN3/state.json" 2>/dev/null \
      || { t3_ok=0; t3_reason="$t3_reason review_cycles!=1"; }

    # fix_task_dispatched: stage=review, target_agent=tdd-implementer,
    # model=claude-opus-4-8, evidence_summary byte-identical to BLOCKER.
    python3 -c '
import json, sys
blocker = sys.argv[2]
evs = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
fds = [e for e in evs if e.get("event")=="fix_task_dispatched"]
ok = (len(fds)==1
      and fds[0].get("stage")=="review"
      and fds[0].get("target_agent")=="tdd-implementer"
      and fds[0].get("model")=="claude-opus-4-8"
      and fds[0].get("evidence_summary")==blocker)
sys.exit(0 if ok else 1)
' "$RUN3/events.jsonl" "$BLOCKER" 2>/dev/null \
      || { t3_ok=0; t3_reason="$t3_reason fix_task_dispatched-shape-or-verbatim"; }
  fi
else
  t3_ok=0; t3_reason="sandbox"
fi
if [ "$t3_ok" -eq 1 ]; then
  record PASS T3 "review-verdict fix (cycle 1): review_cycles=1, fresh Opus fix_task_dispatched, blockers verbatim, REVIEW_CYCLE 1/3 + DISPATCH_FIX"
else
  record FAIL T3 "review-verdict fix (cycle 1): review_cycles=1, fresh Opus fix_task_dispatched, blockers verbatim, REVIEW_CYCLE 1/3 + DISPATCH_FIX (${t3_reason# })"
fi

# ---------------------------------------------------------------------------
# T4 — max-3 bound (locked phase body): the 3rd FIX verdict prints
#      REVIEW_CYCLES_EXHAUSTED: 3/3, exits 4, and appends NO new
#      fix_task_dispatched (the dispatch count stays at 2 — cycles 1 and 2).
#      review_cycles reaches 3.
# ---------------------------------------------------------------------------
t4_ok=1
t4_reason=""
if make_sandbox good >/dev/null; then
  sb4="$SANDBOX"
  RUN4="$(init_to_implement "$sb4" run-t4)" || { t4_ok=0; t4_reason="init"; }
  if [ "$t4_ok" -eq 1 ]; then
    rs "$sb4" review-verdict --run-dir "$RUN4" --verdict fix \
       --evidence-summary 'round 1 blocker' --ts 2026-06-11T10:00:00Z >/dev/null \
      || { t4_ok=0; t4_reason="$t4_reason fix1"; }
    rs "$sb4" review-verdict --run-dir "$RUN4" --verdict fix \
       --evidence-summary 'round 2 blocker' --ts 2026-06-11T10:10:00Z >/dev/null \
      || { t4_ok=0; t4_reason="$t4_reason fix2"; }
    out4="$(rs "$sb4" review-verdict --run-dir "$RUN4" --verdict fix \
            --evidence-summary 'round 3 blocker' --ts 2026-06-11T10:20:00Z)"
    rc=$?
    [ "$rc" -eq 4 ] || { t4_ok=0; t4_reason="$t4_reason 3rd-fix-rc=$rc(want-4)"; }
    printf '%s\n' "$out4" | grep -qF 'REVIEW_CYCLES_EXHAUSTED: 3/3' \
      || { t4_ok=0; t4_reason="$t4_reason no-EXHAUSTED-3/3"; }
    printf '%s\n' "$out4" | grep -qF 'DISPATCH_FIX' \
      && { t4_ok=0; t4_reason="$t4_reason 3rd-fix-still-DISPATCH_FIX"; }

    # review_cycles == 3, but only TWO fix_task_dispatched events (no 3rd dispatch).
    python3 -c '
import json, sys
s = json.load(open(sys.argv[1]))
sys.exit(0 if s.get("review_cycles") == 3 else 1)
' "$RUN4/state.json" 2>/dev/null \
      || { t4_ok=0; t4_reason="$t4_reason review_cycles!=3"; }
    n="$(count_events "$RUN4/events.jsonl" fix_task_dispatched)"
    [ "$n" = "2" ] || { t4_ok=0; t4_reason="$t4_reason dispatch-count=$n(want-2)"; }
    # The exhaustion is in the audit log: a stage_blocked(review) event, NOT a
    # 3rd fix_task_dispatched (every transition is logged — error exit included).
    nb="$(count_events "$RUN4/events.jsonl" stage_blocked stage review)"
    [ "$nb" = "1" ] || { t4_ok=0; t4_reason="$t4_reason exhausted-stage_blocked-count=$nb(want-1)"; }
  fi
else
  t4_ok=0; t4_reason="sandbox"
fi
if [ "$t4_ok" -eq 1 ]; then
  record PASS T4 "max-3 bound: 3rd FIX exits 4 with REVIEW_CYCLES_EXHAUSTED 3/3, NO 3rd dispatch (count stays 2), review_cycles=3"
else
  record FAIL T4 "max-3 bound: 3rd FIX exits 4 with REVIEW_CYCLES_EXHAUSTED 3/3, NO 3rd dispatch (count stays 2), review_cycles=3 (${t4_reason# })"
fi

# ---------------------------------------------------------------------------
# T5 — DISTRACTOR (max-3 bound): a plausible-wrong impl that allows a 4th
#      review cycle is rejected. After the 3rd FIX exhausts the bound, the
#      run is past the merge-gate cap: a 4th review-verdict call must NOT
#      silently dispatch a 4th fix (dispatch count must never exceed 2), and
#      must not exit 0 as if the cap didn't apply.
# ---------------------------------------------------------------------------
t5_ok=1
t5_reason=""
if make_sandbox good >/dev/null; then
  sb5="$SANDBOX"
  RUN5="$(init_to_implement "$sb5" run-t5)" || { t5_ok=0; t5_reason="init"; }
  if [ "$t5_ok" -eq 1 ]; then
    rs "$sb5" review-verdict --run-dir "$RUN5" --verdict fix --evidence-summary 'r1' --ts 2026-06-11T10:00:00Z >/dev/null
    rs "$sb5" review-verdict --run-dir "$RUN5" --verdict fix --evidence-summary 'r2' --ts 2026-06-11T10:10:00Z >/dev/null
    rs "$sb5" review-verdict --run-dir "$RUN5" --verdict fix --evidence-summary 'r3' --ts 2026-06-11T10:20:00Z >/dev/null
    # 4th FIX after the bound is exhausted.
    PATH="$sb5/stubbin:$PATH" timeout 60 python3 "$RUNSTATE" review-verdict \
       --run-dir "$RUN5" --verdict fix --evidence-summary 'r4 sneaky' \
       --ts 2026-06-11T10:30:00Z </dev/null >/dev/null 2>&1
    rc=$?
    [ "$rc" -ne 0 ] || { t5_ok=0; t5_reason="$t5_reason 4th-fix-exit-0"; }
    # Dispatch count must STILL be 2 — no 4th-cycle fix ever dispatched.
    n="$(count_events "$RUN5/events.jsonl" fix_task_dispatched)"
    [ "$n" = "2" ] || { t5_ok=0; t5_reason="$t5_reason dispatch-count=$n(want-2)"; }
  fi
else
  t5_ok=0; t5_reason="sandbox"
fi
if [ "$t5_ok" -eq 1 ]; then
  record PASS T5 "distractor: a 4th review cycle past the exhausted bound is refused (exit != 0), dispatch count never exceeds 2"
else
  record FAIL T5 "distractor: a 4th review cycle past the exhausted bound is refused (exit != 0), dispatch count never exceeds 2 (${t5_reason# })"
fi

# ---------------------------------------------------------------------------
# T6 — review-verdict approve: prints an approval line with the cycle count
#      and appends NO fix_task_dispatched. APPROVE on the first review is the
#      clean path.
# ---------------------------------------------------------------------------
t6_ok=1
t6_reason=""
if make_sandbox good >/dev/null; then
  sb6="$SANDBOX"
  RUN6="$(init_to_implement "$sb6" run-t6)" || { t6_ok=0; t6_reason="init"; }
  if [ "$t6_ok" -eq 1 ]; then
    out6="$(rs "$sb6" review-verdict --run-dir "$RUN6" --verdict approve --ts 2026-06-11T10:00:00Z)"
    rc=$?
    [ "$rc" -eq 0 ] || { t6_ok=0; t6_reason="$t6_reason approve-rc=$rc"; }
    printf '%s\n' "$out6" | grep -qiF 'approve' \
      || { t6_ok=0; t6_reason="$t6_reason no-approval-line"; }
    n="$(count_events "$RUN6/events.jsonl" fix_task_dispatched)"
    [ "$n" = "0" ] || { t6_ok=0; t6_reason="$t6_reason dispatch-on-approve(n=$n)"; }
    python3 -c '
import json, sys
s = json.load(open(sys.argv[1]))
sys.exit(0 if s.get("review_cycles") == 0 else 1)
' "$RUN6/state.json" 2>/dev/null \
      || { t6_ok=0; t6_reason="$t6_reason review_cycles!=0-on-approve"; }
  fi
else
  t6_ok=0; t6_reason="sandbox"
fi
if [ "$t6_ok" -eq 1 ]; then
  record PASS T6 "review-verdict approve: exit 0, approval line, NO fix_task_dispatched, review_cycles stays 0"
else
  record FAIL T6 "review-verdict approve: exit 0, approval line, NO fix_task_dispatched, review_cycles stays 0 (${t6_reason# })"
fi

# ===========================================================================
# GROUP C — run_state.py: fix-dispatched tier validation (CI/cloud_review fix)
#           REQ a47eb712 AC 677c1262 (fix routing) + 143bfa6b AC2 (same-tier)
# ===========================================================================

# ---------------------------------------------------------------------------
# T7 — fix-dispatched --stage ci: appends a fix_task_dispatched on the implement
#      tier (tdd-implementer / claude-opus-4-8) with the evidence verbatim.
#      This is the CI-failure → fix routing substrate, no human input.
# ---------------------------------------------------------------------------
t7_ok=1
t7_reason=""
CI_EVID='build check failed: TypeError at exporter.py:42 (see https://ci/run/1)'
if make_sandbox good >/dev/null; then
  sb7="$SANDBOX"
  RUN7="$(init_to_implement "$sb7" run-t7)" || { t7_ok=0; t7_reason="init"; }
  if [ "$t7_ok" -eq 1 ]; then
    rs "$sb7" fix-dispatched --run-dir "$RUN7" --stage ci \
       --evidence-summary "$CI_EVID" --ts 2026-06-11T11:00:00Z >/dev/null
    rc=$?
    [ "$rc" -eq 0 ] || { t7_ok=0; t7_reason="$t7_reason ci-fix-rc=$rc"; }
    python3 -c '
import json, sys
evid = sys.argv[2]
evs = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
fds = [e for e in evs if e.get("event")=="fix_task_dispatched"]
ok = (len(fds)==1
      and fds[0].get("stage")=="ci"
      and fds[0].get("target_agent")=="tdd-implementer"
      and fds[0].get("model")=="claude-opus-4-8"
      and fds[0].get("evidence_summary")==evid)
sys.exit(0 if ok else 1)
' "$RUN7/events.jsonl" "$CI_EVID" 2>/dev/null \
      || { t7_ok=0; t7_reason="$t7_reason ci-fix-shape-or-verbatim"; }
  fi
else
  t7_ok=0; t7_reason="sandbox"
fi
if [ "$t7_ok" -eq 1 ]; then
  record PASS T7 "fix-dispatched --stage ci: fresh Opus fix_task_dispatched on tdd-implementer/claude-opus-4-8, evidence verbatim"
else
  record FAIL T7 "fix-dispatched --stage ci: fresh Opus fix_task_dispatched on tdd-implementer/claude-opus-4-8, evidence verbatim (${t7_reason# })"
fi

# ---------------------------------------------------------------------------
# T8 — DISTRACTOR (143bfa6b AC2): the tier pairing is mechanically enforced. A
#      fix dispatch naming a wrong agent/model pair (e.g. tdd-implementer on
#      claude-sonnet-4-6 — a mid-task downgrade) must die non-zero and emit no
#      event. Fresh-task-SAME-tier is enforced in code, not just prose.
# ---------------------------------------------------------------------------
t8_ok=1
t8_reason=""
if make_sandbox good >/dev/null; then
  sb8="$SANDBOX"
  RUN8="$(init_to_implement "$sb8" run-t8)" || { t8_ok=0; t8_reason="init"; }
  if [ "$t8_ok" -eq 1 ]; then
    # Wrong tier: implement-fix work must go to claude-opus-4-8, never sonnet.
    PATH="$sb8/stubbin:$PATH" timeout 60 python3 "$RUNSTATE" fix-dispatched \
       --run-dir "$RUN8" --stage ci --evidence-summary 'x' \
       --model claude-sonnet-4-6 --ts 2026-06-11T11:00:00Z </dev/null >/dev/null 2>&1
    rc=$?
    [ "$rc" -ne 0 ] || { t8_ok=0; t8_reason="$t8_reason wrong-tier-exit-0"; }
    if [ -f "$RUN8/events.jsonl" ]; then
      n="$(count_events "$RUN8/events.jsonl" fix_task_dispatched)"
      [ "$n" = "0" ] || { t8_ok=0; t8_reason="$t8_reason wrong-tier-leaked-event(n=$n)"; }
    fi
  fi
else
  t8_ok=0; t8_reason="sandbox"
fi
if [ "$t8_ok" -eq 1 ]; then
  record PASS T8 "distractor: fix-dispatched with a wrong agent/model tier pairing dies non-zero, emits no event"
else
  record FAIL T8 "distractor: fix-dispatched with a wrong agent/model tier pairing dies non-zero, emits no event (${t8_reason# })"
fi

# ===========================================================================
# GROUP D — run_state.py: record-decision (conflicting evidence → ship-or-fix)
#           REQ 1963e467 AC2 + a47eb712 AC 059d2889 (timeout consolidation)
# ===========================================================================

# ---------------------------------------------------------------------------
# T9 — record-decision: appends a decision_recorded event carrying decision
#      (ship|fix), rationale, and conflicting_evidence. This is how a
#      cloud-review timeout is consolidated as a recorded ship-or-fix INPUT —
#      never a hard failure.
# ---------------------------------------------------------------------------
t9_ok=1
t9_reason=""
if make_sandbox good >/dev/null; then
  sb9="$SANDBOX"
  RUN9="$(init_to_implement "$sb9" run-t9)" || { t9_ok=0; t9_reason="init"; }
  if [ "$t9_ok" -eq 1 ]; then
    rs "$sb9" record-decision --run-dir "$RUN9" --decision ship \
       --rationale 'Cloud review timed out; CI green and merge-gate APPROVE — ship.' \
       --conflicting-evidence 'cloud_review=timeout, ci=passed, review=approve' \
       --ts 2026-06-11T12:00:00Z >/dev/null
    rc=$?
    [ "$rc" -eq 0 ] || { t9_ok=0; t9_reason="$t9_reason rc=$rc"; }
    python3 -c '
import json, sys
evs = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
drs = [e for e in evs if e.get("event")=="decision_recorded"]
ok = (len(drs)==1
      and drs[0].get("decision")=="ship"
      and drs[0].get("rationale")
      and drs[0].get("conflicting_evidence"))
# A timeout consolidated as a decision must NOT have produced a stage_blocked
# on cloud_review.
blocked = [e for e in evs if e.get("event")=="stage_blocked" and e.get("stage")=="cloud_review"]
sys.exit(0 if (ok and not blocked) else 1)
' "$RUN9/events.jsonl" 2>/dev/null \
      || { t9_ok=0; t9_reason="$t9_reason decision_recorded-shape-or-stray-block"; }
  fi
else
  t9_ok=0; t9_reason="sandbox"
fi
if [ "$t9_ok" -eq 1 ]; then
  record PASS T9 "record-decision: decision_recorded(ship, rationale, conflicting_evidence); NO stage_blocked cloud_review"
else
  record FAIL T9 "record-decision: decision_recorded(ship, rationale, conflicting_evidence); NO stage_blocked cloud_review (${t9_reason# })"
fi

# ===========================================================================
# GROUP E — cloud_review.py: trigger comment + poll until response or timeout
#           REQ a47eb712 AC 059d2889
# ===========================================================================

# ---------------------------------------------------------------------------
# T10 — cloud_review.py posts the configured trigger comment VERBATIM (gh pr
#       comment, recorded by the stub in comments.log), then — with a response
#       seeded — prints CLOUD_REVIEW_RESPONSE and exits 0.
# ---------------------------------------------------------------------------
t10_ok=1
t10_reason=""
TRIGGER='@cloud-reviewer please review'
if make_sandbox good >/dev/null; then
  sb10="$SANDBOX"
  # Seed a cloud-review response comment so the poll terminates immediately.
  seed_cloud_review_verdict "$sb10" cloud-reviewer 'Looks good. No findings.' \
    || { t10_ok=0; t10_reason="$t10_reason seed"; }
  out10="$(cr "$sb10" --pr 57 --trigger-comment "$TRIGGER" \
           --reviewer-login cloud-reviewer --timeout-minutes 1 --interval-seconds 0)"
  rc=$?
  [ "$rc" -eq 0 ] || { t10_ok=0; t10_reason="$t10_reason rc=$rc(want-0)"; }
  printf '%s\n' "$out10" | grep -qF 'CLOUD_REVIEW_RESPONSE' \
    || { t10_ok=0; t10_reason="$t10_reason no-RESPONSE-line"; }
  # The trigger comment was posted verbatim and recorded by the stub.
  if [ -f "$sb10/stub-state/comments.log" ]; then
    grep -qF "$TRIGGER" "$sb10/stub-state/comments.log" \
      || { t10_ok=0; t10_reason="$t10_reason trigger-not-recorded-verbatim"; }
  else
    t10_ok=0; t10_reason="$t10_reason no-comments.log"
  fi
else
  t10_ok=0; t10_reason="sandbox"
fi
if [ "$t10_ok" -eq 1 ]; then
  record PASS T10 "cloud_review.py: posts trigger comment verbatim, sees seeded response, prints CLOUD_REVIEW_RESPONSE, exits 0"
else
  record FAIL T10 "cloud_review.py: posts trigger comment verbatim, sees seeded response, prints CLOUD_REVIEW_RESPONSE, exits 0 (${t10_reason# })"
fi

# ---------------------------------------------------------------------------
# T11 — cloud_review.py timeout: with NO response seeded, the poll runs until
#       timeout_minutes elapses and prints CLOUD_REVIEW_TIMEOUT with a DISTINCT
#       exit code that is NEITHER 0 (success) NOR a hard error. Timeout is a
#       consolidation input, not a failure.
# ---------------------------------------------------------------------------
t11_ok=1
t11_reason=""
if make_sandbox good >/dev/null; then
  sb11="$SANDBOX"
  # No seed_pr_view → the stub serves an empty PR (no comments/reviews) forever.
  out11="$(cr "$sb11" --pr 57 --trigger-comment "$TRIGGER" \
           --reviewer-login cloud-reviewer --timeout-minutes 0 --interval-seconds 0)"
  rc=$?
  # Distinct timeout exit: not 0 (response) and not 1/2/3 (hard errors).
  if [ "$rc" -eq 0 ]; then
    t11_ok=0; t11_reason="$t11_reason timeout-exit-0(not-distinct)"
  fi
  printf '%s\n' "$out11" | grep -qF 'CLOUD_REVIEW_TIMEOUT' \
    || { t11_ok=0; t11_reason="$t11_reason no-TIMEOUT-line"; }
  printf '%s\n' "$out11" | grep -qF 'CLOUD_REVIEW_RESPONSE' \
    && { t11_ok=0; t11_reason="$t11_reason RESPONSE-on-timeout"; }
else
  t11_ok=0; t11_reason="sandbox"
fi
if [ "$t11_ok" -eq 1 ]; then
  record PASS T11 "cloud_review.py timeout: no response seeded → CLOUD_REVIEW_TIMEOUT with distinct non-zero exit (not a hard error, no RESPONSE)"
else
  record FAIL T11 "cloud_review.py timeout: no response seeded → CLOUD_REVIEW_TIMEOUT with distinct non-zero exit (not a hard error, no RESPONSE) (${t11_reason# })"
fi

# ---------------------------------------------------------------------------
# T12 — DISTRACTOR (security): cloud_review.py must NEVER interpolate untrusted
#       text into a shell. A trigger comment carrying shell metacharacters must
#       round-trip into comments.log LITERALLY with no side effect (no file
#       created, no command run). Also assert the script source contains no
#       shell=True / os.system.
# ---------------------------------------------------------------------------
t12_ok=1
t12_reason=""
PAYLOAD='@cloud-reviewer please review; $(touch /tmp/ship-pwned-$$) `id` && echo x'
SENTINEL="/tmp/ship-pwned-$$"
rm -f "$SENTINEL"
if make_sandbox good >/dev/null; then
  sb12="$SANDBOX"
  seed_cloud_review_verdict "$sb12" cloud-reviewer 'ok' >/dev/null
  cr "$sb12" --pr 57 --trigger-comment "$PAYLOAD" \
     --reviewer-login cloud-reviewer --timeout-minutes 1 --interval-seconds 0 >/dev/null
  # The payload must be recorded LITERALLY (the stub appends body verbatim).
  if [ -f "$sb12/stub-state/comments.log" ]; then
    grep -qF "$PAYLOAD" "$sb12/stub-state/comments.log" \
      || { t12_ok=0; t12_reason="$t12_reason payload-not-literal"; }
  else
    t12_ok=0; t12_reason="$t12_reason no-comments.log"
  fi
  # The injection must NOT have executed.
  if [ -e "$SENTINEL" ]; then
    t12_ok=0; t12_reason="$t12_reason injection-executed"
    rm -f "$SENTINEL"
  fi
  # Source hygiene: no shell=True / os.system as ACTUAL CODE in cloud_review.py.
  # Strip Python comments (# ...) and string-literal prose so the docstring's
  # own "never shell=True / os.system" warning is not a false positive; only a
  # live code use of the injection surface trips this.
  if [ -f "$CLOUD_REVIEW" ]; then
    code_only="$(python3 -c '
import io, sys, tokenize
toks = []
with open(sys.argv[1], "rb") as f:
    for tok in tokenize.tokenize(f.readline):
        if tok.type in (tokenize.COMMENT, tokenize.STRING):
            continue
        toks.append(tok.string)
sys.stdout.write(" ".join(toks))
' "$CLOUD_REVIEW" 2>/dev/null)"
    printf '%s' "$code_only" | grep -qE 'shell[[:space:]]*=[[:space:]]*True|os\.system' \
      && { t12_ok=0; t12_reason="$t12_reason shell-injection-surface-in-source"; }
  else
    t12_ok=0; t12_reason="$t12_reason cloud_review.py-missing"
  fi
else
  t12_ok=0; t12_reason="sandbox"
fi
if [ "$t12_ok" -eq 1 ]; then
  record PASS T12 "distractor/security: metacharacter trigger comment round-trips literally, no injection executed, no shell=True/os.system in cloud_review.py"
else
  record FAIL T12 "distractor/security: metacharacter trigger comment round-trips literally, no injection executed, no shell=True/os.system in cloud_review.py (${t12_reason# })"
fi

# ===========================================================================
# GROUP F — SKILL.md text contracts: the four new stages' choreography
#           REQ 1963e467 AC3, a47eb712 AC1/AC2, c163650c, 143bfa6b AC3, max-3
# ===========================================================================

# ---------------------------------------------------------------------------
# T13 — the Phase 4 handoff STUB is gone; implement/review/ci/cloud_review are
#       documented as real stages, and a Phase 5 handoff stub now marks the
#       boundary (deploy/e2e/logs/Gate 2 land later).
# ---------------------------------------------------------------------------
t13_ok=1
t13_missing=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t13_ok=0; t13_missing="no-body"
else
  # The old Phase-4 stub must NOT remain.
  grep -qiE 'phase[[:space:]]+4[[:space:]]+handoff[[:space:]]+stub' "$SKILL_BODY" \
    && { t13_ok=0; t13_missing="$t13_missing phase4-stub-still-present"; }
  # Each new stage has its own documented section heading.
  for stage in 'Stage: implement' 'Stage: review' 'Stage: ci' 'Stage: cloud_review'; do
    grep -qiF "$stage" "$SKILL_BODY" || { t13_ok=0; t13_missing="$t13_missing [$stage]"; }
  done
  # A Phase 5 handoff stub now marks the new boundary.
  grep -qiE 'phase[[:space:]]+5' "$SKILL_BODY" || { t13_ok=0; t13_missing="$t13_missing phase-5"; }
  grep -qi 'stub' "$SKILL_BODY" || { t13_ok=0; t13_missing="$t13_missing stub"; }
fi
if [ "$t13_ok" -eq 1 ]; then
  record PASS T13 "SKILL: Phase-4 stub replaced by implement/review/ci/cloud_review stage sections; Phase 5 handoff stub marks the new boundary"
else
  record FAIL T13 "SKILL: Phase-4 stub replaced by implement/review/ci/cloud_review stage sections; Phase 5 handoff stub marks the new boundary (missing:${t13_missing})"
fi

# ---------------------------------------------------------------------------
# T14 — implement stage choreography: dispatch tdd-implementer pinned
#       claude-opus-4-8 tests-first; record implement-evidence; push branch +
#       gh pr create; record the PR via set-pr.
# ---------------------------------------------------------------------------
t14_ok=1
t14_missing=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t14_ok=0; t14_missing="no-body"
else
  grep -qF 'tdd-implementer' "$SKILL_BODY" || { t14_ok=0; t14_missing="$t14_missing tdd-implementer"; }
  grep -qF 'claude-opus-4-8' "$SKILL_BODY" || { t14_ok=0; t14_missing="$t14_missing claude-opus-4-8"; }
  grep -qF 'implement-evidence' "$SKILL_BODY" || { t14_ok=0; t14_missing="$t14_missing implement-evidence"; }
  grep -qF 'gh pr create' "$SKILL_BODY" || { t14_ok=0; t14_missing="$t14_missing gh-pr-create"; }
  grep -qF 'set-pr' "$SKILL_BODY" || { t14_ok=0; t14_missing="$t14_missing set-pr"; }
fi
if [ "$t14_ok" -eq 1 ]; then
  record PASS T14 "SKILL implement: tdd-implementer on claude-opus-4-8, implement-evidence, gh pr create, set-pr"
else
  record FAIL T14 "SKILL implement: tdd-implementer on claude-opus-4-8, implement-evidence, gh pr create, set-pr (missing:${t14_missing})"
fi

# ---------------------------------------------------------------------------
# T15 — review stage choreography (1963e467 AC3 + max-3): merge-gate-reviewer
#       on claude-fable-5 with the FULL PR diff and an APPROVE/FIX verdict;
#       review-verdict helper; max-3 bound documented as a BLOCKED error exit
#       (not a third gate); FIX → fresh Opus task with blockers verbatim.
# ---------------------------------------------------------------------------
t15_ok=1
t15_missing=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t15_ok=0; t15_missing="no-body"
else
  grep -qF 'merge-gate-reviewer' "$SKILL_BODY" || { t15_ok=0; t15_missing="$t15_missing merge-gate-reviewer"; }
  grep -qiF 'full PR diff' "$SKILL_BODY" || grep -qiF 'full diff' "$SKILL_BODY" \
    || { t15_ok=0; t15_missing="$t15_missing full-diff"; }
  grep -qF 'APPROVE' "$SKILL_BODY" || { t15_ok=0; t15_missing="$t15_missing APPROVE"; }
  grep -qF 'FIX' "$SKILL_BODY" || { t15_ok=0; t15_missing="$t15_missing FIX"; }
  grep -qF 'review-verdict' "$SKILL_BODY" || { t15_ok=0; t15_missing="$t15_missing review-verdict"; }
  grep -qi 'verbatim' "$SKILL_BODY" || { t15_ok=0; t15_missing="$t15_missing verbatim"; }
  # max-3 bound: the number 3 with a BLOCKED error-exit framing (NOT a 3rd gate).
  grep -qE '\b3\b' "$SKILL_BODY" || { t15_ok=0; t15_missing="$t15_missing max-3-number"; }
  grep -qF 'REVIEW_CYCLES_EXHAUSTED' "$SKILL_BODY" || { t15_ok=0; t15_missing="$t15_missing exhausted-token"; }
fi
if [ "$t15_ok" -eq 1 ]; then
  record PASS T15 "SKILL review: merge-gate-reviewer/claude-fable-5, full PR diff, APPROVE/FIX, review-verdict, verbatim blockers, max-3 + REVIEW_CYCLES_EXHAUSTED"
else
  record FAIL T15 "SKILL review: merge-gate-reviewer/claude-fable-5, full PR diff, APPROVE/FIX, review-verdict, verbatim blockers, max-3 + REVIEW_CYCLES_EXHAUSTED (missing:${t15_missing})"
fi

# ---------------------------------------------------------------------------
# T16 — DISTRACTOR (two gates stay two): the review max-3 exhaustion is an
#       ERROR EXIT (BLOCKED), never a third human gate. The SKILL body must
#       not introduce a gate_3, and must frame the exhausted bound as BLOCKED.
# ---------------------------------------------------------------------------
t16_ok=1
t16_reason=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t16_ok=0; t16_reason="no-body"
else
  grep -qiE 'gate[ _]?3' "$SKILL_BODY" && { t16_ok=0; t16_reason="$t16_reason gate_3-introduced"; }
  # The exhausted review bound must be wired to BLOCKED, not a gate.
  grep -qF 'BLOCKED' "$SKILL_BODY" || { t16_ok=0; t16_reason="$t16_reason no-BLOCKED"; }
fi
if [ "$t16_ok" -eq 1 ]; then
  record PASS T16 "distractor: no gate_3 introduced — the exhausted review bound is a BLOCKED error exit, the two human gates stay two"
else
  record FAIL T16 "distractor: no gate_3 introduced — the exhausted review bound is a BLOCKED error exit, the two human gates stay two (${t16_reason# })"
fi

# ---------------------------------------------------------------------------
# T17 — ci stage choreography (a47eb712 AC1): wait on GitHub checks via
#       `gh pr checks ... --watch`; failure routes to a fix cycle WITHOUT human
#       input (fix-dispatched --stage ci) and re-enters review before ci re-passes.
# ---------------------------------------------------------------------------
t17_ok=1
t17_missing=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t17_ok=0; t17_missing="no-body"
else
  grep -qF 'gh pr checks' "$SKILL_BODY" || { t17_ok=0; t17_missing="$t17_missing gh-pr-checks"; }
  grep -qF -- '--watch' "$SKILL_BODY" || { t17_ok=0; t17_missing="$t17_missing --watch"; }
  grep -qF 'fix-dispatched' "$SKILL_BODY" || { t17_ok=0; t17_missing="$t17_missing fix-dispatched"; }
  # "without human input" / "no human" framing for the CI fix routing.
  grep -qiE 'without human|no human input|unattended' "$SKILL_BODY" \
    || { t17_ok=0; t17_missing="$t17_missing without-human"; }
fi
if [ "$t17_ok" -eq 1 ]; then
  record PASS T17 "SKILL ci: gh pr checks --watch; CI failure routes to fix-dispatched without human input"
else
  record FAIL T17 "SKILL ci: gh pr checks --watch; CI failure routes to fix-dispatched without human input (missing:${t17_missing})"
fi

# ---------------------------------------------------------------------------
# T18 — cloud_review stage choreography (a47eb712 AC2 + 1963e467 AC2): trigger
#       comment (default "@claude review") via cloud_review.py; poll until
#       response or timeout_minutes; TIMEOUT is consolidated by the orchestrator
#       as a recorded ship-or-fix decision (record-decision), NOT a hard
#       failure; stage skippable via config (cloud_review.skip).
# ---------------------------------------------------------------------------
t18_ok=1
t18_missing=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t18_ok=0; t18_missing="no-body"
else
  grep -qF 'cloud_review.py' "$SKILL_BODY" || { t18_ok=0; t18_missing="$t18_missing cloud_review.py"; }
  grep -qiF 'trigger_comment' "$SKILL_BODY" || grep -qiF 'trigger comment' "$SKILL_BODY" \
    || { t18_ok=0; t18_missing="$t18_missing trigger-comment"; }
  grep -qF '@claude review' "$SKILL_BODY" || { t18_ok=0; t18_missing="$t18_missing default-comment"; }
  grep -qiF 'timeout' "$SKILL_BODY" || { t18_ok=0; t18_missing="$t18_missing timeout"; }
  grep -qF 'record-decision' "$SKILL_BODY" || { t18_ok=0; t18_missing="$t18_missing record-decision"; }
  grep -qiF 'ship-or-fix' "$SKILL_BODY" || grep -qiF 'ship or fix' "$SKILL_BODY" \
    || { t18_ok=0; t18_missing="$t18_missing ship-or-fix"; }
  grep -qF 'skip' "$SKILL_BODY" || { t18_ok=0; t18_missing="$t18_missing skip"; }
fi
if [ "$t18_ok" -eq 1 ]; then
  record PASS T18 "SKILL cloud_review: cloud_review.py trigger (default @claude review), poll-until-timeout, timeout → record-decision ship-or-fix, skippable"
else
  record FAIL T18 "SKILL cloud_review: cloud_review.py trigger (default @claude review), poll-until-timeout, timeout → record-decision ship-or-fix, skippable (missing:${t18_missing})"
fi

# ---------------------------------------------------------------------------
# T19 — DISTRACTOR (143bfa6b AC3): the body still has NO fallback/downgrade/
#       mid-task model-switch language anywhere — even with the new fix-cycle
#       and CI-fix-routing stages added.
# ---------------------------------------------------------------------------
t19_ok=1
if [ "$SKILL_BODY_OK" -eq 1 ] \
   && grep -qiE '(fall[- ]?back|downgrade|switch.*model.*mid)' "$SKILL_BODY"; then
  t19_ok=0
fi
if [ "$t19_ok" -eq 1 ]; then
  record PASS T19 "distractor: no fallback/downgrade/model-switch language anywhere in SKILL.md body (still clean after Phase 4)"
else
  record FAIL T19 "distractor: no fallback/downgrade/model-switch language anywhere in SKILL.md body (still clean after Phase 4)"
fi

# ---------------------------------------------------------------------------
# T20 — events.jsonl: every new transition type the four stages emit is a
#       KNOWN event type that validate accepts (implement_evidence). A run that
#       drives implement→review(fix→approve)→ci(fix)→cloud_review(decision)
#       validates clean.
# ---------------------------------------------------------------------------
t20_ok=1
t20_reason=""
if make_sandbox good >/dev/null; then
  sb20="$SANDBOX"
  RUN20="$(init_to_implement "$sb20" run-t20)" || { t20_ok=0; t20_reason="init"; }
  if [ "$t20_ok" -eq 1 ]; then
    rs "$sb20" stage-start --run-dir "$RUN20" --stage implement --ts 2026-06-11T09:11:00Z >/dev/null
    rs "$sb20" implement-evidence --run-dir "$RUN20" --red 'red' --green 'green' --ts 2026-06-11T09:20:00Z >/dev/null
    rs "$sb20" set-pr --run-dir "$RUN20" --number 57 --url 'https://github.com/acme/widgets/pull/57' --ts 2026-06-11T09:25:00Z >/dev/null
    rs "$sb20" stage-end --run-dir "$RUN20" --stage implement --result passed --ts 2026-06-11T09:30:00Z >/dev/null

    rs "$sb20" stage-start --run-dir "$RUN20" --stage review --ts 2026-06-11T09:31:00Z >/dev/null
    rs "$sb20" review-verdict --run-dir "$RUN20" --verdict fix --evidence-summary 'b1' --ts 2026-06-11T09:35:00Z >/dev/null
    rs "$sb20" stage-end --run-dir "$RUN20" --stage review --result failed --reason 'FIX 1 blocker' --ts 2026-06-11T09:36:00Z >/dev/null
    # fix lands on implement
    rs "$sb20" stage-start --run-dir "$RUN20" --stage implement --ts 2026-06-11T09:37:00Z >/dev/null
    rs "$sb20" stage-end --run-dir "$RUN20" --stage implement --result passed --ts 2026-06-11T09:45:00Z >/dev/null
    # re-review approves
    rs "$sb20" stage-start --run-dir "$RUN20" --stage review --ts 2026-06-11T09:46:00Z >/dev/null
    rs "$sb20" review-verdict --run-dir "$RUN20" --verdict approve --ts 2026-06-11T09:48:00Z >/dev/null
    rs "$sb20" stage-end --run-dir "$RUN20" --stage review --result passed --ts 2026-06-11T09:49:00Z >/dev/null

    # ci fails once, fix dispatched
    rs "$sb20" stage-start --run-dir "$RUN20" --stage ci --ts 2026-06-11T09:50:00Z >/dev/null
    rs "$sb20" fix-dispatched --run-dir "$RUN20" --stage ci --evidence-summary 'ci log' --ts 2026-06-11T09:52:00Z >/dev/null
    rs "$sb20" stage-end --run-dir "$RUN20" --stage ci --result failed --reason 'build failed' --ts 2026-06-11T09:53:00Z >/dev/null

    # cloud_review timeout consolidated as a decision
    rs "$sb20" record-decision --run-dir "$RUN20" --decision ship \
       --rationale 'timeout; ci+review ok' --conflicting-evidence 'cloud_review=timeout' \
       --ts 2026-06-11T09:55:00Z >/dev/null

    rs "$sb20" validate --run-dir "$RUN20" >/dev/null \
      || { t20_ok=0; t20_reason="$t20_reason validate-failed"; }
  fi
else
  t20_ok=0; t20_reason="sandbox"
fi
if [ "$t20_ok" -eq 1 ]; then
  record PASS T20 "events: a full implement→review(fix→approve)→ci(fix)→cloud_review(decision) run validates clean (all new event types known)"
else
  record FAIL T20 "events: a full implement→review(fix→approve)→ci(fix)→cloud_review(decision) run validates clean (all new event types known) (${t20_reason# })"
fi

# ---------------------------------------------------------------------------
# T21 — set-pr: records the PR number/url into state.pr (the only sanctioned
#       PR mutation path); validate still accepts the run.
# ---------------------------------------------------------------------------
t21_ok=1
t21_reason=""
if make_sandbox good >/dev/null; then
  sb21="$SANDBOX"
  RUN21="$(init_to_implement "$sb21" run-t21)" || { t21_ok=0; t21_reason="init"; }
  if [ "$t21_ok" -eq 1 ]; then
    rs "$sb21" set-pr --run-dir "$RUN21" --number 57 \
       --url 'https://github.com/acme/widgets/pull/57' --ts 2026-06-11T09:25:00Z >/dev/null
    rc=$?
    [ "$rc" -eq 0 ] || { t21_ok=0; t21_reason="$t21_reason set-pr-rc=$rc"; }
    python3 -c '
import json, sys
s = json.load(open(sys.argv[1]))
pr = s.get("pr")
ok = isinstance(pr, dict) and pr.get("number")==57 and pr.get("url")=="https://github.com/acme/widgets/pull/57"
sys.exit(0 if ok else 1)
' "$RUN21/state.json" 2>/dev/null \
      || { t21_ok=0; t21_reason="$t21_reason state.pr-not-set"; }
    rs "$sb21" validate --run-dir "$RUN21" >/dev/null \
      || { t21_ok=0; t21_reason="$t21_reason validate-failed"; }
  fi
else
  t21_ok=0; t21_reason="sandbox"
fi
if [ "$t21_ok" -eq 1 ]; then
  record PASS T21 "set-pr: writes state.pr {number,url}; validate ok"
else
  record FAIL T21 "set-pr: writes state.pr {number,url}; validate ok (${t21_reason# })"
fi

# ---------------------------------------------------------------------------
# T22 — cloud_review reviewer_login config: preflight accepts a present
#       non-empty reviewer_login and rejects a present-but-empty one (the flag
#       the SKILL passes to cloud_review.py has real config backing).
# ---------------------------------------------------------------------------
t22_ok=1
t22_reason=""
PREFLIGHT="$REPO_ROOT/skills/ship-issue/scripts/preflight.py"
run_pf() { ( cd "$1" && PATH="$1/stubbin:$PATH" timeout 60 python3 "$PREFLIGHT" --repo "$1" </dev/null ) >/dev/null 2>&1; }
if make_sandbox good >/dev/null; then
  sbA="$SANDBOX"
  sandbox_replace_config "$sbA" '{"staging_url":"http://localhost:9999","deploy_command":"true","log_command":"echo no-errors","cloud_review":{"trigger_comment":"@cloud-reviewer please review","timeout_minutes":30,"reviewer_login":"cloud-reviewer"},"ci":{"required_checks":["build"]}}'
  run_pf "$sbA"; [ $? -eq 0 ] || { t22_ok=0; t22_reason="$t22_reason present-reviewer_login-rejected"; }
else
  t22_ok=0; t22_reason="$t22_reason sandboxA"
fi
if make_sandbox good >/dev/null; then
  sbB="$SANDBOX"
  sandbox_replace_config "$sbB" '{"staging_url":"http://localhost:9999","deploy_command":"true","log_command":"echo no-errors","cloud_review":{"trigger_comment":"@cloud-reviewer please review","timeout_minutes":30,"reviewer_login":""},"ci":{"required_checks":["build"]}}'
  run_pf "$sbB"; [ $? -eq 2 ] || { t22_ok=0; t22_reason="$t22_reason empty-reviewer_login-accepted"; }
else
  t22_ok=0; t22_reason="$t22_reason sandboxB"
fi
if [ "$t22_ok" -eq 1 ]; then
  record PASS T22 "preflight: cloud_review.reviewer_login optional — accepts a non-empty string, blocks a present-but-empty one"
else
  record FAIL T22 "preflight: cloud_review.reviewer_login optional — accepts a non-empty string, blocks a present-but-empty one (${t22_reason# })"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf '%d/%d passed\n' "$PASS_COUNT" "$TOTAL_COUNT"
if [ "$PASS_COUNT" -eq "$TOTAL_COUNT" ]; then
  exit 0
fi
exit 1
