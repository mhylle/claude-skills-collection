---
name: implement-plan
description: Orchestrate the execution of complete implementation plans, delegating each phase to implement-phase skill. This skill manages the full plan lifecycle including phase sequencing, user confirmation between phases, and overall progress tracking. Triggers on "implement the plan", "execute the implementation plan", or when given a path to a plan file.
argument-hint: "[plan-path]"
---

# Implement Plan

Orchestrate complete implementation plans by sequencing phases and delegating each one to the `implement-phase` skill. Read a plan, track progress, and coordinate phase-by-phase execution with user confirmation between phases.

## Your Role: Orchestrator

This session coordinates — it does not implement. All code writing, testing, and file creation happens inside `implement-phase`, which spawns its own subagents.

Why this separation matters:
- **Context preservation** — This session retains the full plan context across all phases. Implementation work would fill the context with code details and lose sight of the overall plan.
- **Clean error boundaries** — Implementation failures are isolated within implement-phase's subagents. The orchestrator stays clean and can reason about recovery without being entangled in failing code.
- **Parallelization** — implement-phase runs multiple tasks concurrently within a phase.

In practice: use Read/Glob to understand context, Skill to invoke implement-phase, and Task tools to track progress. Do not use Write/Edit/NotebookEdit.

## Getting Started

### 1. Locate and Read the Plan

Find the plan file (common locations: `docs/plans/`, `thoughts/plans/`, or the user-specified path). Read the entire plan — full context is essential for sequencing phases correctly.

### 2. Assess the Environment

Check what supporting infrastructure exists. Not all projects have all of these — adapt accordingly:

| Check | If present | If absent |
|-------|-----------|-----------|
| Task tools progress | Resume from first incomplete phase | Start from Phase 1 |
| ADR directory (`docs/decisions/`) | Pass to implement-phase for compliance | implement-phase skips ADR checks |
| Prompt files (`docs/prompts/phase-*.md`) | Pass matching prompt to implement-phase | implement-phase uses plan directly |

### 3. Check or Create Progress Tracking

```
TaskList → Look for tasks matching "Phase N:" pattern

If tasks exist with some completed:
  → Resume from first non-completed task
  → Show progress summary

If no tasks exist:
  → Create one task per phase with sequential dependencies
  → Start from Phase 1
```

### 4. Confirm Before Starting

Present a brief summary before executing:
- Plan name and total phases
- Current progress (if resuming)
- Which phase executes first
- Notable dependencies or prerequisites

Wait for user confirmation to begin.

## Phase Execution

### Announce

Briefly state what's about to happen:

```
======================================
STARTING PHASE [N]: [Phase Name]
======================================

Objectives: [1-2 sentences]
Dependencies: [Previous phase status]

Delegating to implement-phase...
```

### Delegate to implement-phase

```
Skill(skill="implement-phase"): Execute Phase [N] of the implementation plan.

Context:
- Plan: [plan file path]
- Phase: [N] ([Phase Name])
- Task ID: [from TaskList, if available]
- Prompt: [prompt file path if discovered, otherwise "None"]
- Previous Phase Status: [Complete/N/A]

Execute all quality gates and return structured result.
```

Optional parameters to pass through when specified in the plan:
- `TDD Mode`, `Coverage Threshold` — from plan metadata
- `Skip Steps` — if specific quality gates should be skipped

### Handle Results

implement-phase returns one of three statuses:

**COMPLETE** — All quality gates passed.
1. Update task status to `completed`
2. Present results summary
3. Note any manual verification items (rare — implement-phase handles most verification)
4. Wait for user confirmation before next phase

**FAILED** — Quality gates could not be satisfied after internal retries.
1. Present failure details and what was attempted
2. Do not automatically retry the whole phase — implement-phase already retried internally
3. Offer options:
   - **Fix and retry** — User provides guidance, re-run the phase
   - **Skip** — Mark as skipped, note the risk, continue (user's call)
   - **Abort** — Stop plan execution
4. Wait for user decision

**BLOCKED** — Cannot proceed without user intervention (missing credentials, ambiguous requirements, destructive operation needing confirmation, etc.).
1. Present the blocker with full context
2. Include options from implement-phase plus your recommendation
3. Wait for user decision
4. On resolution, resume from the blocked step (not from Phase 1)

### Confirm Between Phases

After each phase completes:

```
======================================
PHASE [N] COMPLETE: [Phase Name]
======================================

Results:
  Implementation: [files created/modified]
  Verification: [build/test/lint status]
  Code Review: [status]
  [ADR Compliance: status — only if project uses ADRs]

[Manual verification items, if any]

Progress: [N]/[total] phases complete
Next: Phase [N+1] — [Name]

Ready to proceed?
======================================
```

## Resuming Interrupted Work

When tasks already exist for this plan:

1. Call TaskList to see current state
2. Find the first non-completed task
3. Spot-check that previous work exists (verify a few key files from completed phases)
4. Present resume summary and continue

```
Resuming: [Plan Name]

  Phase 1: [Name] — completed
  Phase 2: [Name] — completed
  Phase 3: [Name] — resuming here
  Phase 4: [Name] — pending

Continuing from Phase 3...
```

## Final Completion

After all phases complete:

```
======================================
PLAN COMPLETE: [Plan Name]
======================================

Summary:
  Phases Completed: [N]/[N]
  Files Created: [count]
  Files Modified: [count]
  Tests Added: [count]

Quality Gates: All passed across all phases

Final Verification:
  [Remaining manual items, if any — often none]

======================================
```

## Adapting to Plan Size

Not every plan needs full ceremony:

| Plan Size | Approach |
|-----------|----------|
| 1-2 phases | Brief announcements, compact status |
| 3-5 phases | Standard flow with summaries |
| 6+ phases | Full tracking, progress percentages |

The implement-phase pipeline is the same regardless — this adaptation is about how much orchestration scaffolding this skill adds around it.

## Key Principles

1. **Delegate, don't implement** — All code work flows through implement-phase
2. **Confirm between phases** — Give the user a chance to review, adjust, or abort
3. **Surface problems clearly** — Present failures and blockers with context and options
4. **Degrade gracefully** — Missing ADRs, prompts, or task history should not block execution
5. **Resume cleanly** — Task tools let work survive session restarts

## Skill Dependencies

```
implement-plan
    └── implement-phase (required)
            ├── verification-loop (required)
            ├── code-review (required)
            └── adr (used only if docs/decisions/ exists)
```

## Reference

See `references/plan-format.md` for:
- Standard plan structure and formatting
- Exit condition templates by project type (Node.js, Python, Go, Rust, Java)
- Phase organization and sizing guidelines
