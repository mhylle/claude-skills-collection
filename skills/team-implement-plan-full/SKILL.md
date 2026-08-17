---
name: team-implement-plan-full
description: Execute implementation plans with a full team — one implementer per phase running in parallel where the dependency graph allows, plus a shared cross-phase Reviewer. Phases execute in waves based on dependencies. Use for large plans with 4+ phases and independent work streams. Highest token cost but fastest execution for parallelizable work. Triggers on "full team implement", "parallel implement", or when the user explicitly wants maximum parallelism.
argument-hint: "[plan-path]"
---

# Team Implement Plan Full (Large Team)

## Overview

This skill executes implementation plans with maximum parallelism. Each phase gets a dedicated implementer teammate. Independent phases run simultaneously within waves. A shared Reviewer provides cross-phase quality checks.

**Team composition:**
- **phase-N-impl** (one per phase in current wave): Implements their phase directly
- **reviewer**: Shared across all phases. Reviews FIFO as phases complete. Checks cross-phase consistency
- **Lead**: Orchestrates waves, manages team lifecycle, handles plan sync and completion

**When to use this:**
- Plans with 4+ phases where some phases are independent
- Large features spanning multiple modules/layers
- When speed of execution matters and you can afford the token cost

**Token cost:** ~100-150K per wave (scales with concurrent implementers)

**References:**
- `references/team-lifecycle.md` for team lifecycle pattern
- `references/quality-pipeline-distribution.md` for pipeline distribution

## Initial Response

When invoked with a plan path:

> "I'll set up a full implementation team with parallel execution. Let me read the plan, analyze the dependency graph, and present the execution waves before starting."

## Workflow

### Phase 1: Plan Analysis

**Step 1a: Read and validate the plan**

```
Read($0)  # Plan path from argument
```

Validate:
- [ ] Implementation phases with objectives and tasks
- [ ] Exit conditions per phase
- [ ] Dependencies between phases (from TaskList or plan structure)

**Step 1b: Check existing progress**

```
TaskList  # Check for existing tasks
```

If tasks exist with some completed, resume from current state (skip completed phases, adjust waves).

**Step 1c: Build dependency graph**

Parse phase dependencies to build execution waves:

```
Algorithm:
1. Read all tasks and their blockedBy relationships
2. Wave 1 = phases with no dependencies (blockedBy is empty)
3. Wave 2 = phases whose ALL dependencies are in Wave 1
4. Wave N = phases whose ALL dependencies are in Waves 1..N-1
5. Apply file conflict detection (Step 1d)
```

**Step 1d: Detect file conflicts**

For phases in the same wave, check if they touch overlapping files:

```
For each pair of phases in the same wave:
  - Extract file scope from plan tasks (files mentioned)
  - If scopes overlap: add synthetic dependency, move one phase to next wave
  - Priority: keep the phase with more downstream dependents in earlier wave
```

**Shared files** that multiple phases need to modify (index files, module registrations, route configs) are handled by the Lead after a wave completes, not by individual implementers.

**Step 1e: Build file ownership map**

```
file_ownership = {}
For each wave:
  For each phase in wave:
    For each file in phase scope:
      file_ownership[file] = phase_id

shared_files = files appearing in multiple phases across waves
```

Shared files are excluded from all implementer scopes. Lead handles them at wave boundaries.

**Step 1f: Present wave plan to user**

```
## Execution Plan

### Wave 1 (parallel)
- Phase 1: [Name] — files: [scope]
- Phase 3: [Name] — files: [scope]

### Wave 2 (after Wave 1 completes)
- Phase 2: [Name] — depends on Phase 1 — files: [scope]

### Wave 3 (after Wave 2 completes)
- Phase 4: [Name] — depends on Phase 2 — files: [scope]
- Phase 5: [Name] — depends on Phase 2 — files: [scope]

### Shared files (handled by Lead at wave boundaries)
- src/app.module.ts (modified by Phase 1, 2, 4)
- src/routes/index.ts (modified by Phase 3, 5)

Estimated team size: [max wave size + 1 reviewer]
Estimated token cost: ~[cost estimate]

Proceed?
```

Wait for user confirmation before starting.

### Phase 2: Team Creation

**Step 2a: Create team**

```
TeamCreate(team_name="impl-full-{plan-slug}")
```

**Step 2b: Spawn Reviewer**

The Reviewer is spawned once and persists across all waves.

```
Task(subagent_type="general-purpose",
     team_name="impl-full-{plan-slug}",
     name="reviewer",
     prompt="You are the cross-phase Reviewer on a full implementation team.

PLAN: {full plan content}

YOUR ROLE: Quality gate for ALL phases. You review each phase as implementers complete them. You are the only reviewer — process requests FIFO.

REVIEW PROTOCOL:
When an implementer messages you 'Phase N ready for review':

1. READ all changed files completely
2. RUN exit condition commands independently:
   - Build: {build commands from plan}
   - Lint: {lint commands}
   - Test: {test commands}
3. CHECK code quality:
   - Does the code follow existing patterns?
   - Any security issues?
   - Error handling adequate?
   - Tests meaningful?
   - Design decision compliance?
4. CHECK cross-phase consistency:
   - Do types/interfaces match across phases?
   - Are shared contracts maintained?
   - Any naming conflicts with other completed phases?
5. CHECK ADR compliance:
   - Read docs/decisions/INDEX.md
   - Verify against relevant ADRs

DECISION:
- PASS: Message team lead: 'PASS: Phase N — [quality summary]'
- NEEDS_CHANGES: Message the specific implementer: 'NEEDS_CHANGES: [issue list with file:line refs]'
  Wait for re-request, then re-review

RULES:
- You are read-only — NEVER modify code. Only implementers write code
- Process reviews FIFO — first come, first served
- Be thorough but pragmatic — real issues only, not style nitpicks
- Always include file:line references
- If you notice cross-phase conflicts, message the team lead immediately")
```

### Phase 3: Wave Execution Loop

For each wave:

**Step 3a: Spawn wave implementers**

For each phase in the current wave, spawn a dedicated implementer:

```
Task(subagent_type="general-purpose",
     team_name="impl-full-{plan-slug}",
     name="phase-{N}-impl",
     prompt="You are the implementer for Phase {N} on a full implementation team.

PLAN CONTEXT: {relevant plan sections}
YOUR PHASE: {phase N details — objective, tasks, exit conditions}

YOUR FILE SCOPE — you may ONLY modify these files:
{file list from ownership map}

DO NOT MODIFY these shared files (the Lead handles them):
{shared file list}

IMPLEMENTATION PROTOCOL:
1. Read all files in your scope and relevant context files
2. Implement phase tasks IN ORDER (tests first, then implementation)
3. Run all exit condition commands:
   - Build: {build commands}
   - Lint: {lint commands}
   - Test: {test commands}
4. Fix any failures — iterate until all exit conditions pass
5. When ALL exit conditions pass, message 'reviewer':
   'Phase {N} ready for review. Files changed: [list]. Exit conditions passing.'
6. If reviewer sends NEEDS_CHANGES, fix the issues and re-request review
7. Do NOT start any other phase — your scope is Phase {N} only

RULES:
- Stay within your file scope — do NOT modify files outside it
- If you need to change a shared file, message the team lead with what change is needed
- If you need information from another phase's files, READ them but do not WRITE
- If you hit a blocker, message the team lead
- Follow existing codebase patterns documented in the plan")
```

**Step 3b: Monitor wave progress**

While wave executes:
- Track which implementers have messaged Reviewer via TaskList and messages
- Track which phases have passed review
- If an implementer goes idle without progress, message them for status
- If an implementer reports a blocker, help resolve it or escalate to user
- Relay cross-phase information when relevant (e.g., "Phase 1 created a new type at src/types.ts:42 that Phase 3 may need")

**Step 3c: Handle shared file requests**

When implementers message that they need a shared file modified:
1. Collect all shared file change requests for the current wave
2. After ALL wave phases pass review, apply shared file changes yourself (the Lead directly edits)
3. Run full build/test to verify shared file changes don't break anything
4. If tests fail, fix and re-verify

**Step 3d: Wave review tracking**

Track review status per phase:

```
Wave 1 Review Status:
  Phase 1: ✅ PASS
  Phase 3: 🔄 In review (attempt 2)
  Phase 5: ⏳ Awaiting review
```

**Step 3e: Handle fix loops**

If a fix loop exceeds 3 iterations for any phase:
1. Read the disputed issues
2. Determine if the issue is genuine or a disagreement
3. Make a judgment call and message both the implementer and reviewer
4. If genuinely stuck, ask the user for input

**Step 3f: Wave completion**

When ALL phases in the wave have passed review:

1. Apply shared file changes (Step 3c)
2. Run full test suite to verify cross-phase integration
3. If integration tests fail:
   - Identify which phase's changes caused the failure
   - Message that phase's implementer with the fix needed
   - Re-verify after fix
4. Shut down wave implementers (they completed their one phase)
5. Update task status for all wave phases (TaskUpdate to completed)
6. Generate wave completion report

**Step 3g: User confirmation between waves**

```
Wave {W} complete.

Phases completed: {list with summaries}
Files changed: {aggregated list}
Issues caught by Reviewer: {summary}
Integration status: {pass/issues}

Next wave: {phase list}

Continue? (or /clear and resume later — progress is saved)
```

Wait for user confirmation before spawning next wave.

**Step 3h: Reviewer health check**

After each wave:
- If Reviewer has reviewed 4+ phases, check for quality degradation
- Signs of degradation: reviews getting shorter, missing obvious issues, slow responses
- If degraded: shut down Reviewer, spawn replacement with same prompt

### Phase 4: Plan Completion

After all waves complete:

**Step 4a: Final integration check**

Run the full test suite one final time. All exit conditions from all phases must still pass.

**Step 4b: Completion report**

```
## Implementation Complete

**Plan**: {plan name}
**Method**: Full team (parallel wave execution)
**Waves executed**: {count}
**Total phases**: {count}
**Phases per wave**: {breakdown}

### Quality Summary
- Issues caught by Reviewer: {count}
- Fix loops required: {count}
- Cross-phase conflicts resolved: {count}
- Shared file changes: {count}

### Per-Phase Summary
| Phase | Wave | Implementer | Review Attempts | Key Changes |
|-------|------|-------------|-----------------|-------------|
| 1 | 1 | phase-1-impl | 1 | {summary} |
| 2 | 2 | phase-2-impl | 2 | {summary} |
...

### Files Changed (all phases)
{aggregated file list}
```

**Step 4c: Shutdown and cleanup**

1. Shut down Reviewer
2. TeamDelete
3. Present final report to user
4. Suggest: "Run `/e2e-testing` to validate the full implementation"

## Crash Recovery Protocol

If the session ends mid-wave:

1. On next session, user invokes `/team-implement-plan-full [plan-path]`
2. Lead reads plan and checks TaskList
3. **Completed phases** (task status = completed): Skip entirely
4. **Completed waves**: Skip entirely
5. **In-progress wave**: Check which phases in the wave are completed vs pending
   - Completed phases in the wave: Skip
   - In-progress/pending phases: Re-create team, spawn implementers only for these
6. Reviewer is re-spawned fresh (stateless)
7. Re-run dependency analysis to determine correct wave structure from remaining phases

**What persists:** Task status, committed code, plan file
**What's lost:** Teammate context, uncommitted changes, review history

**Mitigation:** Lead encourages committing after each wave completes.

## File Conflict Prevention

### Rules

1. **Each implementer has an explicit file scope** — listed in their spawn prompt
2. **Implementers MUST NOT modify files outside their scope** — stated as a rule in prompt
3. **Shared files are Lead-managed** — identified before execution, excluded from all scopes
4. **Same-wave overlap = synthetic dependency** — detected in Step 1d, prevents parallel execution
5. **Read is always allowed** — implementers can READ any file for context, just not WRITE outside scope

### Shared File Handling

Common shared files:
- Module registration files (`app.module.ts`, `main.py`)
- Route index files (`routes/index.ts`)
- Type/interface barrel exports (`types/index.ts`)
- Configuration files (`config/*.ts`)
- Package manifests (`package.json` — for new dependencies)

Protocol:
1. Implementer messages Lead: "Phase N needs to add [import/route/provider] to [shared file]"
2. Lead collects all requests for the wave
3. After wave passes review, Lead applies all shared file changes at once
4. Lead runs full build/test to verify
5. This prevents merge conflicts and ensures consistency

## Wave Size Limits

| Scenario | Max Concurrent Implementers | Rationale |
|----------|---------------------------|-----------|
| Default | 4 | Balance between parallelism and coordination overhead |
| Simple phases (< 3 tasks each) | 5 | Lower per-phase complexity allows more concurrency |
| Complex phases (5+ tasks each) | 3 | Higher per-phase complexity needs more lead attention |
| User override | As specified | User can request specific wave sizes |

The Reviewer is always 1 (shared across wave). Total team size = wave implementers + 1 reviewer + lead.

## Teammate Stability

### Implementer Lifecycle
- Each implementer handles exactly ONE phase, then is shut down
- This prevents context degradation from long sessions
- Fresh implementer per phase = consistent quality

### Reviewer Lifecycle
- Single reviewer persists across waves
- Monitor for degradation after 4-5 reviews
- Replacement protocol: shut down, spawn fresh reviewer with same prompt
- Signs of degradation: reviews getting superficial, missing issues previously caught, slow responses

### Lead Responsibilities
- Monitor all teammates for responsiveness
- 2+ messages without response = teammate is stuck, spawn replacement
- Track review quality — if reviewer approves code that then fails integration, reviewer may need replacement

## Quality Pipeline Distribution

| Pipeline Step | Owner | Notes |
|---|---|---|
| 1. Implementation | phase-N-impl | Direct code writing within file scope |
| 2. Verification-loop | phase-N-impl | Build/lint/test scoped to phase |
| 3. Integration testing | phase-N-impl | Tests within phase scope |
| 4. Code review | reviewer | Cross-phase consistency + per-phase quality |
| 5. ADR compliance | reviewer | Centralized ADR knowledge |
| 6. Plan sync | Lead | Single writer to task status |
| 7. Prompt archival | Lead | Single writer to prompt files |
| 8. Completion report | Lead | Aggregates per wave and final |

## Quality Checklist

Before completing each wave:
- [ ] All wave phases passed Reviewer review
- [ ] Shared file changes applied and verified
- [ ] Full test suite passes (cross-phase integration)
- [ ] Task status updated for all wave phases
- [ ] User confirmed wave completion

Before completing the plan:
- [ ] All waves completed
- [ ] Final full test suite passes
- [ ] All tasks marked completed
- [ ] Completion report generated
- [ ] All teammates shut down
- [ ] Team cleaned up via TeamDelete
