# User Story Epic File Template

Template for epic files stored at `docs/user-stories/EPIC-NN-slug.md`.

## Epic File Format

```markdown
# EPIC-NN: [Epic Title]

> **Quick Reference** | Status: [Draft/Accepted/Implemented] | Date: YYYY-MM-DD
> **Objective**: [One sentence: what capability this epic delivers]
> **Users**: [Primary user types/personas]
> **Features**: N | **Tasks**: N

---

## Epic Description

As a [user type], I want [high-level goal] so that [business/user benefit].

## Features

### EPIC-NN.F-01: [Feature Title]

As a [user type], I want [specific capability] so that [benefit].

#### Tasks

##### EPIC-NN.F-01.T-01: [Task Title]

**Objective**: [What this task accomplishes - one sentence]

**Acceptance Criteria**:

- **Given** [precondition describing the starting state]
  **When** [action the user or system takes]
  **Then** [observable expected result]

- **Given** [different precondition or error scenario]
  **When** [action]
  **Then** [expected behavior for this case]

**Tasks** (tests first, then implementation):
- [ ] Write tests: [test file] covering [specific scenarios]
- [ ] Implement: [file/module] to make tests pass
- [ ] Verify: [specific check or command]

**Exit Conditions**:

Build Verification:
- [ ] `[build command]` succeeds
- [ ] `[lint command]` passes

Runtime Verification:
- [ ] Application starts without errors
- [ ] No runtime exceptions in console

Functional Verification:
- [ ] `[test command]` passes
- [ ] [Specific acceptance criterion]: [verification command or observable behavior]

---

##### EPIC-NN.F-01.T-02: [Next Task Title]

[Continue task pattern...]

---

### EPIC-NN.F-02: [Next Feature Title]

[Continue feature pattern...]

## Dependencies

- [External dependencies, prerequisites, or related epics]

## Notes

- [Any additional context, open questions, or future considerations]
```

## Quick Reference Block (Mandatory)

The first 4 lines after the title form the Quick Reference block, enabling LLMs to assess relevance without reading the full file:

```markdown
> **Quick Reference** | Status: [Status] | Date: [Date]
> **Objective**: [One sentence describing the epic's user-facing goal]
> **Users**: [Comma-separated list of user types/personas]
> **Features**: N | **Tasks**: N
```

## Status Values

| Status | Meaning |
|--------|---------|
| **Draft** | Stories defined, not yet reviewed/accepted |
| **Accepted** | Stories reviewed and approved for implementation |
| **Implemented** | All tasks completed and verified |

## Size Guidelines

| Element | Limit | Action if Exceeded |
|---------|-------|--------------------|
| Features per epic | Max 5 | Split the epic into two |
| Tasks per feature | Max 5 | Split the feature into two |
| Given/When/Then per task | Max 4 | Split the task or simplify |
| Total epic file | ~200 lines | Ensure hierarchy limits are respected |

## Hierarchical Numbering (ADR-0004)

| Level | Format | Example |
|-------|--------|---------|
| Epic | `EPIC-NN` | `EPIC-01` |
| Feature | `EPIC-NN.F-NN` | `EPIC-01.F-03` |
| Task | `EPIC-NN.F-NN.T-NN` | `EPIC-01.F-03.T-02` |

Numbers are zero-padded to 2 digits. Sequential within their parent level.

## Task-Level Shared Format

Task-level stories use the shared format contract with create-plan (see `shared-format.md`). The shared fields are:

```
**Objective**: [What this accomplishes]

**Tasks** (tests first, then implementation):
- [ ] Write tests: ...
- [ ] Implement: ...
- [ ] Verify: ...

**Exit Conditions**:
Build Verification: ...
Runtime Verification: ...
Functional Verification: ...
```

User stories add on top of this shared base:

```
**Acceptance Criteria**:
- **Given** ... **When** ... **Then** ...
```
