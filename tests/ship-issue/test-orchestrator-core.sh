#!/bin/bash
# test-orchestrator-core.sh — RED-phase tests for Phase 3 of the ship-issue
# pipeline: the orchestrator skill (skills/ship-issue/SKILL.md) and its
# helpers (scripts/preflight.py, scripts/run_state.py).
#
# Text contracts on SKILL.md (T1-T8), plugin packaging (T9), and scenario
# tests against a local throwaway git sandbox with offline gh/aws stubs
# (T10-T16). No network, no real gh/aws, ever.
#
# Plain bash, no framework. Collects ALL failures (no set -e).
# Output: one line per test "PASS|FAIL Tn: <desc>", then "X/Y passed".
# Exit 0 only if every test passes.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SKILL="$REPO_ROOT/skills/ship-issue/SKILL.md"
PREFLIGHT="$REPO_ROOT/skills/ship-issue/scripts/preflight.py"
RUNSTATE="$REPO_ROOT/skills/ship-issue/scripts/run_state.py"

# shellcheck source=lib-sandbox.sh
. "$SCRIPT_DIR/lib-sandbox.sh"

PASS_COUNT=0
TOTAL_COUNT=0

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"; cleanup_sandboxes' EXIT

record() {
  # record <PASS|FAIL> <test-id> <description>
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  if [ "$1" = "PASS" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
  printf '%s %s: %s\n' "$1" "$2" "$3"
}

# ---------------------------------------------------------------------------
# Shared extraction helpers (same approach as test-agent-roster.sh)
# ---------------------------------------------------------------------------

# Print YAML frontmatter only: lines strictly between the first `---` line
# (which must be line 1) and the next `---` line.
extract_frontmatter() {
  local file="$1"
  [ -f "$file" ] || return 1
  head -n1 "$file" | grep -qE '^---[[:space:]]*$' || return 1
  awk 'NR==1{next} /^---[[:space:]]*$/{exit} {print}' "$file"
}

# Print the body: everything AFTER the closing `---` of the frontmatter.
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

# ---------------------------------------------------------------------------
# Sandbox command helpers — stubs first on PATH, never the network
# ---------------------------------------------------------------------------

# run_preflight <sandbox> <stdout-file>  → preflight's exit code
run_preflight() {
  local sb="$1" out="$2" rc
  (
    cd "$sb" || exit 97
    PATH="$sb/stubbin:$PATH" timeout 60 python3 "$PREFLIGHT" --repo "$sb" </dev/null
  ) > "$out" 2>/dev/null
  rc=$?
  return "$rc"
}

# rs <sandbox> <run_state.py args...>  → run_state.py's exit code; stdout passes through
rs() {
  local sb="$1"
  shift
  PATH="$sb/stubbin:$PATH" timeout 60 python3 "$RUNSTATE" "$@" </dev/null 2>/dev/null
}

# ---------------------------------------------------------------------------
# T1 — SKILL.md exists with required frontmatter fields
# ---------------------------------------------------------------------------
t1_ok=1
t1_reason=""
if [ ! -f "$SKILL" ]; then
  t1_ok=0; t1_reason="missing-file"
elif ! fm="$(extract_frontmatter "$SKILL")"; then
  t1_ok=0; t1_reason="unparseable-frontmatter"
else
  printf '%s\n' "$fm" | grep -qE '^name:[[:space:]]*ship-issue[[:space:]]*$' \
    || { t1_ok=0; t1_reason="$t1_reason name"; }
  printf '%s\n' "$fm" | grep -qE '^description:[[:space:]]*[^[:space:]]' \
    || { t1_ok=0; t1_reason="$t1_reason description"; }
  printf '%s\n' "$fm" | grep -E '^argument-hint:' | grep -qF 'issue-number-or-url' \
    || { t1_ok=0; t1_reason="$t1_reason argument-hint"; }
  printf '%s\n' "$fm" | grep -qE '^disable-model-invocation:[[:space:]]*true[[:space:]]*$' \
    || { t1_ok=0; t1_reason="$t1_reason disable-model-invocation"; }
fi
if [ "$t1_ok" -eq 1 ]; then
  record PASS T1 "SKILL.md exists with name/description/argument-hint/disable-model-invocation frontmatter"
else
  record FAIL T1 "SKILL.md exists with name/description/argument-hint/disable-model-invocation frontmatter (${t1_reason# })"
fi

# ---------------------------------------------------------------------------
# T2 — distractor: NO context: fork in frontmatter (gates are interactive).
#       Missing/unparseable file is T1's failure, not T2's.
# ---------------------------------------------------------------------------
t2_ok=1
if fm="$(extract_frontmatter "$SKILL" 2>/dev/null)"; then
  if printf '%s\n' "$fm" | grep -qE '^context:'; then
    t2_ok=0
  fi
fi
if [ "$t2_ok" -eq 1 ]; then
  record PASS T2 "frontmatter has no context: line (no context fork; gates are interactive)"
else
  record FAIL T2 "frontmatter has no context: line (no context fork; gates are interactive)"
fi

# ---------------------------------------------------------------------------
# T3 — body mentions the orchestrator's moving parts
# ---------------------------------------------------------------------------
t3_ok=1
t3_missing=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t3_ok=0; t3_missing="no-body"
else
  for needle in 'gh issue view' '.claude/ship-issue.config.json' 'scripts/preflight.py' 'scripts/run_state.py' 'state.json' 'events.jsonl' 'BLOCKED'; do
    grep -qF "$needle" "$SKILL_BODY" || { t3_ok=0; t3_missing="$t3_missing $needle"; }
  done
  grep -qiF 'resume' "$SKILL_BODY" || { t3_ok=0; t3_missing="$t3_missing resume"; }
fi
if [ "$t3_ok" -eq 1 ]; then
  record PASS T3 "body mentions gh issue view, config path, both helper scripts, state.json, events.jsonl, BLOCKED, resume"
else
  record FAIL T3 "body mentions gh issue view, config path, both helper scripts, state.json, events.jsonl, BLOCKED, resume (missing:${t3_missing})"
fi

# ---------------------------------------------------------------------------
# T4 — body names all nine stage state keys exactly
# ---------------------------------------------------------------------------
t4_ok=1
t4_missing=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t4_ok=0; t4_missing="no-body"
else
  for stage in preflight plan implement review ci cloud_review deploy e2e logs; do
    grep -qE "\b${stage}\b" "$SKILL_BODY" || { t4_ok=0; t4_missing="$t4_missing $stage"; }
  done
fi
if [ "$t4_ok" -eq 1 ]; then
  record PASS T4 "body names all nine stage keys (preflight plan implement review ci cloud_review deploy e2e logs)"
else
  record FAIL T4 "body names all nine stage keys (missing:${t4_missing})"
fi

# ---------------------------------------------------------------------------
# T5 — gate-1 contract: approve/reject, fresh issue-planner task on
#       claude-fable-5 with rejection feedback carried verbatim
# ---------------------------------------------------------------------------
t5_ok=1
t5_missing=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t5_ok=0; t5_missing="no-body"
else
  grep -qiE 'gate[[:space:]]+1' "$SKILL_BODY" || { t5_ok=0; t5_missing="$t5_missing gate-1"; }
  grep -qi 'approve' "$SKILL_BODY" || { t5_ok=0; t5_missing="$t5_missing approve"; }
  grep -qi 'reject' "$SKILL_BODY" || { t5_ok=0; t5_missing="$t5_missing reject"; }
  grep -qF 'issue-planner' "$SKILL_BODY" || { t5_ok=0; t5_missing="$t5_missing issue-planner"; }
  grep -qF 'claude-fable-5' "$SKILL_BODY" || { t5_ok=0; t5_missing="$t5_missing claude-fable-5"; }
  grep -qi 'verbatim' "$SKILL_BODY" || { t5_ok=0; t5_missing="$t5_missing verbatim"; }
fi
if [ "$t5_ok" -eq 1 ]; then
  record PASS T5 "gate-1 contract: approve/reject, issue-planner on claude-fable-5, feedback carried verbatim"
else
  record FAIL T5 "gate-1 contract: approve/reject, issue-planner on claude-fable-5, feedback carried verbatim (missing:${t5_missing})"
fi

# ---------------------------------------------------------------------------
# T6 — the pipeline boundary stub. Phase 4 SHIPPED the implement/review/ci/
#      cloud_review stages, so the old "Phase 4 handoff stub" is gone; the
#      boundary stub now marks the Phase 5 handoff (deploy/e2e/logs/Gate 2).
# ---------------------------------------------------------------------------
t6_ok=1
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t6_ok=0
else
  # The boundary stub now points at Phase 5, not Phase 4.
  grep -qiE 'phase[[:space:]]+5' "$SKILL_BODY" || t6_ok=0
  grep -qi 'stub' "$SKILL_BODY" || t6_ok=0
  # The old Phase-4 handoff stub must NOT remain (those stages are real now).
  grep -qiE 'phase[[:space:]]+4[[:space:]]+handoff[[:space:]]+stub' "$SKILL_BODY" && t6_ok=0
fi
if [ "$t6_ok" -eq 1 ]; then
  record PASS T6 "body declares the Phase 5 handoff stub (Phase 4 stages shipped, old Phase-4 stub gone)"
else
  record FAIL T6 "body declares the Phase 5 handoff stub (Phase 4 stages shipped, old Phase-4 stub gone)"
fi

# ---------------------------------------------------------------------------
# T7 — no fallback/downgrade/model-switch language in the body
#       (missing file is T1's failure, not T7's)
# ---------------------------------------------------------------------------
t7_ok=1
if [ "$SKILL_BODY_OK" -eq 1 ] \
   && grep -qiE '(fall[- ]?back|downgrade|switch.*model.*mid)' "$SKILL_BODY"; then
  t7_ok=0
fi
if [ "$t7_ok" -eq 1 ]; then
  record PASS T7 "no fallback/downgrade/model-switch language in SKILL.md body"
else
  record FAIL T7 "no fallback/downgrade/model-switch language in SKILL.md body"
fi

# ---------------------------------------------------------------------------
# T8 — optional tasktracker timer mirroring is documented
# ---------------------------------------------------------------------------
t8_ok=1
t8_missing=""
if [ "$SKILL_BODY_OK" -ne 1 ]; then
  t8_ok=0; t8_missing="no-body"
else
  for needle in time_integration startTimer stopTimer; do
    grep -qF "$needle" "$SKILL_BODY" || { t8_ok=0; t8_missing="$t8_missing $needle"; }
  done
fi
if [ "$t8_ok" -eq 1 ]; then
  record PASS T8 "body documents tasktracker time_integration mirroring via startTimer/stopTimer"
else
  record FAIL T8 "body documents tasktracker time_integration mirroring via startTimer/stopTimer (missing:${t8_missing})"
fi

# ---------------------------------------------------------------------------
# T9 — plugin packaging ships ship-issue from the default skills/ location
# ---------------------------------------------------------------------------
# Distribution is plugin-only (ADR-0011). A skill ships when it is a
# <name>/SKILL.md directory under the plugin root's skills/ and the manifest
# does not redirect the scan somewhere else.
t9_ok=1
t9_reason=""
if [ ! -f "$REPO_ROOT/skills/ship-issue/SKILL.md" ]; then
  t9_ok=0; t9_reason="$t9_reason no-skill-md-at-plugin-root"
fi
if [ ! -f "$REPO_ROOT/.claude-plugin/plugin.json" ]; then
  t9_ok=0; t9_reason="$t9_reason no-plugin-manifest"
fi
if grep -q '"skills":' "$REPO_ROOT/.claude-plugin/plugin.json" 2>/dev/null; then
  t9_ok=0; t9_reason="$t9_reason manifest-overrides-skills-path"
fi
if [ "$t9_ok" -eq 1 ]; then
  record PASS T9 "plugin ships ship-issue from the default skills/ location"
else
  record FAIL T9 "plugin ships ship-issue from the default skills/ location (${t9_reason# })"
fi

# ---------------------------------------------------------------------------
# T10 — preflight passes on a good sandbox config
# ---------------------------------------------------------------------------
t10_ok=1
t10_reason=""
if make_sandbox good >/dev/null; then
  sb10="$SANDBOX"
  run_preflight "$sb10" "$WORK_DIR/t10-preflight.out"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    t10_ok=0; t10_reason="exit=$rc"
  fi
else
  t10_ok=0; t10_reason="sandbox-setup-failed"
fi
if [ "$t10_ok" -eq 1 ]; then
  record PASS T10 "preflight exits 0 on good sandbox config"
else
  record FAIL T10 "preflight exits 0 on good sandbox config (${t10_reason})"
fi

# ---------------------------------------------------------------------------
# T11 — preflight BLOCKED names ALL missing keys, before any run state
# ---------------------------------------------------------------------------
t11_ok=1
t11_reason=""
if make_sandbox broken >/dev/null; then
  sb11="$SANDBOX"
  out11="$WORK_DIR/t11-preflight.out"
  run_preflight "$sb11" "$out11"
  rc=$?
  if [ "$rc" -ne 2 ]; then
    t11_ok=0; t11_reason="$t11_reason exit=$rc(want-2)"
  fi
  grep -q '^BLOCKED:' "$out11" || { t11_ok=0; t11_reason="$t11_reason no-BLOCKED-lines"; }
  grep -q 'staging_url' "$out11" || { t11_ok=0; t11_reason="$t11_reason missing-staging_url"; }
  grep -q 'cloud_review' "$out11" || { t11_ok=0; t11_reason="$t11_reason missing-cloud_review"; }
  grep -q 'stagin_url' "$out11" || { t11_ok=0; t11_reason="$t11_reason missing-unknown-key-stagin_url"; }
  if [ -e "$sb11/.ship-issue/runs" ]; then
    t11_ok=0; t11_reason="$t11_reason run-state-created-despite-block"
  fi
else
  t11_ok=0; t11_reason="sandbox-setup-failed"
fi
if [ "$t11_ok" -eq 1 ]; then
  record PASS T11 "preflight BLOCKED (exit 2) names staging_url, cloud_review, and unknown key stagin_url; no run state created"
else
  record FAIL T11 "preflight BLOCKED (exit 2) names staging_url, cloud_review, and unknown key stagin_url; no run state created (${t11_reason# })"
fi

# ---------------------------------------------------------------------------
# T12 — distractor: mutual-exclusivity and tasktracker shape violations block.
#       A plausible-wrong impl accepting "at least one of deploy_command/ecs"
#       or a truthy string time_integration would pass these configs.
# ---------------------------------------------------------------------------
t12_ok=1
t12_reason=""
if make_sandbox conflict >/dev/null; then
  sb12a="$SANDBOX"
  out12a="$WORK_DIR/t12a-preflight.out"
  run_preflight "$sb12a" "$out12a"
  rc=$?
  if [ "$rc" -ne 2 ]; then
    t12_ok=0; t12_reason="$t12_reason conflict-exit=$rc(want-2)"
  fi
  grep -q '^BLOCKED:' "$out12a" || { t12_ok=0; t12_reason="$t12_reason conflict-no-BLOCKED-lines"; }
else
  t12_ok=0; t12_reason="$t12_reason conflict-sandbox-setup-failed"
fi
if make_sandbox good >/dev/null; then
  sb12b="$SANDBOX"
  sandbox_replace_config "$sb12b" '{"staging_url":"http://localhost:9999","deploy_command":"true","log_command":"echo no-errors","cloud_review":{"trigger_comment":"@cloud-reviewer please review","timeout_minutes":30},"ci":{"required_checks":["build"]},"tasktracker":{"time_integration":"yes"}}' \
    || { t12_ok=0; t12_reason="$t12_reason tasktracker-config-write-failed"; }
  out12b="$WORK_DIR/t12b-preflight.out"
  run_preflight "$sb12b" "$out12b"
  rc=$?
  if [ "$rc" -ne 2 ]; then
    t12_ok=0; t12_reason="$t12_reason tasktracker-string-exit=$rc(want-2)"
  fi
  grep -q '^BLOCKED:' "$out12b" || { t12_ok=0; t12_reason="$t12_reason tasktracker-string-no-BLOCKED-lines"; }
else
  t12_ok=0; t12_reason="$t12_reason tasktracker-sandbox-setup-failed"
fi
if [ "$t12_ok" -eq 1 ]; then
  record PASS T12 "preflight blocks (exit 2) on deploy_command+ecs conflict and on string time_integration"
else
  record FAIL T12 "preflight blocks (exit 2) on deploy_command+ecs conflict and on string time_integration (${t12_reason# })"
fi

# ---------------------------------------------------------------------------
# T13 — dry-run reaches gate 1 via the helper-driven flow
# ---------------------------------------------------------------------------
t13_ok=1
t13_reason=""
sb13=""
RUN13=""
if make_sandbox good >/dev/null; then
  sb13="$SANDBOX"
  RUN13="$sb13/.ship-issue/runs/run-t13"
  run_preflight "$sb13" "$WORK_DIR/t13-preflight.out"
  rc=$?
  [ "$rc" -eq 0 ] || { t13_ok=0; t13_reason="$t13_reason preflight-exit=$rc"; }

  rs "$sb13" init --repo "$sb13" --run-id run-t13 --issue-number 142 \
     --issue-url 'https://github.com/acme/widgets/issues/142' \
     --issue-title 'Add CSV export' --branch 'ship-issue/142-csv-export' \
     --ts 2026-06-11T09:14:02Z >/dev/null \
    || { t13_ok=0; t13_reason="$t13_reason init"; }
  rs "$sb13" stage-end --run-dir "$RUN13" --stage preflight --result passed \
     --ts 2026-06-11T09:14:20Z >/dev/null \
    || { t13_ok=0; t13_reason="$t13_reason stage-end-preflight"; }
  rs "$sb13" stage-start --run-dir "$RUN13" --stage plan \
     --ts 2026-06-11T09:14:21Z >/dev/null \
    || { t13_ok=0; t13_reason="$t13_reason stage-start-plan"; }
  { printf '# Plan: Add CSV export\n\n- AC1: export button downloads CSV\n' > "$RUN13/plan.md"; } 2>/dev/null \
    || { t13_ok=0; t13_reason="$t13_reason write-plan.md"; }
  rs "$sb13" stage-end --run-dir "$RUN13" --stage plan --result passed \
     --ts 2026-06-11T09:21:40Z >/dev/null \
    || { t13_ok=0; t13_reason="$t13_reason stage-end-plan"; }
  rs "$sb13" gate-reached --run-dir "$RUN13" --gate gate_1 \
     --ts 2026-06-11T09:21:41Z >/dev/null \
    || { t13_ok=0; t13_reason="$t13_reason gate-reached"; }

  python3 -c '
import json, sys
s = json.load(open(sys.argv[1]))
ok = (s["gates"]["gate_1"]["state"] == "waiting"
      and s["stages"]["plan"]["status"] == "passed"
      and s["stages"]["implement"]["status"] == "pending")
sys.exit(0 if ok else 1)
' "$RUN13/state.json" 2>/dev/null \
    || { t13_ok=0; t13_reason="$t13_reason state.json-assertions"; }

  python3 -c '
import json, sys
evs = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
types = {e.get("event") for e in evs}
sys.exit(0 if {"gate_reached", "gate_wait_started"} <= types else 1)
' "$RUN13/events.jsonl" 2>/dev/null \
    || { t13_ok=0; t13_reason="$t13_reason events-gate_reached+gate_wait_started"; }

  rs "$sb13" validate --run-dir "$RUN13" >/dev/null \
    || { t13_ok=0; t13_reason="$t13_reason validate"; }
else
  t13_ok=0; t13_reason="sandbox-setup-failed"
fi
if [ "$t13_ok" -eq 1 ]; then
  record PASS T13 "helper-driven dry-run reaches gate 1: gate_1 waiting, plan passed, implement pending, events logged, validate ok"
else
  record FAIL T13 "helper-driven dry-run reaches gate 1: gate_1 waiting, plan passed, implement pending, events logged, validate ok (${t13_reason# })"
fi

# ---------------------------------------------------------------------------
# T14 — distractor: the T13 run paused ONLY at gate 1 — no implement
#       stage_started, no gate_2 events
# ---------------------------------------------------------------------------
t14_ok=1
if [ -n "$RUN13" ]; then
  python3 -c '
import json, sys
evs = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
bad = any(e.get("event") == "stage_started" and e.get("stage") == "implement" for e in evs)
bad = bad or any(e.get("gate") == "gate_2" for e in evs)
sys.exit(1 if bad else 0)
' "$RUN13/events.jsonl" 2>/dev/null || t14_ok=0
else
  t14_ok=0
fi
if [ "$t14_ok" -eq 1 ]; then
  record PASS T14 "gate-1 run has NO stage_started(implement) and NO gate_2 events"
else
  record FAIL T14 "gate-1 run has NO stage_started(implement) and NO gate_2 events"
fi

# ---------------------------------------------------------------------------
# T15 — kill-mid-plan + resume: crash gap recorded, work window reopened
# ---------------------------------------------------------------------------
t15_ok=1
t15_reason=""
if make_sandbox good >/dev/null; then
  sb15="$SANDBOX"
  RUN15="$sb15/.ship-issue/runs/run-t15"

  rs "$sb15" init --repo "$sb15" --run-id run-t15 --issue-number 142 \
     --issue-url 'https://github.com/acme/widgets/issues/142' \
     --issue-title 'Add CSV export' --branch 'ship-issue/142-csv-export' \
     --ts 2026-06-11T09:58:00Z >/dev/null \
    || { t15_ok=0; t15_reason="$t15_reason init"; }
  rs "$sb15" stage-end --run-dir "$RUN15" --stage preflight --result passed \
     --ts 2026-06-11T09:59:30Z >/dev/null \
    || { t15_ok=0; t15_reason="$t15_reason stage-end-preflight"; }
  rs "$sb15" stage-start --run-dir "$RUN15" --stage plan \
     --ts 2026-06-11T10:00:00Z >/dev/null \
    || { t15_ok=0; t15_reason="$t15_reason stage-start-plan"; }
  # Simulated crash: NO stage-end — the plan work window stays open.

  out15="$(rs "$sb15" resume-check --run-dir "$RUN15" --ts 2026-06-11T10:45:19Z)" \
    || { t15_ok=0; t15_reason="$t15_reason resume-check-rc"; }
  if [ "$out15" != "RESUME_AT: stage:plan" ]; then
    t15_ok=0; t15_reason="$t15_reason resume-check-output"
  fi

  python3 -c '
import json, sys
evs = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
gaps = [e for e in evs if e.get("event") == "crash_gap_recorded"]
ok = (len(gaps) == 1
      and gaps[0].get("stage") == "plan"
      and gaps[0].get("gap_seconds") == 2719)
starts = [e for e in evs if e.get("event") == "timer_started" and e.get("stage") == "plan"]
ok = ok and any(e.get("ts") == "2026-06-11T10:45:19Z" for e in starts)
stage_starts = [e for e in evs if e.get("event") == "stage_started" and e.get("stage") == "plan"]
ok = ok and len(stage_starts) == 1
sys.exit(0 if ok else 1)
' "$RUN15/events.jsonl" 2>/dev/null \
    || { t15_ok=0; t15_reason="$t15_reason events-crash-gap+fresh-timer+single-stage_started"; }

  python3 -c '
import json, sys
s = json.load(open(sys.argv[1]))
sys.exit(0 if s["timing"]["crash_gap_seconds"] == 2719 else 1)
' "$RUN15/state.json" 2>/dev/null \
    || { t15_ok=0; t15_reason="$t15_reason state-crash_gap_seconds"; }
else
  t15_ok=0; t15_reason="sandbox-setup-failed"
fi
if [ "$t15_ok" -eq 1 ]; then
  record PASS T15 "resume after kill-mid-plan: RESUME_AT stage:plan, crash gap 2719s recorded, fresh timer, no second stage_started"
else
  record FAIL T15 "resume after kill-mid-plan: RESUME_AT stage:plan, crash gap 2719s recorded, fresh timer, no second stage_started (${t15_reason# })"
fi

# ---------------------------------------------------------------------------
# T16 — distractor: resume while gate-waiting is gate wait, NOT a crash gap
# ---------------------------------------------------------------------------
t16_ok=1
t16_reason=""
if make_sandbox good >/dev/null; then
  sb16="$SANDBOX"
  RUN16="$sb16/.ship-issue/runs/run-t16"

  rs "$sb16" init --repo "$sb16" --run-id run-t16 --issue-number 142 \
     --issue-url 'https://github.com/acme/widgets/issues/142' \
     --issue-title 'Add CSV export' --branch 'ship-issue/142-csv-export' \
     --ts 2026-06-11T09:14:02Z >/dev/null \
    || { t16_ok=0; t16_reason="$t16_reason init"; }
  rs "$sb16" stage-end --run-dir "$RUN16" --stage preflight --result passed \
     --ts 2026-06-11T09:14:20Z >/dev/null \
    || { t16_ok=0; t16_reason="$t16_reason stage-end-preflight"; }
  rs "$sb16" stage-start --run-dir "$RUN16" --stage plan \
     --ts 2026-06-11T09:14:21Z >/dev/null \
    || { t16_ok=0; t16_reason="$t16_reason stage-start-plan"; }
  { printf '# Plan: Add CSV export\n' > "$RUN16/plan.md"; } 2>/dev/null \
    || { t16_ok=0; t16_reason="$t16_reason write-plan.md"; }
  rs "$sb16" stage-end --run-dir "$RUN16" --stage plan --result passed \
     --ts 2026-06-11T09:21:40Z >/dev/null \
    || { t16_ok=0; t16_reason="$t16_reason stage-end-plan"; }
  rs "$sb16" gate-reached --run-dir "$RUN16" --gate gate_1 \
     --ts 2026-06-11T09:21:41Z >/dev/null \
    || { t16_ok=0; t16_reason="$t16_reason gate-reached"; }

  out16="$(rs "$sb16" resume-check --run-dir "$RUN16" --ts 2026-06-11T11:00:00Z)" \
    || { t16_ok=0; t16_reason="$t16_reason resume-check-rc"; }
  if [ "$out16" != "RESUME_AT: gate:gate_1" ]; then
    t16_ok=0; t16_reason="$t16_reason resume-check-output"
  fi

  python3 -c '
import json, sys
evs = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
sys.exit(1 if any(e.get("event") == "crash_gap_recorded" for e in evs) else 0)
' "$RUN16/events.jsonl" 2>/dev/null \
    || { t16_ok=0; t16_reason="$t16_reason crash_gap_recorded-emitted-or-no-events"; }
else
  t16_ok=0; t16_reason="sandbox-setup-failed"
fi
if [ "$t16_ok" -eq 1 ]; then
  record PASS T16 "resume while gate-waiting: RESUME_AT gate:gate_1 and NO crash_gap_recorded event"
else
  record FAIL T16 "resume while gate-waiting: RESUME_AT gate:gate_1 and NO crash_gap_recorded event (${t16_reason# })"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf '%d/%d passed\n' "$PASS_COUNT" "$TOTAL_COUNT"
if [ "$PASS_COUNT" -eq "$TOTAL_COUNT" ]; then
  exit 0
fi
exit 1
