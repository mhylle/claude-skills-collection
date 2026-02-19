# Shared Format Contract: User Stories ↔ Create-Plan

This document defines the shared structure between task-level user stories and create-plan implementation phases, per [ADR-0005](../../../docs/decisions/ADR-0005-shared-format-user-stories-create-plan.md).

**Both skills MUST consult this file when generating task/phase-level output.** This is the single source of truth for the shared format.

## Shared Base Structure

Both task-level user stories and create-plan phases use this identical structure:

```markdown
**Objective**: [What this task/phase accomplishes - one sentence]

**Tasks** (tests first, then implementation):
- [ ] Write tests: [test file] covering [specific scenarios]
- [ ] Implement: [file/module] to make tests pass
- [ ] Verify: [specific check or command]

**Exit Conditions**:

Build Verification:
- [ ] `[build command]` succeeds
- [ ] `[lint command]` passes
- [ ] `[typecheck command]` passes (if applicable)

Runtime Verification:
- [ ] Application starts: `[start command]`
- [ ] No runtime errors in console
- [ ] [Service/endpoint] is accessible

Functional Verification:
- [ ] `[test command]` passes
- [ ] [Specific test]: `[targeted test command]`
- [ ] [Manual check]: [Observable behavior to verify]
```

## User Story Additions

User stories add these fields **above** the shared base:

```markdown
**Acceptance Criteria**:

- **Given** [precondition describing the starting state]
  **When** [action the user or system takes]
  **Then** [observable expected result]

- **Given** [different precondition or error/edge case]
  **When** [action]
  **Then** [expected behavior]
```

## Create-Plan Additions

Create-plan phases add this field **above** the shared base:

```markdown
**Verification Approach**: [How will we verify this phase works? Description of the testing strategy.]
```

## Complete Side-by-Side Comparison

### User Story Task (EPIC-01.F-01.T-01)

```markdown
##### EPIC-01.F-01.T-01: Validate Login Credentials

**Objective**: Handle login form submission and credential validation

**Acceptance Criteria**:

- **Given** a registered user on the login page
  **When** they enter valid credentials and click submit
  **Then** they are redirected to the dashboard with an active session

- **Given** a user on the login page
  **When** they enter invalid credentials
  **Then** they see an error message and remain on the login page

**Tasks** (tests first, then implementation):
- [ ] Write tests: `auth.spec.ts` covering valid login, invalid login, missing fields
- [ ] Implement: `auth.controller.ts` login endpoint
- [ ] Verify: `npm test -- auth` passes

**Exit Conditions**:

Build Verification:
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

Runtime Verification:
- [ ] `npm run dev` starts without errors
- [ ] Login endpoint responds on `/api/auth/login`

Functional Verification:
- [ ] `npm test -- auth` passes
- [ ] Valid credentials return 200 with session token
- [ ] Invalid credentials return 401 with error message
```

### Equivalent Create-Plan Phase

```markdown
### Phase 1: Login Credential Validation

**Objective**: Handle login form submission and credential validation

**Verification Approach**: Unit tests verify credential validation logic.
Integration test confirms the login endpoint accepts valid credentials and rejects invalid ones.

**Tasks** (tests first, then implementation):
- [ ] Write tests: `auth.spec.ts` covering valid login, invalid login, missing fields
- [ ] Implement: `auth.controller.ts` login endpoint
- [ ] Verify: `npm test -- auth` passes

**Exit Conditions**:

Build Verification:
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

Runtime Verification:
- [ ] `npm run dev` starts without errors
- [ ] Login endpoint responds on `/api/auth/login`

Functional Verification:
- [ ] `npm test -- auth` passes
- [ ] Valid credentials return 200 with session token
- [ ] Invalid credentials return 401 with error message
```

## Mapping Rules

When create-plan consumes user stories:

| User Story Element | Maps To |
|--------------------|---------|
| Task title | Phase name |
| Objective | Objective (direct copy) |
| Acceptance Criteria | Verification Approach (summarized) + Functional Verification items |
| Tasks | Tasks (direct copy) |
| Exit Conditions | Exit Conditions (direct copy, may add more) |

## Maintenance

- **Any changes to the shared base structure must be reflected in both skills**
- This file is the authoritative reference -- if SKILL.md conflicts with this file, this file wins
- Review this contract when modifying either the user-story or create-plan skills
