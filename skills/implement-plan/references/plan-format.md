# Implementation Plan Format Reference

Standard format and guidelines for technical implementation plans.

## Plan File Structure

```markdown
# [Feature/Task Name] Implementation Plan

## Overview
Brief description of what this plan accomplishes.

## Prerequisites
- [ ] Required dependencies installed
- [ ] Environment configured
- [ ] Related tickets/issues linked

## Phase 1: [Phase Name]

### Objectives
- Primary goal of this phase
- Secondary outcomes

### Changes
- [ ] File: `path/to/file.ts` - Description of change
- [ ] File: `path/to/another.ts` - Description of change

### Success Criteria
- [ ] Tests pass: `npm test`
- [ ] Lint clean: `npm run lint`
- [ ] Manual verification: [specific steps]

---

## Phase 2: [Phase Name]
[Repeat structure]

---

## Final Verification
- [ ] All phases complete
- [ ] Integration tests pass
- [ ] Documentation updated
- [ ] Ready for review
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

## Success Criteria Patterns

### Automated Checks
```markdown
### Success Criteria
- [ ] Tests pass: `npm test`
- [ ] Lint clean: `npm run lint`
- [ ] Type check: `npm run typecheck`
- [ ] Build succeeds: `npm run build`
- [ ] Coverage maintained: `npm run test:cov` (>80%)
```

### Manual Verification Steps
```markdown
### Manual Verification
- [ ] Feature accessible at `/path/to/feature`
- [ ] UI renders correctly on desktop and mobile
- [ ] Form validation displays appropriate errors
- [ ] Success message appears after submission
- [ ] Data persists after page refresh
```

### Integration Checks
```markdown
### Integration Verification
- [ ] API endpoint responds: `curl http://localhost:3000/api/endpoint`
- [ ] Database records created correctly
- [ ] Event bus publishes expected events
- [ ] Downstream services receive notifications
```

## Verification Step Templates

### Frontend Verification
```markdown
- [ ] Component renders without console errors
- [ ] Responsive design works at 320px, 768px, 1024px, 1440px
- [ ] Keyboard navigation functional (Tab, Enter, Escape)
- [ ] Screen reader announces content correctly
- [ ] Loading states display appropriately
- [ ] Error states handled gracefully
```

### Backend Verification
```markdown
- [ ] Endpoint returns correct status codes (200, 400, 401, 404, 500)
- [ ] Response payload matches schema
- [ ] Authentication required where expected
- [ ] Rate limiting enforced
- [ ] Logging captures relevant information
- [ ] Database transactions commit/rollback correctly
```

### Security Verification
```markdown
- [ ] Input validation prevents injection attacks
- [ ] Authentication tokens validated
- [ ] Authorization checks enforced
- [ ] Sensitive data not logged
- [ ] CORS configured correctly
- [ ] Rate limiting prevents abuse
```

## Checkbox States

| State | Markdown | Meaning |
|-------|----------|---------|
| Pending | `- [ ]` | Not started |
| In Progress | `- [~]` | Currently working (optional) |
| Complete | `- [x]` | Finished and verified |
| Blocked | `- [!]` | Cannot proceed (optional) |
| Skipped | `- [-]` | Intentionally skipped (optional) |

## Plan Metadata (Optional)

Include at the top of complex plans:

```markdown
---
ticket: JIRA-1234
author: developer@example.com
created: 2024-01-15
estimated_phases: 5
estimated_time: 4h
dependencies:
  - JIRA-1230 (must be complete)
  - feature-branch-x (must be merged)
---
```

## Example: Complete Plan

```markdown
# User Authentication Implementation Plan

## Overview
Implement JWT-based authentication with login, logout, and session management.

## Prerequisites
- [ ] PostgreSQL database running
- [ ] Environment variables configured (.env)
- [ ] JWT secret generated

---

## Phase 1: Database Schema

### Objectives
- Create users table with authentication fields
- Set up password hashing utilities

### Changes
- [ ] File: `src/migrations/001-create-users.ts` - Create users table migration
- [ ] File: `src/utils/password.ts` - Add bcrypt hashing utilities

### Success Criteria
- [ ] Migration runs: `npm run migration:run`
- [ ] Tests pass: `npm test -- --grep "password"'
- [ ] Manual: Verify table exists in database

---

## Phase 2: Authentication Service

### Objectives
- Implement login/logout logic
- JWT token generation and validation

### Changes
- [ ] File: `src/auth/auth.service.ts` - Core authentication logic
- [ ] File: `src/auth/auth.guard.ts` - Route protection guard
- [ ] File: `src/auth/jwt.strategy.ts` - Passport JWT strategy

### Success Criteria
- [ ] Tests pass: `npm test -- --grep "auth"'
- [ ] Lint clean: `npm run lint`
- [ ] Manual: Test login with valid/invalid credentials

---

## Phase 3: API Endpoints

### Objectives
- Expose authentication endpoints
- Add protected route examples

### Changes
- [ ] File: `src/auth/auth.controller.ts` - Login/logout/refresh endpoints
- [ ] File: `src/auth/auth.module.ts` - Module configuration

### Success Criteria
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Manual verification:
  - [ ] POST /auth/login returns token
  - [ ] POST /auth/logout invalidates session
  - [ ] GET /auth/profile returns user (with token)
  - [ ] GET /auth/profile returns 401 (without token)

---

## Final Verification
- [ ] All phases complete
- [ ] E2E tests pass: `npm run test:e2e`
- [ ] API documentation updated
- [ ] Security review checklist complete
```

## Tips for Effective Plans

1. **Be Specific**: Reference exact file paths and line numbers when possible
2. **Include Context**: Link to related tickets, PRs, or documentation
3. **Think Incrementally**: Each phase should leave the system in a working state
4. **Plan for Failure**: Include rollback steps for risky changes
5. **Document Assumptions**: Note any assumptions that might not hold
6. **Keep Current**: Update the plan if scope changes during implementation
