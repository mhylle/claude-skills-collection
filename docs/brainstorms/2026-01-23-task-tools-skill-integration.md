# Brainstorm: Task Tools Skill Integration

**Date**: 2026-01-23
**Status**: Ready for Planning

## Executive Summary

This brainstorm defines how to integrate Claude Code's new Task tools (TaskCreate, TaskUpdate, TaskList, TaskGet) into our plan workflow (create-plan, implement-plan, implement-phase). The core principle is **separation of concerns**: plans become pure specification documents while Tasks handle all progress tracking. This eliminates duplication, enables cross-session persistence, and unlocks dependency-based execution ordering.

## Idea Evolution

### Original Concept

Evaluate overlap between Claude Code's new Task tools (v2.1.16) and our plan workflow to determine what to keep, change, and remove. Goal: use Claude Code functionality maximally without duplicating progress tracking.

### Refined Understanding

Through Socratic exploration, we established:

1. **Plans = Specification** - Define what to build, exit conditions, verification approaches
2. **Tasks = Progress Tracking** - Track completion status, dependencies, ownership
3. **Skills = Orchestration** - The 8-step pipeline, quality gates, fix loops

The key insight: checkboxes in plans (`- [ ]`) duplicate what Tasks now provide natively. By removing checkboxes and using Tasks, we get persistence, dependencies, and multi-agent coordination for free.

### Key Clarifications Made

- **Task granularity**: Sub-step level (Phase 1.1, 1.2, etc.) for full visibility
- **Exit conditions**: Remain in plan as specification (not Tasks)
- **Task creation**: create-plan bootstraps Tasks automatically after writing plan
- **Task modification**: implement-plan can add/modify Tasks during execution
- **Task list selection**: Use current session's task list (Option A) for now

## Analysis Results

### Strengths (Yellow Hat)

| Strength | Evidence |
|----------|----------|
| **Cross-session persistence** | Tasks stored at `~/.claude/tasks/{uuid}/` survive restarts |
| **Native dependency management** | `blocks`/`blockedBy` enables proper execution ordering |
| **Multi-agent coordination** | Shared task list via `CLAUDE_CODE_TASK_LIST_ID` |
| **Cleaner plan documents** | Removing checkboxes makes plans pure specifications |
| **Reliable resume** | Task status is authoritative, no checkbox parsing needed |
| **Parallel execution** | Independent sub-steps can run concurrently |

### Risks & Concerns (Black Hat + Premortem)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Task count explosion (100+ tasks) | Medium | Medium | Guidance: max 10-15 tasks per phase |
| Plan-Task desync after plan edit | Medium | High | Add "refresh tasks from plan" capability |
| Existing plans break (have checkboxes) | High | Medium | Backward compat: fallback to checkbox resume |
| Task list ID confusion | Medium | Low | Document task list ID in plan file |
| implement-phase missing task_id | Low | High | Always pass task_id in context |

### Gaps Identified (Updated)

- [x] **Task persistence** - CONFIRMED: Filesystem at `~/.claude/tasks/`
- [x] **Dependency tracking** - CONFIRMED: `blocks`/`blockedBy` working
- [x] **Cross-session sharing** - CONFIRMED: `CLAUDE_CODE_TASK_LIST_ID` env var
- [ ] **Task limits** - Unknown: max count, description length
- [ ] **Programmatic task list selection** - Cannot change task list mid-session

### Enhancement Opportunities (SCAMPER)

- **Substitute**: TodoWrite → TaskCreate/TaskUpdate throughout all skills
- **Combine**: Task metadata + plan reference = linked tracking system
- **Adapt**: DAG patterns from Airflow, dual-ledger from Magentic-One
- **Modify**: Amplify dependency tracking, reduce plan file complexity
- **Put to other use**: Tasks could track non-plan work (ad-hoc requests)
- **Eliminate**: Plan file checkboxes, Plan Sync checkbox updates
- **Reverse**: Plan references Tasks (via metadata) instead of embedding status

### Premortem Findings

- **Failure mode**: Task explosion makes TaskList unreadable → **Prevention**: Granularity guidelines, phase grouping in subject
- **Failure mode**: User edits plan, Tasks become stale → **Prevention**: "Refresh tasks" command, or warn on plan modification
- **Failure mode**: Resume picks wrong phase due to task ordering → **Prevention**: Use metadata.phase_number for ordering, not task ID
- **Failure mode**: implement-phase updates wrong task → **Prevention**: Always pass explicit task_id in context

## Structured Concept

### Component 1: create-plan Skill

**Purpose**: Create implementation plans AND bootstrap Tasks for tracking
**Current Scope**: Research, design, write plan document
**New Scope**: Research, design, write plan document, **create Tasks**

**Changes Required**:

1. **Plan Format** - Remove checkbox syntax:
   ```markdown
   # Current
   **Tasks**:
   - [ ] Write tests
   - [ ] Implement service

   # New
   **Work Items**:
   1. Write tests: `auth.service.spec.ts`
   2. Implement: `auth.service.ts`
   ```

2. **Exit Conditions** - Remove checkboxes, keep as spec:
   ```markdown
   # Current
   **Exit Conditions**:
   - [ ] `npm run build` succeeds

   # New
   **Exit Conditions**:
   - Build: `npm run build` succeeds
   - Tests: `npm test` passes
   ```

3. **New Phase 7: Bootstrap Tasks**:
   ```
   After writing plan:
   1. For each phase:
      For each work item:
        TaskCreate(
          subject: "Phase {N}.{M}: {Work Item}",
          description: "See {plan_path} Phase {N}\n\n{work_item_details}",
          activeForm: "{Present tense action}"
        )
   2. Set dependencies:
      TaskUpdate(taskId, addBlockedBy: [previous_task_ids])
   3. Report to user:
      "Plan written to {path}
       Created {count} tasks with dependencies.
       Task list ID: {uuid}
       Run /implement-plan to begin execution."
   ```

**Key Decisions**:
- Automatic Task creation (no user prompt)
- Sub-step granularity (Phase N.M format)
- Sequential dependencies within phase, parallel across independent work items

### Component 2: implement-plan Skill

**Purpose**: Orchestrate plan execution using Tasks for progress
**Current Scope**: Read plan, TodoWrite tracking, delegate to implement-phase
**New Scope**: Read plan, **Task-based tracking**, delegate to implement-phase

**Changes Required**:

1. **Step 4: Progress Tracker** - Replace TodoWrite:
   ```markdown
   # Current (SKILL.md:180-186)
   TodoWrite: Track plan-level progress
   - [ ] Phase 1: [Phase Name]

   # New
   TaskList: Check for existing tasks
   - If tasks exist for this plan: Resume from first non-completed
   - If no tasks: Error - run create-plan first (or create tasks now)
   ```

2. **Resume Logic** - Task-based instead of checkbox-based:
   ```
   1. TaskList() to get all tasks
   2. Filter by metadata.plan_path matching current plan
   3. Find first task with status != "completed"
   4. Resume from that phase/sub-step
   ```

3. **Phase Execution Loop**:
   ```
   For each phase:
     1. TaskUpdate(taskId, status: "in_progress")
     2. Announce phase to user
     3. Skill(implement-phase, context: {plan, phase, prompt, task_id})
     4. Receive PHASE_RESULT
     5. TaskUpdate(taskId, status: "completed")  # or leave in_progress if blocked
     6. Present results, wait for user confirmation
   ```

4. **Context to implement-phase** - Add task_id:
   ```
   Context:
   - Plan: {plan_path}
   - Phase: {N} ({Phase Name})
   - Prompt: {prompt_path or None}
   - Task ID: {task_id}  # NEW
   - Previous Phase Status: Complete
   ```

5. **Progress Tracking Table Update**:
   ```markdown
   | Method | Scope | Purpose |
   |--------|-------|---------|
   | Task Tools | Persistent | Track progress and dependencies |
   | Plan File | Specification | Define phases, exit conditions |
   | Status Updates | User | Communicate current state |
   ```

**Key Decisions**:
- Tasks are authoritative for progress (not plan checkboxes)
- Can create additional tasks during execution if needed
- Backward compatibility: fallback to checkbox resume if no tasks found

### Component 3: implement-phase Skill

**Purpose**: Execute single phase with quality gates
**Current Scope**: 8-step pipeline including Plan Sync (checkbox updates)
**New Scope**: 8-step pipeline, **Plan Sync simplified** (no checkbox updates)

**Changes Required**:

1. **Input Context** - Accept task_id:
   ```
   When invoked, this skill expects:
   - Plan Path: [path to plan file]
   - Phase: [number or name]
   - Prompt Path: [optional]
   - Task ID: [task_id for this phase]  # NEW
   - Changed Files: [optional]
   ```

2. **Step 6: Plan Synchronization** - Simplify:
   ```markdown
   # Current
   1. Mark completed tasks with `[x]`
   2. Update exit condition checkboxes

   # New
   1. Verify exit conditions passed (read from plan spec)
   2. Add ADR references if new ADRs created
   3. Note deviations from plan (append to notes section)
   4. DO NOT update checkboxes (Tasks track completion)
   ```

3. **Return Value** - Include task info:
   ```yaml
   PHASE_RESULT:
     phase_number: 2
     phase_name: "Authentication Service"
     status: COMPLETE | FAILED | BLOCKED
     task_id: "5"  # NEW
     task_status: "completed"  # NEW
     steps:
       implementation: PASS
       exit_conditions: PASS
       code_review: PASS
       adr_compliance: PASS
       plan_sync: PASS
     ready_for_next: true
   ```

**Key Decisions**:
- Plan file remains specification (no status updates)
- Task status updated by implement-plan (not implement-phase)
- Exit conditions verified against plan spec, not checkboxes

### Component 4: Plan Format Reference

**Purpose**: Define standard plan document structure
**Location**: `skills/implement-plan/references/plan-format.md`

**Changes Required**:

1. **Remove checkpoint states table** (no more `[ ]` / `[x]`)
2. **Update task format**:
   ```markdown
   # Current
   ### Tasks (tests first, then implementation)
   - [ ] Write tests: `file.spec.ts`
   - [ ] Implement: `file.ts`

   # New
   ### Work Items (tests first, then implementation)
   1. Write tests: `file.spec.ts` covering [scenarios]
   2. Implement: `file.ts` to make tests pass
   3. Verify: `npm test -- file` passes
   ```

3. **Update exit condition format**:
   ```markdown
   # Current
   **Exit Conditions**:
   - [ ] `npm run build` succeeds
   - [ ] `npm test` passes

   # New
   **Exit Conditions**:
   > Phase cannot proceed until ALL conditions pass.

   Build Verification:
   - `npm run build` succeeds
   - `npm run lint` passes

   Functional Verification:
   - `npm test` passes
   - API responds on expected endpoint
   ```

4. **Add Task integration note**:
   ```markdown
   ## Progress Tracking

   Progress is tracked via Claude Code's Task tools, not checkboxes.
   - Tasks created by create-plan skill
   - Status visible via `/tasks` command or TaskList
   - Resume works across sessions automatically
   ```

## Research Findings

### External Best Practices

From web research on task management in planning workflows:

| Pattern | Source | Application |
|---------|--------|-------------|
| **Dual-ledger architecture** | Microsoft Magentic-One | Separate spec (Task Ledger) from progress (Progress Ledger) |
| **Plan-and-execute pattern** | LangChain/LangGraph | Planner generates spec, executor tracks progress |
| **DAG dependency management** | Apache Airflow | Use `blockedBy` for execution ordering |
| **Optimal task size** | Project management research | 30-90 minutes per task (sub-step level) |
| **Spec vs backlog separation** | Agile methodology | Plans define WHAT, tasks track progress toward goals |

### Anti-Patterns to Avoid

- **Treating task backlog as specification** - Tasks track progress, not define work
- **Exhaustive upfront task decomposition** - Allow task creation during execution
- **Mixing spec and status in same document** - Keep plan clean, use Tasks for status
- **Specification drift into task descriptions** - Task description references plan, doesn't duplicate

### Codebase Context

Files to modify:
- `skills/create-plan/SKILL.md` - Add Phase 7: Bootstrap Tasks
- `skills/implement-plan/SKILL.md` - Replace TodoWrite, add resume logic
- `skills/implement-phase/SKILL.md` - Simplify Plan Sync, update return value
- `skills/implement-plan/references/plan-format.md` - Remove checkboxes

Current TodoWrite usage (`implement-plan/SKILL.md:180-186`):
```markdown
### 4. Create Progress Tracker

TodoWrite: Track plan-level progress
- [ ] Phase 1: [Phase Name]
- [ ] Phase 2: [Phase Name]
```

## Architectural Decisions

### Documented (Proposed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Separation of concerns | Plans for spec, Tasks for tracking | Eliminates duplication, enables persistence |
| Task granularity | Sub-step level (Phase N.M) | Full visibility, parallel execution |
| Exit conditions location | Plan file (as spec) | They're verification criteria, not work items |
| Task creation timing | Automatic in create-plan | Tasks ready immediately after planning |
| Backward compatibility | Fallback to checkbox resume | Support existing plans |

### Pending ADR Creation

Once implementation begins, create ADR for:
- **ADR: Separation of Plan Specification and Progress Tracking**
  - Context: Current plans mix spec and status via checkboxes
  - Decision: Plans become pure specification, Tasks handle tracking
  - Consequences: Cleaner plans, persistent progress, dependency support

## Recommended Next Steps

1. **Create implementation plan** - Use create-plan skill to detail the changes
2. **Update plan-format.md first** - Define new format before updating skills
3. **Update create-plan skill** - Add Phase 7: Bootstrap Tasks
4. **Update implement-plan skill** - Replace TodoWrite with Task tools
5. **Update implement-phase skill** - Simplify Plan Sync step
6. **Test end-to-end** - Create plan, verify tasks, implement, verify resume

## Ready for Create-Plan

**Yes** - The concept is well-defined and ready for implementation planning.

### Suggested Plan Scope

**Primary Deliverables**:
- Updated `plan-format.md` reference document
- Updated `create-plan` skill with Task bootstrapping
- Updated `implement-plan` skill with Task-based tracking
- Updated `implement-phase` skill with simplified Plan Sync
- Backward compatibility for existing plans

**Key Phases**:
1. Update plan-format.md (remove checkboxes, add Task notes)
2. Update create-plan (add Phase 7: Bootstrap Tasks)
3. Update implement-plan (TaskList/TaskUpdate instead of TodoWrite)
4. Update implement-phase (simplify Plan Sync, update return value)
5. Integration testing (create plan → implement → resume)

**Critical Success Factors**:
- Tasks created automatically by create-plan
- Resume works across sessions via Task status
- Plan files remain clean specifications
- Backward compatibility for existing checkbox-based plans

## Sources

### Research
- [Microsoft Magentic-One](https://www.microsoft.com/en-us/research/articles/magentic-one-a-generalist-multi-agent-system-for-solving-complex-tasks/) - Dual-ledger architecture
- [LangChain Plan-and-Execute](https://www.blog.langchain.com/planning-agents/) - Plan-execute pattern
- [Apache Airflow DAGs](https://www.astronomer.io/docs/learn/managing-dependencies) - Dependency management
- [Granularity in Project Management](https://www.meegle.com/blogs/granularity-in-project-management) - Task sizing

### Codebase
- `skills/create-plan/SKILL.md` - Current plan creation workflow
- `skills/implement-plan/SKILL.md` - Current TodoWrite usage at lines 180-186
- `skills/implement-phase/SKILL.md` - Current Plan Sync at Step 6
- `skills/implement-plan/references/plan-format.md` - Current plan format

### Prior Brainstorm
- `docs/brainstorms/2026-01-23-task-tools-workflow-integration.md` - Task tools research
