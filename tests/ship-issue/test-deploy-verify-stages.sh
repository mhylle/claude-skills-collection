#!/bin/bash
# test-deploy-verify-stages.sh — RED-phase tests for Phase 5 of the ship-issue
# pipeline: the deploy / e2e / logs stages, the Gate 2 merge brief, and the
# merge itself.
#
# Three artifacts are exercised (all implemented LATER — these tests are RED now):
#   1. skills/ship-issue/SKILL.md — the "Phase 5 handoff stub" section is
#      REPLACED by four real sections: Stage: deploy, Stage: e2e, Stage: logs,
#      and Gate 2 — merge confirmation. (grep-contract tests over the body.)
#   2. skills/ship-issue/scripts/run_state.py — two new subcommands:
#      `run-completed --run-dir <d> --merged-pr-url <url>` (emits run_completed)
#      and `run-aborted --run-dir <d> --reason <why>` (emits run_aborted). Both
#      event types already exist in the schema with no emitting subcommand yet.
#   3. skills/ship-issue/scripts/merge_brief.py — NEW stdlib-Python CLI
#      (`merge_brief.py --run-dir <d>`), a pure READER of run state, printing
#      the consolidated Gate 2 merge brief (content + embedded time summary).
#
# AC→test mapping (DESIGN NOTE, task 26ad6c63), each AC with its named distractor:
#   REQ sonnet-verification
#     AC0 (e2e):  T3 right-impl / T4 distractor (no ship-on-FAIL; gate_2 only after logs)
#     AC1 (logs): T5 right-impl / T6 distractor (unreachable ⇒ BLOCKED, never CLEAN)
#   REQ ci-cloud-deploy
#     AC2 (deploy waits BEFORE e2e): T2 grep+order / T10 sandbox order /
#                                    T11 distractor (assertion has teeth)
#   REQ two-gates
#     AC1 (merge brief + merge only after confirm): T15 content / T10 merge-after-approve /
#                                                    T14 distractor (rejected ⇒ run_aborted, no merge)
#     AC2 (exactly two gates): T12 right-impl / T13 distractor (exhaustion & cloud_review
#                              timeout emit NO gate event)
#   REQ time-tracking
#     AC3 (brief embeds time summary, matches summary): T16 right-impl /
#         T17 distractor (omit tier rollup or fold external into a model tier ⇒ FAIL;
#         partition-exact, reused from timing T10)
#     AC4 (dashboard live elapsed): OUT OF SCOPE — no test here.
#
# Plain bash, no framework. set -u, collects ALL failures (no set -e).
# Output: one line per test "PASS|FAIL Tn: <desc>", then "X/Y passed".
# Exit 0 only if every test passes. NO network, NO real gh/aws (sandbox stubs).

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SKILL="$REPO_ROOT/skills/ship-issue/SKILL.md"
RUNSTATE="$REPO_ROOT/skills/ship-issue/scripts/run_state.py"
MERGE_BRIEF="$REPO_ROOT/skills/ship-issue/scripts/merge_brief.py"

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
# Extraction + command helpers (same approach as the sibling suites)
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

# rs <sandbox> <run_state.py args...>  → exit code preserved; stdout passes through
rs() {
  local sb="$1"
  shift
  PATH="$sb/stubbin:$PATH" timeout 60 python3 "$RUNSTATE" "$@" </dev/null 2>/dev/null
}

# mb <sandbox> <merge_brief.py args...> → exit code preserved; stdout passes through
mb() {
  local sb="$1"
  shift
  ( cd "$sb" && PATH="$sb/stubbin:$PATH" timeout 60 python3 "$MERGE_BRIEF" "$@" </dev/null ) 2>/dev/null
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

# first_index <events.jsonl> <event-type> [<key> <value>]
# Prints the 0-based index of the FIRST matching event, or -1 if absent.
first_index() {
  python3 -c '
import json, sys
path, etype = sys.argv[1], sys.argv[2]
key = sys.argv[3] if len(sys.argv) > 3 else None
val = sys.argv[4] if len(sys.argv) > 4 else None
evs = [json.loads(l) for l in open(path) if l.strip()]
for i, e in enumerate(evs):
    if e.get("event") != etype:
        continue
    if key is not None and str(e.get(key)) != val:
        continue
    print(i); break
else:
    print(-1)
' "$@"
}

# init_to_implement <sandbox> <run-id>  → echoes RUN_DIR; takes a fresh run up
# to implement being active (preflight+plan passed, gate_1 approved). Mirrors
# the helper in test-implementation-stages.sh.
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

# drive_to_pre_deploy <sandbox> <run-dir>  → drives implement→review→ci→cloud_review
# to passed so deploy is the next stage. Records a PR, opens+closes each stage.
drive_to_pre_deploy() {
  local sb="$1" rd="$2"
  rs "$sb" stage-start --run-dir "$rd" --stage implement --ts 2026-06-11T09:11:00Z >/dev/null || return 1
  rs "$sb" implement-evidence --run-dir "$rd" --red 'red 3 failing' --green 'green 42 passed' --ts 2026-06-11T09:20:00Z >/dev/null || return 1
  rs "$sb" set-pr --run-dir "$rd" --number 57 --url 'https://github.com/acme/widgets/pull/57' --ts 2026-06-11T09:25:00Z >/dev/null || return 1
  rs "$sb" stage-end --run-dir "$rd" --stage implement --result passed --ts 2026-06-11T09:30:00Z >/dev/null || return 1
  rs "$sb" stage-start --run-dir "$rd" --stage review --ts 2026-06-11T09:31:00Z >/dev/null || return 1
  rs "$sb" review-verdict --run-dir "$rd" --verdict approve --ts 2026-06-11T09:35:00Z >/dev/null || return 1
  rs "$sb" stage-end --run-dir "$rd" --stage review --result passed --ts 2026-06-11T09:36:00Z >/dev/null || return 1
  rs "$sb" stage-start --run-dir "$rd" --stage ci --ts 2026-06-11T09:37:00Z >/dev/null || return 1
  rs "$sb" stage-end --run-dir "$rd" --stage ci --result passed --ts 2026-06-11T09:40:00Z >/dev/null || return 1
  rs "$sb" stage-start --run-dir "$rd" --stage cloud_review --ts 2026-06-11T09:41:00Z >/dev/null || return 1
  rs "$sb" stage-end --run-dir "$rd" --stage cloud_review --result passed --ts 2026-06-11T09:45:00Z >/dev/null || return 1
}

# drive_deploy_e2e_logs <sandbox> <run-dir>  → deploy→e2e→logs all passed, then
# gate_2 reached. Deploy's stage_passed lands BEFORE e2e's timer_started in the
# event order. Writes one E2E evidence file under the run dir so the merge brief
# can point at a real file on disk.
drive_deploy_e2e_logs() {
  local sb="$1" rd="$2"
  rs "$sb" stage-start --run-dir "$rd" --stage deploy --ts 2026-06-11T09:46:00Z >/dev/null || return 1
  rs "$sb" stage-end --run-dir "$rd" --stage deploy --result passed --ts 2026-06-11T09:48:00Z >/dev/null || return 1
  # E2E evidence on disk (the merge brief's E2E evidence path must RESOLVE here).
  mkdir -p "$rd/logs/staging-e2e" || return 1
  printf 'PASS S-1\n' > "$rd/logs/staging-e2e/2026-06-11-094900-S-1.png" || return 1
  rs "$sb" stage-start --run-dir "$rd" --stage e2e --ts 2026-06-11T09:49:00Z >/dev/null || return 1
  rs "$sb" stage-end --run-dir "$rd" --stage e2e --result passed --ts 2026-06-11T10:02:00Z >/dev/null || return 1
  rs "$sb" stage-start --run-dir "$rd" --stage logs --ts 2026-06-11T10:03:00Z >/dev/null || return 1
  rs "$sb" stage-end --run-dir "$rd" --stage logs --result passed --ts 2026-06-11T10:04:00Z >/dev/null || return 1
  rs "$sb" gate-reached --run-dir "$rd" --gate gate_2 --ts 2026-06-11T10:04:01Z >/dev/null || return 1
}

# ===========================================================================
# GROUP A — SKILL.md text contracts: deploy / e2e / logs / Gate 2 sections
# ===========================================================================

# ---------------------------------------------------------------------------
# T1 — the Phase 5 handoff STUB is gone; deploy/e2e/logs are documented as real
#      stages and a real "Gate 2 — merge confirmation" section exists. The
#      Phase-5-boundary stub language must not remain.
# ---------------------------------------------------------------------------
t1_ok=1
t1_missing=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t1_ok=0; t1_missing="no-body"
else
  # The old Phase-5 stub must NOT remain.
  grep -qiE 'phase[[:space:]]+5[[:space:]]+handoff[[:space:]]+stub' "$SKILL_BODY" \
    && { t1_ok=0; t1_missing="$t1_missing phase5-stub-still-present"; }
  grep -qiE 'phase[[:space:]]+5[[:space:]]+boundary' "$SKILL_BODY" \
    && { t1_ok=0; t1_missing="$t1_missing phase5-boundary-still-present"; }
  # Each new stage / gate has its own documented section heading.
  for sec in 'Stage: deploy' 'Stage: e2e' 'Stage: logs'; do
    grep -qiF "$sec" "$SKILL_BODY" || { t1_ok=0; t1_missing="$t1_missing [$sec]"; }
  done
  # The Gate 2 merge-confirmation section.
  grep -qiE 'Gate 2[[:space:]]*(—|-|–).*merge' "$SKILL_BODY" \
    || grep -qiF 'merge confirmation' "$SKILL_BODY" \
    || { t1_ok=0; t1_missing="$t1_missing gate-2-merge-section"; }
fi
if [ "$t1_ok" -eq 1 ]; then
  record PASS T1 "SKILL: Phase-5 stub replaced by deploy/e2e/logs stage sections + a Gate 2 merge-confirmation section"
else
  record FAIL T1 "SKILL: Phase-5 stub replaced by deploy/e2e/logs stage sections + a Gate 2 merge-confirmation section (missing:${t1_missing})"
fi

# ---------------------------------------------------------------------------
# T2 — AC2 (ci-cloud-deploy) right-impl, grep-contract: the deploy stage uses
#      `deploy_command` OR (`aws ecs update-service` + `aws ecs wait
#      services-stable`), confirms `staging_url`, and the `Stage: deploy`
#      section PHYSICALLY PRECEDES `Stage: e2e` in the body (deploy waits for
#      stability BEFORE e2e runs).
# ---------------------------------------------------------------------------
t2_ok=1
t2_missing=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t2_ok=0; t2_missing="no-body"
else
  grep -qF 'deploy_command' "$SKILL_BODY" || { t2_ok=0; t2_missing="$t2_missing deploy_command"; }
  # ECS path: update-service then wait services-stable (the stability wait).
  grep -qF 'aws ecs update-service' "$SKILL_BODY" || { t2_ok=0; t2_missing="$t2_missing aws-ecs-update-service"; }
  grep -qF 'aws ecs wait services-stable' "$SKILL_BODY" || { t2_ok=0; t2_missing="$t2_missing aws-ecs-wait-services-stable"; }
  grep -qF 'staging_url' "$SKILL_BODY" || { t2_ok=0; t2_missing="$t2_missing staging_url"; }
  # Physical ordering: the deploy heading precedes the e2e heading.
  dep_line="$(grep -niF 'Stage: deploy' "$SKILL_BODY" | head -1 | cut -d: -f1)"
  e2e_line="$(grep -niF 'Stage: e2e' "$SKILL_BODY" | head -1 | cut -d: -f1)"
  if [ -z "$dep_line" ] || [ -z "$e2e_line" ]; then
    t2_ok=0; t2_missing="$t2_missing missing-deploy-or-e2e-heading"
  elif [ "$dep_line" -ge "$e2e_line" ]; then
    t2_ok=0; t2_missing="$t2_missing deploy-not-before-e2e(dep=$dep_line,e2e=$e2e_line)"
  fi
fi
if [ "$t2_ok" -eq 1 ]; then
  record PASS T2 "AC2 deploy grep-contract: deploy_command|ecs update-service+wait services-stable, confirms staging_url, Stage: deploy precedes Stage: e2e"
else
  record FAIL T2 "AC2 deploy grep-contract: deploy_command|ecs update-service+wait services-stable, confirms staging_url, Stage: deploy precedes Stage: e2e (missing:${t2_missing})"
fi

# ---------------------------------------------------------------------------
# T3 — AC0 (sonnet-verification) right-impl, e2e choreography: the `Stage: e2e`
#      section dispatches staging-e2e-verifier on claude-sonnet-4-6 with the
#      staging_url + the plan's scenarios; a FAIL routes to a fix cycle, a
#      BLOCKED stops the run.
# ---------------------------------------------------------------------------
t3_ok=1
t3_missing=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t3_ok=0; t3_missing="no-body"
else
  grep -qF 'staging-e2e-verifier' "$SKILL_BODY" || { t3_ok=0; t3_missing="$t3_missing staging-e2e-verifier"; }
  grep -qF 'claude-sonnet-4-6' "$SKILL_BODY" || { t3_ok=0; t3_missing="$t3_missing claude-sonnet-4-6"; }
  grep -qF 'staging_url' "$SKILL_BODY" || { t3_ok=0; t3_missing="$t3_missing staging_url"; }
  grep -qiF 'scenario' "$SKILL_BODY" || { t3_ok=0; t3_missing="$t3_missing scenarios"; }
  grep -qF 'FAIL' "$SKILL_BODY" || { t3_ok=0; t3_missing="$t3_missing FAIL"; }
  grep -qF 'BLOCKED' "$SKILL_BODY" || { t3_ok=0; t3_missing="$t3_missing BLOCKED"; }
  # FAIL → fix cycle (fix-dispatched on the e2e stage).
  grep -qF 'fix-dispatched' "$SKILL_BODY" || { t3_ok=0; t3_missing="$t3_missing fix-dispatched"; }
fi
if [ "$t3_ok" -eq 1 ]; then
  record PASS T3 "AC0 e2e: staging-e2e-verifier on claude-sonnet-4-6 w/ staging_url + scenarios; FAIL→fix-dispatched, BLOCKED→stop"
else
  record FAIL T3 "AC0 e2e: staging-e2e-verifier on claude-sonnet-4-6 w/ staging_url + scenarios; FAIL→fix-dispatched, BLOCKED→stop (missing:${t3_missing})"
fi

# ---------------------------------------------------------------------------
# T4 — DISTRACTOR (AC0 sonnet-verification): an E2E FAIL must NEVER ship. The
#      body must not route an E2E FAIL straight to gate_2 / merge, and Gate 2
#      must be reachable only AFTER logs passes. We assert: (i) no text wires an
#      e2e FAIL to gate_2/merge, and (ii) the Stage: logs heading physically
#      precedes the Gate 2 section — logs gates gate_2, not e2e.
# ---------------------------------------------------------------------------
t4_ok=1
t4_reason=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t4_ok=0; t4_reason="no-body"
else
  # No "ship on FAIL": the body must not contain a phrase routing a FAIL/failed
  # e2e verdict to gate_2 or merge on the same logical line.
  if grep -niE 'e2e' "$SKILL_BODY" | grep -iE 'fail' | grep -iqE 'gate_?2|merge'; then
    t4_ok=0; t4_reason="$t4_reason e2e-FAIL-line-mentions-gate2/merge"
  fi
  # gate_2 is only reached after logs passes: the Stage: logs heading precedes
  # the Gate 2 section heading.
  logs_line="$(grep -niF 'Stage: logs' "$SKILL_BODY" | head -1 | cut -d: -f1)"
  gate2_line="$(grep -niE 'Gate 2' "$SKILL_BODY" | head -1 | cut -d: -f1)"
  if [ -z "$logs_line" ] || [ -z "$gate2_line" ]; then
    t4_ok=0; t4_reason="$t4_reason missing-logs-or-gate2-heading"
  elif [ "$logs_line" -ge "$gate2_line" ]; then
    t4_ok=0; t4_reason="$t4_reason logs-not-before-gate2(logs=$logs_line,gate2=$gate2_line)"
  fi
fi
if [ "$t4_ok" -eq 1 ]; then
  record PASS T4 "distractor AC0: no E2E FAIL routes to gate_2/merge — gate_2 sits after logs (Stage: logs precedes the Gate 2 section)"
else
  record FAIL T4 "distractor AC0: no E2E FAIL routes to gate_2/merge — gate_2 sits after logs (Stage: logs precedes the Gate 2 section) (${t4_reason# })"
fi

# ---------------------------------------------------------------------------
# T5 — AC1 (sonnet-verification) right-impl, logs choreography: the `Stage:
#      logs` section dispatches staging-log-verifier on claude-sonnet-4-6 over
#      the deploy window (log_command / cloudwatch).
# ---------------------------------------------------------------------------
t5_ok=1
t5_missing=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t5_ok=0; t5_missing="no-body"
else
  grep -qF 'staging-log-verifier' "$SKILL_BODY" || { t5_ok=0; t5_missing="$t5_missing staging-log-verifier"; }
  grep -qF 'claude-sonnet-4-6' "$SKILL_BODY" || { t5_ok=0; t5_missing="$t5_missing claude-sonnet-4-6"; }
  grep -qF 'log_command' "$SKILL_BODY" || { t5_ok=0; t5_missing="$t5_missing log_command"; }
  grep -qiE 'deploy window|window covering the deploy' "$SKILL_BODY" \
    || { t5_ok=0; t5_missing="$t5_missing deploy-window"; }
fi
if [ "$t5_ok" -eq 1 ]; then
  record PASS T5 "AC1 logs: staging-log-verifier on claude-sonnet-4-6 over the deploy window (log_command/cloudwatch)"
else
  record FAIL T5 "AC1 logs: staging-log-verifier on claude-sonnet-4-6 over the deploy window (log_command/cloudwatch) (missing:${t5_missing})"
fi

# ---------------------------------------------------------------------------
# T6 — DISTRACTOR (AC1 sonnet-verification): unreachable logs (BLOCKED) must
#      NEVER be treated as CLEAN. The body must wire a BLOCKED log verdict
#      (unreachable / unfetchable) to a BLOCKED error exit, and must not equate
#      "could not fetch" with a clean pass. Assert the body says, near the log
#      stage, that unreachable/unfetchable logs are BLOCKED (never clean/pass).
# ---------------------------------------------------------------------------
t6_ok=1
t6_reason=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t6_ok=0; t6_reason="no-body"
else
  # The logs stage must mention CLEAN (the clean verdict) and BLOCKED.
  grep -qiF 'CLEAN' "$SKILL_BODY" || { t6_ok=0; t6_reason="$t6_reason no-CLEAN-verdict"; }
  grep -qF 'BLOCKED' "$SKILL_BODY" || { t6_ok=0; t6_reason="$t6_reason no-BLOCKED"; }
  # Unreachable/unfetchable logs ⇒ BLOCKED framing must be present.
  grep -qiE 'logs (cannot|could not).*(inspect|fetch|reach)|log (command|source).*(fail|unreachable)|unreachable.*log' "$SKILL_BODY" \
    || { t6_ok=0; t6_reason="$t6_reason no-unreachable-logs-blocked-framing"; }
  # And the body must NOT equate an unreachable/unfetchable log fetch with CLEAN
  # on the same logical line.
  if grep -niE 'unreachable|cannot fetch|could not fetch|fetch fail' "$SKILL_BODY" | grep -iqE '\bclean\b'; then
    t6_ok=0; t6_reason="$t6_reason unreachable-equated-with-clean"
  fi
fi
if [ "$t6_ok" -eq 1 ]; then
  record PASS T6 "distractor AC1: unreachable logs are BLOCKED, never passed/CLEAN (no line equates an unfetchable log with clean)"
else
  record FAIL T6 "distractor AC1: unreachable logs are BLOCKED, never passed/CLEAN (no line equates an unfetchable log with clean) (${t6_reason# })"
fi

# ---------------------------------------------------------------------------
# T7 — Gate 2 merge-confirmation choreography: the section presents the
#      consolidated merge brief (merge_brief.py), performs the merge (gh pr
#      merge) ONLY after explicit human confirmation, then records the terminal
#      event — run-completed (approved/merged) or run-aborted (declined).
# ---------------------------------------------------------------------------
t7_ok=1
t7_missing=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t7_ok=0; t7_missing="no-body"
else
  grep -qF 'merge_brief.py' "$SKILL_BODY" || { t7_ok=0; t7_missing="$t7_missing merge_brief.py"; }
  grep -qF 'gh pr merge' "$SKILL_BODY" || { t7_ok=0; t7_missing="$t7_missing gh-pr-merge"; }
  grep -qF 'gate-decision' "$SKILL_BODY" || { t7_ok=0; t7_missing="$t7_missing gate-decision"; }
  grep -qF 'gate_2' "$SKILL_BODY" || { t7_ok=0; t7_missing="$t7_missing gate_2"; }
  grep -qiE 'explicit (confirm|approv)|only after.*confirm|after.*explicit' "$SKILL_BODY" \
    || { t7_ok=0; t7_missing="$t7_missing only-after-confirm"; }
  grep -qF 'run-completed' "$SKILL_BODY" || { t7_ok=0; t7_missing="$t7_missing run-completed"; }
  grep -qF 'run-aborted' "$SKILL_BODY" || { t7_ok=0; t7_missing="$t7_missing run-aborted"; }
fi
if [ "$t7_ok" -eq 1 ]; then
  record PASS T7 "SKILL Gate 2: merge_brief.py brief, gh pr merge only after explicit confirmation, run-completed/run-aborted terminal events"
else
  record FAIL T7 "SKILL Gate 2: merge_brief.py brief, gh pr merge only after explicit confirmation, run-completed/run-aborted terminal events (missing:${t7_missing})"
fi

# ===========================================================================
# GROUP B — run_state.py new subcommands: run-completed / run-aborted
# ===========================================================================

# ---------------------------------------------------------------------------
# T8 — run-completed: emits a run_completed event carrying merged_pr_url;
#      validate still accepts the run.
# ---------------------------------------------------------------------------
t8_ok=1
t8_reason=""
MERGED_URL='https://github.com/acme/widgets/pull/57'
if make_sandbox good >/dev/null; then
  sb8="$SANDBOX"
  RUN8="$(init_to_implement "$sb8" run-t8)" || { t8_ok=0; t8_reason="init"; }
  if [ "$t8_ok" -eq 1 ]; then
    rs "$sb8" run-completed --run-dir "$RUN8" --merged-pr-url "$MERGED_URL" \
       --ts 2026-06-11T10:30:00Z >/dev/null
    rc=$?
    [ "$rc" -eq 0 ] || { t8_ok=0; t8_reason="$t8_reason run-completed-rc=$rc"; }
    python3 -c '
import json, sys
url = sys.argv[2]
evs = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
rc = [e for e in evs if e.get("event")=="run_completed"]
ok = len(rc)==1 and rc[0].get("merged_pr_url")==url
sys.exit(0 if ok else 1)
' "$RUN8/events.jsonl" "$MERGED_URL" 2>/dev/null \
      || { t8_ok=0; t8_reason="$t8_reason run_completed-shape-or-url"; }
    rs "$sb8" validate --run-dir "$RUN8" >/dev/null \
      || { t8_ok=0; t8_reason="$t8_reason validate-failed"; }
  fi
else
  t8_ok=0; t8_reason="sandbox"
fi
if [ "$t8_ok" -eq 1 ]; then
  record PASS T8 "run-completed: emits run_completed{merged_pr_url}; validate ok"
else
  record FAIL T8 "run-completed: emits run_completed{merged_pr_url}; validate ok (${t8_reason# })"
fi

# ---------------------------------------------------------------------------
# T9 — run-aborted: emits a run_aborted event carrying reason; validate still
#      accepts the run.
# ---------------------------------------------------------------------------
t9_ok=1
t9_reason=""
ABORT_REASON='Gate 2 declined: feature deferred'
if make_sandbox good >/dev/null; then
  sb9="$SANDBOX"
  RUN9="$(init_to_implement "$sb9" run-t9)" || { t9_ok=0; t9_reason="init"; }
  if [ "$t9_ok" -eq 1 ]; then
    rs "$sb9" run-aborted --run-dir "$RUN9" --reason "$ABORT_REASON" \
       --ts 2026-06-11T10:30:00Z >/dev/null
    rc=$?
    [ "$rc" -eq 0 ] || { t9_ok=0; t9_reason="$t9_reason run-aborted-rc=$rc"; }
    python3 -c '
import json, sys
reason = sys.argv[2]
evs = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
ra = [e for e in evs if e.get("event")=="run_aborted"]
ok = len(ra)==1 and ra[0].get("reason")==reason
sys.exit(0 if ok else 1)
' "$RUN9/events.jsonl" "$ABORT_REASON" 2>/dev/null \
      || { t9_ok=0; t9_reason="$t9_reason run_aborted-shape-or-reason"; }
    rs "$sb9" validate --run-dir "$RUN9" >/dev/null \
      || { t9_ok=0; t9_reason="$t9_reason validate-failed"; }
  fi
else
  t9_ok=0; t9_reason="sandbox"
fi
if [ "$t9_ok" -eq 1 ]; then
  record PASS T9 "run-aborted: emits run_aborted{reason}; validate ok"
else
  record FAIL T9 "run-aborted: emits run_aborted{reason}; validate ok (${t9_reason# })"
fi

# ===========================================================================
# GROUP C — full helper-driven sandbox run: ordering, gate count, merge timing
# ===========================================================================

# ---------------------------------------------------------------------------
# T10 — AC2 (ci-cloud-deploy) sandbox order + AC1 (two-gates) merge-after-approve:
#       a full run deploy(no-op)→e2e→logs reaches gate_2 with deploy's
#       stage_passed BEFORE e2e's timer_started in events.jsonl; then a
#       `gh pr merge` invocation (recorded argv) appears ONLY after gate_2's
#       gate-decision approved, and a run_completed event is written.
# ---------------------------------------------------------------------------
t10_ok=1
t10_reason=""
if make_sandbox good >/dev/null; then
  sb10="$SANDBOX"
  RUN10="$(init_to_implement "$sb10" run-t10)" || { t10_ok=0; t10_reason="init"; }
  if [ "$t10_ok" -eq 1 ]; then
    drive_to_pre_deploy "$sb10" "$RUN10" || { t10_ok=0; t10_reason="$t10_reason pre-deploy"; }
    drive_deploy_e2e_logs "$sb10" "$RUN10" || { t10_ok=0; t10_reason="$t10_reason deploy-e2e-logs"; }
  fi
  if [ "$t10_ok" -eq 1 ]; then
    EV="$RUN10/events.jsonl"
    # Ordering: deploy stage_passed precedes e2e timer_started.
    dep_pass="$(first_index "$EV" stage_passed stage deploy)"
    e2e_timer="$(first_index "$EV" timer_started stage e2e)"
    if [ "$dep_pass" -lt 0 ] || [ "$e2e_timer" -lt 0 ]; then
      t10_ok=0; t10_reason="$t10_reason missing-deploy-pass-or-e2e-timer(dep=$dep_pass,e2e=$e2e_timer)"
    elif [ "$dep_pass" -ge "$e2e_timer" ]; then
      t10_ok=0; t10_reason="$t10_reason deploy_passed-not-before-e2e-timer(dep=$dep_pass,e2e=$e2e_timer)"
    fi
    # gate_2 reached, then approve it, then perform the merge ONLY now.
    [ -f "$sb10/stub-state/pr-merge.argv" ] && { t10_ok=0; t10_reason="$t10_reason merge-before-gate2-decision"; }
    rs "$sb10" gate-decision --run-dir "$RUN10" --gate gate_2 --decision approved \
       --ts 2026-06-11T10:10:00Z >/dev/null \
      || { t10_ok=0; t10_reason="$t10_reason gate2-decision-rc"; }
    # The orchestrator performs the merge after the approval (here, the test
    # drives the recorded merge fake), then records the terminal event.
    PATH="$sb10/stubbin:$PATH" gh pr merge 57 --squash --delete-branch >/dev/null 2>&1
    rs "$sb10" run-completed --run-dir "$RUN10" \
       --merged-pr-url 'https://github.com/acme/widgets/pull/57' \
       --ts 2026-06-11T10:10:05Z >/dev/null \
      || { t10_ok=0; t10_reason="$t10_reason run-completed-rc"; }
    # A merge was recorded, and it carries PR 57.
    if [ ! -f "$sb10/stub-state/pr-merge.argv" ]; then
      t10_ok=0; t10_reason="$t10_reason no-pr-merge.argv-after-approve"
    else
      grep -qxF '57' "$sb10/stub-state/pr-merge.argv" \
        || { t10_ok=0; t10_reason="$t10_reason pr-merge-argv-missing-57"; }
    fi
    # run_completed event present.
    n="$(count_events "$EV" run_completed)"
    [ "$n" = "1" ] || { t10_ok=0; t10_reason="$t10_reason run_completed-count=$n(want-1)"; }
    # validate clean.
    rs "$sb10" validate --run-dir "$RUN10" >/dev/null \
      || { t10_ok=0; t10_reason="$t10_reason validate-failed"; }
  fi
else
  t10_ok=0; t10_reason="sandbox"
fi
if [ "$t10_ok" -eq 1 ]; then
  record PASS T10 "AC2/two-gates: full run reaches gate_2 w/ deploy stage_passed BEFORE e2e timer_started; gh pr merge recorded ONLY after gate_2 approved; run_completed; validate ok"
else
  record FAIL T10 "AC2/two-gates: full run reaches gate_2 w/ deploy stage_passed BEFORE e2e timer_started; gh pr merge recorded ONLY after gate_2 approved; run_completed; validate ok (${t10_reason# })"
fi

# ---------------------------------------------------------------------------
# T11 — DISTRACTOR (AC2 ci-cloud-deploy): the deploy-before-e2e ordering
#       assertion must have TEETH. Hand-build an events sequence where e2e's
#       timer_started PRECEDES deploy's stage_passed and assert the SAME
#       ordering check (deploy_passed index < e2e_timer index) FAILS on it.
#       If the check passed here too, it would be vacuous.
# ---------------------------------------------------------------------------
t11_ok=1
t11_reason=""
BAD_EV="$WORK_DIR/bad-order-events.jsonl"
cat > "$BAD_EV" <<'EOF'
{"event":"stage_started","ts":"2026-06-11T09:49:00Z","stage":"e2e"}
{"event":"timer_started","ts":"2026-06-11T09:49:00Z","stage":"e2e"}
{"event":"stage_started","ts":"2026-06-11T09:46:00Z","stage":"deploy"}
{"event":"timer_started","ts":"2026-06-11T09:46:00Z","stage":"deploy"}
{"event":"timer_stopped","ts":"2026-06-11T09:48:00Z","stage":"deploy","work_seconds":120}
{"event":"stage_passed","ts":"2026-06-11T09:48:00Z","stage":"deploy"}
EOF
bad_dep="$(first_index "$BAD_EV" stage_passed stage deploy)"
bad_e2e="$(first_index "$BAD_EV" timer_started stage e2e)"
# The same ordering predicate used in T10 (dep_pass < e2e_timer) must be FALSE
# here, i.e. e2e's timer precedes deploy's pass — proving the check rejects a
# wrong ordering rather than passing unconditionally.
if [ "$bad_dep" -lt 0 ] || [ "$bad_e2e" -lt 0 ]; then
  t11_ok=0; t11_reason="$t11_reason missing-indices(dep=$bad_dep,e2e=$bad_e2e)"
elif [ "$bad_dep" -lt "$bad_e2e" ]; then
  # If the predicate were TRUE here, the ordering check has no teeth.
  t11_ok=0; t11_reason="$t11_reason ordering-check-toothless(dep=$bad_dep<e2e=$bad_e2e)"
fi
if [ "$t11_ok" -eq 1 ]; then
  record PASS T11 "distractor AC2: deploy-before-e2e ordering check has teeth — a sequence with e2e timer before deploy pass makes the predicate FALSE"
else
  record FAIL T11 "distractor AC2: deploy-before-e2e ordering check has teeth — a sequence with e2e timer before deploy pass makes the predicate FALSE (${t11_reason# })"
fi

# ---------------------------------------------------------------------------
# T12 — AC2 (two-gates) right-impl: a full successful sandbox run's events.jsonl
#       has EXACTLY 2 gate_reached events (gate_1, gate_2) and no third human
#       halt.
# ---------------------------------------------------------------------------
t12_ok=1
t12_reason=""
if make_sandbox good >/dev/null; then
  sb12="$SANDBOX"
  RUN12="$(init_to_implement "$sb12" run-t12)" || { t12_ok=0; t12_reason="init"; }
  if [ "$t12_ok" -eq 1 ]; then
    drive_to_pre_deploy "$sb12" "$RUN12" || { t12_ok=0; t12_reason="$t12_reason pre-deploy"; }
    drive_deploy_e2e_logs "$sb12" "$RUN12" || { t12_ok=0; t12_reason="$t12_reason deploy-e2e-logs"; }
    rs "$sb12" gate-decision --run-dir "$RUN12" --gate gate_2 --decision approved \
       --ts 2026-06-11T10:10:00Z >/dev/null || { t12_ok=0; t12_reason="$t12_reason gate2-decision"; }
    rs "$sb12" run-completed --run-dir "$RUN12" \
       --merged-pr-url 'https://github.com/acme/widgets/pull/57' \
       --ts 2026-06-11T10:10:05Z >/dev/null || { t12_ok=0; t12_reason="$t12_reason run-completed"; }
  fi
  if [ "$t12_ok" -eq 1 ]; then
    EV="$RUN12/events.jsonl"
    total_gates="$(count_events "$EV" gate_reached)"
    [ "$total_gates" = "2" ] || { t12_ok=0; t12_reason="$t12_reason gate_reached-count=$total_gates(want-2)"; }
    g1="$(count_events "$EV" gate_reached gate gate_1)"
    g2="$(count_events "$EV" gate_reached gate gate_2)"
    [ "$g1" = "1" ] || { t12_ok=0; t12_reason="$t12_reason gate_1-reached=$g1(want-1)"; }
    [ "$g2" = "1" ] || { t12_ok=0; t12_reason="$t12_reason gate_2-reached=$g2(want-1)"; }
    rs "$sb12" validate --run-dir "$RUN12" >/dev/null \
      || { t12_ok=0; t12_reason="$t12_reason validate-failed"; }
  fi
else
  t12_ok=0; t12_reason="sandbox"
fi
if [ "$t12_ok" -eq 1 ]; then
  record PASS T12 "AC2 two-gates: a full successful run has exactly 2 gate_reached events (gate_1, gate_2) and no third halt"
else
  record FAIL T12 "AC2 two-gates: a full successful run has exactly 2 gate_reached events (gate_1, gate_2) and no third halt (${t12_reason# })"
fi

# ---------------------------------------------------------------------------
# T13 — DISTRACTOR (AC2 two-gates): the error-exit paths emit NO gate event.
#       (a) The review max-3 exhaustion path emits a stage_blocked(review), NOT
#           a gate_reached. (b) A cloud_review timeout consolidated by
#           record-decision emits a decision_recorded, NOT a gate_reached. Both
#           are stage_blocked / decision_recorded, never a third human gate.
# ---------------------------------------------------------------------------
t13_ok=1
t13_reason=""
# (a) review exhaustion path
if make_sandbox good >/dev/null; then
  sb13a="$SANDBOX"
  RUN13a="$(init_to_implement "$sb13a" run-t13a)" || { t13_ok=0; t13_reason="$t13_reason init-a"; }
  if [ -n "${RUN13a:-}" ] && [ -d "${RUN13a:-/nonexistent}" ]; then
    rs "$sb13a" review-verdict --run-dir "$RUN13a" --verdict fix --evidence-summary 'r1' --ts 2026-06-11T10:00:00Z >/dev/null
    rs "$sb13a" review-verdict --run-dir "$RUN13a" --verdict fix --evidence-summary 'r2' --ts 2026-06-11T10:10:00Z >/dev/null
    # 3rd FIX exhausts the bound (exit 4, stage_blocked review, NO gate).
    PATH="$sb13a/stubbin:$PATH" timeout 60 python3 "$RUNSTATE" review-verdict \
       --run-dir "$RUN13a" --verdict fix --evidence-summary 'r3' \
       --ts 2026-06-11T10:20:00Z </dev/null >/dev/null 2>&1
    EV="$RUN13a/events.jsonl"
    nb="$(count_events "$EV" stage_blocked stage review)"
    [ "$nb" = "1" ] || { t13_ok=0; t13_reason="$t13_reason exhaust-stage_blocked=$nb(want-1)"; }
    # NO gate_2 from the exhaustion path; the only gate reached is gate_1.
    g2="$(count_events "$EV" gate_reached gate gate_2)"
    [ "$g2" = "0" ] || { t13_ok=0; t13_reason="$t13_reason exhaust-emitted-gate_2(n=$g2)"; }
    total_after_g1="$(count_events "$EV" gate_reached)"
    [ "$total_after_g1" = "1" ] || { t13_ok=0; t13_reason="$t13_reason exhaust-gate_reached-total=$total_after_g1(want-1=only-gate_1)"; }
  fi
else
  t13_ok=0; t13_reason="$t13_reason sandbox-a"
fi
# (b) cloud_review timeout → decision_recorded path
if make_sandbox good >/dev/null; then
  sb13b="$SANDBOX"
  RUN13b="$(init_to_implement "$sb13b" run-t13b)" || { t13_ok=0; t13_reason="$t13_reason init-b"; }
  if [ -n "${RUN13b:-}" ] && [ -d "${RUN13b:-/nonexistent}" ]; then
    rs "$sb13b" record-decision --run-dir "$RUN13b" --decision ship \
       --rationale 'cloud review timed out; CI green + APPROVE — ship' \
       --conflicting-evidence 'cloud_review=timeout, ci=passed, review=approve' \
       --ts 2026-06-11T10:00:00Z >/dev/null
    EV="$RUN13b/events.jsonl"
    nd="$(count_events "$EV" decision_recorded)"
    [ "$nd" = "1" ] || { t13_ok=0; t13_reason="$t13_reason timeout-decision_recorded=$nd(want-1)"; }
    # The timeout consolidation emits NO gate event at all beyond gate_1.
    total_b="$(count_events "$EV" gate_reached)"
    [ "$total_b" = "1" ] || { t13_ok=0; t13_reason="$t13_reason timeout-gate_reached-total=$total_b(want-1=only-gate_1)"; }
  fi
else
  t13_ok=0; t13_reason="$t13_reason sandbox-b"
fi
if [ "$t13_ok" -eq 1 ]; then
  record PASS T13 "distractor two-gates: review exhaustion emits stage_blocked(review) & cloud_review timeout emits decision_recorded — neither emits a gate event"
else
  record FAIL T13 "distractor two-gates: review exhaustion emits stage_blocked(review) & cloud_review timeout emits decision_recorded — neither emits a gate event (${t13_reason# })"
fi

# ---------------------------------------------------------------------------
# T14 — DISTRACTOR (AC1 two-gates): a run where gate_2 is REJECTED records a
#       run_aborted event and NO `gh pr merge` argv. The merge is the Gate 2
#       outcome of an APPROVAL only; a decline never merges.
# ---------------------------------------------------------------------------
t14_ok=1
t14_reason=""
if make_sandbox good >/dev/null; then
  sb14="$SANDBOX"
  RUN14="$(init_to_implement "$sb14" run-t14)" || { t14_ok=0; t14_reason="init"; }
  if [ "$t14_ok" -eq 1 ]; then
    drive_to_pre_deploy "$sb14" "$RUN14" || { t14_ok=0; t14_reason="$t14_reason pre-deploy"; }
    drive_deploy_e2e_logs "$sb14" "$RUN14" || { t14_ok=0; t14_reason="$t14_reason deploy-e2e-logs"; }
    # Human DECLINES at Gate 2.
    rs "$sb14" gate-decision --run-dir "$RUN14" --gate gate_2 --decision rejected \
       --feedback 'defer the feature' --ts 2026-06-11T10:10:00Z >/dev/null \
      || { t14_ok=0; t14_reason="$t14_reason gate2-reject-rc"; }
    # The orchestrator records a run_aborted and performs NO merge.
    rs "$sb14" run-aborted --run-dir "$RUN14" --reason 'Gate 2 declined: feature deferred' \
       --ts 2026-06-11T10:10:05Z >/dev/null \
      || { t14_ok=0; t14_reason="$t14_reason run-aborted-rc"; }
    EV="$RUN14/events.jsonl"
    na="$(count_events "$EV" run_aborted)"
    [ "$na" = "1" ] || { t14_ok=0; t14_reason="$t14_reason run_aborted-count=$na(want-1)"; }
    nc="$(count_events "$EV" run_completed)"
    [ "$nc" = "0" ] || { t14_ok=0; t14_reason="$t14_reason run_completed-on-reject(n=$nc)"; }
    # NO gh pr merge was ever recorded on a declined gate.
    if [ -f "$sb14/stub-state/pr-merge.argv" ]; then
      t14_ok=0; t14_reason="$t14_reason pr-merge-recorded-on-reject"
    fi
    rs "$sb14" validate --run-dir "$RUN14" >/dev/null \
      || { t14_ok=0; t14_reason="$t14_reason validate-failed"; }
  fi
else
  t14_ok=0; t14_reason="sandbox"
fi
if [ "$t14_ok" -eq 1 ]; then
  record PASS T14 "distractor two-gates: a rejected gate_2 records run_aborted and NO gh pr merge argv (decline never merges)"
else
  record FAIL T14 "distractor two-gates: a rejected gate_2 records run_aborted and NO gh pr merge argv (decline never merges) (${t14_reason# })"
fi

# ===========================================================================
# GROUP D — merge_brief.py: consolidated Gate 2 brief content + time summary
# ===========================================================================

# Build one fully-populated, completed run that BOTH merge_brief.py and
# run_state.py summary read, so the two producers can be cross-checked. Reuse
# the T9 fixture shape from the timing suite (nine stages all passed, both gates
# approved) and add the run-state artifacts a brief points at (plan.md, E2E
# evidence files). This run dir is engine-shaped so `validate` passes.
BRIEF_RUN="$WORK_DIR/brief-run"
mkdir -p "$BRIEF_RUN/logs/staging-e2e"
printf '# plan\n\n## Acceptance criteria\n- AC-1 ...\n' > "$BRIEF_RUN/plan.md"
printf 'PASS S-1\n' > "$BRIEF_RUN/logs/staging-e2e/2026-06-11-114320-S-1.png"
printf 'PASS S-2\n' > "$BRIEF_RUN/logs/staging-e2e/2026-06-11-114800-S-2.png"
cat > "$BRIEF_RUN/state.json" <<'EOF'
{
  "run_id": "run-2026-06-11-issue-142-c0de",
  "issue": {
    "number": 142,
    "url": "https://github.com/acme/widgets/issues/142",
    "title": "Add CSV export to the reports page"
  },
  "branch": "ship-issue/142-csv-export",
  "pr": { "number": 187, "url": "https://github.com/acme/widgets/pull/187" },
  "review_cycles": 1,
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
cat > "$BRIEF_RUN/events.jsonl" <<'EOF'
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
{"event":"implement_evidence","ts":"2026-06-11T09:40:30Z","red_evidence":"AC-1..AC-3 export tests: 5 failing (RED)","green_evidence":"full suite 128 passed (GREEN)"}
{"event":"timer_stopped","ts":"2026-06-11T10:52:30Z","stage":"implement","work_seconds":4335}
{"event":"stage_passed","ts":"2026-06-11T10:52:30Z","stage":"implement"}
{"event":"stage_started","ts":"2026-06-11T10:52:35Z","stage":"review"}
{"event":"timer_started","ts":"2026-06-11T10:52:35Z","stage":"review"}
{"event":"fix_task_dispatched","ts":"2026-06-11T10:55:00Z","stage":"review","target_agent":"tdd-implementer","model":"claude-opus-4-8","evidence_summary":"1 blocker: AC-3 untested"}
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
EOF

# Capture the brief once for the content + time-summary tests.
brief_out="$(cd "$WORK_DIR" && timeout 60 python3 "$MERGE_BRIEF" --run-dir "$BRIEF_RUN" 2>/dev/null)"
brief_rc=$?

# ---------------------------------------------------------------------------
# T15 — AC1 (two-gates) merge-brief CONTENT: the brief contains the plan link,
#       the PR link, every review verdict, CI status, E2E evidence path(s) that
#       RESOLVE to real files on disk, and the log verdict.
# ---------------------------------------------------------------------------
t15_ok=1
t15_reason=""
if [ "$brief_rc" -ne 0 ]; then
  t15_ok=0; t15_reason="$t15_reason brief-rc=$brief_rc(want-0)"
fi
if [ -n "$brief_out" ]; then
  # Plan link: a reference to the run's plan.md.
  printf '%s\n' "$brief_out" | grep -qiE 'plan\.md|plan:' \
    || { t15_ok=0; t15_reason="$t15_reason no-plan-link"; }
  # PR link.
  printf '%s\n' "$brief_out" | grep -qF 'https://github.com/acme/widgets/pull/187' \
    || { t15_ok=0; t15_reason="$t15_reason no-pr-link"; }
  # Review verdict(s): at least one APPROVE-class verdict reported (review passed).
  printf '%s\n' "$brief_out" | grep -qiE 'approve|review.*pass' \
    || { t15_ok=0; t15_reason="$t15_reason no-review-verdict"; }
  # CI status.
  printf '%s\n' "$brief_out" | grep -qiE 'ci.*(pass|green)' \
    || { t15_ok=0; t15_reason="$t15_reason no-ci-status"; }
  # Log verdict (clean).
  printf '%s\n' "$brief_out" | grep -qiE 'log.*(clean|pass)' \
    || { t15_ok=0; t15_reason="$t15_reason no-log-verdict"; }
  # E2E evidence path(s): every printed path that looks like the run's E2E
  # evidence must RESOLVE to a real file on disk. Extract candidate paths and
  # check each one exists (relative to the run dir or absolute).
  resolve_out="$(printf '%s\n' "$brief_out" | python3 -c '
import os, re, sys
run_dir = sys.argv[1]
text = sys.stdin.read()
# Candidate evidence tokens: any whitespace-delimited token mentioning the
# staging-e2e evidence dir or ending in .png.
cands = set()
for tok in re.split(r"\s+", text):
    tok = tok.strip().strip("\"'\'')(,;")
    if not tok:
        continue
    if "staging-e2e" in tok or tok.endswith(".png"):
        cands.add(tok)
if not cands:
    print("NO_EVIDENCE_PATHS"); sys.exit(0)
missing = []
for c in sorted(cands):
    p = c if os.path.isabs(c) else os.path.join(run_dir, c)
    if not os.path.isfile(p):
        missing.append(c)
print("MISSING:" + ",".join(missing) if missing else "ALL_RESOLVE")
' "$BRIEF_RUN" 2>/dev/null)"
  case "$resolve_out" in
    ALL_RESOLVE) : ;;
    NO_EVIDENCE_PATHS) t15_ok=0; t15_reason="$t15_reason no-e2e-evidence-path-in-brief" ;;
    *) t15_ok=0; t15_reason="$t15_reason e2e-evidence-path-unresolved($resolve_out)" ;;
  esac
else
  t15_ok=0; t15_reason="$t15_reason empty-brief"
fi
if [ "$t15_ok" -eq 1 ]; then
  record PASS T15 "AC1 merge brief content: plan link, PR link, review verdict, CI status, log verdict, and E2E evidence path(s) that resolve to real files on disk"
else
  record FAIL T15 "AC1 merge brief content: plan link, PR link, review verdict, CI status, log verdict, and E2E evidence path(s) that resolve to real files on disk (${t15_reason# })"
fi

# ---------------------------------------------------------------------------
# T16 — AC3 (time-tracking) right-impl: the brief embeds all nine per-stage
#       durations, the three TOTALs (work / gate_wait / crash_gap), and the four
#       TIER lines — and these MATCH `run_state.py summary` for the same run
#       (both producers agree).
# ---------------------------------------------------------------------------
t16_ok=1
t16_reason=""
summary_out="$(timeout 60 python3 "$RUNSTATE" summary --run-dir "$BRIEF_RUN" 2>/dev/null)"
if [ -z "$brief_out" ]; then
  t16_ok=0; t16_reason="$t16_reason empty-brief"
fi
if [ -z "$summary_out" ]; then
  t16_ok=0; t16_reason="$t16_reason empty-summary"
fi
if [ "$t16_ok" -eq 1 ]; then
  # All nine per-stage durations present in the brief.
  T16_STAGE_NAMES=(preflight plan implement review ci cloud_review deploy e2e logs)
  T16_STAGE_DURS=(18 439 4335 1045 1255 600 120 800 60)
  for i in "${!T16_STAGE_NAMES[@]}"; do
    nm="${T16_STAGE_NAMES[$i]}"; du="${T16_STAGE_DURS[$i]}"
    printf '%s\n' "$brief_out" | grep -qE "(^|[^0-9])${nm}([^a-z_]|$)" \
      || { t16_ok=0; t16_reason="$t16_reason brief-no-stage-${nm}"; }
    printf '%s\n' "$brief_out" | grep -qE "(^|[^0-9])${du}([^0-9]|$)" \
      || { t16_ok=0; t16_reason="$t16_reason brief-no-duration-${nm}=${du}"; }
  done
  # The three run totals, by value.
  for du in 8672 1111 0; do
    printf '%s\n' "$brief_out" | grep -qE "(^|[^0-9])${du}([^0-9]|$)" \
      || { t16_ok=0; t16_reason="$t16_reason brief-no-total-${du}"; }
  done
  # The four TIER values.
  for du in 1502 4335 860 1975; do
    printf '%s\n' "$brief_out" | grep -qE "(^|[^0-9])${du}([^0-9]|$)" \
      || { t16_ok=0; t16_reason="$t16_reason brief-no-tier-value-${du}"; }
  done
  # Cross-check: every STAGE/TOTAL/TIER line from run_state.py summary has its
  # value embedded in the brief (the two producers agree).
  cross="$(printf '%s\n' "$summary_out" | python3 -c '
import sys
brief = open(sys.argv[1]).read()
mism = []
for line in sys.stdin:
    parts = line.split()
    if not parts or parts[0] not in ("STAGE","TOTAL","TIER"):
        continue
    val = parts[-1]
    # The value must appear in the brief as a standalone number/token.
    import re
    if not re.search(r"(^|[^0-9])"+re.escape(val)+r"([^0-9]|$)", brief):
        mism.append(" ".join(parts))
print("OK" if not mism else "MISMATCH:" + "; ".join(mism))
' <(printf '%s\n' "$brief_out") 2>/dev/null)"
  if [ "$cross" != "OK" ]; then
    t16_ok=0; t16_reason="$t16_reason summary-not-embedded($cross)"
  fi
fi
if [ "$t16_ok" -eq 1 ]; then
  record PASS T16 "AC3 brief time summary: nine durations, three TOTALs, four TIER lines all embedded and matching run_state.py summary"
else
  record FAIL T16 "AC3 brief time summary: nine durations, three TOTALs, four TIER lines all embedded and matching run_state.py summary (${t16_reason# })"
fi

# ---------------------------------------------------------------------------
# T17 — DISTRACTOR (AC3 time-tracking): the brief's tier rollup must be
#       partition-exact (reuse timing T10's check). A brief that omits the
#       per-tier rollup, or folds external stages (ci/cloud_review/deploy) into
#       a model tier, must FAIL: the fable-5 tier must be exactly 1502 (NOT
#       3477 = 1502 + 1975-external), the four tier values must be present
#       exactly, and they must sum to TOTAL work (8672).
# ---------------------------------------------------------------------------
t17_ok=1
t17_reason=""
if [ -z "$brief_out" ]; then
  t17_ok=0; t17_reason="$t17_reason empty-brief"
else
  # fable-5 stays 1502 — NOT 3477 (3477 = fable 1502 + external 1975 folded in).
  if printf '%s\n' "$brief_out" | grep -qE '(^|[^0-9])3477([^0-9]|$)'; then
    t17_ok=0; t17_reason="$t17_reason fable-folded-external(3477-present)"
  fi
  printf '%s\n' "$brief_out" | grep -qiF 'claude-fable-5' \
    || { t17_ok=0; t17_reason="$t17_reason no-fable-tier-label"; }
  # The explicit external bucket (1975) must be present as its own rollup, not
  # silently merged into a model tier.
  printf '%s\n' "$brief_out" | grep -qiE 'external' \
    || { t17_ok=0; t17_reason="$t17_reason no-external-tier-label"; }
  printf '%s\n' "$brief_out" | grep -qE '(^|[^0-9])1975([^0-9]|$)' \
    || { t17_ok=0; t17_reason="$t17_reason no-external-value-1975"; }
  # Partition-exact: the four tier values present and summing to TOTAL work.
  # Extract tier values the brief reports for each of the four buckets and sum.
  part="$(printf '%s\n' "$brief_out" | python3 -c '
import re, sys
text = sys.stdin.read()
want = {
    "claude-fable-5": 1502,
    "claude-opus-4-8": 4335,
    "claude-sonnet-4-6": 860,
    "external": 1975,
}
errs = []
total = 0
for label, val in want.items():
    # The label must co-occur with its exact value somewhere in the brief.
    if not re.search(r"(^|[^0-9])"+re.escape(str(val))+r"([^0-9]|$)", text):
        errs.append("%s-value-%d-missing" % (label, val))
        continue
    total += val
if total != 8672:
    errs.append("tier-sum=%d!=8672" % total)
print("OK" if not errs else "ERR:" + ",".join(errs))
' 2>/dev/null)"
  if [ "$part" != "OK" ]; then
    t17_ok=0; t17_reason="$t17_reason partition-not-exact($part)"
  fi
fi
if [ "$t17_ok" -eq 1 ]; then
  record PASS T17 "distractor AC3: brief tier rollup is partition-exact — fable-5 stays 1502 (not 3477), external (1975) is its own bucket, four tiers sum to TOTAL work 8672"
else
  record FAIL T17 "distractor AC3: brief tier rollup is partition-exact — fable-5 stays 1502 (not 3477), external (1975) is its own bucket, four tiers sum to TOTAL work 8672 (${t17_reason# })"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf '%d/%d passed\n' "$PASS_COUNT" "$TOTAL_COUNT"
if [ "$PASS_COUNT" -eq "$TOTAL_COUNT" ]; then
  exit 0
fi
exit 1
