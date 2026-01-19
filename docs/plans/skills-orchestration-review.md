# Skills Orchestration Review Plan

**Date**: 2026-01-08
**Status**: Ready for Review

## Executive Summary

This document reviews all skills in the collection against the orchestration workflow pattern defined in `docs/prompts/claude_code_template.md`. The goal is to ensure consistent adherence to:

1. **Orchestrator sessions** - Read plans, determine steps, never do actual work
2. **Subagent delegation** - Spawn subagents for all implementation/research work
3. **Concise returns** - Subagents return only relevant information concisely
4. **File system communication** - Larger outputs go through files, not chat
5. **Context conservation** - The entire pattern exists to preserve context

---

## Current State Analysis

### Skills That Follow Orchestration Pattern Well

| Skill | Alignment | Notes |
|-------|-----------|-------|
| **implement-plan** | Strong | Explicitly orchestrator-focused. Uses subagents for all work. Has parallelization strategy. |
| **codebase-research** | Strong | Decomposes into parallel sub-agents. Synthesizes findings. |
| **prompt-generator** | Strong | Generates prompts that enforce orchestration pattern. |

### Skills That Partially Follow the Pattern

| Skill | Alignment | Gap |
|-------|-----------|-----|
| **create-plan** | Partial | Mentions spawning sub-tasks in Phase 1, but other phases imply direct work |
| **iterate-plan** | Partial | Step 4 says "Make Surgical Edits" using Edit tool directly |
| **brainstorm** | Partial | Phase 3 uses parallel agents, but not framed as orchestrator model throughout |

### Skills That Don't Follow the Pattern

| Skill | Current Behavior | Assessment |
|-------|------------------|------------|
| **context-saver** | Direct work (single-session task) | May not need orchestration - small scope |
| **e2e-testing** | Direct Playwright MCP usage | Could benefit from orchestration for parallel tests |
| **branded-presentation-creator** | Direct python-pptx work | Environment-specific (Claude Desktop), keep as-is |

---

## Identified Gaps

### Gap 1: Missing Conciseness Instructions for Subagents

**Problem**: No skill explicitly instructs spawned subagents to:
- Return only relevant information
- Be concise in their responses
- Avoid verbose explanations

**Impact**: Subagents may return excessive information, consuming orchestrator context.

**Solution**: Add standard subagent instructions to each skill that spawns agents.

### Gap 2: Missing File System Communication Pattern

**Problem**: No skill documents when/how to use file system for larger outputs.

**Impact**: Large outputs go through chat, bloating context.

**Solution**: Create shared guidance and update skills to reference it.

### Gap 3: Inconsistent Orchestrator Framing

**Problem**: Skills vary in how explicitly they frame the orchestration model:
- `implement-plan`: Very explicit ("This session serves as the orchestrator")
- `create-plan`: Implicit ("Spawn parallel sub-tasks")
- `iterate-plan`: Not mentioned

**Impact**: Confusion about when orchestrator vs direct work is appropriate.

**Solution**: Add consistent orchestration framing to all workflow skills.

### Gap 4: Direct Work in Orchestrator Skills

**Problem**: Some skills that should be orchestrators do direct work:
- `iterate-plan` Step 4: "Update the plan using Edit tool"
- `create-plan` Phase 6: "Write the implementation plan"

**Impact**: Orchestrator context gets polluted with implementation details.

**Decision**: ALL edits go through subagents, including plan files. The orchestrator's ONLY job is coordination:
- Spawn work subagent → Spawn test subagent → Spawn fix subagent if needed → Spawn update subagent to mark complete

This keeps orchestrator context maximally clean.

### Gap 5: Missing Shared Subagent Guidelines Reference

**Problem**: Each skill defines its own subagent instructions independently.

**Impact**: Inconsistent subagent behavior across skills.

**Solution**: Create `references/subagent-guidelines.md` that all skills can reference.

---

## Proposed Changes

### 1. Create Shared Subagent Guidelines Reference

**New file**: `docs/references/subagent-guidelines.md`

**Contents**:
- Standard instructions for subagent conciseness
- When to use file system vs chat for output
- Focus and scope constraints
- What subagents should NOT do (architectural decisions, etc.)

### 2. Update implement-plan

**File**: `skills/implement-plan/SKILL.md`

**Changes**:
- Add reference to subagent guidelines
- Add explicit instructions for subagents to be concise
- Add file system output pattern for large results

**Sections affected**: "Subagent Usage Guidelines" (lines 65-89)

### 3. Update create-plan

**File**: `skills/create-plan/SKILL.md`

**Changes**:
- Add orchestration framing section at top (similar to implement-plan)
- Clarify that Phase 1 research uses subagents
- Note that Phase 6 (writing plan) is direct work exception
- Add reference to subagent guidelines

**Sections affected**: After "When to Use This Skill", "Phase 1: Research" (lines 34-50)

### 4. Update iterate-plan

**File**: `skills/iterate-plan/SKILL.md`

**Changes**:
- Add orchestration note (can do direct edits for plan files)
- Add subagent conciseness instructions for Step 2 research
- Reference subagent guidelines

**Sections affected**: "Step 2: Research If Needed" (lines 42-65)

### 5. Update codebase-research

**File**: `skills/codebase-research/SKILL.md`

**Changes**:
- Add subagent conciseness instructions
- Add file system output pattern for large findings
- Reference subagent guidelines

**Sections affected**: "Step 3: Spawn Parallel Sub-Agents" (lines 74-103)

### 6. Update brainstorm

**File**: `skills/brainstorm/SKILL.md`

**Changes**:
- Add orchestration context note (orchestrator for research, direct for synthesis)
- Add subagent conciseness instructions to Phase 3
- Reference subagent guidelines

**Sections affected**: "Phase 3: Context Gathering" (lines 76-114)

### 7. (Optional) Update e2e-testing

**File**: `skills/e2e-testing/SKILL.md`

**Assessment**: Currently does direct Playwright work. Could potentially:
- Run multiple test scenarios in parallel via subagents
- Each subagent runs one scenario and reports back

**Decision**: Defer - current approach works and Playwright MCP may not support parallel instances well. Flag for future consideration.

### 8. No Changes Needed

| Skill | Reason |
|-------|--------|
| **prompt-generator** | Already generates orchestration-compliant prompts |
| **context-saver** | Single-session utility, orchestration overhead not justified |
| **branded-presentation-creator** | Environment-specific, different context (Claude Desktop) |

---

## Implementation Order

1. **First**: Create `docs/references/subagent-guidelines.md`
2. **Second**: Update `implement-plan` (reference model)
3. **Third**: Update `create-plan`, `iterate-plan` (planning workflow)
4. **Fourth**: Update `codebase-research`, `brainstorm` (research/ideation)

---

## Subagent Guidelines Draft Content

```markdown
# Subagent Guidelines

Standard instructions for subagents spawned by orchestrator sessions.

## Core Principles

### 1. Conciseness
- Return ONLY information directly relevant to the task
- Avoid verbose explanations or context that the orchestrator already has
- Use bullet points over paragraphs where possible
- If findings are extensive, summarize key points and write details to file

### 2. File System for Large Outputs
- Any output exceeding ~50 lines should go to a file
- Write to: `docs/findings/{topic}-{timestamp}.md` or task-specific location
- Return: File path + 3-5 line summary in chat

### 3. Focus
- Complete ONLY the assigned task
- Do NOT explore tangential areas
- Do NOT make architectural decisions
- Do NOT update TodoWrite (orchestrator's job)

### 4. Reporting Format
Return results in this structure:
```
## Result
[1-3 sentence summary of outcome]

## Key Findings
- Finding 1 (file:line if applicable)
- Finding 2
- Finding 3

## Details
[If small: inline content]
[If large: "Full details written to: {path}"]

## Blockers (if any)
- [Blocker with context needed from orchestrator]
```

### 5. Error Handling
- Report failures clearly, don't retry autonomously
- Include error details for orchestrator to assess
- Suggest resolution options but don't execute them
```

---

## Decisions Made

### Decision 1: Plan File Edits Through Subagents

**Decision**: All plan file updates go through subagents. The orchestrator NEVER edits directly.

**Workflow**:
```
Orchestrator spawns work subagent
    → Work subagent completes task, reports back
    → Orchestrator spawns test subagent to verify
    → Test subagent reports results
    → If issues: Orchestrator spawns fix subagent
    → If satisfied: Orchestrator spawns update subagent to mark plan item complete
```

**Rationale**: Keeps orchestrator context clean. The orchestrator's job is coordination only.

### Decision 2: e2e-testing MUST Use Subagents

**Decision**: Refactor e2e-testing to use subagents for ALL Playwright MCP work.

**Rationale**: Playwright MCP is extremely context-heavy (DOM snapshots, screenshots, network logs). Running it directly in orchestrator will exhaust context rapidly.

**New Pattern**:
```
Orchestrator reads test regime
    → Spawns parallel subagents (one per scenario or scenario group)
    → Each subagent runs Playwright tests, writes results to file
    → Subagents return: pass/fail summary + file path to detailed results
    → Orchestrator synthesizes results, spawns report subagent if needed
```

### Decision 3: context-saver Trade-off Analysis

**Concern**: Spawning a subagent requires feeding it context about the session, which itself consumes context.

**Analysis**:
- Context-saver needs: trajectory, decisions made, active files, next steps
- This information already exists in orchestrator's memory
- Passing it to a subagent = duplicating in the message
- But: Subagent's work (file scanning, synthesis) stays isolated

**Decision**: Use subagents, BUT minimize context transfer:
- Orchestrator provides: Goal summary, key decisions list, active file paths
- Subagent discovers: File contents, code excerpts, detailed state
- Result: Subagent reads files directly rather than receiving content via message

**New Consideration**: Hooks for automated context preservation.

---

## Hooks Strategy for Context Preservation

### Problem
Manual context-saving requires user intervention. By the time context is critical, it may be too late to save effectively.

### Proposed Hooks

#### Hook 1: Pre-Session Context Load
**Trigger**: Session start (or `/context load` command)
**Action**: Check for existing `CONTEXT-*.md` files, prompt to resume

```yaml
# .claude/hooks/context-loader.yml
trigger: session_start
action: |
  Check docs/context/ for recent files
  If found: "Found saved context from {date}. Resume this work?"
```

#### Hook 2: Context Size Warning
**Trigger**: Context exceeds threshold (e.g., 70% of limit)
**Action**: Warn user, offer to save context

```yaml
# .claude/hooks/context-warning.yml
trigger: context_size > 70%
action: |
  "Context is getting large. Consider running /context-saver to checkpoint."
```

#### Hook 3: Auto-Save on Phase Completion
**Trigger**: Orchestrator marks a phase complete in TodoWrite
**Action**: Automatically spawn context-saver subagent

```yaml
# .claude/hooks/phase-checkpoint.yml
trigger: todo_phase_complete
action: |
  Spawn context-saver subagent with minimal context
  Write to docs/context/CONTEXT-{phase}-checkpoint.md
```

#### Hook 4: Session End Reminder
**Trigger**: User signals session end (goodbye, done for now, etc.)
**Action**: Prompt to save context before ending

```yaml
# .claude/hooks/session-end.yml
trigger: session_end_detected
action: |
  "Would you like to save context before ending? This will help resume later."
```

### Implementation Notes

Claude Code hooks execute shell commands. For context preservation:
1. Hook detects trigger condition
2. Hook outputs reminder/prompt to user
3. User (or auto) invokes `/context-saver` skill
4. Skill spawns subagent to do the actual work

### New Skill Needed: context-loader

To complement `context-saver`, we need a `context-loader` skill that:
- Finds recent context files
- Presents options to user
- Loads selected context into session
- Validates context against current codebase state

---

## Updated Skill Changes

### e2e-testing (Major Refactor)

**Current**: Direct Playwright MCP usage in main session
**New**: Orchestrator pattern with subagents for all Playwright work

**New Structure**:
```
## Run Mode - Orchestration Pattern

### Pre-Run (Orchestrator)
1. Read test regime
2. Load history for flaky detection
3. Plan parallel execution groups

### Execution (Subagents)
For each scenario group, spawn subagent:
- Task: "Run scenarios [X, Y, Z] using Playwright MCP"
- Instructions: Write results to tests/e2e/results/{scenario}.json
- Return: Pass/fail count + file path only

### Post-Run (Orchestrator)
1. Collect results from subagent files
2. Spawn report subagent to generate reports
3. Update history file via subagent
```

### context-saver (Update)

**Current**: Direct extraction work
**New**: Orchestrator spawns extraction subagent with minimal context transfer

**New Pattern**:
```
User triggers /context-saver
    → Orchestrator prepares minimal context packet:
        - Goal (1-2 sentences)
        - Key decisions (bullet list)
        - Active file paths (not contents)
        - Current phase
    → Spawns subagent with packet
    → Subagent reads files, extracts details, writes CONTEXT file
    → Returns: File path + summary
```

### New Skill: context-loader

**Purpose**: Load saved context into new sessions

**Workflow**:
1. Scan `docs/context/` for `CONTEXT-*.md` files
2. Present list with timestamps and summaries
3. User selects which to load
4. Validate: Check if referenced files still exist
5. Present context summary to user
6. User confirms, session continues with context

---

## Missing Skills Identified

| Skill | Purpose | Priority |
|-------|---------|----------|
| **context-loader** | Load saved context into new sessions | High |
| **subagent-instructions** (reference) | Shared guidelines for all subagents | High |

---

## Revised Implementation Order

1. **Create** `docs/references/subagent-guidelines.md` - Foundation for all updates
2. **Update** `implement-plan` - Reference model, add conciseness instructions
3. **Update** `create-plan` - Add orchestration framing
4. **Update** `iterate-plan` - Remove direct edit exception
5. **Update** `codebase-research` - Add conciseness instructions
6. **Update** `brainstorm` - Add orchestration context
7. **Refactor** `e2e-testing` - Major change to subagent pattern
8. **Update** `context-saver` - Subagent-based extraction
9. **Create** `context-loader` - New skill
10. **Create** hooks configuration examples

---

## Next Steps After Approval

1. Create subagent guidelines reference
2. Update skills in revised implementation order
3. Create context-loader skill
4. Document hooks patterns (even if not all implementable today)
5. Test updated skills with real workflows
