# Brainstorm: Task Tools Workflow Integration

**Date**: 2026-01-23
**Status**: Needs More Exploration (awaiting documentation)

## Executive Summary

Claude Code v2.1.16 (January 22, 2026) introduced a new task management system with dependency tracking. This analysis explores how to integrate these new Task tools (TaskCreate, TaskUpdate, TaskList, TaskGet) with our existing plan workflow, reducing redundancy by separating specification (plans) from execution tracking (tasks).

## Idea Evolution

### Original Concept

Evaluate overlap between Claude Code's new Task tools and our plan workflow (create-plan, implement-plan, implement-phase) to determine what to keep, change, and remove.

### Refined Understanding

The new Task tools provide:
- Persistent task tracking (assumed - across sessions)
- Dependency management (blocks/blockedBy)
- Ownership tracking (owner field)
- Status progression (pending → in_progress → completed)

Our plan workflow currently conflates two concerns:
1. **Specification** - What to build, how to verify
2. **Progress tracking** - What's done, what's next

The Task tools can handle #2, allowing plans to focus purely on #1.

### Key Clarifications Made

- Task tools are brand new (v2.1.16, released January 22, 2026)
- Documentation is not yet available
- Tool descriptions suggest filesystem persistence but this is unconfirmed
- Dependency tracking via blocks/blockedBy aligns with our phase ordering needs

## Analysis Results

### Strengths (Yellow Hat)

- **Single source of truth for progress** - Tasks handle all status tracking
- **Cross-session persistence** - No more losing TodoWrite state on restart
- **Native dependency management** - blocks/blockedBy replaces implicit phase ordering
- **Teammate support** - owner field enables delegation patterns
- **Reduced plan complexity** - Plans become pure specification documents

### Risks & Concerns (Black Hat + Premortem)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Documentation unavailable | High | Medium | Wait for docs before implementing |
| Persistence behavior differs from assumption | Medium | High | Test thoroughly before adopting |
| Task limits (count, metadata size) | Low | Medium | Design for reasonable limits |
| Task ID format not predictable | Medium | Low | Use metadata for plan linkage |
| Breaking change in future versions | Low | High | Abstract task usage behind skill layer |

### Gaps Identified

- [ ] **Task storage location** - Need to confirm where tasks persist
- [ ] **Task ID format** - Can we use meaningful IDs or are they auto-generated?
- [ ] **Cross-session behavior** - Verify tasks survive session restart
- [ ] **Team visibility** - Do spawned agents see the same task list?
- [ ] **Task limits** - Max count, metadata size, description length

### Enhancement Opportunities (SCAMPER)

- **Substitute**: Replace TodoWrite with TaskCreate/TaskUpdate throughout
- **Combine**: Merge progress tracking into Task system, keep specs in plans
- **Adapt**: Use blocks/blockedBy for phase dependencies
- **Modify**: Simplify plan format by removing checkbox syntax
- **Put to other use**: Use metadata field to link tasks to plan files/phases
- **Eliminate**: Remove redundant checkbox tracking in plan sync step
- **Reverse**: Invert relationship - plans reference tasks, not contain them

### Premortem Findings

- **Failure mode**: We redesign workflow, then docs reveal tasks don't persist → **Prevention**: Wait for documentation confirmation
- **Failure mode**: Task system changes in v2.2, breaking our integration → **Prevention**: Abstract task usage, don't depend on internal details
- **Failure mode**: Tasks can't express our exit condition complexity → **Prevention**: Keep exit conditions in plans, tasks just track completion

## Structured Concept

### Component 1: Plan Files (Specification Only)

**Purpose**: Define what to build, how to verify, design decisions
**Scope**:
- Phase structure and objectives
- Verification approaches
- Exit conditions (build, runtime, functional)
- ADR references

**Changes**:
- Remove `[ ]` / `[x]` checkbox syntax
- Remove task lists within phases
- Keep as pure specification documents

### Component 2: Task Tools (Progress Tracking)

**Purpose**: Track execution progress across sessions
**Scope**:
- Phase-level progress (one task per phase)
- Dependencies between phases
- Ownership for delegation
- Metadata linking to plan file

**Usage Pattern**:
```
implement-plan:
1. Read plan file
2. TaskCreate for each phase (if not exists)
3. Set dependencies via TaskUpdate (blockedBy)
4. For each phase:
   - TaskUpdate: status → in_progress
   - Delegate to implement-phase
   - TaskUpdate: status → completed
```

### Component 3: Modified implement-plan Skill

**Purpose**: Orchestrate plan execution using Task tools
**Changes**:
- Replace TodoWrite with TaskCreate/TaskUpdate
- Use TaskList to check/resume progress
- Link tasks to phases via metadata

### Component 4: Modified implement-phase Skill

**Purpose**: Execute single phase, report via Task status
**Changes**:
- Remove Step 6 (Plan Sync) checkbox updates
- Keep exit condition verification (from plan file)
- Update Task status on completion

## Research Findings

### External Best Practices

- Claude Code's TodoWrite was session-only, causing workflow disruption ([GitHub Issue #2954](https://github.com/anthropics/claude-code/issues/2954))
- Community built workarounds: plan.md files, Beads CLI, CLEO, Continuous Claude
- Anthropic responded with new task management in v2.1.16

### Anti-Patterns to Avoid

- Don't duplicate progress tracking (Tasks AND plan checkboxes)
- Don't assume implementation details before docs available
- Don't tightly couple to task internals that may change

### Codebase Context

Relevant files to modify:
- `skills/implement-plan/SKILL.md` - Main orchestration skill
- `skills/implement-phase/SKILL.md` - Phase execution skill
- `skills/create-plan/SKILL.md` - Plan creation template
- `skills/implement-plan/references/plan-format.md` - Plan format reference

Current TodoWrite usage in implement-plan (line 183):
```markdown
### 4. Create Progress Tracker

TodoWrite: Track plan-level progress
- [ ] Phase 1: [Phase Name]
- [ ] Phase 2: [Phase Name]
- [ ] Phase N: [Phase Name]
- [ ] Final verification
```

## Architectural Decisions

### Pending Decisions (not yet documented)

- **Separation of concerns**: Plans for spec, Tasks for tracking
- **Dependency model**: Use blocks/blockedBy for phase ordering
- **Metadata linkage**: Store plan path and phase number in task metadata

ADRs will be created once documentation confirms Task tool behavior.

## Recommended Next Steps

1. **Wait for documentation** - Official docs should clarify persistence and usage
2. **Test persistence** - Create task, close session, verify it persists
3. **Create ADR** - Document decision to separate spec from tracking
4. **Update skills** - Modify implement-plan, implement-phase, create-plan
5. **Update plan-format.md** - Remove checkbox patterns from reference

## Ready for Create-Plan

**No** - Awaiting documentation to confirm:
- Task persistence behavior
- Task storage location
- Task ID format and limits

### Suggested Plan Scope (Once Ready)

- Primary deliverables: Updated skill files with Task integration
- Key phases:
  1. Confirm Task behavior via testing
  2. Update plan-format.md (remove checkboxes)
  3. Update create-plan (new template)
  4. Update implement-plan (TaskCreate/TaskUpdate)
  5. Update implement-phase (remove plan sync checkboxes)
- Critical success factors: Tasks must persist across sessions

## Sources

- [Claude Code v2.1.16 Release](https://github.com/anthropics/claude-code/releases/tag/v2.1.16)
- [Piebald-AI System Prompts](https://github.com/Piebald-AI/claude-code-system-prompts)
- [Claude Code Changelog](https://claudelog.com/claude-code-changelog/)
- [Context persistence issue #2954](https://github.com/anthropics/claude-code/issues/2954)
