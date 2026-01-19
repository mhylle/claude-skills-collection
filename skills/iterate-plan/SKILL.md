---
name: iterate-plan
description: Update existing implementation plans through user feedback with thorough research and validation. This skill should be used when iterating on implementation plans, updating plans based on new requirements, refining technical approaches in existing plans, or when the user wants to modify a previously created plan file. Triggers on requests like "update the plan", "change the implementation approach", "iterate on this plan", or when feedback is provided about an existing plan document.
---

# Iterate Plan

## Overview

This skill enables intelligent iteration on existing implementation plans. Rather than rewriting plans from scratch, it makes surgical, well-researched updates while preserving the plan's existing structure and quality standards.

## Orchestration Note

This skill operates as an **orchestrator** - it coordinates work but delegates execution to specialized subagents.

- **All edits to plan files go through subagents** - the orchestrator never directly modifies plan content
- **Coordination flow**: research → edit → validate
- Subagents receive focused instructions and return concise results
- See `docs/references/subagent-guidelines.md` for subagent patterns and best practices

## Initial Input Handling

Parse the user's request to identify two required elements:

1. **Plan file path** - The location of the existing implementation plan
2. **Requested changes** - What modifications the user wants

Handle these scenarios:

| Scenario | Action |
|----------|--------|
| No plan provided | Ask: "Which plan file should I update?" |
| Plan but no feedback | Ask: "What changes would you like to make to this plan?" |
| Both provided | Proceed to Step 1 |

## Five-Step Iteration Process

### Step 1: Understand the Current Plan

Read the complete plan file and thoroughly understand:
- Overall structure and organization
- Current technical approach and decisions
- Success criteria (both automated and manual)
- Dependencies and relationships between sections
- Any existing constraints or trade-offs documented

Document the sections that will likely need modification based on the feedback.

### Step 2: Research If Needed

**Critical**: Only spawn research tasks if the changes require new technical understanding.

When research is necessary, use specialized sub-agents with highly specific instructions:

```
Research Task Template:
- Agent type: codebase-locator | codebase-analyzer | Explore
- Specific directories to examine
- Exact patterns or code to find
- Required output format (file:line references)
```

Research scenarios that warrant sub-agent spawning:
- Changes involve unfamiliar parts of the codebase
- New integrations or dependencies need validation
- Technical feasibility of proposed changes is uncertain
- Alternative approaches need evaluation

**Subagent Conciseness Requirements**:
- Subagents must return concise, actionable findings
- Large outputs (code samples, extensive analysis) go to files rather than inline responses
- Research subagents provide file:line references, not full code excerpts

**Do NOT research when**:
- Changes are cosmetic or structural (reordering, rewording)
- The modification is already well-understood
- Feedback is about plan formatting, not technical content

### Step 3: Present Understanding Before Changes

Before making any modifications, present:

1. **Interpretation of Feedback**
   - Restate what changes are being requested
   - Confirm understanding of the user's intent

2. **Research Findings** (if research was performed)
   - Key discoveries with file:line references
   - Technical implications for the plan

3. **Planned Modifications**
   - List specific sections that will change
   - Describe the nature of each change
   - Note any sections that will remain unchanged

Wait for user confirmation before proceeding to Step 4.

### Step 4: Make Surgical Edits

**Delegate edits to a subagent** - the orchestrator does not directly modify plan files.

**Subagent Delegation Pattern**:
1. **Orchestrator prepares edit instructions** - Compile specific changes needed with exact locations
2. **Spawn edit subagent** - Provide the subagent with:
   - Path to the plan file
   - Precise edit instructions (what to change and where)
   - The principles below as editing guidelines
3. **Subagent makes edits** - Executes surgical edits using the Edit tool
4. **Subagent returns confirmation** - Reports what was changed with before/after summaries

**Instructions for the Edit Subagent**:

**Structural Integrity**
- Maintain existing heading hierarchy
- Preserve section organization patterns
- Keep consistent formatting throughout

**Content Quality**
- Ensure changes align with surrounding context
- Update all related sections (e.g., if changing approach, update affected tasks)
- Maintain traceability between requirements and implementation tasks

**Success Criteria Standards**
- **Automated Verification**: Commands that can be run (tests, lints, builds)
- **Manual Verification**: Human-observable behaviors requiring testing
- Never mix these categories; keep them distinctly separated

**Edit Scope**
- Change only what is necessary to address the feedback
- Avoid "while I'm here" improvements unless explicitly requested
- Preserve author's voice and existing explanations where possible

### Step 5: Present Changes and Invite Iteration

After editing, present:

1. **Summary of Changes Made**
   - What was modified and why
   - Any dependencies that were updated as a result

2. **Invitation for Further Iteration**
   - Ask if the changes meet expectations
   - Offer to refine any sections further

## Critical Guidelines

### Be Skeptical
- Question whether changes are truly needed
- Verify technical claims through research, not assumptions
- Challenge feedback that may be based on misunderstanding

### Be Surgical
- Minimize edit scope to exactly what's needed
- Prefer targeted edits over section rewrites
- Preserve existing content that isn't directly affected

### Be Thorough
- Update all sections affected by a change (dependencies, success criteria, etc.)
- Ensure internal consistency after modifications
- Verify no orphaned references remain

### Be Interactive
- Confirm understanding before making changes
- Present planned modifications before execution
- Seek feedback after changes are complete

### Never Update with Open Questions
**Do NOT update the plan with unresolved questions.**

If research reveals ambiguity or multiple valid approaches:
1. Present the options to the user
2. Explain trade-offs for each
3. Wait for direction before proceeding

## Quality Checklist

Before considering iteration complete, verify:

- [ ] All requested changes have been addressed
- [ ] Success criteria remain measurable and categorized (automated vs manual)
- [ ] No broken references or orphaned sections
- [ ] Plan remains internally consistent
- [ ] Technical approach is validated (if changes were technical)
- [ ] User has confirmed the changes meet their needs
