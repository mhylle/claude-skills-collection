# Workflow Enforcement Rules

Hard rules enforced via passive context in CLAUDE.md (not skill invocation).

Based on [Vercel research](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals): Passive context achieves 100% compliance vs 53-79% for skill-based enforcement.

## Rule 1: Plan Before Implement

**NEVER implement complex features without a plan.**

```
✗ BAD:  "Add authentication" → Start coding
✓ GOOD: "Add authentication" → /create-plan → /implement-plan
```

Threshold: If task touches 3+ files or requires architectural decisions → use `/create-plan`.

---

## Rule 2: Quality Gates Are Mandatory

**ALL quality gates must pass before phase completion.**

| Gate | Check | Blocking? |
|------|-------|-----------|
| Build | Compiles without errors | YES |
| Types | Type checking passes | YES |
| Lint | No linting errors | YES |
| Tests | All tests pass | YES |
| Security | No obvious vulnerabilities | YES |
| Code Review | Must be clean PASS | YES |

**PASS_WITH_NOTES is NOT acceptable** - fix all recommendations first.

---

## Rule 3: Recommendations Are Blocking

**Code review recommendations are not optional.**

```
✗ BAD:  "It's just a note, fix it later"
✓ GOOD: "Fix recommendation before proceeding"
```

The clean baseline principle: Each phase ends clean. The next phase inherits a verified, working codebase.

---

## Rule 4: Orchestrators Never Write Code

**implement-plan and implement-phase are orchestrators. They delegate, never implement.**

```
implement-plan (ORCHESTRATOR)
    ⛔ NEVER uses Write/Edit tools
    ⛔ NEVER writes code directly
    │
    └── implement-phase (ORCHESTRATOR)
            ⛔ NEVER uses Write/Edit tools
            │
            └── Subagents (WORKERS)
                    ✅ Write code
                    ✅ Create files
                    ✅ Run tests
```

---

## Rule 5: Subagents Return Concise Status

**Subagent responses must be structured and brief.**

```
✗ BAD (300+ lines):
"I successfully created the service. First I analyzed..."

✓ GOOD (5 lines):
STATUS: PASS
FILES: src/auth.service.ts (created), src/auth.module.ts (modified)
ERRORS: None
```

Large outputs (test logs, stack traces) → write to `logs/` directory.

---

## Rule 6: Progress Via Task Tools (2.1.16+)

**Use Task tools with dependency tracking.**

```
✗ BAD:  Edit plan.md to change [ ] to [x]
✓ GOOD: TaskUpdate(taskId, status: "completed")
```

### Task Dependencies
- Use `blockedBy` to enforce phase ordering
- Blocked tasks auto-unblock when dependencies complete
- Progress persists across `/clear` and session restarts

### Session Management
```bash
claude --resume "feature-name"    # Resume named session
claude --from-pr 123              # Resume by PR number (2.1.27+)
```

Sessions auto-link to PRs when created via `gh pr create`.

---

## Rule 7: Document Architectural Decisions

**Use `/adr` when making significant technical decisions.**

Triggers:
- Choosing between technologies/approaches
- Establishing new patterns
- Making trade-offs with implications
- Decisions future developers will question

---

## Rule 8: Auto-Continue Between Steps

**implement-phase steps execute continuously without pausing.**

```
Step 1: Implementation → PASS → AUTO-CONTINUE
Step 2: Verification   → PASS → AUTO-CONTINUE
Step 3: Integration    → PASS → AUTO-CONTINUE
Step 4: Code Review    → PASS → AUTO-CONTINUE
Step 5: ADR Compliance → PASS → AUTO-CONTINUE
Step 6: Plan Sync      → PASS → AUTO-CONTINUE
Step 7: Prompt Archive → PASS → AUTO-CONTINUE
Step 8: Complete       → DONE
```

**Do NOT ask "should I continue?" between steps.**

---

## Rule 9: Verification-First Planning

**Every phase must define HOW it will be verified.**

```markdown
### Phase N: [Name]

**Objective**: [What]

**Verification Approach**: [HOW we'll verify] ← MANDATORY

**Exit Conditions**:
- Build compiles
- Types check
- Tests pass
- [Functional criteria]
```

---

## Rule 10: Security Review for Sensitive Code

**Auto-trigger `/security-review` for:**

- Authentication/authorization
- User input handling
- API endpoints (especially public)
- Secrets/credentials
- Payment processing
- File uploads
- Database queries

---

## Quick Reference: Skill Flow

```
Ideation:    /brainstorm
Planning:    /create-plan
Execution:   /implement-plan [path]
Quality:     /verification-loop, /code-review, /security-review, /code-quality-audit
Decisions:   /adr [title]
```

## Directory Conventions

| Type | Location |
|------|----------|
| Plans | `docs/plans/YYYY-MM-DD-name.md` |
| Brainstorms | `docs/brainstorms/YYYY-MM-DD-topic.md` |
| ADRs | `docs/decisions/ADR-NNNN-title.md` |
| Logs | `logs/[type]-[name].log` |
