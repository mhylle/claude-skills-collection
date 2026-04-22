# Boundary rules — when to suggest, when not to

The full rule set used by the heuristic. The SKILL.md has the summary; these are the exact conditions.

---

## Suggest compaction

### After completing a phase/task (strong signal)

Task completion is the clearest natural boundary.

```yaml
trigger:
  event: TaskUpdate
  parameters:
    status: completed
  conditions:
    - tool_count.significant >= threshold * 0.6
    - time_since_last_suggestion > 10min
```

### After a major implementation milestone (strong signal)

Commits and successful builds indicate stable points.

```yaml
trigger:
  event: Bash
  command_pattern: "git commit"
  result: success
  conditions:
    - tool_count.significant >= threshold * 0.7
    - not pending_tasks_in_current_feature
```

### Before starting a new feature (medium signal)

Beginning new work is a good reset point.

```yaml
trigger:
  event: TaskUpdate
  parameters:
    status: in_progress
  conditions:
    - previous_task_completed
    - feature_boundary_detected    # see definition below
    - tool_count.significant >= threshold * 0.5
```

**`feature_boundary_detected`** is true when the new task's `subject` or `description` clearly belongs to a different feature area than the most recently completed task. Heuristics: task subjects don't share any non-stopword noun in common, or the new task is marked with a different `feature_tag` / parent-epic than the previous one. If the caller can't distinguish features, fall back to treating every task-completion → new-task transition as `false` — this trigger just won't fire, and the stronger task-completion trigger above still applies.

### Context about to overflow (warning signal)

Proactive suggestion before the auto-compact threshold fires mid-task.

```yaml
trigger:
  event: any
  conditions:
    - estimated_context_usage > 0.8
    - tool_count.significant >= threshold * 0.9
  priority: high
```

---

## Do NOT suggest compaction

### During active debugging

```yaml
suppress_when:
  - recent_error_count > 0
  - last_tool_was: [Read, Grep, Glob]   # investigating
  - pattern_detected: "debug_cycle"
  - task_subject_contains: ["debug", "fix", "investigate"]
```

**Why:** debugging requires mental models built across many interactions. Compacting mid-debug loses the investigation trail.

### During active implementation

```yaml
suppress_when:
  - uncommitted_changes: true
  - last_tools_sequence: [Edit, Edit, Edit]   # active coding
  - time_since_last_edit < 5min
  - test_failures_unresolved: true
```

**Why:** mid-implementation compaction risks losing the reasoning behind partial changes.

### Other suppressions

```yaml
suppress_when:
  - last_suggestion < 10min_ago         # avoid nagging
  - user_deferred_recently: true        # respect user choice
  - critical_operation_in_progress: true
  - rollback_or_revert_active: true
```

---

## Accept / defer heuristics (for users)

**Accept when:**
- You've just completed a logical unit of work.
- The suggestion aligns with a natural pause in your workflow.
- You're about to context-switch to a different feature/area.
- You've made a commit and tests are passing.
- You notice responses are getting slower or less accurate.

**Defer when:**
- You're in the middle of tracking down a bug.
- You have uncommitted changes you're still iterating on.
- You're about to run a critical command that needs context.
- You're iterating on a specific piece of code.
- The current task is almost complete (< 5 min remaining).

---

## Preserving context before compact

Before accepting a suggestion, check:

1. **Uncommitted work:** `git status && git diff --stat`
2. **Active tasks:** TaskList
3. **Decision points worth capturing:**
   - Architectural decisions made
   - Reasoning behind non-obvious choices
   - Known issues or TODOs discovered
4. **Current position:**
   - File/function currently being worked on
   - Next step
   - Any blockers or dependencies

The skill auto-invokes `context-saver` when `integrate_context_saver: true` (default), which produces a handoff doc before compaction. See `context-saver/SKILL.md` for the output format.
