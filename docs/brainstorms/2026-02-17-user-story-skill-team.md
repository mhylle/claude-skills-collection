# Brainstorm: User Story Skill

**Date**: 2026-02-17
**Type**: Team Brainstorm
**Status**: Ready for Planning

## Executive Summary

A skill that generates hierarchical user stories (epics → features → tasks) with formal Given/When/Then acceptance criteria. Works both standalone and from brainstorm output. Positioned as the requirements layer between brainstorming and create-plan, with task-level stories sharing format with create-plan phases for seamless handoff.

## Idea Evolution

### Original Concept
Create a skill for creating user stories based on brainstorm outputs, integrated into the post-brainstorm workflow alongside ADR creation.

### Refined Understanding
A dual-mode user story skill that:
1. **Consumes brainstorm output** when available (auto-detect or explicit path)
2. **Works standalone** with its own clarification phase for direct user input
3. **Produces hierarchical stories** (EPIC → Feature → Task) in separate epic-scoped files with an INDEX
4. **Uses shared format** with create-plan at the task level, so task stories map directly to plan phases
5. **Sits upstream of create-plan** in workflow: `brainstorm → ADRs + user stories → create-plan`

### Key Clarifications Made
- Standalone mode is required (not just brainstorm consumer)
- Workflow position is A: parallel to ADRs, upstream of create-plan
- Full hierarchy needed: epic, feature, and task levels
- Formal Given/When/Then acceptance criteria required
- One file per epic with INDEX.md (follows ADR convention)
- Hierarchical numbering: EPIC-01.F-01.T-01
- Task-level stories share structure with create-plan phases (copy-paste compatible)
- Brainstorm input: accept explicit path AND auto-scan for recent brainstorms

## Analysis Results

### Strengths (Validated through adversarial debate)

1. **Fills the requirements gap** — Current workflow jumps from ideas (brainstorm) to implementation (create-plan). User stories provide the missing requirements layer expressed in user language.

2. **Hierarchical decomposition enables progressive planning** — Epics give big picture, features decompose into plannable chunks, task-level stories map 1:1 to create-plan phases.

3. **Shared format creates seamless handoff** — Task-level stories with Given/When/Then acceptance criteria can be directly imported as create-plan exit conditions, eliminating the translation step.

4. **Dual-mode input maximizes utility** — Works both from rich brainstorm output and from scratch, making it useful in more contexts.

5. **INDEX.md pattern is proven** — Follows the ADR convention for discoverability and tiered reading.

### Risks & Concerns (Survived adversarial scrutiny)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hierarchy bloat — epic files could grow very large | Medium | Medium | Set limits: max 5 features per epic, max 5 tasks per feature. Suggest splitting if exceeded. |
| Parallel ADR+story creation creates ordering ambiguity | Medium | Low | Stories reference ADR IDs; ADRs don't reference stories. One-way dependency. |
| Standalone mode requires significant clarification logic | Medium | Low | Reuse brainstorm's Socratic questioning patterns (scope, users, constraints, success criteria) |
| Shared format with create-plan may drift over time | Low | High | Document the shared format contract in a reference file; both skills import from same template |
| Given/When/Then may be overkill for simple tasks | Low | Low | Allow simplified "Verify: [description]" for trivial tasks; full GWT for non-trivial |

### Gaps Identified

- [ ] **Shared format contract** — Need a reference file defining the exact shared structure between user stories (task level) and create-plan phases
- [ ] **Priority/estimation fields** — Decided to omit for now (keep it narrative-focused), but may want MoSCoW priority at feature level
- [ ] **Story status tracking** — Should stories have status (Draft, Accepted, Implemented)? Recommend: yes, lightweight
- [ ] **Reverse mode** — Creative idea: extract user stories from existing code/plans for documentation. Defer to future enhancement.

### Enhancement Opportunities (SCAMPER)

- **Combine**: Task-level stories could literally become create-plan phase inputs (not just copy-paste compatible, but auto-imported)
- **Adapt**: Borrow persona definition from UX research — define user personas once, reference in all stories
- **Eliminate**: Skip sprint/estimation fields — this is a requirements tool, not project management
- **Reverse**: Future enhancement — generate stories backward from existing implementation for documentation

### Premortem Findings

- **Failure mode**: Skill produces stories that are too generic/template-y → **Prevention**: Require codebase context research (like create-plan does) to ground stories in real code
- **Failure mode**: Users skip stories and go straight to create-plan → **Prevention**: Make create-plan aware of stories; it should check for and reference existing stories
- **Failure mode**: Hierarchical numbering becomes confusing → **Prevention**: INDEX.md provides the map; keep IDs short and consistent

## Structured Concept

### Component 1: Skill Core (`skills/user-story/SKILL.md`)
**Purpose**: Main skill definition with workflow, phases, and output format
**Scope**: Input handling, clarification, research, story generation, output writing
**Dependencies**: ADR skill (for referencing decisions), brainstorm output (optional input)
**Key Decisions**: Fork context, Explore agent type, dual-mode input

### Component 2: Story Template (`skills/user-story/references/story-template.md`)
**Purpose**: Defines the epic file format, story structure at each level, and Given/When/Then patterns
**Scope**: Templates only — no workflow logic
**Dependencies**: Must stay synchronized with create-plan phase format
**Key Decisions**: Hierarchical numbering scheme, shared format contract

### Component 3: Index Template (`skills/user-story/references/index-template.md`)
**Purpose**: Template for the `docs/user-stories/INDEX.md` file
**Scope**: Master index of all epics and their features
**Dependencies**: Follows ADR INDEX.md pattern
**Key Decisions**: Tiered reading strategy (INDEX → epic file → individual stories)

### Component 4: Output Files
**Purpose**: Generated user story artifacts
**Location**: `docs/user-stories/`
**Format**:
- `docs/user-stories/INDEX.md` — Master index
- `docs/user-stories/EPIC-NN-slug.md` — One file per epic with full hierarchy

## Design Decisions

### Decision 1: File Organization — One File Per Epic + INDEX.md (Option B)
**Rationale**: Follows proven ADR pattern. Keeps files focused (one epic = one concern). INDEX.md provides discoverability. Avoids single-file bloat (Option A) and file explosion (Option C).

### Decision 2: Hierarchical Numbering — EPIC-NN.F-NN.T-NN (Option B)
**Rationale**: Provides clear parent-child relationships at a glance. Enables referencing at any level. Works naturally with file-per-epic structure.

### Decision 3: Create-Plan Integration — Shared Format (Option C)
**Rationale**: Task-level stories use the same structure as create-plan phases (objective, tasks, exit conditions). This means create-plan can directly consume task stories as phase definitions, eliminating the translation step.

### Decision 4: Brainstorm Input — Both Modes (Option C)
**Rationale**: Auto-scanning for recent brainstorms reduces friction in the standard workflow, while explicit paths give control. Standalone mode ensures the skill is useful even without a prior brainstorm.

## Proposed Output Format

### INDEX.md Structure
```markdown
# User Stories Index

| Epic | Title | Features | Status |
|------|-------|----------|--------|
| [EPIC-01](./EPIC-01-user-auth.md) | User Authentication | 3 | Draft |
| [EPIC-02](./EPIC-02-dashboard.md) | Dashboard | 4 | Draft |
```

### Epic File Structure
```markdown
# EPIC-01: User Authentication

> **Quick Reference** | Status: Draft | Date: 2026-02-17
> **Objective**: Users can securely authenticate to access protected resources
> **Features**: 3 | **Tasks**: 8

---

## Epic Description
As a [user type], I want [goal] so that [benefit].

## Features

### EPIC-01.F-01: Login Flow

As a registered user, I want to log in with my credentials so that I can access my account.

#### Tasks

##### EPIC-01.F-01.T-01: Login Form Submission

**Objective**: Handle login form submission and credential validation

**Acceptance Criteria**:

- **Given** a registered user on the login page
  **When** they enter valid credentials and click submit
  **Then** they are redirected to the dashboard with an active session

- **Given** a user on the login page
  **When** they enter invalid credentials
  **Then** they see an error message and remain on the login page

**Tasks** (tests first, then implementation):
- [ ] Write tests: [test file] covering [scenarios]
- [ ] Implement: [file] to make tests pass
- [ ] Verify: [specific check]

**Exit Conditions**:
[Follows create-plan phase format - build/runtime/functional verification]
```

### Shared Format Contract (Task Level ↔ Plan Phase)

Both task-level stories and create-plan phases share:
```
**Objective**: [What this accomplishes]
**Tasks** (tests first, then implementation):
- [ ] Write tests: ...
- [ ] Implement: ...
- [ ] Verify: ...
**Exit Conditions**:
- Build Verification: ...
- Runtime Verification: ...
- Functional Verification: ...
```

User stories ADD to this shared base:
```
**Acceptance Criteria** (Given/When/Then):
- Given [precondition] When [action] Then [result]
```

## Proposed Skill Workflow

### Phase 1: Input Detection
1. Check for explicit brainstorm file path argument
2. If no argument, scan `docs/brainstorms/` for files from last 7 days
3. If brainstorm files found, offer to use them
4. If standalone, proceed to Socratic clarification

### Phase 2: Context Gathering
1. Read brainstorm output (if available)
2. Read existing user stories INDEX.md (if exists)
3. Read relevant ADRs
4. Research codebase for existing patterns

### Phase 3: Clarification (especially in standalone mode)
- Who are the users/personas?
- What are the core goals?
- What are the constraints?
- What does success look like?
- What's the scope boundary?

### Phase 4: Story Generation
1. Identify epics from high-level goals
2. Decompose epics into features
3. Decompose features into tasks
4. Write Given/When/Then acceptance criteria
5. Add exit conditions in shared create-plan format

### Phase 5: Output
1. Write epic files to `docs/user-stories/EPIC-NN-slug.md`
2. Create/update `docs/user-stories/INDEX.md`
3. Report summary and suggest next steps

## Recommended Next Steps

1. **Create ADRs** for the key design decisions (file organization, numbering, shared format, brainstorm integration)
2. **Create the skill** via create-plan with this brainstorm as input
3. **Create shared format reference** — a reference file both user-story and create-plan skills can import
4. **Update create-plan** to check for and reference existing user stories when available

## Ready for Create-Plan

**Yes**

### Suggested Plan Scope
Create the user-story skill with:
- `skills/user-story/SKILL.md` — Main skill definition
- `skills/user-story/references/story-template.md` — Story format templates
- `skills/user-story/references/index-template.md` — INDEX.md template
- `skills/user-story/references/shared-format.md` — Shared format contract with create-plan

### Suggested ADRs
1. ADR: User Story File Organization (one file per epic + INDEX.md)
2. ADR: Hierarchical Story Numbering Scheme
3. ADR: Shared Format Contract Between User Stories and Create-Plan
4. ADR: User Story Workflow Position (upstream of create-plan)
