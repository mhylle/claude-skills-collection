---
name: strategic-compact
description: Suggest context compaction at optimal logical boundaries — between phases, after a research burst, after a debugging session ends — rather than waiting for the automatic compaction threshold to hit mid-task. Use when the user asks whether to compact, mentions context is getting long, wants to checkpoint before a big task, or when you notice the session is approaching a natural transition where compacting would preserve the next phase's context. Complements (doesn't replace) Claude Code's built-in auto-compaction. Triggers on "/strategic-compact", "should I compact", "when should I clear context", "getting long", or proactively at phase boundaries and session transitions.
allowed-tools: Read, Bash
---

# Strategic Compact

Suggest context compaction at *logical* boundaries — not arbitrary token thresholds. Auto-compaction is a safety net; strategic compaction is a workflow optimization that makes compaction feel like a natural pause instead of an interruption.

---

## Why strategic > automatic

Auto-compaction fires on simple thresholds (token count, time). That creates real problems:

- **Mid-task disruption** — auto-compact might fire while you're debugging, losing the mental model built up over many interactions.
- **Context fragmentation** — arbitrary cutoffs create artificial boundaries in session history.
- **Lost continuity** — "why" decisions get compacted away at random points rather than preserved at meaningful boundaries.
- **Incomplete state** — mid-implementation compaction can lose partially completed work.

Strategic compaction instead:
- Monitors for **logical boundaries** (task completion, phase transitions, successful commits).
- Considers **semantic state** (actively debugging vs. between tasks).
- Provides **suggestions** — never forces compaction.
- Integrates with `context-saver` to preserve critical state first.
- Respects workflow rhythm rather than imposing arbitrary limits.

Goal: compaction that feels like a natural pause, not an interruption.

---

## When to use

**Passive monitoring** — via PreToolUse hook that attaches to every tool call, tracks counters, and evaluates boundaries. Hook setup → `references/hook-setup.md`.

**Direct invocation:**
- `/strategic-compact` — check current session state and get a recommendation.
- `/strategic-compact status` — view tool counts and threshold proximity.
- `/strategic-compact now` — force a suggestion (auto-invokes context-saver first).

**Trigger phrases:** "should I compact", "when should I clear context", "getting long", "checkpoint", "context is getting big".

---

## The core heuristic

Two questions:
1. **Has enough work happened that compaction is worthwhile?** (weighted tool-call count vs. threshold)
2. **Is this moment a good place to compact?** (logical boundary vs. mid-task)

Both must be yes before suggesting. The full rule set is in `references/boundary-rules.md`. Summary:

### Suggest when…

| Signal strength | Trigger |
|---|---|
| **Strong** | Task completion (TaskUpdate → `completed`), + ≥60% threshold, + >10min since last suggestion |
| **Strong** | Successful git commit, + ≥70% threshold, + no pending tasks in this feature |
| **Medium** | New feature starting (TaskUpdate → `in_progress` after completing previous), + ≥50% threshold |
| **Warning (high priority)** | Estimated context usage >80% + ≥90% threshold — prevent forced auto-compaction mid-task |

### Don't suggest when…

- **Active debugging** — recent errors, investigation-pattern tool sequence, or task name contains "debug/fix/investigate".
- **Active implementation** — uncommitted changes, recent edits, unresolved test failures.
- **User recently deferred** — respect the last "not now".
- **Critical operation in progress** — rollback, migration, destructive commands.
- **Last suggestion was <10 min ago** — avoid nagging.

---

## Threshold

Default: **50 weighted tool calls between logical boundaries.**

Weights (why count "significant" vs. raw):
- Edit / Write / Bash / NotebookEdit / TaskUpdate — weight 1.0
- Read — 0.5
- Glob / Grep — 0.3
- WebFetch / WebSearch — 0.5

Scenario-tuned thresholds (standard dev 50, debugging 75, quick fixes 30, large refactor 40, docs 60). Full config + dynamic adjustment rules → `references/hook-setup.md`.

---

## Preserve before compact

When a suggestion is accepted, **auto-invoke context-saver** before compaction (via `integrate_context_saver: true` in hook config — default). This produces a handoff doc capturing:
- What was being worked on
- Files mid-edit with line numbers
- Decisions made
- Next steps

The compacted session can be resumed from that file. See `context-saver/SKILL.md` for the doc format.

---

## Suggestion format

Keep suggestions informative but non-intrusive:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Context Compaction Suggested
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Session Metrics:
   Tool calls:     72 significant (threshold: 50)
   Session time:   45 minutes
   Last boundary:  Task completed 3 min ago

 Boundary Detected:
   Task "Add user authentication" marked complete
   Git commit: "feat: implement JWT auth flow"
   No pending changes or active debugging

 Recommendation: GOOD TIME TO COMPACT

 Options:
   [1] Compact now (will invoke context-saver first)
   [2] Defer for 15 minutes
   [3] Defer until next boundary
   [4] Dismiss (don't suggest again this session)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Always show **why now** — the specific boundary and conditions that triggered the suggestion. Users trust the heuristic faster when they can see its reasoning.

**Minimal mode** (for experienced users):
```
[Compact? 72/50 calls | Task done | Clean state] Y/n/defer
```

---

## Integration with other skills

- **`context-saver`** — auto-invoked before compact. Captures in-flight state as a handoff doc.
- **`implement-phase`** — emits `phase_complete` boundary events.
- **`create-plan`** — plan creation emits a boundary.
- **`code-review`** — review completion emits a boundary.

Full integration specs → `references/hook-setup.md`.

---

## Core principles (keep these in mind)

1. **Suggest, don't force** — respect the user's workflow.
2. **Boundary-aware** — align with natural pause points, not token counts.
3. **Context-preserving** — always integrate with context-saver before compact.
4. **Configurable** — adapt thresholds per project and scenario.
5. **Non-intrusive** — clear but minimal suggestions; include the "why."

---

## References (loaded on demand)

- `references/hook-setup.md` — PreToolUse hook config, state tracking, tool weights, dynamic thresholds, per-project configuration, integration specs, troubleshooting
- `references/boundary-rules.md` — Full suggest-when / suppress-when rule specifications with YAML patterns, plus accept/defer heuristics for users
