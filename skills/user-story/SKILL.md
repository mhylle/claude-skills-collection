---
name: user-story
description: Generate hierarchical user stories (epics, features, tasks) with formal Given/When/Then acceptance criteria. Works from brainstorm output or standalone. Produces structured requirements that feed directly into create-plan. Triggers on "create user stories", "write stories", "define requirements", "user story", or when presenting features that need requirements decomposition.
context: fork
agent: Explore
argument-hint: "[brainstorm-path?]"
---

# User Story

## Overview

This skill generates hierarchical user stories (epics → features → tasks) with formal Given/When/Then acceptance criteria. It works in two modes: consuming brainstorm output for rich context, or standalone with its own clarification phase. Task-level stories share format with create-plan phases for seamless handoff.

**Workflow Position**: `brainstorm → (ADRs + user stories) → create-plan → implement-plan`

**Related ADRs**:
- [ADR-0003](../../docs/decisions/ADR-0003-user-story-file-organization.md): One file per epic with INDEX.md
- [ADR-0004](../../docs/decisions/ADR-0004-hierarchical-story-numbering.md): Hierarchical numbering (EPIC-NN.F-NN.T-NN)
- [ADR-0005](../../docs/decisions/ADR-0005-shared-format-user-stories-create-plan.md): Shared format contract with create-plan
- [ADR-0006](../../docs/decisions/ADR-0006-user-story-workflow-position.md): Upstream of create-plan, parallel to ADRs

## Initial Response

When this skill is invoked, respond:

> "I'm ready to help you define user stories. I can work from a brainstorm document or start fresh. Let me check for recent brainstorms, or you can describe the feature/system you want to define requirements for."

## Workflow (5 Phases)

### Phase 1: Input Detection

Determine the input mode and gather initial context.

**Step 1: Check for explicit brainstorm path**

If the user passed a file path argument (`$0`):
```
Read($0)  # Read the brainstorm file
```
→ Proceed to Phase 2 with brainstorm content as context.

**Step 2: Auto-scan for recent brainstorms**

If no argument provided, scan for recent brainstorm files:
```
Glob("docs/brainstorms/*.md")
```

| Scenario | Action |
|----------|--------|
| Recent brainstorms found (last 7 days) | Present list and ask: "I found these recent brainstorms. Would you like to base user stories on one of them, or start fresh?" |
| No recent brainstorms | Proceed to standalone mode (Phase 3) |
| User selects a brainstorm | Read the file, proceed to Phase 2 |
| User wants to start fresh | Proceed to Phase 3 |

**Step 3: Check for existing user stories**

Always check for existing stories to avoid duplication:
```
Read("docs/user-stories/INDEX.md")  # If it exists
```

If existing stories overlap with the current scope, note them and ask whether to extend, revise, or create new epics.

### Phase 2: Context Gathering

Gather all relevant context before generating stories.

**Always do:**

1. **Read brainstorm output** (if available from Phase 1)
   - Extract: goals, components, risks, decisions, suggested scope
   - Identify user types/personas mentioned

2. **Read existing ADRs** for architectural context:
   ```
   Read("docs/decisions/INDEX.md")
   # Then Quick Reference (first 10 lines) of relevant ADRs
   ```

3. **Read existing user stories INDEX** (if it exists):
   ```
   Read("docs/user-stories/INDEX.md")
   ```

**When project context is detected** (user mentions codebase, files, modules):

4. **Research codebase** for existing patterns:
   ```
   Task(subagent_type="codebase-locator",
        prompt="Find all files related to [feature area]")
   Task(subagent_type="codebase-analyzer",
        prompt="Analyze how [related functionality] is implemented")
   ```

After gathering context, present a summary:
```
## Context Summary
- **Source**: [Brainstorm file / Standalone input]
- **Existing Stories**: [None / EPIC-01, EPIC-02...]
- **Relevant ADRs**: [ADR-NNNN, ...]
- **Codebase Context**: [Key files and patterns found]
```

Then proceed to Phase 3 if standalone, or Phase 4 if brainstorm input provides sufficient context.

### Phase 3: Clarification (Standalone Mode)

When working without brainstorm input, use targeted Socratic questioning to understand requirements.

**Round 1: Users & Goals** (ask 2-3 questions)

| Category | Example Questions |
|----------|------------------|
| **Users/Personas** | "Who are the primary users of this system/feature?" |
| | "Are there different user roles with different needs?" |
| **Core Goals** | "What is the primary problem being solved?" |
| | "What does success look like for the user?" |

**Round 2: Scope & Constraints** (ask 2-3 questions)

| Category | Example Questions |
|----------|------------------|
| **Scope** | "What is explicitly in scope for this work?" |
| | "What should be considered out of scope?" |
| **Constraints** | "Are there technical constraints to be aware of?" |
| | "Are there existing systems this must integrate with?" |

**Round 3: Success Criteria** (ask 2-3 questions)

| Category | Example Questions |
|----------|------------------|
| **Acceptance** | "How will you know this feature is working correctly?" |
| | "What are the key scenarios that must work?" |
| **Edge Cases** | "What error cases or edge cases concern you most?" |
| | "What happens when things go wrong?" |

**Continuation Protocol**:
- After each round, offer: "I have more questions if you'd like to continue refining, or we can move to story generation. Your call."
- Continue until user signals readiness
- Do NOT rush -- thorough clarification produces better stories

### Phase 4: Story Generation

Generate hierarchical user stories from the gathered context.

**Step 1: Identify Epics**

Extract high-level goals/capabilities from the input. Each epic represents a major user-facing capability.

```
Epic format:
  ID: EPIC-NN
  Title: [Capability name]
  Description: As a [user type], I want [goal] so that [benefit]
  Status: Draft
```

**Limits**: If more than 5-7 epics emerge, discuss with the user which to prioritize for this session.

**Step 2: Decompose into Features**

For each epic, identify 2-5 features that compose it:

```
Feature format:
  ID: EPIC-NN.F-NN
  Title: [Feature name]
  Description: As a [user type], I want [specific capability] so that [benefit]
```

**Limit**: Max 5 features per epic. If more emerge, suggest splitting the epic.

**Step 3: Decompose into Tasks**

For each feature, identify 2-5 implementable tasks:

```
Task format (shared with create-plan phases):
  ID: EPIC-NN.F-NN.T-NN
  Title: [Task name]

  **Objective**: [What this task accomplishes]

  **Acceptance Criteria**:
  - **Given** [precondition]
    **When** [action]
    **Then** [expected result]

  **Tasks** (tests first, then implementation):
  - [ ] Write tests: [test file] covering [scenarios]
  - [ ] Implement: [file] to make tests pass
  - [ ] Verify: [specific check or command]

  **Exit Conditions**:
  Build Verification:
  - [ ] [build/lint/typecheck commands]

  Runtime Verification:
  - [ ] [start command, no errors]

  Functional Verification:
  - [ ] [test commands, specific checks]
```

**Limit**: Max 5 tasks per feature. If more emerge, suggest splitting the feature.

**Step 4: Review with User**

Before writing output, present the hierarchy for review:

```
## Story Hierarchy Preview

### EPIC-01: [Title]
  - EPIC-01.F-01: [Feature title] (N tasks)
  - EPIC-01.F-02: [Feature title] (N tasks)

### EPIC-02: [Title]
  - EPIC-02.F-01: [Feature title] (N tasks)

Total: N epics, N features, N tasks

Does this decomposition look right? Any adjustments before I write the detailed stories?
```

Wait for user confirmation before proceeding to output.

### Phase 5: Output

Write the user story files following the conventions from ADR-0003 and ADR-0004.

**Step 1: Create directory** (if needed)
```bash
mkdir -p docs/user-stories
```

**Step 2: Write epic files**

For each epic, write a file using the template from `references/story-template.md`:

File: `docs/user-stories/EPIC-NN-slug.md`

See `references/story-template.md` for the complete format.

**Step 3: Create/update INDEX.md**

Write/update `docs/user-stories/INDEX.md` using the template from `references/index-template.md`.

**Step 4: Report summary**

After writing all files, present:

```
## User Stories Created

| File | Epic | Features | Tasks |
|------|------|----------|-------|
| [EPIC-01-slug.md](docs/user-stories/EPIC-01-slug.md) | [Title] | N | N |
| [EPIC-02-slug.md](docs/user-stories/EPIC-02-slug.md) | [Title] | N | N |

**Index**: docs/user-stories/INDEX.md

## Recommended Next Steps
1. Review and refine acceptance criteria
2. Create ADRs for any architectural decisions identified (`/adr`)
3. Create implementation plan from these stories (`/create-plan`)
```

## Shared Format Contract

Task-level stories share structure with create-plan phases per ADR-0005.

See `references/shared-format.md` for the exact contract.

**Shared base** (both user stories and plan phases):
- Objective
- Tasks (tests first, then implementation)
- Exit Conditions (build/runtime/functional verification)

**User stories add**:
- Acceptance Criteria (Given/When/Then)
- Story description (As a [user], I want [goal] so that [benefit])

## Quality Checklist

Before finalizing output, verify:

**Structure**:
- [ ] All epics have Quick Reference blocks
- [ ] Hierarchical numbering is consistent (EPIC-NN.F-NN.T-NN)
- [ ] Max 5 features per epic, max 5 tasks per feature
- [ ] INDEX.md is created/updated

**Content**:
- [ ] Every story has "As a [user], I want [goal] so that [benefit]"
- [ ] Every task has at least one Given/When/Then acceptance criterion
- [ ] Task-level format matches shared format contract (Objective, Tasks, Exit Conditions)
- [ ] Exit conditions cover build, runtime, and functional verification
- [ ] Status is set (Draft for new stories)

**Context**:
- [ ] Brainstorm input was fully consumed (if applicable)
- [ ] Existing stories were checked for overlap
- [ ] Relevant ADRs are referenced
- [ ] User confirmed the hierarchy before output was written

## Best Practices

### Writing Good User Stories

1. **Users, not systems**: Write from the user's perspective, not the system's
2. **Independent**: Each feature should be independently deliverable where possible
3. **Testable**: Every story should have clear, verifiable acceptance criteria
4. **Small enough**: If a task has more than 3-4 Given/When/Then criteria, consider splitting it

### Writing Good Acceptance Criteria

1. **Specific**: "Given a user with admin role" not "Given a user"
2. **Observable**: Focus on visible outcomes, not internal state
3. **Complete**: Cover the happy path AND key error/edge cases
4. **Independent**: Each criterion tests one behavior

### Hierarchy Guidelines

| Level | Represents | Timeframe | Example |
|-------|-----------|-----------|---------|
| **Epic** | Major user capability | Weeks-months | "User Authentication" |
| **Feature** | Deliverable functionality | Days-weeks | "Password Reset Flow" |
| **Task** | Single implementable unit | Hours-days | "Email Validation on Reset Form" |

### Integration with Create-Plan

When create-plan is invoked after user stories:
- Each task-level story can become a plan phase
- Given/When/Then criteria become exit conditions
- The shared format means no translation step is needed
- Reference story IDs in the plan for traceability

## Resources

### references/
- `story-template.md` - Epic file format and story structure at each level
- `index-template.md` - INDEX.md template for user stories directory
- `shared-format.md` - Shared format contract between user stories and create-plan
