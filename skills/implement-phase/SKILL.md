---
name: implement-phase
description: Execute a single phase from an implementation plan with all quality gates. This skill is the unit of work for implement-plan, handling implementation, verification, code review, ADR compliance, and plan synchronization for ONE phase. Triggers when implement-plan delegates a phase, or manually with "/implement-phase" and a phase reference.
context: fork
user-invocable: false
argument-hint: "[plan-path] [phase-number]"
---

# Implement Phase

Execute a **single phase** from an implementation plan with comprehensive quality gates. Designed to be called by `implement-plan`, but can also be invoked directly.

---

## Orchestrator pattern (non-negotiable)

**This session is an orchestrator. Never implement code directly.**

| DO (orchestrator) | DON'T (direct implementation) |
|---|---|
| Spawn subagents to write code | Write code yourself |
| Spawn subagents to create files | Use Write/Edit tools directly |
| Spawn subagents to run tests | Run tests yourself |
| Spawn subagents to fix issues | Fix code yourself |
| Read files to understand context | Read files to copy/paste code |
| Track progress with Task tools | Implement while tracking |
| Coordinate and delegate | Do the work yourself |

**Violations:** using Write/Edit/NotebookEdit directly, creating files without spawning a subagent, fixing code without spawning a subagent, running implementation commands directly.

**Why orchestrate?**
- **Context preservation** — main session retains full plan context.
- **Parallelization** — independent tasks run concurrently.
- **Clean separation** — orchestration logic stays separate from implementation.
- **Better error handling** — subagent failures don't pollute main context.

**Subagent communication protocol** → `references/subagent-protocol.md`. Every subagent prompt must include a response-format block demanding terse STATUS/FILES/ERRORS output and disk-based logs for large output. Verbose subagent responses are the single biggest context waster this skill faces.

---

## Execution contract (read before starting)

Steps 1–8 execute as **one continuous operation**. The orchestrator does not pause between them.

```
current_step = 1
while current_step <= 8:
    result = execute_step(current_step)
    if result == PASS:
        current_step += 1          # AUTO-CONTINUE, no user pause
    elif result == FAIL:
        fix_and_retry(current_step)  # Stay on step, spawn fix subagent, retry
    elif result == BLOCKED:
        return BLOCKED               # Only valid early exit
return COMPLETE                      # Only stop here (after Step 8)
```

**The only valid pause points are:**
1. **BLOCKED** — something you cannot fix without user intervention (see Blocker Protocol below).
2. **After Step 8** — the Completion Report has been presented; await user before the next phase.

**Everything else is a fix loop, not a pause.** Verification failed → spawn fix subagent → re-run → PASS → continue. Code review returned PASS_WITH_NOTES → spawn fix subagent → re-run → PASS → continue. None of these require user input; they require retries.

**After each step, output a progress tracker and continue.** Example after Step 4:
```
┌─────────────────────────────────────────┐
│ PROGRESS: Step 4 → Step 5               │
├─────────────────────────────────────────┤
│ ✅ Step 1: Implementation    [DONE]     │
│ ✅ Step 2: Exit Conditions   [DONE]     │
│ ✅ Step 3: Integration Test  [DONE]     │
│ ✅ Step 4: Code Review       [DONE]     │
│ ⏳ Step 5: ADR Compliance    [CURRENT]  │
│ ⬚ Step 6: Plan Sync         [PENDING]  │
│ ⬚ Step 7: Prompt Archival   [PENDING]  │
│ ⬚ Step 8: Completion Report [PENDING]  │
├─────────────────────────────────────────┤
│ NEXT ACTION: Check ADR compliance now   │
└─────────────────────────────────────────┘
```

NEXT ACTION must describe executing the next step, not "waiting for user confirmation." Any tracker whose NEXT ACTION says otherwise (before Step 8) is a contract violation.

**Self-check after a skill invocation (like code-review):**
1. Did it return PASS? → continue to next step immediately.
2. PASS_WITH_NOTES or NEEDS_CHANGES? → spawn fix subagents, re-run step, expect clean PASS.
3. Am I at Step 8? → if no, execute next step immediately.
4. Did I test the feature myself? → if no, go back to Step 3.

---

## Blocker protocol

A blocker is something you **cannot fix autonomously**. Do not stop for fixable issues.

**Valid blockers:**

| Blocker | Example |
|---|---|
| Permission denied | Subagent cannot write to a protected directory |
| Infrastructure unavailable | Cannot reach required inference server |
| Missing credentials | API key not configured, auth token expired |
| External service down | Third-party API returning 503 |
| Ambiguous requirements | Plan says "integrate with payment system" but doesn't specify which |
| Destructive operation | Phase requires dropping a production database |

**NOT blockers — fix these yourself:** test fails, lint errors, build errors, type errors, code-review feedback, API returning an error, UI element not found.

**When you hit a genuine blocker:**
```
⛔ BLOCKED: [brief description]

Phase: [N] - [Name]
Step: [current step]
Blocker Type: [Permission | Infrastructure | Credentials | External | Ambiguous | Destructive]

Details:
[what failed and why]

What I need:
[specific action from user]

Options:
A) [resolve and continue]
B) [skip this verification and proceed with risk]
C) [abort phase]
```

After the user resolves, resume from the blocked step (not Step 1).

---

## Mandatory exit conditions

Non-negotiable — a phase cannot complete until **all** are satisfied.

| Condition | Requirement | Why |
|---|---|---|
| **verification-loop PASS** | All 6 checks pass (Build, Type, Lint, Test, Security, Diff) | Code must compile, type-check, pass linting, tests, and security |
| **Integration tests PASS** | All API/UI tests pass | Feature must work end-to-end |
| **Code review PASS** | Clean PASS status (not PASS_WITH_NOTES) | No outstanding issues |
| **All recommendations fixed** | Every recommendation addressed | Recommendations are blocking, not optional |
| **ADR compliance PASS** | Follows existing ADRs, new decisions documented | Architectural consistency |
| **Plan verified** | All work items confirmed complete | Specification fulfilled |

**Why recommendations are mandatory, not "nice to have":**
- Recommendations indicate pattern violations, missing tests, or technical debt.
- Unfixed, they accumulate and compound across phases.
- The Clean Baseline Principle requires each phase to end clean — the next phase inherits whatever you leave behind.
- If an issue is worth noting, it's worth fixing.

The only acceptable Step 4 outcome is clean **PASS**.

---

## Input context

```
Plan Path: [path to plan file]
Phase: [number or name]
Task ID: [from implement-plan's TaskList]
Prompt Path: [optional - path to pre-generated prompt from prompt-generator]
Changed Files: [optional - auto-detected if not provided]
Skip Steps: [optional - list of steps to skip, for testing]
TDD Mode: [enabled/disabled - see references/tdd-mode.md]
Coverage Threshold: [percentage - default 80%, applies when TDD enabled]
```

If a **Prompt Path** is provided (from `prompt-generator`):
1. Read the prompt file — it contains detailed orchestration instructions.
2. Use the prompt as primary guidance.
3. Use the plan as the source of truth for exit conditions and success criteria.
4. Archive the prompt on completion (Step 7).

---

## Architecture

```
implement-plan (orchestrates full plan)
    │
    └── implement-phase (this skill — one phase at a time)
            │
            ├── 1. Implementation (spawn subagents)
            ├── 2. Exit Condition Verification (verification-loop skill)
            ├── 3. Automated Integration Testing (API or Playwright)
            ├── 4. Code Review (code-review skill)
            ├── 5. ADR Compliance Check
            ├── 6. Plan Synchronization
            ├── 7. Prompt Archival (if prompt provided)
            └── 8. Phase Completion Report
```

---

## The 8 steps (overview)

Full subagent-spawning patterns and per-step output formats live in `references/step-details.md`. Read that file when you're about to execute a step. Summary here:

### Step 1 — Implementation
Spawn test subagents first (verification-first pattern), then implementation subagents with a coding-standards pointer embedded. Monitor, collect changed files.
**Output:** `IMPLEMENTATION_STATUS`, `FILES_CREATED/MODIFIED`, `TEST_RESULTS`. **Gate:** PASS. **Next:** Step 2.

### Step 2 — Exit Condition Verification (verification-loop)
Invoke the `verification-loop` skill. It runs 6 checks (Build, Type, Lint, Test, Security, Diff).
**Output:** `VERIFICATION_LOOP_STATUS`, per-check results. **Gate:** all 6 PASS. **Next:** Step 3.

### Step 3 — Automated Integration Testing
**You are the tester.** Not the user. API → curl/httpie/fetch subagent. Web UI → `browser-verification-agent` (one test scenario per spawn). CLI → execute and verify output. Database → query and verify.
**Output:** aggregated `INTEGRATION_TEST_STATUS`, pass/fail counts, evidence paths. **Gate:** PASS. **Next:** Step 4.

### Step 4 — Code Review
Invoke the `code-review` skill with phase context. Clean PASS is required; PASS_WITH_NOTES and NEEDS_CHANGES both require fix subagents and re-review (max 3 retries).
**Output:** `CODE_REVIEW_STATUS`, blocking issues, recommendations. **Gate:** clean PASS. **Next:** Step 5.

### Step 5 — ADR Compliance Check
Read `docs/decisions/INDEX.md`, check against applicable ADRs, invoke the `adr` skill if new decisions need documentation.
**Output:** `ADR_COMPLIANCE_STATUS`, applicable ADRs, any new ADR numbers. **Gate:** PASS. **Next:** Step 6.

### Step 6 — Plan Synchronization
Verify all work items completed, add ADR references, note deviations. Per ADR-0001, plans are specification documents — progress lives in Task tools (TaskUpdate), not checkbox edits.
**Output:** `PLAN_SYNC_STATUS`, work-items count. **Gate:** PASS. **Next:** Step 7.

### Step 7 — Prompt Archival
If a prompt file was used, move it to `docs/prompts/completed/`. If none, mark skipped.
**Output:** `PROMPT_ARCHIVAL_STATUS`. **Gate:** non-blocking (a failed archive logs but doesn't stop completion). **Next:** Step 8.

### Step 8 — Phase Completion Report
Final. Generate the summary (see `references/step-details.md` for the format), invoke `continuous-learning` to capture patterns, present to user, stop.

---

## Optional steps

Some pipelines insert additional steps at specific points. See `references/optional-steps.md` for the full list and enablement mechanism. Currently supported:

- **Security Review** (inserts at Step 4.5) — enable for auth/input/crypto/payment phases. Skill: `security-review`.

---

## TDD mode

Optional. When enabled (via plan metadata, `--tdd` flag, or global settings), Step 1 follows the RED → GREEN → REFACTOR cycle and a coverage-verification check is added. See `references/tdd-mode.md` for full details.

---

## Phase-steps extensibility

The pipeline is defined as an ordered list of steps:

```
PHASE_STEPS = [
  { name: "implementation",       required: true,  skill: null },
  { name: "exit_conditions",      required: true,  skill: null },
  { name: "integration_testing",  required: true,  skill: null },
  { name: "code_review",          required: true,  skill: "code-review" },
  { name: "adr_compliance",       required: true,  skill: "adr" },
  { name: "plan_sync",            required: true,  skill: null },
  { name: "prompt_archival",      required: false, skill: null },
  { name: "completion_report",    required: true,  skill: null },
]
```

Adding a new step: define gate criteria, insert at the right position, implement the logic or delegate to a skill. Steps can be conditional (e.g., phase-type-based, metadata-flag-gated).

---

## Error handling

**Step failures:**
1. Log failure details with full context.
2. Attempt an automatic fix (spawn fix subagent).
3. Re-run the step.
4. Escalate to user if the fix fails or requires a decision.

**Retry limit:** default 3 per step. Exhausted retries escalate:
```
⛔ PHASE BLOCKED: [Step Name] failed after 3 attempts

Last Error: [details]

Options:
A) Retry with different approach
B) Skip this step (if non-blocking)
C) Abort phase and return to plan

How should I proceed?
```

**Blocker protocol** (above): stop all pending work, preserve state for resume, report with full context, await decision.

---

## Configuration

```yaml
# In the plan file
phase_config:
  strict_mode: true          # Fail on any warning
  skip_steps: []
  additional_steps: []
  retry_limit: 3
  tdd_mode: false
  coverage_threshold: 80

# Global defaults (~/.claude/settings.json)
implement_phase:
  default_retry_limit: 3
  always_run_security: false
  require_adr_for_decisions: true
  default_tdd_mode: false
  default_coverage_threshold: 80
```

---

## Invocation

**From implement-plan (primary use):**
```
Skill(skill="implement-phase"): Execute Phase 2 of the implementation plan.

Context:
- Plan: docs/plans/auth-implementation.md
- Phase: 2 (Authentication Service)
- Previous Phase Status: Complete

Execute all quality gates and return structured result.
```

**Manual:**
```
/implement-phase docs/plans/my-plan.md phase:3
```

Or interactively:
```
/implement-phase
> Which plan? docs/plans/auth-implementation.md
> Which phase? 2
```

---

## Return value

When called by `implement-plan`, returns a structured `PHASE_RESULT` object with per-step status, files changed, test results, ADR info, and a `ready_for_next` flag. Full schema in `references/return-value.md`.

---

## Integration with other skills

- **code-review** — called in Step 4. Receives phase context, returns structured review.
- **adr** — called in Step 5 when new architectural decisions need documentation or compliance check finds undocumented decisions.
- **verification-loop** — called in Step 2. Default exit-condition check (6 checks).
- **security-review** — called in optional Step 4.5 when enabled.
- **continuous-learning** — called in Step 8 to capture phase patterns before `/clear` or `/compact`.

Future extensibility: the step design allows adding `security-scan`, `performance-check`, `documentation-update`, `changelog-entry`, and similar quality gates without modifying the core logic.

---

## Best practices

**For implement-plan authors:**
1. Provide complete phase context when calling.
2. Trust the structured return value.
3. Handle BLOCKED status appropriately.
4. Present manual verification steps to the user only if they were actually needed (should be rare — Step 3 covers automated testing).

**For direct users:**
1. Ensure the plan file is up-to-date before running.
2. Have `docs/decisions/INDEX.md` available.
3. Review any manual verification steps the completion report surfaces.
4. If the completion report shows PASS_WITH_NOTES at any point, verify those notes got fixed — a clean report should have none.

**For step developers:**
1. A new step must define: its gate criteria, its output format, whether it's `required`, whether it wraps a skill.
2. Insert at the correct position (after the step it depends on, before any step that depends on it).
3. Update `references/step-details.md` with the subagent pattern.
