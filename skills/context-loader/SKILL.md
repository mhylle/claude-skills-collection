---
name: context-loader
description: Load saved context from previous sessions for seamless continuation. This skill should be used at session start to resume work, when switching between tasks, or when explicitly asked to load context. Triggers on "load context", "resume work", "continue from", "what was I working on", or session start with existing context files.
---

# Context Loader

## Overview
Load previously saved context into the current session, enabling seamless continuation of complex work across chat sessions.

## When to Use
- Starting a new session with existing saved context
- Resuming interrupted work
- Switching between different workstreams
- When user asks "what was I working on?"

## Orchestration Model
This skill can operate directly (lightweight file scanning) or delegate to subagent for validation.
- Direct: Scanning for files, presenting options
- Subagent: Validating context against current codebase state
Reference: `docs/references/subagent-guidelines.md`

## Workflow

### Step 1: Discover Context Files
Scan for context files:
- Primary: `docs/context/CONTEXT-*.md`
- Alternative: Project root `CONTEXT-*.md`
- Sort by modification time (most recent first)

### Step 2: Present Options
Show user available contexts:
```
Found saved contexts:
1. CONTEXT-auth-refactor.md (2 hours ago) - "Implementing JWT authentication"
2. CONTEXT-bug-123.md (1 day ago) - "Fixing checkout flow error"
3. CONTEXT-feature-search.md (3 days ago) - "Adding search functionality"

Which context should I load? (Enter number or 'none')
```

### Step 3: Load Selected Context
Read the selected context file completely.

### Step 4: Validate (Optional - via Subagent)
If context references specific files, spawn validation subagent:
```
Task: "Validate context file references.
Check if these files still exist and note any that have changed:
{list of file paths from context}
Return: validation status + any warnings about missing/changed files."
```

### Step 5: Present Context Summary
Summarize loaded context for user:
```
Loaded context: {title}

Goal: {goal from context}
Current Phase: {phase}
Key Decisions: {brief list}

Active Files:
- {file1}: {why relevant}
- {file2}: {why relevant}

Next Steps:
1. {next step 1}
2. {next step 2}

{Validation warnings if any}

Ready to continue. What would you like to work on?
```

### Step 6: Handle Stale Context
If validation finds issues:
- Missing files: Warn user, suggest removing from focus
- Changed files: Note changes, offer to re-read
- Major drift: Suggest creating fresh context

## Quick Load
For users who know what they want:
```
/context-loader auth-refactor
```
Directly loads `CONTEXT-auth-refactor.md` without menu.

## Integration with Hooks
This skill can be triggered by session-start hook:
- Hook checks for recent context files
- If found, prompts: "Found saved context. Load it?"
- User confirms, skill executes

## Quality Checklist
Before presenting loaded context:
- [ ] File exists and is readable
- [ ] Context structure is valid (has required sections)
- [ ] Referenced files validated (if validation enabled)
- [ ] Summary is concise and actionable
- [ ] User understands current state and next steps
