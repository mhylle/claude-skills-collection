# Implementation Plan Format Reference

Standard format and guidelines for technical implementation plans.

## Plan File Structure

```markdown
# [Feature/Task Name] Implementation Plan

## Overview
Brief description of what this plan accomplishes.

## Prerequisites
- Required dependencies installed
- Environment configured
- Related tickets/issues linked

## Phase 1: [Phase Name]

### Objectives
- Primary goal of this phase
- Secondary outcomes

### Verification Approach
[How will we verify this phase works? What tests, commands, or checks will confirm success?]

### Work Items
1. Write tests: `path/to/file.spec.ts` - Test cases for [scenarios]
2. Implement: `path/to/file.ts` - Implementation to make tests pass
3. Verify: [specific command or check]

### Exit Conditions

> Phase cannot proceed until ALL conditions pass.

Build Verification:
- `npm run build` succeeds
- `npm run lint` passes
- `npm run typecheck` passes

Runtime Verification:
- Application starts without errors
- [Service/endpoint] accessible

Functional Verification:
- `npm test` passes
- [Feature-specific check]
- [Manual check]: [observable behavior]

---

## Phase 2: [Phase Name]
[Repeat structure]

---

## Final Verification
- All phases complete
- Integration tests pass
- Documentation updated
- Ready for review
```

## Phase Organization Guidelines

### Phase Sizing
- **Atomic**: Each phase should be independently verifiable
- **Focused**: One logical unit of work per phase
- **Reversible**: Changes can be rolled back if issues arise
- **Time-boxed**: Typically 30-120 minutes of implementation work

### Phase Dependencies
- List dependencies at the start of each phase
- Phases should build on previous phases logically
- Avoid circular dependencies between phases

### Recommended Phase Types

| Phase Type | Purpose | Example |
|------------|---------|---------|
| Setup | Environment, dependencies | "Install required packages" |
| Foundation | Core structures, interfaces | "Create base service class" |
| Implementation | Feature code | "Implement user authentication" |
| Integration | Connect components | "Wire up API endpoints" |
| Testing | Add test coverage | "Add unit tests for auth service" |
| Documentation | Update docs | "Document API endpoints" |
| Cleanup | Remove deprecated code | "Remove legacy auth system" |

## Progress Tracking

Progress is tracked via **Task tools**, not checkboxes. See [ADR-0001](../../../docs/decisions/ADR-0001-separate-plan-spec-from-progress-tracking.md) for the architectural decision.

### Task Tools Overview

| Tool | Purpose |
|------|---------|
| `TaskCreate` | Create new tasks with subject, description, and activeForm |
| `TaskUpdate` | Update status (pending/in_progress/completed), set dependencies |
| `TaskList` | View all tasks and their current status |
| `TaskGet` | Retrieve full details of a specific task |

### Work Item to Task Mapping

Each work item maps to a task with a standardized naming convention:

- **Phase 1.1**: First work item in Phase 1
- **Phase 1.2**: Second work item in Phase 1
- **Phase 2.1**: First work item in Phase 2

Example task creation:
```
TaskCreate:
  subject: "Phase 1.1: Write password utility tests"
  description: "Create src/utils/password.spec.ts with tests for hash generation, comparison, and invalid inputs"
  activeForm: "Writing password utility tests"
```

### Dependency Management

Use `blocks` and `blockedBy` to express task dependencies:

- **blockedBy**: Tasks that must complete before this one can start
- **blocks**: Tasks that cannot start until this one completes

Example:
```
TaskUpdate:
  taskId: "phase-1-2"
  addBlockedBy: ["phase-1-1"]  # Implementation blocked by tests
```

### Cross-Session Persistence

Tasks persist across sessions, enabling:
- Resumption of work after interruptions
- Handoff between team members
- Clear audit trail of progress

## Exit Condition Patterns

Exit conditions are **blocking gates** - a phase cannot proceed until ALL conditions pass. Each phase must have checks in all three verification categories.

### Standard Exit Condition Structure
```markdown
**Exit Conditions**:

> Phase cannot proceed until ALL conditions pass.

Build Verification:
- `[build command]` succeeds
- `[lint command]` passes
- `[typecheck command]` passes

Runtime Verification:
- Application starts: `[start command]`
- No runtime errors in console
- [Service/endpoint] accessible at [URL]

Functional Verification:
- `[test command]` passes
- [Specific feature test]: `[targeted test command]`
- [Manual check]: [Observable behavior]
```

### Build Verification Examples
```markdown
Build Verification:
- `npm run build` succeeds (0 errors)
- `npm run lint` passes (0 errors, 0 warnings)
- `npm run typecheck` passes
- Bundle size under 500KB: `npm run build:analyze`
```

### Runtime Verification Examples
```markdown
Runtime Verification:
- `npm run start` starts without errors
- Server listens on port 3000
- Health endpoint responds: `curl http://localhost:3000/health`
- No unhandled promise rejections in console
- Database connection established
```

### Functional Verification Examples
```markdown
Functional Verification:
- `npm test` passes (all tests green)
- `npm run test:e2e` passes
- Auth endpoint returns 200 on valid credentials
- Auth endpoint returns 401 on invalid credentials
- JWT token contains expected claims (sub, exp, iat)
- Rate limiting triggers after 100 requests/minute
```

### Manual Verification (User Confirms)
```markdown
Manual Verification (user to confirm):
- Login form accepts valid credentials
- Error message displays for invalid credentials
- Session persists after page refresh
- Logout clears session completely
```

## Verification Step Templates

### Frontend Verification
```markdown
- Component renders without console errors
- Responsive design works at 320px, 768px, 1024px, 1440px
- Keyboard navigation functional (Tab, Enter, Escape)
- Screen reader announces content correctly
- Loading states display appropriately
- Error states handled gracefully
```

### Backend Verification
```markdown
- Endpoint returns correct status codes (200, 400, 401, 404, 500)
- Response payload matches schema
- Authentication required where expected
- Rate limiting enforced
- Logging captures relevant information
- Database transactions commit/rollback correctly
```

### Security Verification
```markdown
- Input validation prevents injection attacks
- Authentication tokens validated
- Authorization checks enforced
- Sensitive data not logged
- CORS configured correctly
- Rate limiting prevents abuse
```

## Plan Metadata (Optional)

Include at the top of complex plans:

```markdown
---
ticket: JIRA-1234
author: developer@example.com
created: 2024-01-15
estimated_phases: 5
estimated_time: 4h
task_list_id: plan-auth-impl-2024-01-15
dependencies:
  - JIRA-1230 (must be complete)
  - feature-branch-x (must be merged)
---
```

The `task_list_id` field provides a unique identifier for tracking this plan's tasks across sessions. When resuming work, use this ID to retrieve the existing task list.

## Example: Complete Plan

```markdown
# User Authentication Implementation Plan

## Overview
Implement JWT-based authentication with login, logout, and session management.

## Prerequisites
- PostgreSQL database running
- Environment variables configured (.env)
- JWT secret generated

---

## Phase 1: Database Schema

### Objectives
- Create users table with authentication fields
- Set up password hashing utilities

### Verification Approach
Unit tests verify password hashing generates valid bcrypt hashes and comparison works correctly.
Migration test confirms table creation succeeds.

### Work Items
1. Write tests: `src/utils/password.spec.ts` - hash generation, hash comparison, invalid inputs
2. Implement: `src/migrations/001-create-users.ts` - Create users table migration
3. Implement: `src/utils/password.ts` - Add bcrypt hashing utilities
4. Verify: `npm test -- password` passes

### Exit Conditions

> Phase cannot proceed until ALL conditions pass.

Build Verification:
- `npm run build` succeeds
- `npm run lint` passes

Runtime Verification:
- `npm run migration:run` succeeds
- Database connection established

Functional Verification:
- `npm test -- --grep "password"` passes
- Verify users table exists in database

---

## Phase 2: Authentication Service

### Objectives
- Implement login/logout logic
- JWT token generation and validation

### Verification Approach
Unit tests verify JWT generation, validation, and expiration handling.
Integration tests confirm login/logout flows work end-to-end.

### Work Items
1. Write tests: `src/auth/auth.service.spec.ts` - login, logout, token validation, expiration
2. Write tests: `src/auth/auth.guard.spec.ts` - route protection, missing token, invalid token
3. Write tests: `src/auth/jwt.strategy.spec.ts` - JWT parsing, claim extraction
4. Implement: `src/auth/auth.service.ts` - Core authentication logic
5. Implement: `src/auth/auth.guard.ts` - Route protection guard
6. Implement: `src/auth/jwt.strategy.ts` - Passport JWT strategy
7. Verify: `npm test -- auth` passes

### Exit Conditions

> Phase cannot proceed until ALL conditions pass.

Build Verification:
- `npm run build` succeeds
- `npm run lint` passes
- `npm run typecheck` passes

Runtime Verification:
- Application starts with `npm run start`
- No auth-related runtime errors

Functional Verification:
- `npm test -- --grep "auth"` passes
- Login with valid credentials returns token
- Login with invalid credentials returns 401

---

## Phase 3: API Endpoints

### Objectives
- Expose authentication endpoints
- Add protected route examples

### Verification Approach
E2E tests verify all endpoints respond correctly to valid and invalid requests.
Manual verification confirms the full login flow works in browser/Postman.

### Work Items
1. Write tests: `src/auth/auth.controller.spec.ts` - all endpoint scenarios
2. Write tests: `test/auth.e2e-spec.ts` - full flow integration tests
3. Implement: `src/auth/auth.controller.ts` - Login/logout/refresh endpoints
4. Implement: `src/auth/auth.module.ts` - Module configuration
5. Verify: `npm test && npm run test:e2e` passes

### Exit Conditions

> Phase cannot proceed until ALL conditions pass.

Build Verification:
- `npm run build` succeeds
- `npm run lint` passes

Runtime Verification:
- `npm run start` starts server on port 3000
- `curl http://localhost:3000/health` returns 200

Functional Verification:
- `npm test` passes
- POST /auth/login returns token with valid credentials
- POST /auth/login returns 401 with invalid credentials
- POST /auth/logout invalidates session
- GET /auth/profile returns user (with token)
- GET /auth/profile returns 401 (without token)

---

## Final Verification
- All phases complete
- E2E tests pass: `npm run test:e2e`
- API documentation updated
- Security review checklist complete
```

## Exit Condition Templates by Project Type

### Node.js/TypeScript
```markdown
**Exit Conditions**:

> Phase cannot proceed until ALL conditions pass.

Build Verification:
- `npm run build` succeeds
- `npm run lint` passes
- `npm run typecheck` passes

Runtime Verification:
- `npm run start` starts without errors
- Server responds on port 3000
- `curl http://localhost:3000/health` returns 200

Functional Verification:
- `npm test` passes
- `npm run test:e2e` passes (if applicable)
- [Feature-specific checks]
```

### Python
```markdown
**Exit Conditions**:

> Phase cannot proceed until ALL conditions pass.

Build Verification:
- `pip install -e .` succeeds
- `flake8` or `ruff check .` passes
- `mypy .` passes (if using type hints)

Runtime Verification:
- `python -m [module]` starts without errors
- Service responds on expected port
- No uncaught exceptions in logs

Functional Verification:
- `pytest` passes
- `pytest tests/integration` passes (if applicable)
- [Feature-specific checks]
```

### Go
```markdown
**Exit Conditions**:

> Phase cannot proceed until ALL conditions pass.

Build Verification:
- `go build ./...` succeeds
- `golangci-lint run` passes
- `go vet ./...` passes

Runtime Verification:
- `go run .` or compiled binary starts
- Health endpoint responds at /health
- No panics in logs

Functional Verification:
- `go test ./...` passes
- `go test -race ./...` passes (race detection)
- [Feature-specific checks]
```

### Rust
```markdown
**Exit Conditions**:

> Phase cannot proceed until ALL conditions pass.

Build Verification:
- `cargo build` succeeds
- `cargo clippy` passes
- `cargo fmt --check` passes

Runtime Verification:
- `cargo run` starts without panics
- Service binds to expected port
- No runtime errors in logs

Functional Verification:
- `cargo test` passes
- Integration tests pass
- [Feature-specific checks]
```

### Java (Maven)
```markdown
**Exit Conditions**:

> Phase cannot proceed until ALL conditions pass.

Build Verification:
- `mvn compile` succeeds
- `mvn checkstyle:check` passes
- No compilation warnings

Runtime Verification:
- `mvn exec:java` or jar starts
- Application logs "Started" message
- Health actuator responds

Functional Verification:
- `mvn test` passes
- `mvn verify` (integration tests) passes
- [Feature-specific checks]
```

## Tips for Effective Plans

1. **Be Specific**: Reference exact file paths and line numbers when possible
2. **Include Context**: Link to related tickets, PRs, or documentation
3. **Think Incrementally**: Each phase should leave the system in a working state
4. **Plan for Failure**: Include rollback steps for risky changes
5. **Document Assumptions**: Note any assumptions that might not hold
6. **Keep Current**: Update the plan if scope changes during implementation
7. **Exit Conditions are Gates**: Every phase must pass all three verification categories before proceeding
