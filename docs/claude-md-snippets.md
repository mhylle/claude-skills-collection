# CLAUDE.md Snippets for Workflow Enforcement

This document contains modular snippets for your project's `CLAUDE.md` file.

## Key Insight: Passive Context > Skill Invocation

Based on [Vercel's research](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals):

| Approach | Success Rate |
|----------|--------------|
| Skills only (default) | 53% |
| Skills with explicit instructions | 79% |
| **Passive context (always loaded)** | **100%** |

**Conclusion**: Embed workflow rules directly in CLAUDE.md. They're loaded every turn without requiring skill invocation.

---

## Quick Start

Use `./init-workflow.sh [project-dir] [level]` to generate CLAUDE.md automatically.

Or copy the **Essential Snippet** below:

---

## Essential Snippet (Recommended Minimum)

```markdown
## Workflow Rules (Mandatory - Always Enforced)

### Decision Matrix

| Condition | Required Action |
|-----------|-----------------|
| Single file, obvious fix | Implement directly |
| 2-3 files, clear scope | Consider `/create-plan` |
| **3+ files OR architectural** | **MUST `/create-plan` first** |

### Quality Gates (ALL Blocking)

| Gate | Blocking? |
|------|-----------|
| Build compiles | **YES** |
| Types pass | **YES** |
| Lint passes | **YES** |
| Tests pass | **YES** |
| Code review = PASS | **YES** |

**PASS_WITH_NOTES is NOT acceptable.** Fix all recommendations first.
```

---

## Modular Snippets

### 1. Core Workflow Enforcement

```markdown
## Implementation Workflow

When implementing features, follow this mandatory workflow:

### For New Ideas/Features
1. `/brainstorm` - Refine the idea through Socratic questioning
2. `/create-plan` - Design phased implementation with verification criteria
3. `/implement-plan docs/plans/[plan-file].md` - Execute the plan

### For Bug Fixes & Small Changes
- Simple fixes: Implement directly
- Complex fixes: Use `/create-plan` to design the approach

### Workflow Rules
- Plans live in `docs/plans/` with format `YYYY-MM-DD-feature-name.md`
- Brainstorms live in `docs/brainstorms/`
- ADRs live in `docs/adr/`
- NEVER implement complex features without a plan
```

### 2. Quality Gate Enforcement

```markdown
## Quality Gates (Mandatory)

Every implementation phase MUST pass these quality gates before completion:

### Verification Loop (6 Checks)
1. **Build**: Project compiles without errors
2. **Types**: TypeScript/type checking passes
3. **Lint**: No linting errors
4. **Tests**: All tests pass
5. **Security**: No obvious security issues
6. **Diff Review**: Changes are minimal and focused

### Code Review Requirements
- All code review recommendations are BLOCKING (not optional)
- PASS_WITH_NOTES is NOT acceptable - must achieve clean PASS
- Fix all issues before proceeding to next phase

### Clean Baseline Principle
- Each phase ends with a clean, working codebase
- Errors introduced during a phase are that phase's responsibility
- Next phase inherits a verified, clean state
```

### 3. Orchestrator Pattern Enforcement

```markdown
## Orchestrator Pattern

When using `/implement-plan` or `/implement-phase`:

### Main Session Responsibilities
- Read plans and track progress
- Delegate implementation to subagents
- Verify quality gates pass
- NEVER write code directly

### Subagent Responsibilities
- Write implementation code
- Run tests and verification
- Report concise status back

### Context Preservation
- Subagent responses must be concise (not 300+ lines)
- Large outputs (test logs, errors) go to `logs/` directory
- Return only: STATUS, FILES modified, ERRORS (if any)
```

### 4. Task Tools Integration (Claude Code 2.1.16+)

```markdown
## Task Tools Integration

Progress tracked via Task tools with dependency tracking (persists across `/clear` and sessions):

### Task Lifecycle
| Status | Meaning |
|--------|---------|
| `pending` | Not started |
| `in_progress` | Currently being worked on |
| `completed` | Done and verified |

### Dependencies
Tasks use `blockedBy` to enforce ordering. Blocked tasks auto-unblock when dependencies complete.

### Session Management
```bash
claude --resume "feature-name"    # Resume named session
claude --from-pr 123              # Resume by PR number (2.1.27+)
```

Sessions auto-link to PRs when created via `gh pr create`.

### Rules
- Use TaskUpdate for status changes (not manual edits)
- Dependencies enforce phase ordering automatically
- Progress persists across `/clear` commands
```

### 4.5. Coding Standards Enforcement

```markdown
## Coding Standards (Mandatory)

Standards enforced during implementation, not just review.

### Decision Matrix

| Condition | Action |
|-----------|--------|
| Creating a controller | MUST be <30 lines per method, HTTP concerns only |
| Creating a service | MUST have single responsibility, <500 lines |
| Service >300 lines | WARNING - consider splitting |
| Missing interface on DTO | **BLOCKING** - add before commit |

### Size Limits

| Type | Warning | Blocking |
|------|---------|----------|
| Service file | >300 lines | >500 lines |
| Controller method | >20 lines | >50 lines |
| Service public methods | >8 | >12 |
| Constructor dependencies | >5 | >8 |

### Required Patterns

| Pattern | Requirement |
|---------|-------------|
| Controllers | HTTP concerns only, delegate to services |
| Services | Single responsibility, one domain |
| Interfaces | DTOs, response types, cross-module contracts |
| Errors | Domain exceptions, no swallowed errors |
| Logging | Project logger, no `console.log` |
| Config | Via ConfigService, no hardcoded values |

### Forbidden Patterns (BLOCKING)

| Pattern | Example | Why |
|---------|---------|-----|
| `console.log` | Debug statements in production | Use project logger |
| Empty catch | `catch (e) {}` | Swallows errors silently |
| Hardcoded secrets | `apiKey = "sk-..."` | Security risk |
| Business logic in controller | `if (order.total > 100)` | Violates separation |
| Untyped DTOs | `@Body() body: any` | Missing contract |
| Unhandled promises | `asyncOp()` without await | Silent failures |

### Enforcement Points

1. **Implementation**: Subagent prompts include standards
2. **Verification Loop**: Check 3 (Lint) catches violations
3. **Code Review**: `/code-review` uses `coding-standards-checklist.md`

Reference: `docs/standards/CODING_STANDARDS.md`
```

### 5. ADR Enforcement

```markdown
## Architectural Decision Records

Document architectural decisions in ADRs when:
- Choosing between approaches/technologies
- Establishing new patterns or conventions
- Making trade-offs with significant implications
- Making decisions future developers will question

### Creating ADRs
Use `/adr [title]` to create an ADR with:
- Context (why is this decision needed?)
- Options considered
- Decision made
- Consequences

### ADR Location
- ADRs live in `docs/adr/`
- Naming: `NNNN-title-slug.md` (e.g., `0001-use-nestjs-for-backend.md`)
- INDEX.md tracks all ADRs
```

### 6. Verification-First Planning

```markdown
## Verification-First Planning

When creating plans (`/create-plan`), every phase MUST define:

### Required Phase Elements
```markdown
### Phase N: [Name]

**Objective**: [What this phase accomplishes]

**Verification Approach**: [HOW we'll verify it works]

**Tasks**:
- [ ] Write tests first
- [ ] Implement to make tests pass
- [ ] Verify all checks pass

**Exit Conditions**:
- Build: compiles without errors
- Types: type checking passes
- Lint: no linting errors
- Tests: all tests pass
- Runtime: application starts and runs
```

### Three Verification Categories (never skip any)
1. **Build Verification**: Compiles, lint passes, types check
2. **Runtime Verification**: Application starts and runs
3. **Functional Verification**: Correct behavior, tests pass
```

### 7. Security Review Triggers

```markdown
## Security Review Requirements

Automatically invoke `/security-review` when implementing:
- Authentication or authorization
- User input handling or validation
- API endpoints (especially public)
- Secrets, credentials, or API keys
- Payment processing
- File uploads
- Database queries

### Security Categories Checked
1. Secrets/Credentials exposure
2. Input Validation
3. SQL/NoSQL Injection
4. XSS vulnerabilities
5. Authentication bypass
6. Authorization flaws
7. Cryptographic issues
8. Session management
9. Error handling (info disclosure)
10. Dependency vulnerabilities
```

### 8. Skill Reference Quick Guide

```markdown
## Available Skills

| Skill | When to Use | Command |
|-------|-------------|---------|
| brainstorm | Refine ideas, find gaps | `/brainstorm` |
| create-plan | Design implementation | `/create-plan` |
| implement-plan | Execute a plan | `/implement-plan [path]` |
| verification-loop | Verify implementation | `/verification-loop` |
| code-review | Review code quality | `/code-review` |
| security-review | Security audit | `/security-review` |
| code-quality-audit | Coverage, complexity, deps, mutation metrics | `/code-quality-audit` |
| adr | Document decisions | `/adr [title]` |
| codebase-research | Understand codebase | `/codebase-research` |
| e2e-testing | Test web applications | `/e2e-testing [mode]` |
```

---

## Complete Snippet (All-in-One)

For projects that want full workflow enforcement:

```markdown
## Skill-Based Development Workflow

This project uses structured skill-based development. Follow these requirements.

### Mandatory Workflow

For non-trivial features:
1. **Ideation**: `/brainstorm` - Refine through Socratic questioning
2. **Planning**: `/create-plan` - Design phased implementation
3. **Execution**: `/implement-plan docs/plans/[file].md` - Execute plan

For bug fixes:
- Simple: Fix directly
- Complex: `/create-plan` first

### Quality Gates (All Required)

Every phase must pass:
1. Build compiles
2. Types check
3. Lint passes
4. Tests pass
5. Security verified
6. Code review achieves PASS (not PASS_WITH_NOTES)

**Recommendations are BLOCKING** - fix before proceeding.

### Orchestrator Pattern

- Main session: Delegates work, never writes code directly
- Subagents: Write code, return concise status
- Large outputs: Write to `logs/` directory

### Coding Standards (Enforced)

| Standard | Limit | Severity |
|----------|-------|----------|
| Controller method | <30 lines | **BLOCKING** if >50 |
| Service file | <500 lines | **BLOCKING** |
| DTOs typed | Required | **BLOCKING** |
| `console.log` | Forbidden | **BLOCKING** |
| Empty catch blocks | Forbidden | **BLOCKING** |
| Hardcoded secrets | Forbidden | **BLOCKING** |

Reference: `docs/standards/CODING_STANDARDS.md`

### Progress Tracking

- Tracked via Task tools (persistent across sessions)
- Resume: `CLAUDE_CODE_TASK_LIST_ID=plan-name claude`
- Never manually edit plan checkboxes

### Document Locations

| Type | Location | Format |
|------|----------|--------|
| Plans | `docs/plans/` | `YYYY-MM-DD-name.md` |
| Brainstorms | `docs/brainstorms/` | `YYYY-MM-DD-topic.md` |
| ADRs | `docs/adr/` | `NNNN-title.md` |
| Logs | `logs/` | `[type]-[name].log` |

### When to Create ADRs

- Choosing technologies or approaches
- Establishing patterns
- Making trade-offs
- Decisions needing future justification

Use `/adr [title]` to create.

### Security Review Triggers

Auto-invoke `/security-review` for:
- Auth/authz code
- User input handling
- API endpoints
- Secrets/credentials
- Payment processing
- File uploads
```

---

## Minimal Snippet (Quick Reference)

For projects that want lightweight guidance:

```markdown
## Development Workflow

- **Plan before implementing**: `/create-plan` for features
- **Execute plans**: `/implement-plan docs/plans/[file].md`
- **All quality gates must pass**: Build, types, lint, tests, security, review
- **Recommendations are blocking**: Fix before proceeding
- **Document decisions**: `/adr [title]` for architectural choices
```

---

## Project-Specific Customizations

### For TypeScript/Node.js Projects

```markdown
## Build Verification Commands

```bash
npm run build        # Build check
npm run typecheck    # Type check
npm run lint         # Lint check
npm test             # Test check
```

All must pass before phase completion.
```

### For Python Projects

```markdown
## Build Verification Commands

```bash
python -m py_compile **/*.py  # Syntax check
mypy .                        # Type check
ruff check .                  # Lint check
pytest                        # Test check
```

All must pass before phase completion.
```

### For Monorepo Projects

```markdown
## Monorepo Workflow

When planning:
- Identify affected packages in plan
- Define verification per package
- Consider cross-package dependencies

Verification runs at monorepo root:
```bash
npm run build --workspaces
npm run test --workspaces
```
```

---

## Enforcement Levels

Choose the enforcement level appropriate for your project:

| Level | Snippets to Include | Use Case |
|-------|---------------------|----------|
| **Minimal** | Essential only | Small projects, familiar teams |
| **Standard** | Essential + Quality Gates + ADR | Most projects |
| **Strict** | Complete All-in-One | Large projects, regulated industries |
| **Custom** | Mix and match modular | Specific workflow needs |

---

## Integration with Existing CLAUDE.md

Add these snippets to your existing `CLAUDE.md` file after any project-specific context. Example structure:

```markdown
# Project: My Application

## Overview
[Project description]

## Tech Stack
[Technologies used]

## Project Structure
[Directory layout]

---
## Skill-Based Development Workflow
[Paste chosen snippets here]
---

## Project-Specific Commands
[Custom commands]
```
