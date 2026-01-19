# Hooks Patterns for Context Preservation

Documentation of hook patterns that support the orchestration workflow and context preservation.

## Overview

Claude Code hooks execute shell commands in response to events. These patterns help automate context preservation to prevent context exhaustion during long orchestration sessions.

## Hook Types for Context Workflow

### 1. Session Start Hook
**Purpose**: Detect existing context files and prompt to resume

**Trigger**: New session start
**Action**: Check for CONTEXT-*.md files, suggest loading

**Implementation Notes**:
- Hook runs shell command to check docs/context/
- If files found, output prompts user
- User can invoke /context-loader to load

**Example Pattern**:
```bash
# Check for recent context files
if ls docs/context/CONTEXT-*.md 2>/dev/null | head -1; then
  echo "Found saved context. Consider running /context-loader to resume."
fi
```

### 2. Context Size Warning Hook
**Purpose**: Warn when context is getting large

**Trigger**: Context exceeds threshold (conceptual - may require Claude Code support)
**Action**: Suggest checkpointing

**Note**: This hook type may not be directly implementable with current Claude Code hooks (which trigger on tool calls, not context size). Document as aspirational pattern.

**Workaround**: User can manually checkpoint, or orchestrator skills can include periodic reminders.

### 3. Phase Completion Hook
**Purpose**: Auto-checkpoint when major work completes

**Trigger**: Could be implemented as post-TodoWrite hook when phase marked complete
**Action**: Remind to save context

**Implementation Notes**:
- Harder to implement automatically
- Best practice: Skills should include checkpoint reminders after major phases
- Orchestrator can spawn context-saver subagent after completing phases

### 4. Session End Hook
**Purpose**: Remind to save before ending

**Trigger**: User signals session end (bye, done, etc.)
**Action**: Prompt to save context

**Note**: Session end detection is not a standard hook trigger. Implement as skill behavior: when user says goodbye, offer to save context first.

## Implementable vs Aspirational

| Hook Pattern | Implementable Now? | Notes |
|--------------|-------------------|-------|
| Session start context check | Partial | Can check files, but auto-trigger is manual |
| Context size warning | No | Requires Claude Code internal support |
| Phase completion | Partial | Skills can include reminders |
| Session end reminder | Partial | Can be skill behavior, not automatic |

## Best Practices for Skills

Since not all hooks are automatable, skills should:

1. **Include checkpoint reminders** after completing major phases
2. **Suggest context-saving** when work is substantial
3. **Reference context files** at session start if they exist
4. **Offer to save** when user indicates session end

## Future Hook Possibilities

If Claude Code adds these hook triggers, enable:
- `on_context_threshold`: Trigger when context reaches X%
- `on_session_start`: Trigger at conversation begin
- `on_session_idle`: Trigger after N minutes of inactivity
- `on_phrase_detected`: Trigger on specific user phrases

## Integration with Skills

Skills that should include context awareness:
- **implement-plan**: Checkpoint after each phase
- **create-plan**: Save context after plan creation
- **codebase-research**: Offer to save extensive findings
- **brainstorm**: Save after synthesis phase

## Example Skill Integration

```markdown
### Phase Completion (in implement-plan)

After completing a phase:
1. Spawn verification subagent
2. Spawn plan-update subagent
3. **Consider context**: If this was a large phase, suggest:
   "Phase X complete. Context has grown. Save checkpoint? (/context-saver)"
```
