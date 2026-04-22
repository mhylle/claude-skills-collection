# TDD Mode (optional)

TDD mode inverts Step 1 so tests are written before implementation, and adds a coverage-verification check. Off by default. Enable per-phase or globally.

---

## Why TDD mode exists

- **Higher coverage** — tests aren't an afterthought.
- **Better design** — writing tests first forces cleaner interfaces.
- **Confidence** — every line of production code exists to make a test pass.
- **Documentation** — tests act as executable specifications.

Good candidates for TDD:
- New features with well-defined requirements
- Business logic with clear acceptance criteria
- Code that needs high reliability
- Phases where the plan explicitly requires TDD

---

## Enabling TDD mode

**Per-plan:**
```yaml
phase_config:
  tdd_mode: true
  coverage_threshold: 80   # optional, default 80
```

**Per-invocation:**
```
/implement-phase docs/plans/my-plan.md phase:3 --tdd
```

**Globally:**
```yaml
# ~/.claude/settings.json
implement_phase:
  default_tdd_mode: true
  default_coverage_threshold: 80
```

---

## The RED → GREEN → REFACTOR cycle

```
RED      → Write a failing test that defines desired behavior
GREEN    → Write the minimum code to make the test pass
REFACTOR → Improve structure while keeping tests green
                ↑                                  ↓
                └──────── repeat ──────────────────┘
```

- **RED**: Tests must fail initially. If they pass immediately, either the test is wrong or the feature already exists.
- **GREEN**: Write only what's needed to pass the test. Ugly code is fine here — it gets refactored next.
- **REFACTOR**: Tests stay green. If they break, you broke something; revert and try again.

---

## Step 1 in TDD mode

Normal Step 1 spawns implementation subagents first, then tests. TDD mode reverses that and adds a RED verification step before GREEN.

**Normal:**
```
Step 1: Implementation
├── 1a. Read phase requirements
├── 1b. Spawn IMPLEMENTATION subagents
├── 1c. Spawn TEST subagents
└── 1d. Verify tests pass
```

**TDD:**
```
Step 1: Implementation (TDD mode)
├── 1a. Read phase requirements
├── 1b. Spawn TEST subagents FIRST (RED)
├── 1c. Verify tests FAIL — proves the tests test something real
├── 1d. Spawn IMPLEMENTATION subagents (GREEN)
├── 1e. Verify tests PASS
├── 1f. Spawn REFACTOR subagents (optional)
└── 1g. Verify tests still PASS
```

---

## TDD subagent examples

**Step 1b — write failing tests (RED):**
```
Task (run_in_background: true): "Write unit tests for UserAuthService.

Context: Phase 3 - User Authentication (TDD Mode - RED phase)
Location: src/auth/user-auth.service.spec.ts

Test scenarios (from requirements):
- authenticateUser() returns token for valid credentials
- authenticateUser() throws UnauthorizedError for invalid password
- authenticateUser() throws NotFoundError for unknown user
- refreshToken() extends session for valid refresh token

IMPORTANT: Implementation does NOT exist yet. Tests MUST fail.
Write tests that will drive the implementation.

RESPONSE FORMAT: STATUS, FILES created, test count, ERRORS if any."
```

**Step 1c — verify tests fail:**
```
Task: "Run tests and verify they FAIL.

Command: npm test -- --testPathPattern=user-auth.service.spec.ts
Expected: Tests should FAIL (RED phase of TDD)

If tests PASS, there is a problem — either tests are wrong or feature already exists.

RESPONSE FORMAT: STATUS (expect FAIL), test count, failure summary."
```

**Step 1d — minimal implementation (GREEN):**
```
Task (run_in_background: true): "Implement UserAuthService to pass tests.

Context: Phase 3 - User Authentication (TDD Mode - GREEN phase)
Location: src/auth/user-auth.service.ts
Tests at: src/auth/user-auth.service.spec.ts

Write MINIMAL code to make all tests pass. Do not add extra functionality.
Follow the interface defined by the tests.

RESPONSE FORMAT: STATUS, FILES created/modified, ERRORS if any."
```

---

## Coverage verification

TDD mode enforces a minimum coverage threshold (default 80%). After Step 1 completes, spawn a coverage verification subagent:

```
Task: "Verify code coverage meets TDD threshold.

Commands:
1. npm test -- --coverage --coverageReporters=text
2. Parse coverage percentage from output

Threshold: 80%
Scope: Files created/modified in this phase

RESPONSE FORMAT:
STATUS: PASS | FAIL
COVERAGE: [percentage]%
UNCOVERED_LINES: [count]
DETAILS: [brief summary or path to full report]"
```

**On coverage failure:**
1. Identify uncovered lines/branches.
2. Spawn a subagent to add tests covering them.
3. Re-run coverage check.
4. Repeat until threshold met or max retries exhausted.

```
COVERAGE_STATUS: FAIL
COVERAGE: 72%
THRESHOLD: 80%
UNCOVERED:
  - src/auth/user-auth.service.ts: lines 45-52 (error handling)
  - src/auth/user-auth.service.ts: lines 78-80 (edge case)

ACTION: Spawning subagent to add tests for uncovered code paths...
```

---

## TDD checklist (before Step 1 marked PASS)

- [ ] Tests written BEFORE implementation code
- [ ] Tests failed initially (RED verified)
- [ ] Minimal code written to pass tests (GREEN)
- [ ] Refactoring done with passing tests (REFACTOR)
- [ ] Coverage threshold met
- [ ] No implementation code without corresponding tests

---

## Step 1 output (TDD)

```
IMPLEMENTATION_STATUS: PASS
TDD_MODE: enabled
TDD_PHASES:
  RED: VERIFIED (tests failed as expected)
  GREEN: PASS (all tests now passing)
  REFACTOR: PASS (tests still green)
COVERAGE: 85% (threshold: 80%)
FILES_CREATED: [list]
FILES_MODIFIED: [list]
TEST_RESULTS: 12 passing, 0 failing
ERRORS: None
```
