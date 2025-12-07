---
name: create-plan
description: Create detailed implementation plans through interactive research and iteration. This skill should be used when creating new implementation plans, designing feature specifications, planning technical work, or when the user asks to plan an implementation. Triggers on requests like "create a plan", "plan the implementation", "design how to implement", or when given a feature/task that needs structured planning before implementation.
---

# Create Plan

Create detailed, well-researched implementation plans through interactive collaboration and thorough codebase investigation.

## When to Use This Skill

- Planning new features or functionality
- Designing technical implementations before coding
- Creating phased development roadmaps
- Structuring complex refactoring work
- Any task requiring upfront planning and design

## Initial Input Handling

Parse the user's request to identify:

1. **Task description** - What needs to be implemented
2. **Context files** - Relevant existing code or documentation
3. **Constraints** - Timeline, technology, or scope limitations

| Scenario | Action |
|----------|--------|
| Parameters provided | Read all referenced files completely, then proceed to Research |
| Missing task description | Ask: "What feature or functionality should I plan?" |
| No context provided | Ask: "Are there existing files or documentation I should review?" |

## Planning Workflow

### Phase 1: Research

**Critical**: Thoroughly investigate the codebase before planning.

Spawn parallel sub-tasks using specialized agents:

```
Research Tasks:
- codebase-locator: Find all files related to the feature area
- codebase-analyzer: Understand existing patterns and architecture
- Explore: Investigate integration points and dependencies
```

For each research task, provide:
- Specific directories to examine
- Exact patterns or code to find
- Required output: file:line references

**Read all identified files completely** - no partial reads or summaries.

### Phase 2: Present Understanding

Before any design work, present findings:

1. **Codebase Analysis**
   - Relevant existing code with file:line references
   - Current patterns and conventions discovered
   - Integration points and dependencies

2. **Clarifying Questions**
   - Ask only questions that code investigation couldn't answer
   - Focus on business logic, user requirements, edge cases
   - Avoid questions answerable by reading more code

Wait for user response before proceeding.

### Phase 3: Research User Corrections

**Critical**: Do not accept user corrections at face value.

When the user provides corrections or additional context:
1. Verify claims through code investigation
2. Cross-reference with discovered patterns
3. Resolve any conflicts between user input and codebase reality

If conflicts exist, present findings and discuss before proceeding.

### Phase 4: Design Options

Present design approaches with trade-offs:

```
Option A: [Approach Name]
- Description: [How it works]
- Pros: [Benefits]
- Cons: [Drawbacks]
- Fits pattern: [Reference to existing codebase patterns]

Option B: [Alternative Approach]
- Description: [How it works]
- Pros: [Benefits]
- Cons: [Drawbacks]
- Fits pattern: [Reference to existing codebase patterns]

Recommendation: [Preferred option with rationale]
```

Wait for user feedback on approach before detailing phases.

### Phase 5: Phase Structure Review

Before writing detailed plan, present proposed phases:

```
Proposed Implementation Phases:

Phase 1: [Name] - [Brief description]
Phase 2: [Name] - [Brief description]
Phase 3: [Name] - [Brief description]

Does this structure make sense? Any phases to add/remove/reorder?
```

Get explicit approval before writing the full plan.

### Phase 6: Write the Plan

Write the implementation plan to the designated location:

**Default path**: `docs/plans/YYYY-MM-DD-description.md`

Use this structure:

```markdown
# Implementation Plan: [Feature Name]

## Overview
[2-3 sentence summary of what will be implemented]

## Context
[Background, motivation, relevant existing code references]

## Design Decision
[Chosen approach and rationale]

## Implementation Phases

### Phase 1: [Name]

**Objective**: [What this phase accomplishes]

**Tasks**:
- [ ] Task 1 with specific file references
- [ ] Task 2 with specific file references

**Success Criteria**:

Automated Verification:
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds

Manual Verification:
- [ ] [Observable behavior to test]
- [ ] [Edge case to verify]

### Phase 2: [Name]
[Continue pattern...]

## Dependencies
[External dependencies, prerequisites, blockers]

## Risks and Mitigations
[Potential issues and how to handle them]
```

## Critical Guidelines

### Be Thorough
- Read entire files, not partial content
- Verify facts through code investigation
- Follow import chains to understand dependencies

### Be Interactive
- Get buy-in at each step
- Allow course corrections throughout
- Present options rather than dictating

### Be Skeptical
- Research user claims before accepting
- Cross-reference multiple sources
- Challenge assumptions with evidence

### Distinguish Success Criteria

**Automated Verification** - Testable via commands:
- Test suites (`npm test`, `make test`)
- Linting (`npm run lint`)
- Type checking (`npm run typecheck`)
- Build success (`npm run build`)

**Manual Verification** - Human-observable behaviors:
- UI/UX behaviors
- Edge cases requiring manual testing
- Performance characteristics
- Integration behaviors

**Never mix these categories** - keep them distinctly separated.

### No Unresolved Questions

**Do NOT write plans with open questions.**

If planning encounters ambiguity:
1. Stop and research further
2. Present options to the user
3. Get resolution before continuing

A plan with "TBD" or "to be determined" sections is incomplete.

## Quality Checklist

Before finalizing any plan:

- [ ] All relevant code has been read completely
- [ ] File:line references are accurate and specific
- [ ] Design fits existing codebase patterns
- [ ] Phases are incrementally implementable
- [ ] Success criteria are measurable and categorized
- [ ] No unresolved questions or TBD sections
- [ ] User has approved structure and approach
