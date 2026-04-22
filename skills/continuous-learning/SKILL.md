---
name: continuous-learning
description: Promote valuable session learnings into reusable, triggerable skill files in ~/.claude/skills/learned/. Unlike Claude Code's built-in memory (which captures conversational facts and preferences), this skill extracts structured patterns — error resolutions, user corrections, workarounds, debugging techniques, project conventions — that future sessions can match against specific triggers. Use at end of a session (typically via Stop hook), after solving a hard bug, when the user says "save what we learned", "remember this for next time", or "extract patterns from this session".
---

# Continuous Learning

Extract patterns from sessions and save them as structured skill files that future sessions can consult by trigger match. This is the layer above Claude Code's auto-memory: memory captures facts and preferences about you and your projects; continuous-learning captures **reusable problem-solving patterns** that need more structure than a memory entry can carry.

---

## Scope — how this differs from auto-memory

Claude Code has a built-in memory system (`~/.claude/projects/.../memory/`) that captures `user`, `feedback`, `project`, and `reference` memories — short, typed entries loaded into every future conversation's context. Use that for:
- Facts about the user's role, preferences, responsibilities.
- Corrections you want applied in all future work ("don't mock the database in integration tests").
- Project-state facts like deadlines, decisions, stakeholders.
- Pointers to external systems.

This skill handles the things auto-memory doesn't:
- **Triggerable patterns** — full YAML files with an exact error-message trigger, root-cause analysis, and copy-pasteable fix. When that same error shows up six months later, the pattern surfaces.
- **Structured templates per pattern type** — not just free text. Consistent shape across error resolutions, user corrections, workarounds, debugging techniques, project-specific conventions.
- **Reusable skills layer** — files land in `~/.claude/skills/learned/`, discoverable as portable skills across projects and machines.
- **Usage + confidence tracking** — a pattern that's worked 5 times carries more weight than one that's worked once.

Rule of thumb: a one-line fact goes in memory. A reproducible fix-recipe or debugging playbook goes here.

---

## When to use

**Automatic triggers:**
- **Stop hook** — runs when a Claude Code session ends. See `references/hook-setup.md`.
- Session timeout — same mechanism.

**Manual triggers:**
- After solving a particularly difficult bug.
- When the user corrects an approach (indicating a learning opportunity).
- After discovering an undocumented workaround.
- When a debugging technique proves especially effective.
- After understanding project-specific conventions.

**Signal phrases to watch for:**
- "Save what we learned"
- "Remember this for next time"
- "This should be a pattern"
- "Extract learnings from this session"
- "What patterns did we discover?"

---

## The five pattern types

Each pattern gets classified into one of five types. Full YAML templates and extraction criteria for each → `references/pattern-types.md`. Detailed examples → `references/examples.md`. Brief summary:

1. **Error resolution** — non-obvious fixes to errors where the root cause matters. Trigger is the exact error message or pattern.
2. **User correction** — insights when the user redirected your approach. Captures original-vs-corrected-vs-why.
3. **Workaround** — clever solutions to limitations in tools, frameworks, or environments. Includes "when will this become unnecessary."
4. **Debugging technique** — systematic approaches for specific problem classes. Includes indicators for "when to reach for this."
5. **Project-specific** — conventions unique to one codebase (architecture, naming, testing, deployment). Must include concrete examples and rationale.

---

## Extraction workflow

### Step 1 — Session analysis

Scan the session for these learning signals:
- **Error/exception events** — error messages, stack traces, failed commands. Note which required multiple attempts.
- **User corrections** — messages where the user redirected the approach; phrases like "actually", "instead", "don't do that".
- **Workarounds** — "can't do X, so we'll do Y"; framework/tool limitations encountered.
- **Debugging journeys** — investigation sequences; hypotheses tested and results.
- **Project conventions** — corrections about "how we do things here"; architectural patterns discovered.

### Step 2 — Threshold evaluation

Apply the extraction threshold to filter noise:

**Include if:**
- Pattern would save significant time if encountered again.
- Solution wasn't immediately obvious from error/docs.
- Pattern is specific enough to be actionable.
- Context is clear enough for future matching.

**Exclude if:**
- Solution was the first result in documentation.
- Pattern is too generic to be useful.
- Context is too narrow (one-time unique situation).
- Better patterns already exist for this case.

**Configurable threshold** — tune via `~/.claude/config/learning.yaml`:

```yaml
extraction:
  threshold: 0.7               # 0.0-1.0, higher = more selective
  min_investigation_steps: 3   # Minimum complexity for extraction
  require_root_cause: true     # Must understand why, not just what
  max_patterns_per_session: 10 # Prevent noise
```

### Step 3 — Structuring

For each pattern that passes threshold:
1. **Classify type** into one of the five categories.
2. **Extract context** — framework, version, environment.
3. **Formulate trigger** — when should this pattern be recalled?
4. **Structure solution** per the type-specific template (`references/pattern-types.md`). Pattern-body fields only — the surrounding file wrapper (metadata, `usage:`, `confidence:`, `tags:`) lives in `references/storage-format.md`.
5. **Assign confidence** — initial confidence based on validation level (goes in the wrapper's `confidence:` block, not the pattern body).

### Step 4 — Deduplication

Before saving, check for existing similar patterns:

```
1. Load existing patterns from ~/.claude/skills/learned/
2. For each candidate:
   a. Search for patterns with similar triggers
   b. Search for patterns in same category/context
   c. Calculate similarity score
3. If similarity > 0.8:
   a. Merge — combine insights, increment times_applied
   b. Update — if new pattern is more complete, replace
4. If similarity < 0.8: save as new pattern
```

**Similarity by type:** error patterns compare error-message patterns; user corrections compare original/corrected approaches; workarounds compare limitations+solutions; debugging compares problem classes; project-specific compares project+category.

### Step 5 — Storage

Write the pattern file and update the index. Full file layout, naming, and schema → `references/storage-format.md`.

---

## Quality criteria

### Scoring

Patterns that score ≥ the threshold get saved.

| Indicator | Weight |
|---|---|
| **Non-obvious solution** (answer wasn't in first search result) | High |
| **Time investment** (took significant debugging time) | High |
| **Root-cause depth** (understanding goes beyond symptoms) | High |
| **Recurrence likelihood** (likely to encounter again) | High |
| **Transferability** (applies beyond immediate context) | Medium |
| **Specificity** (clear trigger conditions) | Medium |
| **Actionability** (concrete steps, not abstract advice) | Medium |

```
quality_score = (
  non_obvious * 0.20 +
  time_investment * 0.15 +
  root_cause_depth * 0.20 +
  recurrence * 0.20 +
  transferability * 0.10 +
  specificity * 0.10 +
  actionability * 0.05
)

# Save if quality_score >= threshold (default 0.7)
```

### What NOT to extract

- Documented in official docs (first page of results).
- Common knowledge for the technology stack.
- Insufficient context for future matching.
- Too narrow (unique one-time situation).
- Too broad (generic advice without specifics).
- Lacks root cause understanding.
- Would be outdated quickly (version-specific hacks).
- Duplicates existing patterns without adding value.

---

## Best practices

**Effective capture:**
- Be specific: "React `useState` stale closure in event handler" > "React bug".
- Include context: framework, version, environment.
- Explain why — root cause beats surface fix.
- Show examples — concrete code beats abstract description.

**Avoiding anti-patterns:**
- Don't save obvious solutions — the first Google result doesn't need saving.
- Don't over-generalize — keep patterns focused and actionable.
- Don't skip validation — patterns should be tested before high confidence.
- Don't ignore updates — revisit patterns as frameworks evolve.

**Pattern hygiene:**
- Review patterns periodically (monthly suggested).
- Deprecate patterns for outdated framework versions.
- Merge similar patterns to reduce duplication.
- Increase confidence only after successful reuse.

---

## Integration points

**With `context-saver`:** when context-saver runs at session end, it can include a "Patterns Discovered This Session" section pointing into `~/.claude/skills/learned/`.

**With `brainstorm`:** learned patterns can inform brainstorming sessions — surface relevant patterns when discussing technical approaches, reference past workarounds when evaluating options.

**With future sessions:** at session start, patterns are loaded and available for automatic matching when similar errors occur, explicit recall ("what did we learn about X?"), and pattern suggestions during debugging.

---

## References (loaded on demand)

- `references/pattern-types.md` — Full YAML templates and extraction criteria for all five pattern types
- `references/examples.md` — Complete worked examples, one per pattern type
- `references/storage-format.md` — Directory layout, file naming, skill file schema, index file structure, lifecycle
- `references/hook-setup.md` — Stop hook configuration, options, lifecycle integration, testing
