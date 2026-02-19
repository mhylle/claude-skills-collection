# Implementation Plan: User Story Skill

## Overview

Create a `user-story` skill that generates hierarchical user stories (epics, features, tasks) with formal Given/When/Then acceptance criteria. The skill works in two modes: consuming brainstorm output for rich context, or standalone with its own clarification phase. It produces files in `docs/user-stories/` and positions itself upstream of `create-plan` in the workflow, with task-level stories sharing format with create-plan phases for seamless handoff.

## Context

The current workflow has a gap between ideation (brainstorm) and technical planning (create-plan). There is no formal requirements layer that expresses what users need in their language. The user-story skill fills this gap, providing hierarchical decomposition (epic, feature, task) grounded in user needs and expressed with Given/When/Then acceptance criteria. Four ADRs have already been accepted establishing the design decisions for file organization (ADR-0003), numbering (ADR-0004), shared format (ADR-0005), and workflow position (ADR-0006).

## Design Decision

Create a full-featured skill with separate reference files following the established skill conventions in this codebase.

**Related ADRs:**
- [ADR-0003](../decisions/ADR-0003-user-story-file-organization.md): One file per epic with central INDEX.md
- [ADR-0004](../decisions/ADR-0004-hierarchical-story-numbering.md): Hierarchical numbering (EPIC-NN.F-NN.T-NN)
- [ADR-0005](../decisions/ADR-0005-shared-format-user-stories-create-plan.md): Shared format contract between user stories and create-plan
- [ADR-0006](../decisions/ADR-0006-user-story-workflow-position.md): User stories upstream of create-plan, parallel to ADRs

## Implementation Phases

### Phase 1: Core Skill Definition

**Objective**: Create `skills/user-story/SKILL.md` with the complete skill workflow, YAML frontmatter, and all phases from input detection through output generation.

**Verification Approach**: The skill file is valid markdown with correct YAML frontmatter, follows the established skill structure pattern, references the correct reference files, and contains all workflow phases defined in the brainstorm.

**Tasks** (tests first, then implementation):
- [ ] Verify: Read `skills/brainstorm/SKILL.md` and `skills/create-plan/SKILL.md` to confirm the patterns being followed
- [ ] Implement: Create `skills/user-story/SKILL.md` with YAML frontmatter (`name: user-story`, `description`, `context: fork`, `agent: Explore`, `argument-hint: "[brainstorm-path?]"`)
- [ ] Implement: Write Phase 1 (Input Detection) -- check for explicit brainstorm path argument, auto-scan `docs/brainstorms/` for recent files, offer to use them, or proceed to standalone clarification
- [ ] Implement: Write Phase 2 (Context Gathering) -- read brainstorm output if available, read existing user stories INDEX.md, read relevant ADRs, research codebase for existing patterns
- [ ] Implement: Write Phase 3 (Clarification) -- Socratic questioning for standalone mode covering users/personas, core goals, constraints, success criteria, scope boundary
- [ ] Implement: Write Phase 4 (Story Generation) -- identify epics from high-level goals, decompose into features (max 5 per epic), decompose into tasks (max 5 per feature), write Given/When/Then acceptance criteria, add exit conditions in shared format
- [ ] Implement: Write Phase 5 (Output) -- write epic files to `docs/user-stories/EPIC-NN-slug.md`, create/update `docs/user-stories/INDEX.md`, report summary and suggest next steps
- [ ] Implement: Write Quality Checklist and Best Practices sections
- [ ] Verify: All 5 workflow phases are present and complete with no TBD sections

**Exit Conditions**:

Build Verification:
- [ ] `skills/user-story/SKILL.md` exists and is valid markdown
- [ ] YAML frontmatter parses correctly

Functional Verification:
- [ ] SKILL.md references all three reference files
- [ ] Phase 1 includes both brainstorm-consumption and standalone modes
- [ ] Phase 4 includes Given/When/Then acceptance criteria format
- [ ] Phase 5 follows epic file structure from ADR-0003 and numbering from ADR-0004
- [ ] Shared format section matches the contract in ADR-0005
- [ ] Epic file size limits documented (max 5 features per epic, max 5 tasks per feature)

---

### Phase 2: Reference Files

**Objective**: Create the three reference files that define templates and the shared format contract.

**Verification Approach**: Each reference file is valid markdown, follows the template conventions used by other skills' reference files, and the shared-format.md accurately reflects both the user-story task-level format and the create-plan phase format.

**Tasks** (tests first, then implementation):
- [ ] Verify: Read existing reference files (adr-template.md, index-template.md) to confirm conventions
- [ ] Implement: Create `skills/user-story/references/story-template.md` -- epic file format with Quick Reference block, story structure at each level, Given/When/Then patterns, shared format fields, status field (Draft/Accepted/Implemented)
- [ ] Implement: Create `skills/user-story/references/index-template.md` -- INDEX.md format with epic table, category grouping, tiered reading instructions
- [ ] Implement: Create `skills/user-story/references/shared-format.md` -- exact shared structure between task-level stories and create-plan phases (Objective, Tasks, Exit Conditions) plus the Given/When/Then addition
- [ ] Verify: shared-format.md structure matches create-plan's phase format exactly

**Exit Conditions**:

Build Verification:
- [ ] All three reference files exist under `skills/user-story/references/`
- [ ] All files are valid markdown

Functional Verification:
- [ ] `story-template.md` includes Given/When/Then template and shared format fields
- [ ] `index-template.md` includes table format and tiered reading instructions
- [ ] `shared-format.md` documents both the shared base and the user-story addition
- [ ] Cross-reference: SKILL.md Phase 4 output format matches story-template.md

---

### Phase 3: Integration and Documentation

**Objective**: Update workflow documentation to include the user-story skill in the pipeline and update the README to list the new skill.

**Verification Approach**: Documentation files accurately reflect the new workflow position and the README lists the skill with correct description.

**Tasks** (tests first, then implementation):
- [ ] Verify: Read README.md, workflow-overview, and detailed-workflow to identify update points
- [ ] Implement: Update README.md to add user-story to the skills table
- [ ] Implement: Update workflow documentation to include user-story between brainstorm and create-plan
- [ ] Verify: Workflow diagram shows brainstorm -> (ADRs + user stories) -> create-plan

**Exit Conditions**:

Build Verification:
- [ ] All modified documentation files are valid markdown
- [ ] No broken markdown links

Functional Verification:
- [ ] README.md lists user-story skill with description and type
- [ ] Workflow overview shows correct pipeline position
- [ ] ADR-0006 workflow position matches documentation

## Dependencies

- ADR-0003 through ADR-0006 (already created and accepted)
- `skills/brainstorm/references/questioning-frameworks.md` (exists -- referenced for standalone mode)
- No external dependencies or package installations required

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Shared format drifts from create-plan | Medium | High | shared-format.md is single source of truth; document in both skills |
| Epic files grow too large | Medium | Medium | Enforce limits (max 5 features/epic, max 5 tasks/feature) |
| Standalone mode clarification too shallow | Low | Medium | Reference brainstorm questioning-frameworks for depth |
| Skill is bypassed | Medium | Low | Acceptable -- skill is optional; future: modify create-plan to check for stories |
