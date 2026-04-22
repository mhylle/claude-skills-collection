---
name: context-saver
description: Write the current session's in-flight work state to a human-readable handoff doc on disk (docs/context/CONTEXT-{topic}.md) so a future chat session — or another person — can pick up exactly where this one stops. Distinct from Claude Code's built-in memory system, which captures long-lived facts and preferences; this skill captures **active session context** (what's being built right now, which files are mid-edit, what's been tried, what's next). Use when the user says "save context", "checkpoint", "save progress", "preserve state", "save before I step away", "dump this so I can continue tomorrow", or before ending a long session with incomplete work. Optimizes for correctness, completeness, minimal size, and trajectory preservation.
disable-model-invocation: true
argument-hint: "[topic?]"
---

# Context Saver

Preserve in-flight session state to disk for seamless continuation in another session. Extracts signal from noise — captures the essential state (trajectory, decisions, active files, blockers, next steps) while discarding ephemeral details (exploratory reads, rejected paths, verbose tool output).

## Scope — how this differs from auto-memory

Claude Code has a built-in memory system at `~/.claude/projects/.../memory/` that captures long-lived, typed entries (`user`, `feedback`, `project`, `reference`). That handles *persistent knowledge*: facts about you, validated preferences, project-state that's true across sessions.

This skill handles what memory doesn't: **the snapshot of what you're actively doing right now.** It's the answer to "I need to step away mid-task — capture where I am so a new session can pick up seamlessly."

- **Memory:** "This user prefers pytest over unittest." (always true, loads into every session)
- **This skill:** "Currently refactoring `src/auth/token.service.ts:45-78` — tried approach A (failed, see line 60), now trying approach B, next step is to update the test at `__tests__/token.service.spec.ts:120`." (true right now, for this specific task)

Memory grows bigger over months; context-save docs are ephemeral — delete them once the work they describe lands.

## When to Use

- User explicitly requests context saving ("save context", "checkpoint this")
- Before ending a long session with incomplete work
- When switching focus and needing to preserve state
- Before attempting risky operations that may require rollback
- When collaborating and need to hand off context to another session

## Core Principles

### Signal Extraction Priority

1. **Trajectory** (highest): What is the user trying to achieve? What's the end goal?
2. **Decisions**: What choices were made and why? What was rejected?
3. **State**: What code is being modified? What's the current progress?
4. **Approaches**: What has been tried? What worked/failed?
5. **Noise** (discard): Exploratory reads, rejected paths, verbose tool output

### Information Density Rules

- **Include**: Specific file:line references, concrete decisions, blockers, next steps
- **Exclude**: General exploration, routine file reads, verbose error traces
- **Compress**: Long code blocks → key excerpts with line references
- **Preserve**: User-stated requirements verbatim, even if seemingly minor

## Context File Structure

Create context files in `docs/context/` or project root as `CONTEXT-{topic}.md`:

```markdown
# Context: {Descriptive Title}

> Saved: {ISO timestamp}
> Session: {Brief session identifier}
> Status: {in-progress | blocked | ready-for-review | completed}

## Trajectory

**Goal**: {One sentence: what is the user ultimately trying to achieve?}

**Success Criteria**:
- {Concrete, measurable outcome 1}
- {Concrete, measurable outcome 2}

**Current Phase**: {Where in the journey: planning | implementing | debugging | testing | refining}

## Problem Statement

{2-4 sentences describing the core problem. Include:}
- What triggered this work
- Key constraints or requirements
- Why existing solutions don't suffice

## Active Code Focus

### Primary Files

| File | Lines | Reason |
|------|-------|--------|
| `path/to/file.ts` | 45-78 | {Why this section matters} |
| `path/to/other.ts` | 12-34 | {What's being modified here} |

### Key Code Context

```{language}
// {file}:{start_line}-{end_line}
// {Brief explanation of what this code does and why it's relevant}
{Essential code excerpt - max 30 lines}
```

### Dependencies & Relationships

- `{file1}` imports from `{file2}` via `{what}`
- `{component}` depends on `{service}` for `{why}`

## Decisions Made

| Decision | Rationale | Alternatives Rejected |
|----------|-----------|----------------------|
| {Choice made} | {Why this approach} | {What was considered but rejected} |

## Approaches Taken

### Succeeded
- {Approach}: {Brief result}

### Failed/Abandoned
- {Approach}: {Why it didn't work, lesson learned}

### In Progress
- {Current approach}: {Current state, what remains}

## User Requirements

> {Verbatim or near-verbatim capture of specific user requests}
> - "{Exact user statement about requirement}"
> - "{Another specific ask}"

## Blockers & Open Questions

- [ ] {Blocker 1}: {What's needed to unblock}
- [ ] {Question 1}: {Context for why this matters}

## Next Steps

1. {Immediate next action with specific file/function reference}
2. {Following action}
3. {Subsequent action}

## Session Notes

{Any important context that doesn't fit above - debugging findings, environment quirks, temporary workarounds}

---
*Resume command*: `Continue working on {brief description}. Read CONTEXT-{topic}.md first.`
```

## Extraction Process

### Step 1: Identify Trajectory

Before extracting anything, answer:
- What transformation is the user trying to achieve?
- What would "done" look like?
- What constraints exist?

### Step 2: Map Active Code

Scan recent tool calls to identify:
- Files with Write/Edit operations → primary focus
- Files with multiple Read operations → secondary context
- Grep/Glob patterns → areas of exploration

For each active file, capture:
- Specific line ranges being modified
- The "why" behind modifications
- Relationships to other files

### Step 3: Extract Decisions

Review conversation for:
- Explicit choices ("let's use X instead of Y")
- Implicit preferences (user accepted one approach, rejected another)
- Constraints stated or discovered

### Step 4: Capture Approaches

Document what was tried:
- **Succeeded**: Brief note on what worked
- **Failed**: Crucially, why it failed (prevents re-trying)
- **In Progress**: Current state and remaining work

### Step 5: Preserve User Requirements

Search conversation for:
- Direct quotes of user requirements
- Specific asks even if mentioned once
- Preferences and style guidance

### Step 6: Define Next Steps

Convert remaining work into actionable items:
- Each step should reference specific files/functions
- Order by logical dependency
- Include enough context to start without re-reading everything

## Quality Checklist

Before finalizing context file:

- [ ] **Trajectory clear?** Can a new session understand the goal in 30 seconds?
- [ ] **Code references specific?** File:line, not just "the auth module"
- [ ] **Decisions documented?** Including what was rejected and why?
- [ ] **User requirements preserved?** Verbatim where possible?
- [ ] **Next steps actionable?** Each step is specific enough to start immediately?
- [ ] **Noise removed?** No exploratory reads, verbose outputs, tangential discussion?
- [ ] **Size reasonable?** Under 500 lines, ideally under 300?

## File Naming Convention

```
CONTEXT-{topic}.md           # General format
CONTEXT-auth-refactor.md     # Feature work
CONTEXT-bug-123.md           # Bug fix
CONTEXT-spike-caching.md     # Investigation
CONTEXT-{date}-{topic}.md    # Time-sensitive work
```

## Usage Examples

### Saving Mid-Implementation Context

```
User: "Save context - I need to step away"

Action:
1. Identify trajectory (what feature being built)
2. Map all files with recent edits
3. Extract key code sections with line numbers
4. Document current approach and progress
5. List concrete next steps
6. Write to docs/context/CONTEXT-{feature}.md
```

### Saving After Investigation

```
User: "Checkpoint this debugging session"

Action:
1. Capture problem statement and symptoms
2. Document what was investigated
3. Record findings (both positive and negative)
4. Note hypotheses tested and results
5. List remaining investigation paths
6. Write to docs/context/CONTEXT-debug-{issue}.md
```

### Saving Before Risky Operation

```
User: "Save state before we refactor"

Action:
1. Document current working state
2. Capture all files that will be touched
3. Note the planned changes
4. Record rollback points
5. Write to docs/context/CONTEXT-pre-{operation}.md
```

## Anti-Patterns to Avoid

- **Dumping full files**: Use excerpts with line references
- **Including tool output**: Summarize findings, don't paste logs
- **Vague references**: "The service file" → "src/services/auth.service.ts:45-78"
- **Missing rationale**: What was done without why
- **Forgotten rejections**: Document why alternatives were rejected
- **Stale context**: Always update, don't create parallel files
