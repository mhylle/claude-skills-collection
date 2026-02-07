# Implementation Plan: Parallel Workflow Systems for Skills Collection

## Overview

Build three parallel implementation execution paths (subagent, small team, full team), one team-based planning skill (team-create-plan), and a workflow decision guide. The current subagent/orchestrator model remains untouched; new team variants are additive separate skill files.

Users choose explicitly via distinct skill names — no environment variables or routing config needed:

| Mode | Ideation | Planning | Implementation |
|------|----------|----------|---------------|
| **Solo** | `/brainstorm` | `/create-plan` | `/implement-plan` |
| **Small team** | `/team-brainstorm` | `/team-create-plan` | `/team-implement-plan` |
| **Full team** | `/team-brainstorm` | `/team-create-plan` | `/team-implement-plan-full` |

## Context

The existing workflow pipeline (`create-plan` -> `implement-plan` -> `implement-phase`) uses a subagent/orchestrator pattern where orchestrator sessions never write code directly. The `team-brainstorm` skill demonstrates the agent team pattern with TeamCreate/SendMessage/TeamDelete lifecycle. This plan extends team patterns to planning and implementation stages.

Key references:
- `skills/team-brainstorm/SKILL.md`: Complete team lifecycle reference
- `skills/implement-plan/SKILL.md`: Current orchestrator pattern
- `skills/implement-phase/SKILL.md`: 8-step quality pipeline
- `docs/brainstorms/2026-02-07-workflow-evolution-agent-teams-team.md`: Full brainstorm context

## Design Decision

Teammates implement code directly using Write/Edit/Bash tools rather than spawning subagents. The orchestrator pattern shifts: the team lead orchestrates teammates who each directly implement. This is necessary because teammates cannot spawn nested teams, and the subagent-within-teammate pattern is unproven at scale.

Each mode is a separate skill file. No modifications to existing skills. Users choose explicitly.

## Implementation Phases

### Phase 1: Shared References and Decision Guide

**Objective**: Create shared reference files for team lifecycle patterns and a workflow decision guide that helps users choose the right mode.

**Tasks**:
- [ ] Create `skills/references/team-lifecycle.md` extracting the common team lifecycle pattern from team-brainstorm (TeamCreate -> spawn -> coordinate -> synthesize -> shutdown -> TeamDelete) as a reusable reference for all team skills
- [ ] Create `skills/references/quality-pipeline-distribution.md` documenting how the 8-step implement-phase pipeline maps to team roles for both small and full team modes
- [ ] Create `skills/workflow-guide/SKILL.md` — a lightweight skill that asks 2-3 questions (scope, stakes, parallelism potential) and recommends which skill variants to use. Output is a recommendation, not automatic routing. Frontmatter: `name: workflow-guide`, `description: Helps choose between solo, small team, and full team workflow modes`

**Exit Conditions**:
- [ ] Reference files follow existing `skills/references/` conventions
- [ ] workflow-guide produces clear recommendations for simple, moderate, and complex tasks
- [ ] All files are valid Markdown

---

### Phase 2: team-create-plan Skill

**Objective**: Build a team-based planning skill with 3 members (Architect, Risk Analyst, Researcher) that produces the same plan format as the existing create-plan skill.

**Tasks**:
- [ ] Write `skills/team-create-plan/SKILL.md` with YAML frontmatter (`name: team-create-plan`, `context: fork`, `argument-hint: "[topic or brainstorm-path]"`)
- [ ] Define Phase 1: Lead captures requirements and conducts Socratic clarification (reuse create-plan's interactive pattern — present understanding, wait for confirmation)
- [ ] Define Phase 2: TeamCreate with slug `plan-{topic}`, spawn 3 teammates:
  - **Architect**: Explores codebase via Glob/Grep/Read, designs phase structure, proposes 2-3 technical approaches with trade-offs, identifies dependencies between phases
  - **Risk Analyst**: Stress-tests Architect's proposals, identifies risks per phase, proposes exit conditions and verification strategies, applies premortem analysis, rates risks by likelihood/impact
  - **Researcher**: Validates feasibility via codebase + web research, finds existing patterns and precedents, checks Architect's claims against codebase reality
- [ ] Define Phase 3: Lead facilitates debate — Architect presents design, Risk Analyst challenges it, Researcher provides evidence. Teammates message each other directly. Lead relays key findings
- [ ] Define Phase 4: Lead synthesizes into design options, presents to user with trade-offs (same interactive checkpoint pattern as create-plan)
- [ ] Define Phase 5: After user approves, Lead writes plan file in same format as create-plan output (same markdown structure, same exit condition format). Bootstrap tasks via TaskCreate with dependencies
- [ ] Define Phase 6: Shutdown teammates, TeamDelete, present plan to user, offer to invoke implement skill
- [ ] Add quality checklist matching team-brainstorm's pattern

**Exit Conditions**:
- [ ] Skill invocable via `/team-create-plan`
- [ ] Output plan format matches existing plans in `docs/plans/`
- [ ] All 3 teammates receive prompts with sufficient context for independent work
- [ ] Debate occurs between Architect and Risk Analyst (not isolated reports)
- [ ] Plan includes: Overview, Context, Design Decision, Phases with exit conditions, Dependencies, Risks

---

### Phase 3: team-implement-plan (Small Review Team)

**Objective**: Build a team-based implementation orchestrator with 2-3 members (Implementer, Reviewer, optional Integrator) that executes plans phase-by-phase with real-time adversarial review.

**Tasks**:
- [ ] Write `skills/team-implement-plan/SKILL.md` with frontmatter (`name: team-implement-plan`, `context: fork`, `argument-hint: "[plan-path]"`)
- [ ] Define team composition:
  - **Implementer**: Executes phase tasks directly (Write/Edit/Bash). Runs implementation + verification (build/lint/test). Messages Reviewer when phase is ready for review
  - **Reviewer**: Reviews code changes, checks ADR compliance, runs integration tests. Messages Implementer with required fixes. Only sends PASS to Lead when all quality gates pass
  - **Integrator** (optional, spawned for plans with 4+ phases): Monitors cross-phase consistency, handles plan sync, checks for integration issues between completed phases
- [ ] Define quality pipeline distribution:

  | Pipeline Step | Owner |
  |---|---|
  | 1. Implementation | Implementer (direct Write/Edit/Bash) |
  | 2. Verification-loop | Implementer (Bash: build, lint, test commands) |
  | 3. Integration testing | Reviewer (Bash: curl, test commands) |
  | 4. Code review | Reviewer (Read files, apply review checklist) |
  | 5. ADR compliance | Reviewer (Read ADRs, check compliance) |
  | 6. Plan sync | Integrator or Lead (TaskUpdate) |
  | 7. Prompt archival | Lead (move prompt files) |
  | 8. Completion report | Lead (synthesize teammate reports) |

- [ ] Define phase execution protocol:
  1. Lead reads plan, creates team, creates tasks per phase via TaskCreate
  2. Lead assigns Phase N to Implementer via message
  3. Implementer implements, runs build/lint/test, messages Reviewer when ready
  4. Reviewer reviews, sends PASS or NEEDS_CHANGES with fix list to Implementer
  5. Fix loop until Reviewer sends PASS to Lead
  6. Lead updates task status, confirms with user, assigns Phase N+1
  7. Repeat until all phases complete
- [ ] Define file ownership: Implementer owns all source files during a phase. Reviewer is read-only. No concurrent writes
- [ ] Define crash recovery: Tasks persist via TaskList. On session resume, check task status, re-create team, re-spawn teammates, continue from last incomplete phase. New teammates read completed phase code for context
- [ ] Define user confirmation between phases (matching implement-plan's pattern)

**Exit Conditions**:
- [ ] Skill invocable via `/team-implement-plan [plan-path]`
- [ ] Team creates with 2-3 members based on plan size
- [ ] Implementer writes code directly and runs verification
- [ ] Reviewer catches basic issues (lint failures, missing tests) and fix loop works
- [ ] User confirmation occurs between phases
- [ ] Phase completion report generated per phase

---

### Phase 4: team-implement-plan-full (Large Team)

**Objective**: Build a full-team implementation system where each plan phase gets a dedicated teammate, plus a cross-phase Reviewer. Phases execute in dependency order with parallel execution where the dependency graph allows.

**Tasks**:
- [ ] Write `skills/team-implement-plan-full/SKILL.md` with frontmatter (`name: team-implement-plan-full`, `context: fork`, `argument-hint: "[plan-path]"`)
- [ ] Define team composition rules:
  - One **phase-N-impl** teammate per phase in the current wave
  - One **reviewer** shared across all phases (persistent for session lifetime)
  - Lead handles: user interaction, team lifecycle, task management, plan sync, completion reports
  - Wave size limit: max 4 concurrent implementers + 1 reviewer per wave. Plans with 5+ phases execute in waves
- [ ] Define dependency graph parsing:
  - Lead reads plan file and TaskList to extract phase dependencies
  - Build execution waves: Wave 1 = phases with no dependencies, Wave 2 = phases whose dependencies are all in Wave 1, etc.
  - If two phases in the same wave touch the same files, add synthetic dependency (move one to next wave)
  - Present dependency graph and wave plan to user before starting
- [ ] Define file ownership and conflict prevention:
  - Lead builds file ownership map from plan task descriptions before spawning
  - Each implementer receives their file scope in spawn prompt: "You own files: [list]. Do NOT modify files outside this scope"
  - Shared files (module registrations, route files, index files) are handled by Lead after all wave implementers complete
  - If file scope cannot be determined from plan, Lead asks user to clarify
- [ ] Define wave execution protocol:
  1. Lead creates team, spawns reviewer (immediately idle)
  2. Lead identifies Wave 1 phases, spawns implementers for each
  3. Each implementer executes their phase: implement code, run build/lint/test
  4. When implementer completes steps 1-2, messages reviewer: "Phase N ready for review"
  5. Reviewer reviews phases FIFO as they arrive. Sends PASS or NEEDS_CHANGES to specific implementer
  6. Fix loop: implementer fixes, re-verifies, re-requests review
  7. When ALL wave phases pass review, Lead confirms with user
  8. Lead shuts down wave implementers, spawns Wave 2 implementers
  9. Repeat until all waves complete
- [ ] Define quality pipeline distribution for full team:

  | Pipeline Step | Owner | Notes |
  |---|---|---|
  | 1. Implementation | phase-N-impl | Direct code writing within file scope |
  | 2. Verification-loop | phase-N-impl | Build/lint/test scoped to their phase |
  | 3. Integration testing | phase-N-impl | Tests within phase scope |
  | 4. Code review | reviewer | Cross-phase consistency + per-phase quality |
  | 5. ADR compliance | reviewer | Centralized ADR knowledge |
  | 6. Plan sync | Lead | Single writer to task status |
  | 7. Prompt archival | Lead | Single writer to prompt files |
  | 8. Completion report | Lead | Aggregates all phase reports per wave |

- [ ] Define cross-phase communication protocol:
  - Implementers message Lead (not each other) to report status and issues
  - Lead relays relevant information between implementers when a change affects another phase's scope
  - Reviewer messages specific implementers for fix requests
  - All progress tracked via TaskUpdate (visible to entire team)
- [ ] Define reviewer workflow:
  - Reviewer spawned at team creation, idles until first review request
  - Processes review requests FIFO
  - Applies code-review checklist + ADR compliance check
  - Sends structured result: PASS or NEEDS_CHANGES with specific file:line references
  - After reviewing 4-5 phases, Lead monitors for quality degradation. If reviewer becomes slow/unreliable, shut down and spawn replacement
- [ ] Define session crash recovery:
  - All progress tracked via TaskList (persists on disk)
  - On resume: Lead reads TaskList, identifies completed/in-progress/pending phases
  - Re-create team, re-spawn implementers for in-progress phases only
  - Reviewer re-spawned fresh (stateless — reviews based on current file state)
  - Completed phases are NOT re-executed
  - Lead presents recovery status to user before continuing
- [ ] Define teammate stability limits:
  - Each implementer handles exactly one phase then shuts down (prevents context degradation)
  - Reviewer may need replacement after 4-5 reviews
  - Lead monitors all teammates for responsiveness. Unresponsive teammate after 2 messages = spawn replacement
  - Document expected token costs: ~30-40K per implementer, ~40-50K for reviewer, ~20K for lead overhead
- [ ] Define idle cost mitigation:
  - Implementers for future waves are NOT spawned until their wave starts
  - Only active-wave implementers + reviewer exist at any time
  - Reviewer idles between reviews (acceptable — single teammate)

**Exit Conditions**:
- [ ] Skill invocable via `/team-implement-plan-full [plan-path]`
- [ ] Dependency graph correctly parsed and waves identified
- [ ] Independent phases execute in parallel within a wave
- [ ] Dependent phases wait for predecessor waves
- [ ] File ownership enforced (no cross-scope writes)
- [ ] Reviewer catches issues and fix loop works
- [ ] Wave transitions include user confirmation
- [ ] Crash recovery resumes from correct wave/phase state
- [ ] Completion report aggregates all phase results

---

### Phase 5: Documentation and Validation

**Objective**: Update project documentation with new skills, create workflow modes guide, document the design decision as an ADR, and run install.

**Tasks**:
- [ ] Update `README.md`: add new skills to tables (team-create-plan, team-implement-plan, team-implement-plan-full, workflow-guide), update workflow diagram, update directory structure
- [ ] Update `documentation/01-workflow-overview.md`: add "Three Workflow Modes" section showing solo/small-team/full-team paths
- [ ] Update `documentation/02-detailed-workflow.md`: add team implementation sections with pipeline distribution diagrams
- [ ] Create `docs/guides/workflow-modes.md`: comprehensive guide with decision matrix, token cost comparison, when-to-use guidance, examples
- [ ] Create ADR via `/adr`: document the design decision "Use direct-implementation teammates rather than subagent-spawning teammates for team implementation modes"
- [ ] Run `install.sh` to install all new skills
- [ ] Commit and push all changes

**Exit Conditions**:
- [ ] All documentation links resolve
- [ ] README reflects all new skills accurately
- [ ] workflow-modes guide covers all three modes with clear decision criteria
- [ ] ADR documents the direct-implementation teammate decision
- [ ] `install.sh` completes successfully with new skills listed
- [ ] All changes committed and pushed

## Dependencies

- Phase 1 must complete before Phases 2-4 (shared references)
- Phases 2, 3, 4 are independent of each other (can be built in any order)
- Phase 5 depends on all previous phases

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Direct-implementation teammates less effective than subagent orchestrators | MEDIUM | HIGH | Test team-implement-plan (Phase 3) on a real plan before building full team (Phase 4) |
| Token cost explosion for full team mode | HIGH | MEDIUM | Wave-based spawning limits concurrent teammates. Document expected costs clearly |
| File conflicts between parallel implementers | MEDIUM | HIGH | File ownership map + synthetic dependencies prevent concurrent writes |
| Reviewer bottleneck in full team mode | MEDIUM | MEDIUM | FIFO queue, reviewer replacement after 4-5 reviews |
| Session crash loses team state | LOW | HIGH | TaskList persistence on disk. Team recreatable from task state |
| Agent teams API changes (experimental) | MEDIUM | HIGH | Each team skill is a separate file. No modifications to existing skills. Easy to remove if API changes |
