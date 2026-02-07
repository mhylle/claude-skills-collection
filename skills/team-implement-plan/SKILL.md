---
name: team-implement-plan
description: Execute implementation plans with a small review team (Implementer + Reviewer + optional Integrator). The Implementer writes code directly while the Reviewer provides adversarial quality checks per phase. Use for moderate-to-complex plans where real-time adversarial review catches issues that automated checks miss. Triggers on "team implement", "team implement plan", or when the user explicitly wants team-based implementation.
context: fork
argument-hint: "[plan-path]"
---

# Team Implement Plan (Small Review Team)

## Overview

This skill executes implementation plans using a small team of 2-3 members. Unlike the solo `implement-plan` which uses an orchestrator/subagent pattern, this skill has teammates that implement code directly and review each other's work adversarially.

**Team composition:**
- **Implementer**: Writes code directly using Write/Edit/Bash. Runs build/lint/test
- **Reviewer**: Reviews code changes, checks ADR compliance, runs integration tests. Sends fix requests
- **Integrator** (optional, for plans with 4+ phases): Monitors cross-phase consistency, handles plan sync

**When to use this vs `implement-plan`:**
- Use `implement-plan` for simple plans (1-3 phases, clear requirements, ~30-40K tokens/phase)
- Use `team-implement-plan` for quality-sensitive plans where adversarial review matters (~60-80K tokens/phase)
- Use `team-implement-plan-full` for large plans with parallel phases (~100-150K tokens/wave)

**Reference**: See `references/team-lifecycle.md` for team lifecycle and `references/quality-pipeline-distribution.md` for pipeline distribution.

## Initial Response

When invoked with a plan path:

> "I'll set up a small implementation team. An Implementer will write code while a Reviewer independently checks quality. Let me read the plan and set up the team."

## Workflow

### Phase 1: Plan Reading & Team Setup

**Step 1a: Read and validate the plan**

```
Read($0)  # Plan path from argument
```

Validate the plan has:
- [ ] Implementation phases with objectives
- [ ] Tasks per phase
- [ ] Exit conditions per phase
- [ ] Dependencies between phases

If the plan is missing required sections, inform the user and stop.

**Step 1b: Check existing progress**

```
TaskList  # Check for existing tasks from this plan
```

If tasks exist with some completed, resume from the first incomplete phase.
If no tasks exist, the plan was created without task bootstrapping — create tasks now.

**Step 1c: Determine team size**

| Plan Size | Team |
|-----------|------|
| 1-3 phases | Implementer + Reviewer (2 members) |
| 4+ phases | Implementer + Reviewer + Integrator (3 members) |

**Step 1d: Create the team**

```
TeamCreate(team_name="impl-{plan-slug}")
```

**Step 1e: Spawn teammates**

#### Implementer

```
Task(subagent_type="general-purpose",
     team_name="impl-{plan-slug}",
     name="implementer",
     prompt="You are the Implementer on an implementation team.

PLAN: {full plan content}
CURRENT PHASE: {phase N details — objective, tasks, exit conditions}

YOUR ROLE: Implement this phase directly using Write, Edit, and Bash tools.

PROTOCOL:
1. Read all files mentioned in the plan's context section
2. Implement the phase tasks IN ORDER (tests first, then implementation)
3. After implementing, run all verification commands from exit conditions:
   - Build verification: run build, lint, typecheck commands
   - Runtime verification: start the app, check for errors
   - Functional verification: run tests
4. Fix any failures — iterate until all exit conditions pass
5. When ALL exit conditions pass, message 'reviewer':
   'Phase N implementation complete. Files changed: [list]. All exit conditions passing.'

RULES:
- Write code directly — you have full access to Write/Edit/Bash tools
- Follow existing codebase patterns (the plan documents them)
- Write tests BEFORE implementation code
- Do not proceed to the next phase — wait for Reviewer approval
- If you hit a blocker you cannot resolve, message the team lead

CURRENT TASK: Implement Phase {N} as described in the plan.")
```

#### Reviewer

```
Task(subagent_type="general-purpose",
     team_name="impl-{plan-slug}",
     name="reviewer",
     prompt="You are the Reviewer on an implementation team.

PLAN: {full plan content}

YOUR ROLE: Independently verify each phase's implementation quality. You are the quality gate.

PROTOCOL:
1. Wait for the Implementer to message you that a phase is ready for review
2. When you receive a review request:
   a. Read ALL changed files completely
   b. Run integration tests (curl endpoints, check UI, verify behavior)
   c. Apply code review checklist:
      - Does the code follow existing patterns in the codebase?
      - Are there any security issues? (injection, XSS, exposed secrets)
      - Is error handling adequate?
      - Are tests meaningful (not just trivial assertions)?
      - Does the code match the plan's design decision?
   d. Check ADR compliance: Read docs/decisions/INDEX.md, verify against relevant ADRs
   e. Re-run all exit condition commands independently to confirm they pass

3. DECISION:
   - If ALL checks pass: Message team lead with 'PASS: Phase N review complete. Quality assessment: [summary]'
   - If ANY issues found: Message 'implementer' with 'NEEDS_CHANGES: [specific list of issues with file:line references]'
     Then wait for implementer to fix and re-request review

RULES:
- Be thorough but pragmatic — flag real issues, not style preferences
- Verify independently — don't trust the Implementer's claim that tests pass
- Include file:line references for every issue
- Do NOT modify code yourself — only the Implementer writes code
- If you and the Implementer disagree on whether something is an issue, message the team lead")
```

#### Integrator (optional, for 4+ phase plans)

```
Task(subagent_type="general-purpose",
     team_name="impl-{plan-slug}",
     name="integrator",
     prompt="You are the Integrator on an implementation team.

PLAN: {full plan content}

YOUR ROLE: Monitor cross-phase consistency and handle plan synchronization.

PROTOCOL:
1. After each phase passes review, verify:
   - No regressions from previous phases (run full test suite, not just phase tests)
   - Integration between completed phases works correctly
   - Shared resources (database schemas, API contracts, types) are consistent
   - Module registrations, route files, index exports are updated

2. Update plan sync:
   - Mark completed tasks via TaskUpdate
   - Verify work items from the plan are actually done
   - Flag any plan tasks that were skipped or partially completed

3. Report to team lead:
   - 'INTEGRATION_PASS: Phase N integrates cleanly with previous phases'
   - 'INTEGRATION_ISSUE: [description of cross-phase problem]'

RULES:
- Run the FULL test suite after each phase, not just new tests
- Check for import errors, missing exports, broken references
- If you find a regression, message 'implementer' with details")
```

### Phase 2: Phase Execution Loop

For each phase in the plan:

**Step 2a: Assign phase to Implementer**

```
TaskUpdate(taskId="{phase-task-id}", status="in_progress")

SendMessage(type="message", recipient="implementer",
  content="Begin Phase {N}: {phase name}.
  Objective: {objective}.
  Tasks: {task list}.
  Exit conditions: {conditions}.
  Files in scope: {files from plan}.")
```

**Step 2b: Wait for implementation**

Implementer works through the phase tasks. Monitor via TaskList. If Implementer goes idle without messaging Reviewer, prompt them.

**Step 2c: Wait for review**

Reviewer receives Implementer's "ready for review" message. Monitor the review.

**Step 2d: Handle fix loop**

If Reviewer sends NEEDS_CHANGES:
1. Implementer receives fix list
2. Implementer fixes issues
3. Implementer re-messages Reviewer
4. Reviewer re-reviews
5. Repeat until PASS

If fix loop exceeds 3 iterations, Lead intervenes:
- Read the disputed issues
- Make a judgment call
- Message both teammates with resolution

**Step 2e: Phase completion**

When Reviewer sends PASS:
1. If Integrator exists, wait for INTEGRATION_PASS
2. Lead runs plan sync (TaskUpdate to completed, verify work items)
3. Lead handles prompt archival if applicable
4. Lead generates phase completion report

**Step 2f: User confirmation**

Present to user:
```
Phase {N} complete.

Implementation: {Implementer's summary}
Review: {Reviewer's assessment}
Integration: {Integrator's check, if applicable}

Files changed: {list}
Exit conditions: All passing

Continue to Phase {N+1}? (or /clear and resume later)
```

Wait for user confirmation before proceeding to next phase.

**Step 2g: Re-assign for next phase**

Update Implementer's context for the next phase:
```
SendMessage(type="message", recipient="implementer",
  content="Phase {N} approved. Begin Phase {N+1}: {details}...")
```

### Phase 3: Plan Completion

After all phases complete:

1. Generate overall completion report:
   - Phases completed: {count}
   - Total fix loops: {count}
   - Key issues caught by Reviewer: {list}
   - Integration issues caught: {list, if Integrator present}

2. Shut down teammates:
   ```
   SendMessage(type="shutdown_request", recipient="implementer", ...)
   SendMessage(type="shutdown_request", recipient="reviewer", ...)
   SendMessage(type="shutdown_request", recipient="integrator", ...)  # if exists
   ```

3. TeamDelete

4. Present final summary to user

## Crash Recovery Protocol

If the session ends mid-implementation:

1. On next session, user invokes `/team-implement-plan [plan-path]`
2. Lead reads plan and checks TaskList for progress
3. Completed phases are skipped
4. Lead creates new team and spawns fresh teammates
5. For the in-progress phase: Implementer reads the current file state and continues
6. Reviewer starts fresh (stateless — reviews based on current code)

**What persists:** Task status (completed/pending), committed code, plan file
**What's lost:** Teammate conversation context, in-progress uncommitted changes

**Mitigation:** Encourage committing after each phase passes review.

## Quality Pipeline Distribution

| Pipeline Step | Owner | Method |
|---|---|---|
| 1. Implementation | Implementer | Direct Write/Edit/Bash |
| 2. Verification-loop | Implementer | Bash: build, lint, test commands |
| 3. Integration testing | Reviewer | Bash: curl, test commands, behavioral checks |
| 4. Code review | Reviewer | Read files, apply review checklist |
| 5. ADR compliance | Reviewer | Read ADRs, check compliance |
| 6. Plan sync | Integrator or Lead | TaskUpdate, verify work items |
| 7. Prompt archival | Lead | Move prompt files if applicable |
| 8. Completion report | Lead | Synthesize teammate reports |

## Quality Checklist

Before completing each phase, verify:

- [ ] Implementer ran all exit condition commands
- [ ] Reviewer independently verified exit conditions
- [ ] Code review found no blocking issues (or all were fixed)
- [ ] ADR compliance checked
- [ ] Integration with previous phases verified (if Integrator present)
- [ ] Task status updated
- [ ] User confirmed phase completion

Before completing the plan, verify:

- [ ] All phases completed and reviewed
- [ ] All tasks marked completed in TaskList
- [ ] All teammates shut down
- [ ] Team cleaned up via TeamDelete
- [ ] Final completion report generated
