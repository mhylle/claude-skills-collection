# Implementation Plan: Task Tools Skill Integration

## Overview

Integrate Claude Code's Task tools (TaskCreate, TaskUpdate, TaskList, TaskGet) into the plan workflow (create-plan, implement-plan, implement-phase) to separate specification from progress tracking. Plans become pure specification documents while Tasks handle all progress tracking with cross-session persistence and dependency management.

## Context

The current plan workflow uses markdown checkboxes (`- [ ]` / `- [x]`) for both task specification and progress tracking. This creates several problems:
- TodoWrite is session-only (no cross-session persistence)
- Checkboxes require parsing for resume logic
- No native dependency tracking between tasks
- Plans mix specification with status

Claude Code v2.1.16 introduced Task tools that provide persistent progress tracking, dependency management via `blocks`/`blockedBy`, and multi-agent coordination.

**Key files to modify**:
- `skills/implement-plan/references/plan-format.md` - Plan format specification
- `skills/create-plan/SKILL.md` - Plan creation workflow
- `skills/implement-plan/SKILL.md` - Plan execution orchestration
- `skills/implement-phase/SKILL.md` - Phase execution pipeline

## Design Decision

Use Task tools for progress tracking; plans become pure specification documents defining WHAT to build (phases, work items, exit conditions) while Tasks track progress (status, dependencies, ownership).

**ADR Reference**: [ADR-0001](../decisions/ADR-0001-separate-plan-spec-from-progress-tracking.md)

## Key Design Choices

| Choice | Decision | Rationale |
|--------|----------|-----------|
| Backward compatibility | Clean break | Simpler implementation, no dual-path logic |
| Task granularity | One per work item (Phase N.M) | Full visibility, parallel execution potential |
| Task list scope | Plan-scoped | Enables cross-session resume per plan |

## Implementation Phases

---

### Phase 1: Update Plan Format Reference ✅

**Status**: Complete (2026-01-23)

**Objective**: Define the new plan format without checkbox syntax, establishing the specification pattern that all skills will follow.

**Verification Approach**: Manual review confirms format changes are complete and consistent. The updated format serves as the specification for subsequent phases.

**Work Items**:
1. Remove checkbox syntax from Tasks section - replace with numbered "Work Items" list
2. Remove checkbox syntax from Exit Conditions - keep as specification bullets
3. Remove "Checkbox States" table (lines 186-194) - no longer applicable
4. Add "Progress Tracking" section explaining Task tools integration
5. Update all examples throughout the document to use new format
6. Add plan metadata field for task_list_id

**Exit Conditions**:

> Phase cannot proceed until ALL conditions pass.

Build Verification:
- Markdown renders correctly (no broken formatting)
- All example code blocks are valid markdown

Content Verification:
- No `- [ ]` checkbox syntax remains in Tasks/Work Items sections
- No `- [ ]` checkbox syntax remains in Exit Conditions sections
- "Checkbox States" table removed
- New "Progress Tracking" section present
- task_list_id field documented in metadata section

---

### Phase 2: Update create-plan Skill ✅

**Status**: Complete (2026-01-23)

**Objective**: Modify create-plan to output plans in the new format and bootstrap Tasks after writing the plan file.

**Verification Approach**: Create a test plan using the skill and verify it produces correct format and creates Tasks with proper dependencies.

**Work Items**:
1. Update Phase 6 plan output format - use numbered Work Items instead of checkboxes
2. Update exit condition output format - remove checkbox syntax
3. Add Phase 7: Bootstrap Tasks after plan is written
   - Parse work items from each phase
   - Call TaskCreate for each work item with subject "Phase N.M: [Work Item]"
   - Set description referencing plan path and phase
   - Set activeForm for spinner display
4. Set task dependencies using TaskUpdate with addBlockedBy
   - Work items within a phase are sequential (each blocked by previous)
   - First work item of phase N+1 blocked by last work item of phase N
5. Store task_list_id in plan file metadata section
6. Update completion message to include task count and list ID
7. Update Quality Checklist to remove checkbox references

**Exit Conditions**:

> Phase cannot proceed until ALL conditions pass.

Build Verification:
- Skill file is valid markdown
- No syntax errors in code blocks

Functional Verification:
- Invoking create-plan produces plan without checkbox syntax
- Tasks are created after plan is written (visible via TaskList)
- Task dependencies are set correctly (blocked tasks show in TaskList)
- Plan metadata includes task_list_id
- Completion message shows task count

---

### Phase 3: Update implement-plan Skill ✅

**Status**: Complete (2026-01-23)

**Objective**: Replace TodoWrite with Task-based progress tracking and implement Task-based resume logic.

**Verification Approach**: Test resume by creating a plan, partially executing it, and verifying the skill resumes from the correct point using Task status.

**Work Items**:
1. Remove TodoWrite usage (currently at lines 180-186)
2. Replace Step 4 "Create Progress Tracker" with Task-based approach:
   - Call TaskList to check for existing tasks
   - If tasks exist for plan: resume from first non-completed task
   - If no tasks: error - plan was not created with create-plan
3. Update phase execution loop:
   - Before phase: TaskUpdate(task_id, status: "in_progress")
   - After phase: TaskUpdate(task_id, status: "completed")
4. Update context passed to implement-phase - add task_id field
5. Update resume logic (lines 352-371) to use Task status instead of checkboxes
6. Update Progress Tracking table (lines 409-414) to reflect Task-based approach
7. Remove references to checkbox parsing throughout

**Exit Conditions**:

> Phase cannot proceed until ALL conditions pass.

Build Verification:
- Skill file is valid markdown
- No references to TodoWrite remain
- No checkbox parsing logic remains

Functional Verification:
- implement-plan uses TaskList to find resume point
- Task status updates to in_progress when phase starts
- Task status updates to completed when phase finishes
- Context to implement-phase includes task_id
- Resume works correctly after session restart

---

### Phase 4: Update implement-phase Skill ✅

**Status**: Complete (2026-01-23)

**Objective**: Accept task_id in input context, simplify Plan Sync to remove checkbox updates, and update PHASE_RESULT to include task information.

**Verification Approach**: Execute a phase and verify Plan Sync no longer modifies checkboxes, exit conditions are verified against specification, and PHASE_RESULT includes task info.

**Work Items**:
1. Update "Input Context" section (lines 155-164) to include task_id
2. Simplify Step 6 (Plan Synchronization) at lines 677-700:
   - Remove checkbox update logic (lines 683-684)
   - Keep: verify exit conditions passed (read from plan spec)
   - Keep: add ADR references if new ADRs created
   - Keep: note deviations from plan
   - Add: verify work items completed for this phase
3. Update exit condition verification (Step 2) to read conditions as specification, not checkboxes
4. Update PHASE_RESULT structure (lines 873-917) to include:
   - task_id field
   - task_status field (the status that was set)
5. Update Step 8 completion report to show task info instead of checkbox counts
6. Remove references to "marking checkboxes" throughout

**Exit Conditions**:

> Phase cannot proceed until ALL conditions pass.

Build Verification:
- Skill file is valid markdown
- No checkbox update logic remains in Step 6

Functional Verification:
- implement-phase accepts task_id in context
- Plan Sync does not modify plan file checkboxes
- Exit conditions verified as specification (not by checkbox state)
- PHASE_RESULT includes task_id and task_status
- Completion report shows task information

---

### Phase 5: Integration Testing ✅

**Status**: Complete (2026-01-23)

**Objective**: Verify the complete workflow works end-to-end: create plan, execute phases, interrupt and resume, confirm cross-session persistence.

**Verification Approach**: Manual end-to-end test following the test script below.

**Work Items**:
1. Create a simple test plan using create-plan skill
   - Verify plan format (no checkboxes in work items or exit conditions)
   - Verify Tasks created (TaskList shows Phase N.M tasks)
   - Verify dependencies set (blocked tasks visible)
2. Begin implementation with implement-plan
   - Verify first task marked in_progress
   - Complete first phase
   - Verify task marked completed
3. Interrupt mid-plan (simulate session end)
4. Resume with implement-plan on same plan
   - Verify resumes from correct phase (first non-completed task)
   - Verify does not re-execute completed phases
5. Complete remaining phases
   - Verify all tasks marked completed
   - Verify plan file unchanged (no checkbox modifications)
6. Verify cross-session persistence
   - Start new session
   - Run TaskList with same task_list_id
   - Confirm task statuses persisted

**Exit Conditions**:

> Phase cannot proceed until ALL conditions pass.

Integration Verification:
- End-to-end workflow completes without errors
- Resume works correctly after interruption
- Cross-session persistence confirmed
- Plan files remain pure specification (no status in file)

Documentation Verification:
- All skill files updated consistently
- plan-format.md matches actual output
- No conflicting documentation remains

---

## Dependencies

- Claude Code v2.1.16+ (Task tools availability)
- Existing skills must be functional before modification

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Task tool API changes | Low | High | Abstract task operations, monitor Claude Code releases |
| Task count limits hit | Low | Medium | Document limits, provide guidance on task granularity |
| Plan-Task desync after manual plan edit | Medium | Medium | Document that manual edits require task refresh |
| Missing task_id in implement-phase context | Low | High | Validate task_id presence, clear error message |

## File Change Summary

| File | Lines Changed (Est.) | Change Type |
|------|---------------------|-------------|
| `skills/implement-plan/references/plan-format.md` | ~100 | Format update |
| `skills/create-plan/SKILL.md` | ~80 | Add Phase 7, format updates |
| `skills/implement-plan/SKILL.md` | ~60 | Replace TodoWrite, update resume |
| `skills/implement-phase/SKILL.md` | ~50 | Simplify Plan Sync, add task_id |

## Progress Tracking

Progress is tracked via Claude Code's Task tools, not checkboxes.
- Tasks created by create-plan skill after plan approval
- Status visible via TaskList or `/tasks` command
- Resume works across sessions automatically

**Task List ID**: (to be set when tasks are created)
