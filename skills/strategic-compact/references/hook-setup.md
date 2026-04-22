# Hook setup and configuration

strategic-compact runs via a PreToolUse hook that tracks tool calls and evaluates whether the current moment is a good time to suggest compaction. This file covers the hook config, the state-tracking mechanism, and advanced configuration.

---

## PreToolUse hook

Create or update `.claude/hooks.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "name": "strategic-compact-monitor",
        "skill": "strategic-compact",
        "enabled": true,
        "priority": 10,
        "config": {
          "threshold": 50,
          "mode": "suggest",
          "integrate_context_saver": true,
          "suppress_during": [
            "debugging",
            "active_implementation",
            "rollback"
          ],
          "boundary_events": [
            "task_completion",
            "git_commit",
            "phase_transition",
            "feature_boundary"
          ]
        }
      }
    ]
  }
}
```

### Config options

| Option | Type | Default | Description |
|---|---|---|---|
| `threshold` | number | 50 | Significant tool calls before suggesting |
| `mode` | string | `"suggest"` | `"suggest"`, `"warn"`, or `"silent"` |
| `integrate_context_saver` | boolean | `true` | Auto-invoke context-saver before compacting |
| `suppress_during` | array | see above | Activity types to suppress during |
| `boundary_events` | array | see above | Events that count as boundaries |
| `min_interval` | number | 600 | Minimum seconds between suggestions |
| `dynamic_threshold` | boolean | `true` | Adjust threshold based on activity |

### Enable/disable

```bash
# Enable for a project
echo '{"skills": {"strategic-compact": {"enabled": true}}}' > .claude/settings.json

# Temporarily
/strategic-compact disable

# For a session — set enabled:false in the hook config
```

---

## State tracking

The hook maintains in-memory session state across tool calls:

```yaml
session_state:
  tool_counts:
    total: 0               # All tool calls
    significant: 0         # State-modifying or complex
    read_operations: 0     # Read, Glob, Grep
    write_operations: 0    # Write, Edit, Bash
    navigation: 0          # Dir changes, file searches

  boundaries:
    tasks_completed: 0     # TaskUpdate status=completed
    phases_completed: 0    # Major implementation phases
    commits_made: 0        # Successful git commits

  flags:
    active_debugging: false
    active_implementation: false
    last_error_count: 0

  timestamps:
    session_start: null
    last_boundary: null
    last_suggestion: null
```

### Tool weights

**Significant (count toward threshold):**
- `Edit` — file modifications
- `Write` — file creation/overwrite
- `Bash` — command execution (especially git, npm, build)
- `NotebookEdit` — Jupyter modifications
- `TaskUpdate` — task state changes

**Tracked but weighted lower:**
- `Read` — 0.5 weight
- `Glob` / `Grep` — 0.3 weight
- `WebFetch` / `WebSearch` — 0.5 weight

**Boundary markers:**
- `TaskUpdate` with `status: completed` — task boundary
- `Bash` with `git commit` — commit boundary
- Skill invocations for phase completion

### Update pseudocode

```python
def on_pre_tool_use(tool_name, parameters):
    state = get_session_state()

    # Update counters
    state.tool_counts.total += 1
    state.tool_counts[categorize(tool_name)] += get_weight(tool_name)

    # Check for boundary markers
    if is_boundary_marker(tool_name, parameters):
        state.boundaries[get_boundary_type(tool_name, parameters)] += 1
        state.timestamps.last_boundary = now()

    # Update activity flags
    update_activity_flags(state, tool_name, parameters)

    # Evaluate suggestion opportunity
    if should_suggest_compact(state):
        return generate_suggestion(state)

    return None
```

---

## Dynamic threshold adjustment

The threshold can scale based on detected activity:

```yaml
dynamic_rules:
  - condition: "active_debugging == true"
    adjustment: "+25"
    reason: "Preserve debugging context"

  - condition: "error_rate > 0.3"
    adjustment: "+15"
    reason: "Troubleshooting in progress"

  - condition: "time_since_boundary > 30min"
    adjustment: "-10"
    reason: "Context likely getting stale"
```

---

## Scenario-tuned thresholds

| Scenario | Threshold | Rationale |
|---|---|---|
| Standard development | 50 | Balanced for typical feature work |
| Complex debugging | 75 | Need more context for issue tracking |
| Quick fixes | 30 | Less context needed, faster cycles |
| Large refactoring | 40 | Many files, context gets stale |
| Documentation | 60 | Mostly reading, less state to track |
| Plan execution | per-phase | Align with plan phase boundaries |

Per-project config:

```json
{
  "projects": {
    "large-monorepo": {
      "threshold": 40,
      "reason": "Many files, context gets stale quickly"
    },
    "focused-library": {
      "threshold": 75,
      "reason": "Smaller scope, more context helpful"
    }
  }
}
```

---

## Custom boundary definitions

Project-specific events that count as boundaries:

```json
{
  "custom_boundaries": {
    "migration_complete": {
      "trigger": "Bash",
      "pattern": "npm run migrate",
      "success_required": true,
      "weight": 0.8
    },
    "deploy_staging": {
      "trigger": "Bash",
      "pattern": "deploy.*staging",
      "weight": 1.0
    }
  }
}
```

---

## Integration with other skills

| Skill | Integration |
|---|---|
| `context-saver` | Auto-invoked before compact, passes session state |
| `implement-phase` | Emits `phase_complete` boundary events |
| `create-plan` | Plan creation emits a boundary; suggests compact after |
| `code-review` | Review completion emits a boundary |

```yaml
skill_integration:
  context-saver:
    invoke_before_compact: true
    pass_session_state: true

  implement-phase:
    listen_for: phase_complete
    boundary_weight: 1.0

  create-plan:
    listen_for: plan_created
    suggest_compact_after: true
```

---

## Troubleshooting

**Suggestions too frequent:** increase threshold or min_interval.
```json
{ "threshold": 75, "min_interval": 900 }
```

**Suggestions never appear:** check that the hook is enabled, threshold is set appropriately, and the skill isn't permanently suppressed.

**Boundaries not detected:** add custom boundary patterns for your workflow (see Custom boundary definitions above).
