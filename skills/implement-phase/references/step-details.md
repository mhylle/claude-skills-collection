# Step details — subagent patterns and output specs

Detailed subagent-spawning patterns and output formats for each of the 8 pipeline steps. SKILL.md gives the summary; read this file when executing a step and you need the concrete invocation shape.

---

## Step 1: Implementation

**What the orchestrator does:**
1. Read phase requirements and tasks from the plan.
2. Read coding standards (`docs/standards/CODING_STANDARDS.md` if it exists).
3. Identify which tasks can run in parallel (independent file sets).
4. Spawn **test subagents first** (verification-first pattern — unless TDD mode is active, in which case see `references/tdd-mode.md`).
5. Spawn implementation subagents with the coding-standards reference embedded.
6. Monitor completion, collect created/modified files.

**Subagent-spawning examples:**

```
# Writing tests
Task (run_in_background: true): "Write unit tests for SummaryAgentService.

Context: Phase 5b-ii - SummaryAgent Service
Location: agentic-core/src/agents/implementations/summary-agent/

Test scenarios:
- Successful summarization
- Retry with feedback
- Error handling

RESPONSE FORMAT: STATUS, FILES created, test count. Write output to logs/."

# Implementation
Task (run_in_background: true): "Implement SummaryAgentService.

Context: Phase 5b-ii - SummaryAgent Service
Requirements from plan: [list]
Must pass the tests at: [test file path]

CODING STANDARDS (MANDATORY):
- Services: <500 lines, single responsibility
- Interfaces: Required for DTOs and response types
- Errors: Domain exceptions, no empty catch blocks
- Logging: Use project logger, no console.log
Ref: docs/standards/CODING_STANDARDS.md

RESPONSE FORMAT: STATUS, FILES created/modified, ERRORS if any."

# Verification
Task (run_in_background: true): "Run build and test verification.

Commands: npm run build && npm run lint && npm test
Report: PASS/FAIL per command, error details if any.
Write full output to logs/verify-phase-5b-ii.log"
```

**Output format:**
```
IMPLEMENTATION_STATUS: PASS | FAIL
FILES_CREATED: [list]
FILES_MODIFIED: [list]
TEST_RESULTS: [summary]
ERRORS: [if any]
SUBAGENTS_SPAWNED: [count]
NEXT_STEP: EXECUTE STEP 2 NOW (verification-loop)
```

Gate: PASS.

---

## Step 2: Exit Condition Verification (verification-loop)

**What the orchestrator does:**
1. Read exit conditions from the plan.
2. Invoke the `verification-loop` skill with phase context.
3. Let verification-loop run its 6 checks (Build, Type, Lint, Test, Security, Diff).
4. Report aggregate result.

**Invocation:**
```
Skill(skill="verification-loop"): Verify Phase [N] implementation.

Context:
- Plan: [plan file path]
- Phase: [N] ([Phase Name])
- Changed Files: [list of files modified in this phase]

Execute all 6 verification checks and return structured result.
```

**Output format:**
```
VERIFICATION_LOOP_STATUS: PASS | FAIL
CHECKS_COMPLETED: 6/6
CHECK_RESULTS:
  BUILD: PASS | FAIL
  TYPE: PASS | FAIL
  LINT: PASS | FAIL
  TEST: PASS | FAIL
  SECURITY: PASS | FAIL
  DIFF: PASS | FAIL
FAILED_CHECKS: [list if any]
EVIDENCE: logs/verification-loop-phase-N.log
NEXT_STEP: EXECUTE STEP 3 NOW
```

Gate: **All 6** checks must PASS. On failure, spawn fix subagents for the failed checks, re-run verification-loop, repeat.

**Disabling verification-loop** (not recommended — only for special cases):
```yaml
phase_config:
  verification_loop: false  # Falls back to basic exit conditions
```

---

## Step 3: Automated Integration Testing

**Core rule: YOU are the tester.** Don't ask the user to manually verify.

**Testing by implementation type:**

| Type | Testing method | Tools/agents |
|---|---|---|
| REST API | Make HTTP requests, verify responses | curl, httpie, fetch subagent |
| GraphQL | Execute queries/mutations | curl with GraphQL payload |
| Web UI | Navigate, interact, assert | `browser-verification-agent` — **one test per spawn** |
| Database | Query and verify data | psql, mysql, prisma |
| Background jobs | Trigger and verify completion | API calls + polling |
| File processing | Provide input, check output | Bash, Read tool |

**Subagent examples:**

```
# API testing (general-purpose subagent)
Task: "Test the new /api/users endpoint.

Make these API calls and report results:
1. POST /api/users with valid payload - expect 201
2. POST /api/users with invalid email - expect 400
3. GET /api/users/:id - expect 200 with user data
4. GET /api/users/nonexistent - expect 404

RESPONSE FORMAT: STATUS, test results summary, ERRORS if any."

# UI testing — ONE test per agent spawn
Task(subagent_type="browser-verification-agent"): "Verify login with valid credentials.

base_url: http://localhost:3000
test_description: Navigate to /login, enter 'test@example.com' in email field,
                  enter 'password123' in password field, click Login button
expected_outcome: URL changes to /dashboard, welcome message visible
session_context: fresh"
```

**UI testing response format** (from browser-verification-agent):
```
STATUS: PASS | FAIL | FLAKY | BLOCKED
SCREENSHOT: logs/screenshots/2026-01-23-143022-login-test.png
OBSERVED: [what actually happened]
EXPECTED: [echo of expected_outcome]
ERRORS: [if any]
```

**Aggregated output:**
```
INTEGRATION_TEST_STATUS: PASS | FAIL
TESTS_RUN: [count]
TESTS_PASSED: [count]
TESTS_FAILED: [count]
FAILURE_DETAILS: [if any]
EVIDENCE: [log files, screenshots]
NEXT_STEP: EXECUTE STEP 4 NOW
```

Gate: PASS. On failure, spawn fix subagents → re-run failed tests → repeat.

---

## Step 4: Code Review

**What the orchestrator does:**
1. Invoke `code-review` skill with phase context (plan path, phase number, changed files).
2. Receive structured review result.

**Output format:**
```
CODE_REVIEW_STATUS: PASS | PASS_WITH_NOTES | NEEDS_CHANGES
BLOCKING_ISSUES: [count]
RECOMMENDATIONS: [list]
NEXT_STEP: EXECUTE STEP 5 NOW
```

**Gate: clean PASS.** PASS_WITH_NOTES and NEEDS_CHANGES both require fix subagents + re-review. See SKILL.md §Exit Conditions for why recommendations are mandatory, not optional.

Max 3 review retries before escalating to user.

---

## Step 5: ADR Compliance Check

**What the orchestrator does:**
1. Read `docs/decisions/INDEX.md` to identify relevant ADRs.
2. Check implementation against applicable ADRs.
3. Identify any new architectural decisions made during implementation.
4. If new decisions found, invoke the `adr` skill to document them.

**Output format:**
```
ADR_COMPLIANCE_STATUS: PASS | NEEDS_DOCUMENTATION
APPLICABLE_ADRS: [list]
COMPLIANCE_RESULTS: [per-ADR status]
NEW_DECISIONS_DOCUMENTED: [list of new ADR numbers, if any]
NEXT_STEP: EXECUTE STEP 6 NOW
```

Gate: PASS.

---

## Step 6: Plan Synchronization

**What the orchestrator does:**
1. Verify all work items for this phase were completed.
2. Add ADR references if new ADRs were created.
3. Note any deviations from original plan.
4. Mark phase status (per ADR-0001, via TaskUpdate — plans are specification documents, progress lives in Task tools, not checkbox edits).

**Output format:**
```
PLAN_SYNC_STATUS: PASS | FAIL
WORK_ITEMS_VERIFIED: [count]
DEVIATIONS_NOTED: [count]
ADR_REFERENCES_ADDED: [count]
NEXT_STEP: EXECUTE STEP 7 NOW
```

Gate: PASS.

---

## Step 7: Prompt Archival

**What the orchestrator does:**
1. Check if a prompt file was used for this phase.
2. If yes, move it to `docs/prompts/completed/`.
3. If no prompt, mark skipped and continue.

```bash
mkdir -p docs/prompts/completed
mv docs/prompts/phase-2-data-pipeline.md docs/prompts/completed/
```

**Output format:**
```
PROMPT_ARCHIVAL_STATUS: PASS | SKIPPED | FAIL
PROMPT_FILE: [original path]
ARCHIVED_TO: [new path in completed/]
NEXT_STEP: EXECUTE STEP 8 NOW
```

Gate: non-blocking. A failed archive logs the error but doesn't stop completion.

**Why archive?** Prevents accidental prompt re-use, creates a record of completed work, keeps the prompts folder clean.

---

## Step 8: Phase Completion Report

Final step — generate the summary for orchestrator and user, then (and only then) stop.

**Output format:**
```
═══════════════════════════════════════════════════════════════
● PHASE [N] COMPLETE: [Phase Name]
═══════════════════════════════════════════════════════════════

Implementation:
  Files Created: [count] ([file list])
  Files Modified: [count] ([file list])
  Tests: [X passing, Y failing]

Exit Conditions:
  Build: ✅ PASS
  Runtime: ✅ PASS
  Unit Tests: ✅ PASS

Integration Testing (performed by Claude):
  API Tests: ✅ [X/Y passed] (or N/A)
  UI Tests: ✅ [X/Y passed] (or N/A)
  Evidence: logs/integration-test-phase-N.log

Code Review:
  Status: ✅ PASS (all recommendations addressed)
  Blocking Issues: 0
  Recommendations Fixed: [count]

ADR Compliance:
  Status: ✅ PASS
  Applicable ADRs: [list]
  New ADRs Created: [list or "None"]

Plan Updated:
  Work Items Verified: [count]
  Phase Status: ✅ Complete
  Task Status: completed (via TaskUpdate)

Prompt:
  Status: ✅ Archived (or ⏭️ Skipped - no prompt provided)
  Archived To: docs/prompts/completed/phase-2-data-pipeline.md

User Verification (only if truly not automatable):
  [None - all verification automated]
  OR
  - [ ] [Physical hardware check]
  - [ ] [Third-party dashboard verification]

Learnings Captured:
  Status: ✅ Extracted
  Patterns Found: [count]
  Saved To: ~/.claude/skills/learned/

═══════════════════════════════════════════════════════════════
PHASE STATUS: ✅ COMPLETE - Ready for next phase
═══════════════════════════════════════════════════════════════
```

**User Verification note:** This section should almost always be empty — Step 3 covers integration testing automatically. Only include items here that genuinely require human eyes (verify email arrived in inbox, check physical device display).

**After the report:**
1. Output final Progress Tracker showing all steps ✅ DONE.
2. Invoke `continuous-learning` skill to capture patterns from this phase (phase completion is a natural learning boundary — user may `/clear` before next phase, and the patterns are freshest now).
3. Present the report.
4. **Now** (and only now) await user confirmation before proceeding to the next phase.
