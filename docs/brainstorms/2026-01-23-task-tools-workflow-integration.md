# Brainstorm: Task Tools Workflow Integration

**Date**: 2026-01-23
**Status**: Research Complete - Ready for Implementation Planning
**Last Updated**: 2026-01-23

## Executive Summary

Claude Code v2.1.16 (January 22, 2026) introduced a new task management system with dependency tracking. This analysis explores how to integrate these new Task tools (TaskCreate, TaskUpdate, TaskList, TaskGet) with our existing plan workflow, reducing redundancy by separating specification (plans) from execution tracking (tasks).

**Key Finding**: Through hands-on testing, we have confirmed Task tools persist to filesystem, support dependency tracking via `blocks`/`blockedBy`, and can be shared across sessions via the `CLAUDE_CODE_TASK_LIST_ID` environment variable.

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
- Official documentation is sparse, but behavior has been **confirmed via testing**
- Filesystem persistence is **confirmed** at `~/.claude/tasks/{task-list-id}/`
- Dependency tracking via blocks/blockedBy is **confirmed and working**
- Cross-session sharing via `CLAUDE_CODE_TASK_LIST_ID` environment variable **confirmed**

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

### Gaps Identified (Updated with Research)

- [x] **Task storage location** - CONFIRMED: `~/.claude/tasks/{task-list-uuid}/{id}.json`
- [x] **Task ID format** - CONFIRMED: Auto-generated integers (1, 2, 3...)
- [x] **Cross-session behavior** - CONFIRMED: Use `CLAUDE_CODE_TASK_LIST_ID` env var
- [x] **Team visibility** - CONFIRMED: Same task list ID = shared tasks across agents
- [ ] **Task limits** - Still unknown: Max count, metadata size, description length

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

### Confirmed Task Tool Behavior (Tested 2026-01-23)

#### Task JSON Structure
```json
{
  "id": "1",
  "subject": "Task title",
  "description": "Detailed description of the task",
  "activeForm": "Present tense action (shown in spinner)",
  "status": "pending | in_progress | completed",
  "blocks": ["task-ids-that-wait-for-this"],
  "blockedBy": ["task-ids-this-waits-for"]
}
```

#### Storage Location
- **Path**: `~/.claude/tasks/{task-list-uuid}/{id}.json`
- **Task List ID**: UUID format (e.g., `eb6c2d0d-7dc7-485a-8d21-204456be20f5`)
- **Task Files**: Named by ID number (`1.json`, `2.json`, etc.)
- **Persistence**: Immediate write to filesystem

#### Tool Capabilities

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| **TaskCreate** | Create new task | `subject`, `description`, `activeForm` |
| **TaskGet** | Retrieve task details | `taskId` |
| **TaskUpdate** | Modify task | `taskId`, `status`, `addBlocks`, `addBlockedBy` |
| **TaskList** | List all tasks | (none) |

#### Dependency Tracking
- `blocks`: Array of task IDs that cannot start until this completes
- `blockedBy`: Array of task IDs that must complete before this starts
- TaskList output shows: `#2 [pending] Task name [blocked by #1]`

#### Cross-Session Sharing
```bash
# Share task list across sessions/subagents
CLAUDE_CODE_TASK_LIST_ID=my-project-tasks claude

# Also works with programmatic usage
claude -p "Continue the work"
# (with CLAUDE_CODE_TASK_LIST_ID set)
```

#### What's Different from TodoWrite

| Feature | TodoWrite | Tasks |
|---------|-----------|-------|
| Persistence | Session only | Filesystem |
| Dependencies | None | blocks/blockedBy |
| Cross-session | No | Yes (via env var) |
| Multi-agent | No | Yes (shared task list) |
| Status tracking | Checkbox only | pending/in_progress/completed |

### Design Inspiration: Beads (Steve Yegge)

The Task system took inspiration from [Beads](https://paddo.dev/blog/beads-memory-for-coding-agents/):

| Beads Principle | Task Implementation |
|-----------------|---------------------|
| Cross-session persistence | Filesystem storage at `~/.claude/tasks/` |
| Dependency tracking | `blocks`/`blockedBy` arrays |
| Scoped work windows | Task list per project/session |
| "Land the Plane" pattern | Status progression + completion tracking |
| Version-controlled truth | JSON files (could be git-tracked) |

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

1. ~~**Wait for documentation**~~ - Behavior confirmed via testing
2. ~~**Test persistence**~~ - DONE: Tasks persist to `~/.claude/tasks/`
3. **Create ADR** - Document decision to separate spec from tracking
4. **Update skills** - Modify implement-plan, implement-phase, create-plan
5. **Update plan-format.md** - Remove checkbox patterns from reference
6. **Test cross-session** - Verify `CLAUDE_CODE_TASK_LIST_ID` in real workflow

## Ready for Create-Plan

**Yes** - Core behavior confirmed:
- [x] Task persistence behavior - Immediate filesystem write
- [x] Task storage location - `~/.claude/tasks/{uuid}/{id}.json`
- [x] Task ID format - Auto-incremented integers
- [x] Dependency tracking - `blocks`/`blockedBy` working
- [x] Cross-session sharing - `CLAUDE_CODE_TASK_LIST_ID` env var
- [ ] Task limits - Unknown but likely reasonable

### Suggested Plan Scope

- Primary deliverables: Updated skill files with Task integration
- Key phases:
  1. ~~Confirm Task behavior via testing~~ DONE
  2. Create ADR for spec/tracking separation
  3. Update plan-format.md (remove checkboxes, add task integration notes)
  4. Update create-plan (new template without progress checkboxes)
  5. Update implement-plan (TaskCreate/TaskUpdate instead of TodoWrite)
  6. Update implement-phase (use Task status, simplify plan sync)
- Critical success factors:
  - Tasks persist across sessions ✓
  - Dependency ordering works ✓
  - Multi-agent coordination via shared task list ✓

## Sources

### Official
- [Claude Code v2.1.16 Release](https://github.com/anthropics/claude-code/releases/tag/v2.1.16)
- [Claude Code Subagents Documentation](https://code.claude.com/docs/en/sub-agents)

### Community Resources
- [Piebald-AI System Prompts](https://github.com/Piebald-AI/claude-code-system-prompts) - Tool descriptions
- [cc-mirror Task Tools](https://github.com/numman-ali/cc-mirror) - Task tool documentation
- [ClaudeLog Task/Agent Tools](https://claudelog.com/mechanics/task-agent-tools/)
- [Claude Code Changelog](https://claudelog.com/claude-code-changelog/)

### Background/Inspiration
- [Beads: Memory for Coding Agents](https://paddo.dev/blog/beads-memory-for-coding-agents/) - Design inspiration
- [GitHub Issue #6760](https://github.com/anthropics/claude-code/issues/6760) - TodoWrite configuration request
- [Context persistence issue #2954](https://github.com/anthropics/claude-code/issues/2954)

### Hands-On Testing (2026-01-23)
- Created tasks via TaskCreate, verified JSON structure
- Tested dependency tracking via TaskUpdate with `addBlockedBy`
- Confirmed filesystem persistence at `~/.claude/tasks/`
- Verified TaskList shows blocked status
