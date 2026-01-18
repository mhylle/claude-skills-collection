---
name: implement-phase
description: Execute a single phase from an implementation plan with all quality gates. This skill is the unit of work for implement-plan, handling implementation, verification, code review, ADR compliance, and plan synchronization for ONE phase. Triggers when implement-plan delegates a phase, or manually with "/implement-phase" and a phase reference.
---

# Implement Phase

Execute a **single phase** from an implementation plan with comprehensive quality gates. This skill is designed to be called by `implement-plan` but can also be invoked directly.

## Architecture

```
implement-plan (orchestrates full plan)
    │
    └── implement-phase (this skill - one phase at a time)
            │
            ├── 1. Implementation (subagents)
            ├── 2. Exit Condition Verification
            ├── 3. Code Review (code-review skill)
            ├── 4. ADR Compliance Check
            ├── 5. Plan Synchronization
            ├── 6. Prompt Archival (if prompt provided)
            └── 7. Phase Completion Report
```

## Design Principles

### Single Responsibility
This skill does ONE thing: execute a single phase completely and correctly.

### Extensibility
The phase execution pipeline is designed as a sequence of **steps**. New steps can be added without modifying the core logic. See [Phase Steps](#phase-steps-extensible).

### Quality Gates
Each step is a gate. If any gate fails, the phase cannot complete.

### Composability
This skill orchestrates other skills (code-review, adr) and can be extended to include more.

## Input Context

When invoked, this skill expects:

```
Plan Path: [path to plan file]
Phase: [number or name]
Prompt Path: [optional - path to pre-generated prompt from prompt-generator]
Changed Files: [optional - auto-detected if not provided]
Skip Steps: [optional - list of steps to skip, e.g., for testing]
```

### Prompt Integration

If a **Prompt Path** is provided (from `prompt-generator` skill):

1. **Read the prompt file** - Contains detailed orchestration instructions
2. **Use prompt as primary guidance** - Follows established patterns and conventions
3. **Plan file as reference** - For exit conditions and verification steps
4. **Archive on completion** - Move prompt to `completed/` subfolder

```
# Prompt provides:
- Detailed orchestration workflow
- Subagent delegation patterns
- Specific task breakdowns
- Error handling guidance

# Plan provides:
- Exit conditions (source of truth)
- Success criteria
- Dependencies
```

## Phase Execution Pipeline

### Step 1: Implementation

**Responsibility**: Execute all tasks in the phase using subagent delegation.

**Process**:
1. Read phase requirements and tasks from plan
2. Identify independent tasks for parallelization
3. Spawn test subagents FIRST (verification-first)
4. Spawn implementation subagents
5. Monitor and handle blockers
6. Collect results and changed files list

**Output**:
```
IMPLEMENTATION_STATUS: PASS | FAIL
FILES_CREATED: [list]
FILES_MODIFIED: [list]
TEST_RESULTS: [summary]
ERRORS: [if any]
```

**Gate**: Implementation must PASS to proceed.

---

### Step 2: Exit Condition Verification

**Responsibility**: Verify all exit conditions defined in the plan pass.

**Process**:
1. Read exit conditions from plan
2. Spawn parallel verification subagents:
   - Build verification (build, lint, typecheck)
   - Runtime verification (app starts, no errors)
   - Functional verification (tests pass, feature works)
3. Aggregate results

**Output**:
```
EXIT_CONDITIONS_STATUS: PASS | FAIL
BUILD_VERIFICATION: PASS | FAIL
RUNTIME_VERIFICATION: PASS | FAIL
FUNCTIONAL_VERIFICATION: PASS | FAIL
FAILED_CONDITIONS: [list if any]
```

**Gate**: ALL exit conditions must PASS to proceed.

**On Failure**: Spawn fix subagents, re-verify, repeat until pass or escalate.

---

### Step 3: Code Review

**Responsibility**: Validate implementation quality across all dimensions.

**Process**:
1. Invoke `code-review` skill with phase context
2. Provide: plan path, phase number, changed files
3. Receive structured review result

**Output**:
```
CODE_REVIEW_STATUS: PASS | PASS_WITH_NOTES | NEEDS_CHANGES
BLOCKING_ISSUES: [count]
RECOMMENDATIONS: [list]
```

**Gate**: Code review must be PASS or PASS_WITH_NOTES to proceed.

**On NEEDS_CHANGES**: Present blocking issues, spawn fix subagents, re-run code review.

---

### Step 4: ADR Compliance Check

**Responsibility**: Ensure architectural decisions are followed and documented.

**Process**:
1. Read `docs/decisions/INDEX.md` to identify relevant ADRs
2. Check implementation against applicable ADRs
3. Identify any new architectural decisions made during implementation
4. If new decisions found, invoke `adr` skill to document them

**Output**:
```
ADR_COMPLIANCE_STATUS: PASS | NEEDS_DOCUMENTATION
APPLICABLE_ADRS: [list]
COMPLIANCE_RESULTS: [per-ADR status]
NEW_DECISIONS_DOCUMENTED: [list of new ADR numbers, if any]
```

**Gate**: ADR compliance must PASS to proceed.

**On NEEDS_DOCUMENTATION**: Invoke `adr` skill for each undocumented decision.

---

### Step 5: Plan Synchronization

**Responsibility**: Update the plan file to reflect completed work.

**Process**:
1. Mark completed tasks with `[x]`
2. Update exit condition checkboxes
3. Add ADR references if new ADRs were created
4. Note any deviations from original plan
5. Update phase status

**Output**:
```
PLAN_SYNC_STATUS: PASS | FAIL
TASKS_MARKED_COMPLETE: [count]
DEVIATIONS_NOTED: [count]
ADR_REFERENCES_ADDED: [count]
```

**Gate**: Plan must sync successfully.

---

### Step 6: Prompt Archival

**Responsibility**: Archive the phase prompt to the completed folder (if prompt was provided).

**Process**:
1. Check if a prompt file was used for this phase
2. If yes, move to `completed/` subfolder:
   ```bash
   # Create completed folder if it doesn't exist
   mkdir -p docs/prompts/completed

   # Move the prompt file
   mv docs/prompts/phase-2-data-pipeline.md docs/prompts/completed/
   ```
3. Log the archival

**Output**:
```
PROMPT_ARCHIVAL_STATUS: PASS | SKIPPED | FAIL
PROMPT_FILE: [original path]
ARCHIVED_TO: [new path in completed/]
```

**Gate**: Non-blocking (failure logged but doesn't stop completion).

**Why Archive?**
- Prevents re-using the same prompt accidentally
- Creates a record of completed work
- Keeps the prompts folder clean for pending work
- Allows review of what instructions were used

---

### Step 7: Phase Completion Report

**Responsibility**: Generate summary for orchestrator and user.

**Output Format**:
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
  Functional: ✅ PASS

Code Review:
  Status: ✅ PASS (or ⚠️ PASS_WITH_NOTES)
  Recommendations: [count] (see details below)

ADR Compliance:
  Status: ✅ PASS
  Applicable ADRs: [list]
  New ADRs Created: [list or "None"]

Plan Updated:
  Tasks Completed: [count]
  Checkboxes Marked: [count]

Prompt:
  Status: ✅ Archived (or ⏭️ Skipped - no prompt provided)
  Archived To: docs/prompts/completed/phase-2-data-pipeline.md

Manual Verification Required:
  - [ ] [Manual check 1]
  - [ ] [Manual check 2]

═══════════════════════════════════════════════════════════════
PHASE STATUS: ✅ COMPLETE - Ready for next phase
═══════════════════════════════════════════════════════════════
```

## Phase Steps (Extensible)

The execution pipeline is defined as an ordered list of steps. This design allows easy extension:

```
PHASE_STEPS = [
  { name: "implementation", required: true, skill: null },
  { name: "exit_conditions", required: true, skill: null },
  { name: "code_review", required: true, skill: "code-review" },
  { name: "adr_compliance", required: true, skill: "adr" },
  { name: "plan_sync", required: true, skill: null },
  { name: "prompt_archival", required: false, skill: null },
  { name: "completion_report", required: true, skill: null },
]
```

### Adding New Steps

To add a new step (e.g., security scan, performance check):

1. Define the step with its gate criteria
2. Add to the pipeline at appropriate position
3. Implement the step logic or delegate to a skill

**Example - Adding Security Scan**:
```
{ name: "security_scan", required: false, skill: "security-scan" }
```

### Conditional Steps

Steps can be conditional based on:
- Phase type (e.g., only run security scan on auth phases)
- Configuration flags
- Plan metadata

```
if (phase.metadata.security_sensitive) {
  run_step("security_scan")
}
```

## Invocation

### From implement-plan (primary use)

```
Skill(skill="implement-phase"): Execute Phase 2 of the implementation plan.

Context:
- Plan: docs/plans/auth-implementation.md
- Phase: 2 (Authentication Service)
- Previous Phase Status: Complete

Execute all quality gates and return structured result.
```

### Manual Invocation

```
/implement-phase docs/plans/my-plan.md phase:3
```

Or interactively:
```
/implement-phase

> Which plan? docs/plans/auth-implementation.md
> Which phase? 2
```

## Return Value

When called by implement-plan, return structured result:

```
PHASE_RESULT:
  phase_number: 2
  phase_name: "Authentication Service"
  status: COMPLETE | FAILED | BLOCKED

  steps:
    implementation: PASS
    exit_conditions: PASS
    code_review: PASS_WITH_NOTES
    adr_compliance: PASS
    plan_sync: PASS
    prompt_archival: PASS | SKIPPED

  files_changed:
    created: [list]
    modified: [list]

  new_adrs: [list or empty]

  prompt:
    used: true | false
    original_path: "docs/prompts/phase-2-data-pipeline.md"
    archived_to: "docs/prompts/completed/phase-2-data-pipeline.md"

  recommendations: [list]

  manual_verification:
    - "Check login flow in browser"
    - "Verify JWT token claims"

  ready_for_next: true | false
  blocker: null | "description of blocker"
```

## Error Handling

### Step Failures

When a step fails:

1. **Log failure details** with full context
2. **Attempt automatic fix** if possible (spawn fix subagent)
3. **Re-run the step** after fix
4. **Escalate to user** if fix fails or requires decision

### Maximum Retries

Each step has a retry limit (default: 3). After exhausting retries:

```
⛔ PHASE BLOCKED: [Step Name] failed after 3 attempts

Last Error: [error details]

Options:
A) Retry with different approach
B) Skip this step (if non-blocking)
C) Abort phase and return to plan

How should I proceed?
```

### Blocker Protocol

When a blocker is encountered:

1. **STOP** all pending work
2. **PRESERVE** state for resume
3. **REPORT** to orchestrator with full context
4. **AWAIT** decision

## Integration with Other Skills

### code-review

Called in Step 3. Receives phase context, returns structured review.

### adr

Called in Step 4 when:
- New architectural decisions need documentation
- Compliance check identifies undocumented decisions

### Future Integrations

The extensible step design allows adding:
- `security-scan` - Security vulnerability scanning
- `performance-check` - Performance regression testing
- `documentation-update` - Auto-update relevant docs
- `changelog-entry` - Add to CHANGELOG.md

## Configuration

Phase behavior can be configured via plan metadata or global settings:

```yaml
# In plan file
phase_config:
  strict_mode: true          # Fail on any warning
  skip_steps: []             # Steps to skip
  additional_steps: []       # Extra steps to run
  retry_limit: 3             # Max retries per step

# Global settings (~/.claude/settings.json)
implement_phase:
  default_retry_limit: 3
  always_run_security: false
  require_adr_for_decisions: true
```

## Best Practices

### For implement-plan Authors

1. Provide complete phase context when calling
2. Trust the structured return value
3. Handle BLOCKED status appropriately
4. Present manual verification steps to user

### For Direct Users

1. Ensure plan file is up-to-date before running
2. Have ADR INDEX.md available
3. Review manual verification steps carefully
4. Check recommendations even on PASS_WITH_NOTES

### For Step Developers

1. Each step must have clear PASS/FAIL criteria
2. Steps should be idempotent (safe to re-run)
3. Provide detailed error messages
4. Log sufficient context for debugging
