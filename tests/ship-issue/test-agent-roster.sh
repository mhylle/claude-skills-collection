#!/bin/bash
# test-agent-roster.sh — RED-phase tests for Phase 2 of the ship-issue pipeline.
#
# Verifies the five ship-issue agent files in agents/ (model pinning, frontmatter
# shape, outcome-contract bodies, verdict contracts, BLOCKED/retry semantics)
# plus plugin packaging of the agent roster.
#
# Plain bash, no framework. Collects ALL failures (no set -e).
# Output: one line per test "PASS|FAIL Tn: <desc>", then "X/Y passed".
# Exit 0 only if every test passes.

set -u

REPO_ROOT="/home/mhylle/projects/claude-skills-collection"
AGENTS_DIR="$REPO_ROOT/agents"

AGENT_FILES=(
  "issue-planner.md"
  "merge-gate-reviewer.md"
  "tdd-implementer.md"
  "staging-e2e-verifier.md"
  "staging-log-verifier.md"
)
AGENT_MODELS=(
  "claude-fable-5"
  "claude-fable-5"
  "claude-opus-4-8"
  "claude-sonnet-4-6"
  "claude-sonnet-4-6"
)

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
# Shared extraction + checker functions (also exercised by distractor tests)
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

# check_model_pin <file> <expected-exact-model-id>
# Extracts `model:` from the frontmatter ONLY and requires EXACT equality.
# Rejects aliases (sonnet/opus/fable/inherit), missing field, date suffixes.
check_model_pin() {
  local file="$1" expected="$2" fm model_line model_value
  fm="$(extract_frontmatter "$file")" || return 1
  model_line="$(printf '%s\n' "$fm" | grep -m1 -E '^model:')" || return 1
  model_value="$(printf '%s' "$model_line" | sed -E 's/^model:[[:space:]]*//; s/[[:space:]]+$//')"
  [ "$model_value" = "$expected" ]
}

# check_outcome_contract <body-file>
# Requires sections Goal / Inputs / Constraints / Output contract (any heading
# level, case-insensitive) AND rejects imperative how-to-think procedures.
check_outcome_contract() {
  local body_file="$1"
  [ -f "$body_file" ] || return 1
  grep -qiE '^#+[[:space:]]*goal([[:space:]]|$)' "$body_file" || return 1
  grep -qiE '^#+[[:space:]]*inputs([[:space:]]|$)' "$body_file" || return 1
  grep -qiE '^#+[[:space:]]*constraints([[:space:]]|$)' "$body_file" || return 1
  grep -qiE '^#+[[:space:]]*output[[:space:]]+contract([[:space:]]|$)' "$body_file" || return 1
  # Reject instruction-sequence openers
  if grep -qiE '^[[:space:]]*(Step[[:space:]]+[0-9]+|First,|Then,|Next,|After that)' "$body_file"; then
    return 1
  fi
  # Reject numbered lists whose items begin with think-verbs
  if grep -qiE '^[[:space:]]*[0-9]+\.[[:space:]]+(Read|Think|Consider|Re-read|Check each|Go through)' "$body_file"; then
    return 1
  fi
  return 0
}

# check_tdd_contract <body-file>
# Requires RED and GREEN to both appear, plus an explicit no-test-weakening
# rule: a line mentioning weaken/loosen/delete/skip in proximity to "test".
check_tdd_contract() {
  local body_file="$1"
  [ -f "$body_file" ] || return 1
  grep -qiE '\bRED\b' "$body_file" || return 1
  grep -qiE '\bGREEN\b' "$body_file" || return 1
  grep -qiE '((weaken|loosen(ed)?|delete|skip)[^.]*\btests?\b|\btests?\b[^.]*(weaken|loosen(ed)?|delete|skip))' "$body_file" || return 1
  return 0
}

# check_merge_gate_verdicts <body-file>
check_merge_gate_verdicts() {
  local body_file="$1"
  [ -f "$body_file" ] || return 1
  grep -q 'APPROVE' "$body_file" || return 1
  grep -q 'FIX' "$body_file" || return 1
  grep -qi 'blocker' "$body_file" || return 1
  return 0
}

# check_e2e_verdicts <body-file>
check_e2e_verdicts() {
  local body_file="$1"
  [ -f "$body_file" ] || return 1
  grep -q 'PASS' "$body_file" || return 1
  grep -q 'FAIL' "$body_file" || return 1
  grep -q 'FLAKY' "$body_file" || return 1
  grep -q 'BLOCKED' "$body_file" || return 1
  grep -qi 'screenshot' "$body_file" || return 1
  return 0
}

# check_log_verdicts <body-file>
check_log_verdicts() {
  local body_file="$1"
  [ -f "$body_file" ] || return 1
  grep -q 'CLEAN' "$body_file" || return 1
  grep -q 'ERRORS_FOUND' "$body_file" || return 1
  grep -qi 'excerpt' "$body_file" || return 1
  return 0
}

# body_to_tmp <agent-filename> — extracts body to a temp file, prints its path.
# Produces an empty path (and rc 1) if the agent file is missing/unparseable.
body_to_tmp() {
  local name="$1" out="$WORK_DIR/body-$1.txt"
  extract_body "$AGENTS_DIR/$name" > "$out" 2>/dev/null || return 1
  printf '%s' "$out"
}

# ---------------------------------------------------------------------------
# T1 — all five files exist
# ---------------------------------------------------------------------------
t1_ok=1
t1_missing=""
for f in "${AGENT_FILES[@]}"; do
  if [ ! -f "$AGENTS_DIR/$f" ]; then
    t1_ok=0
    t1_missing="$t1_missing $f"
  fi
done
if [ "$t1_ok" -eq 1 ]; then
  record PASS T1 "all five agent files exist in agents/"
else
  record FAIL T1 "all five agent files exist in agents/ (missing:${t1_missing})"
fi

# ---------------------------------------------------------------------------
# T2 — frontmatter model pinning (per-file exact match)
# ---------------------------------------------------------------------------
t2_ok=1
t2_bad=""
for i in "${!AGENT_FILES[@]}"; do
  if ! check_model_pin "$AGENTS_DIR/${AGENT_FILES[$i]}" "${AGENT_MODELS[$i]}"; then
    t2_ok=0
    t2_bad="$t2_bad ${AGENT_FILES[$i]}"
  fi
done
if [ "$t2_ok" -eq 1 ]; then
  record PASS T2 "frontmatter model: exactly pinned per file"
else
  record FAIL T2 "frontmatter model: exactly pinned per file (bad/missing:${t2_bad})"
fi

# ---------------------------------------------------------------------------
# T2d — distractor: pinning checker rejects alias and missing model field
# ---------------------------------------------------------------------------
fix_alias="$WORK_DIR/fixture-alias.md"
printf -- '---\nname: fixture-alias\ndescription: fixture\nmodel: sonnet\ncolor: blue\n---\n\nBody text.\n' > "$fix_alias"
fix_nomodel="$WORK_DIR/fixture-nomodel.md"
printf -- '---\nname: fixture-nomodel\ndescription: fixture\ncolor: blue\n---\n\nBody text.\n' > "$fix_nomodel"

t2d_ok=1
if check_model_pin "$fix_alias" "claude-sonnet-4-6"; then t2d_ok=0; fi
if check_model_pin "$fix_nomodel" "claude-fable-5"; then t2d_ok=0; fi
if [ "$t2d_ok" -eq 1 ]; then
  record PASS T2d "pin checker rejects 'model: sonnet' alias and missing model field"
else
  record FAIL T2d "pin checker rejects 'model: sonnet' alias and missing model field (was fooled)"
fi

# ---------------------------------------------------------------------------
# T3 — Fable outcome-contract bodies (issue-planner, merge-gate-reviewer)
# ---------------------------------------------------------------------------
t3_ok=1
t3_bad=""
for f in issue-planner.md merge-gate-reviewer.md; do
  if body="$(body_to_tmp "$f")" && check_outcome_contract "$body"; then
    :
  else
    t3_ok=0
    t3_bad="$t3_bad $f"
  fi
done
if [ "$t3_ok" -eq 1 ]; then
  record PASS T3 "fable bodies have Goal/Inputs/Constraints/Output contract and no imperative procedures"
else
  record FAIL T3 "fable bodies have Goal/Inputs/Constraints/Output contract and no imperative procedures (bad:${t3_bad})"
fi

# ---------------------------------------------------------------------------
# T3d — distractor: all four sections present BUT imperative numbered list
# ---------------------------------------------------------------------------
fix_t3="$WORK_DIR/fixture-t3-body.txt"
cat > "$fix_t3" <<'EOF'
## Goal
Decide whether the PR merges.

## Inputs
The PR diff.

## Constraints
No scope creep.

## Output contract
A verdict.

1. Read the PR description
2. Think about the imports
3. Re-read the diff
EOF
if check_outcome_contract "$fix_t3"; then
  record FAIL T3d "outcome-contract checker rejects body with sections + think-verb numbered list (was fooled)"
else
  record PASS T3d "outcome-contract checker rejects body with sections + think-verb numbered list"
fi

# ---------------------------------------------------------------------------
# T4 — TDD contract in tdd-implementer.md
# ---------------------------------------------------------------------------
if body="$(body_to_tmp tdd-implementer.md)" && check_tdd_contract "$body"; then
  record PASS T4 "tdd-implementer body has RED-before-GREEN and no-test-weakening rule"
else
  record FAIL T4 "tdd-implementer body has RED-before-GREEN and no-test-weakening rule"
fi

# ---------------------------------------------------------------------------
# T4d — distractor: tests-after body must be rejected
# ---------------------------------------------------------------------------
fix_t4="$WORK_DIR/fixture-t4-body.txt"
printf 'write tests after implementing to lock in behavior\nrun every test\n' > "$fix_t4"
if check_tdd_contract "$fix_t4"; then
  record FAIL T4d "tdd checker rejects tests-after-implementation body (was fooled)"
else
  record PASS T4d "tdd checker rejects tests-after-implementation body"
fi

# ---------------------------------------------------------------------------
# T5 — verdict contracts in the three verifier/reviewer bodies
# ---------------------------------------------------------------------------
t5_ok=1
t5_bad=""
if body="$(body_to_tmp merge-gate-reviewer.md)" && check_merge_gate_verdicts "$body"; then
  :
else
  t5_ok=0; t5_bad="$t5_bad merge-gate-reviewer.md"
fi
if body="$(body_to_tmp staging-e2e-verifier.md)" && check_e2e_verdicts "$body"; then
  :
else
  t5_ok=0; t5_bad="$t5_bad staging-e2e-verifier.md"
fi
if body="$(body_to_tmp staging-log-verifier.md)" && check_log_verdicts "$body"; then
  :
else
  t5_ok=0; t5_bad="$t5_bad staging-log-verifier.md"
fi
if [ "$t5_ok" -eq 1 ]; then
  record PASS T5 "verdict contracts (APPROVE/FIX+blocker, PASS/FAIL/FLAKY/BLOCKED+screenshot, CLEAN/ERRORS_FOUND+excerpt)"
else
  record FAIL T5 "verdict contracts (APPROVE/FIX+blocker, PASS/FAIL/FLAKY/BLOCKED+screenshot, CLEAN/ERRORS_FOUND+excerpt) (bad:${t5_bad})"
fi

# ---------------------------------------------------------------------------
# T5d — distractor: PASS/FAIL-only verdict set must be rejected by e2e checker
# ---------------------------------------------------------------------------
fix_t5="$WORK_DIR/fixture-t5-body.txt"
printf 'Verdict is PASS or FAIL.\nAttach a screenshot.\n' > "$fix_t5"
if check_e2e_verdicts "$fix_t5"; then
  record FAIL T5d "e2e verdict checker rejects PASS/FAIL-only set missing FLAKY+BLOCKED (was fooled)"
else
  record PASS T5d "e2e verdict checker rejects PASS/FAIL-only set missing FLAKY+BLOCKED"
fi

# ---------------------------------------------------------------------------
# T6 — plugin packaging ships all five agents from the default agents/ location
# ---------------------------------------------------------------------------
# Distribution is plugin-only (ADR-0011). `agents/` at the plugin root is a
# default discovery location, so shipping is a question of file placement plus a
# manifest that does not redirect the scan elsewhere.
t6_ok=1
t6_reason=""
for f in "${AGENT_FILES[@]}"; do
  if [ ! -f "$AGENTS_DIR/$f" ]; then
    t6_ok=0; t6_reason="$t6_reason not-at-plugin-root:$f"
  fi
done
if [ ! -f "$REPO_ROOT/.claude-plugin/plugin.json" ]; then
  t6_ok=0; t6_reason="$t6_reason no-plugin-manifest"
fi
if grep -q '"agents":' "$REPO_ROOT/.claude-plugin/plugin.json" 2>/dev/null; then
  t6_ok=0; t6_reason="$t6_reason manifest-overrides-agents-path"
fi
if [ "$t6_ok" -eq 1 ]; then
  record PASS T6 "plugin ships all five agents from the default agents/ location"
else
  record FAIL T6 "plugin ships all five agents from the default agents/ location (${t6_reason# })"
fi

# ---------------------------------------------------------------------------
# T7 — frontmatter parses with non-empty name/description/model/color
# ---------------------------------------------------------------------------
t7_ok=1
t7_bad=""
for f in "${AGENT_FILES[@]}"; do
  file="$AGENTS_DIR/$f"
  file_ok=1
  if [ ! -f "$file" ]; then
    file_ok=0
  elif ! head -n1 "$file" | grep -qE '^---[[:space:]]*$'; then
    file_ok=0
  elif [ -z "$(awk 'NR>1 && /^---[[:space:]]*$/{print NR; exit}' "$file")" ]; then
    file_ok=0
  else
    fm="$(extract_frontmatter "$file")"
    for field in name description model color; do
      if ! printf '%s\n' "$fm" | grep -qE "^${field}:[[:space:]]*[^[:space:]]"; then
        file_ok=0
      fi
    done
  fi
  if [ "$file_ok" -eq 0 ]; then
    t7_ok=0
    t7_bad="$t7_bad $f"
  fi
done
if [ "$t7_ok" -eq 1 ]; then
  record PASS T7 "frontmatter parses with non-empty name/description/model/color"
else
  record FAIL T7 "frontmatter parses with non-empty name/description/model/color (bad:${t7_bad})"
fi

# ---------------------------------------------------------------------------
# T8 — no fallback/downgrade language in any existing agent body
#       (missing files are T1's failure, not T8's)
# ---------------------------------------------------------------------------
t8_ok=1
t8_bad=""
for f in "${AGENT_FILES[@]}"; do
  [ -f "$AGENTS_DIR/$f" ] || continue
  if body="$(body_to_tmp "$f")" && grep -qiE '(fall[- ]?back|downgrade|switch.*model.*mid)' "$body"; then
    t8_ok=0
    t8_bad="$t8_bad $f"
  fi
done
if [ "$t8_ok" -eq 1 ]; then
  record PASS T8 "no fallback/downgrade/model-switch language in agent bodies"
else
  record FAIL T8 "no fallback/downgrade/model-switch language in agent bodies (bad:${t8_bad})"
fi

# ---------------------------------------------------------------------------
# T9 — BLOCKED semantics + retry policy in every body
# ---------------------------------------------------------------------------
t9_ok=1
t9_bad=""
for f in "${AGENT_FILES[@]}"; do
  if body="$(body_to_tmp "$f")" \
     && grep -q 'BLOCKED' "$body" \
     && grep -qi 'retry' "$body"; then
    :
  else
    t9_ok=0
    t9_bad="$t9_bad $f"
  fi
done
if [ "$t9_ok" -eq 1 ]; then
  record PASS T9 "every body defines BLOCKED semantics and a retry policy"
else
  record FAIL T9 "every body defines BLOCKED semantics and a retry policy (bad:${t9_bad})"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf '%d/%d passed\n' "$PASS_COUNT" "$TOTAL_COUNT"
if [ "$PASS_COUNT" -eq "$TOTAL_COUNT" ]; then
  exit 0
fi
exit 1
