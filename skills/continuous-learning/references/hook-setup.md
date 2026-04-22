# Stop hook setup

continuous-learning can run automatically when a Claude Code session ends, so no valuable patterns are lost.

---

## Hook configuration

Create or update `~/.claude/hooks.json`:

```json
{
  "hooks": {
    "stop": [
      {
        "name": "continuous-learning",
        "enabled": true,
        "command": "skill:continuous-learning",
        "config": {
          "threshold": 0.7,
          "interactive": false,
          "summary": true
        }
      }
    ],
    "pre-commit": [],
    "post-error": []
  }
}
```

---

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Whether the hook is active |
| `threshold` | float | `0.7` | Extraction threshold (0.0-1.0); higher = more selective |
| `interactive` | boolean | `false` | Ask for confirmation before saving |
| `summary` | boolean | `true` | Display summary of extracted patterns |
| `max_patterns` | int | `10` | Maximum patterns to extract per session |
| `auto_merge` | boolean | `true` | Automatically merge similar patterns |

---

## Lifecycle integration

```
Session Start
     ↓
Load learned patterns from ~/.claude/skills/learned/
     ↓
Pattern retrieval during session (automatic matching)
     ↓
Session End (Stop command or timeout)
     ↓
Stop hook triggers continuous-learning skill
     ↓
Extract and save new patterns
     ↓
Display summary (if configured)
```

---

## Testing the hook

```bash
# Validate hooks.json syntax
claude hook validate

# Run the stop hook manually
claude hook run stop

# Check hook execution logs
claude hook logs --hook stop
```

---

## Summary output

When the stop hook completes, the skill displays:

```
=== Continuous Learning Summary ===

Session analyzed: 2.5 hours, 47 tool calls

Patterns Extracted: 3
  - [error_resolution] TypeScript strict null check fix
  - [user_correction] Prefer named exports in this project
  - [debugging_technique] Async stack trace reconstruction

Patterns Updated: 1
  - [workaround] Jest ESM handling (confidence: 0.85 -> 0.90)

Patterns Skipped: 2
  - Below threshold: Generic TypeScript error (0.45)
  - Duplicate: React hook dependency warning (exists)

Total learned patterns: 47 (across all sessions)

Patterns saved to: ~/.claude/skills/learned/
```
