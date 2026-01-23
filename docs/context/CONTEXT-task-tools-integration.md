# Context: Task Tools Integration into Plan Workflow

> Saved: 2026-01-23T17:30:00Z
> Session: Task tools research and skill integration brainstorm
> Status: ready-for-planning

## Trajectory

**Goal**: Integrate Claude Code's new Task tools (v2.1.16) into our plan workflow, eliminating duplication between plan checkboxes and Task-based progress tracking.

**Success Criteria**:
- create-plan automatically bootstraps Tasks for all phases/sub-steps
- implement-plan uses TaskList/TaskUpdate instead of TodoWrite
- implement-phase simplified (no checkbox updates in Plan Sync)
- Plan files become pure specifications (no `[ ]` checkboxes)
- Resume works across sessions via Task status
- Backward compatibility for existing checkbox-based plans

**Current Phase**: ready-for-planning (brainstorm complete, need implementation plan)

## Problem Statement

Claude Code v2.1.16 introduced persistent Task tools (TaskCreate, TaskUpdate, TaskList, TaskGet) that provide cross-session progress tracking with dependency management. Our current workflow uses TodoWrite (session-only) and plan file checkboxes, creating duplication and losing state on restart. The goal is to use Claude Code's native Task system maximally while keeping plans as clean specification documents.

## Key Documents Created

| Document | Purpose | Location |
|----------|---------|----------|
| Task Tools Research | Confirmed Task behavior via testing | `docs/brainstorms/2026-01-23-task-tools-workflow-integration.md` |
| Skill Integration Brainstorm | Detailed changes for each skill | `docs/brainstorms/2026-01-23-task-tools-skill-integration.md` |

## Active Code Focus

### Primary Files to Modify

| File | Section | Change Required |
|------|---------|-----------------|
| `skills/create-plan/SKILL.md` | Phase 6 + new Phase 7 | Add Task bootstrapping after plan write |
| `skills/implement-plan/SKILL.md` | Lines 180-186 | Replace TodoWrite with TaskList/TaskUpdate |
| `skills/implement-phase/SKILL.md` | Step 6: Plan Sync | Remove checkbox updates, simplify |
| `skills/implement-plan/references/plan-format.md` | Task format, Exit conditions | Remove `[ ]` syntax |

### Task Tool Behavior (Confirmed)

```json
// Task JSON structure at ~/.claude/tasks/{uuid}/{id}.json
{
  "id": "1",
  "subject": "Phase 1.1: Write auth tests",
  "description": "See docs/plans/my-plan.md Phase 1",
  "activeForm": "Writing auth tests",
  "status": "pending | in_progress | completed",
  "blocks": ["task-ids-that-wait"],
  "blockedBy": ["task-ids-this-waits-for"]
}
```

**Key APIs**:
- `TaskCreate(subject, description, activeForm)` → Creates task
- `TaskUpdate(taskId, status, addBlockedBy)` → Updates task
- `TaskList()` → Lists all tasks with status
- `TaskGet(taskId)` → Gets full task details
- `CLAUDE_CODE_TASK_LIST_ID` env var → Share tasks across sessions

## Decisions Made

| Decision | Rationale | Alternatives Rejected |
|----------|-----------|----------------------|
| Plans = spec only (no checkboxes) | Eliminates duplication, cleaner docs | Keep checkboxes as backup (added complexity) |
| Sub-step granularity (Phase N.M) | Full visibility, enables parallelization | Phase-level only (loses sub-step progress) |
| Exit conditions stay in plan | They're verification criteria, not work items | Make them Tasks too (wrong abstraction) |
| create-plan bootstraps Tasks automatically | Tasks ready immediately after planning | User prompt to create (extra friction) |
| Use current session's task list | Only feasible option currently | Named task lists (not possible mid-session) |
| Backward compat via checkbox fallback | Support existing plans | Require migration (breaks existing plans) |

## User Requirements

> "we do not want duplicates, so lets tasks handle tracking"
> "a phase has multiple substeps -> we need a way to reflect this"
> "we want to keep exit conditions in the plan document"
> "create plan should also bootstrap the tasks"
> "we want a hybrid where we create tasks in create-plan but allow implement-plan to also create new tasks"
> "use as much of the functionality in claude code as possible, without duplicating functionality"

## Approaches Taken

### Succeeded
- Task tools research: Confirmed persistence, dependencies, cross-session sharing
- Brainstorm methodology: Six Hats + SCAMPER + Premortem identified risks
- Codebase analysis: Found exact TodoWrite usage at implement-plan:180-186

### In Progress
- Implementation planning: Ready for create-plan skill

## Next Steps

1. **Start new session** with: `Read docs/brainstorms/2026-01-23-task-tools-skill-integration.md and create implementation plan`
2. **Phase 1**: Update `plan-format.md` - remove checkbox syntax, add Task notes
3. **Phase 2**: Update `create-plan/SKILL.md` - add Phase 7: Bootstrap Tasks
4. **Phase 3**: Update `implement-plan/SKILL.md` - TaskList/TaskUpdate instead of TodoWrite
5. **Phase 4**: Update `implement-phase/SKILL.md` - simplify Plan Sync
6. **Phase 5**: Integration test - create plan, verify tasks, implement, test resume

## Session Notes

- Task tools are very new (v2.1.16, January 22, 2026) - documentation is sparse
- Tested Task tools directly in this session - confirmed JSON structure and persistence
- The implement-phase skill was recently updated to 8 steps (added Automated Integration Testing)
- Two brainstorm documents capture different aspects:
  - `task-tools-workflow-integration.md`: Task tool research and confirmed behavior
  - `task-tools-skill-integration.md`: How to modify each skill (the main planning input)

---
*Resume command*: `Read docs/brainstorms/2026-01-23-task-tools-skill-integration.md and create an implementation plan for integrating Task tools into the plan workflow. Also reference docs/brainstorms/2026-01-23-task-tools-workflow-integration.md for Task tool API details.`
