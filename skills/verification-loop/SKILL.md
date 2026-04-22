---
name: verification-loop
description: Comprehensive 6-check verification framework for validating implementation quality across build, types, lint, tests, security, and diff review. This skill ensures code meets all quality gates before phase completion. Triggers on "verify implementation", "run verification", "/verification-loop", or automatically as part of implement-phase Step 2.
allowed-tools: Read, Glob, Bash
---

# Verification Loop

A systematic 6-check verification framework that validates implementation quality across multiple dimensions: build, types, lint, tests, security, and diff review. Catches issues early, ensures code compiles, type-checks, passes linting, runs tests, has no security issues, and contains no unintended changes.

> **Terminology:** this skill uses "Checks" (Check 1–6). Don't confuse with "Phases" (plan phases) or "Steps" (implement-phase steps).

---

## Design philosophy

**Defense in depth** — each check catches a different category of issue:

| Check | Catches | Why it matters |
|---|---|---|
| Build | Syntax errors, missing deps, bundling issues | Code must compile to run |
| Types | Type mismatches, null safety, interface violations | Type safety prevents runtime errors |
| Lint | Style violations, code smells, potential bugs | Consistent, maintainable code |
| Tests | Logic errors, regressions, broken contracts | Functional correctness |
| Security | Secrets, debug code, vulnerable patterns | Production safety |
| Diff | Unintended changes, scope creep, leftover code | Change discipline |

**Fail fast** — checks are ordered by detection speed. Build errors appear in seconds; security scans take longer. Fast checks first provide rapid feedback on common issues.

**Project-agnostic** — detect project type automatically, apply the matching tooling. Node.js, Python, Go, Rust, and mixed-language projects all work.

**Idempotent** — running the loop multiple times produces the same result. Each check passes or fails deterministically based on codebase state.

---

## When to use

**Automatically invoked by implement-phase** as Step 2 (Exit Condition Verification), before integration testing, after implementation subagents complete.

**Manually invoked** for:
- Validating changes before committing
- Checking code quality after refactoring
- Pre-merge verification
- Reproducing CI/CD failures locally

**Don't use for:**
- Reading or analyzing code (no changes made)
- Running exploratory tests (use the test runner directly)
- Checking a single file (use individual tools)

---

## Project type detection

Detect project type first, load the matching reference file, then run the 6 checks with those commands.

| Type | Primary indicator | Reference file |
|---|---|---|
| **Node.js / TypeScript** | `package.json` exists (with `tsconfig.json` → TypeScript) | `references/nodejs-typescript.md` |
| **Python** | `pyproject.toml` or `setup.py` | `references/python.md` |
| **Go** | `go.mod` exists | `references/go.md` |
| **Rust** | `Cargo.toml` exists | `references/rust.md` |
| **Mixed / monorepo** | Multiple indicators | Load each relevant reference |

**Detection logic:**
```bash
detect_project_type() {
  if [ -f "package.json" ]; then
    if [ -f "tsconfig.json" ]; then echo "typescript"; else echo "nodejs"; fi
  elif [ -f "pyproject.toml" ] || [ -f "setup.py" ]; then echo "python"
  elif [ -f "go.mod" ]; then echo "go"
  elif [ -f "Cargo.toml" ]; then echo "rust"
  else echo "unknown"; fi
}
```

After detection, **only load the matching reference file** — don't load all four, that's wasted context.

---

## Check 1 — Build verification

**Purpose:** ensure the codebase compiles, bundles, and produces valid artifacts.

**PASS:** build command exits 0, no compilation errors, all artifacts generated, no missing-dependency errors.

**FAIL:** non-zero exit code, compilation/bundling errors, missing or incomplete artifacts, unresolved deps.

Commands → look up the matching language reference file (`references/<lang>.md`).

**Failure handling:** parse the error output → identify root cause (missing import? syntax error? type mismatch?) → spawn fix subagent with error context → re-run build. Max 3 retries.

**Output shape:**
```
CHECK_1_BUILD_VERIFICATION:
  STATUS: PASS | FAIL
  COMMAND: [command run]
  EXIT_CODE: 0 | [non-zero]
  DURATION: 12.3s
  ARTIFACTS: [list]
  ERRORS: [] | [list of errors]
```

---

## Check 2 — Type verification

**Purpose:** ensure type safety across the codebase with no type errors.

**PASS:** type checker exits 0, no type errors, all assertions valid, no missing type definitions.

**FAIL:** type errors, missing type definitions for dependencies, invalid type assertions, unreachable code (in strict mode).

Commands → language reference.

**Failure handling:** parse errors → categorize (missing types → add annotations; type mismatch → fix types; missing definitions → install `@types/*` or stubs) → spawn fix subagent → re-run. Max 3 retries.

**Output shape:**
```
CHECK_2_TYPE_VERIFICATION:
  STATUS: PASS | FAIL
  COMMAND: [command run]
  EXIT_CODE: 0 | [non-zero]
  DURATION: 8.2s
  FILES_CHECKED: [count]
  ERRORS: [] | [ { file, line, error } ]
```

---

## Check 3 — Lint verification

**Purpose:** ensure code follows style guidelines and catches potential bugs.

**PASS:** linter exits 0, no errors (warnings may be acceptable by config), all auto-fixable issues resolved, formatting matches project standards.

**FAIL:** lint errors, unfixable formatting issues, security-related lint rules violated, complexity thresholds exceeded.

Commands → language reference. **Always run auto-fix first**, then re-run the check without it and assert clean — this resolves mechanical issues before flagging real ones.

**Failure handling:** auto-fix → parse remaining errors → spawn fix subagent for non-auto-fixable issues → re-run. Max 3 retries.

**Output shape:**
```
CHECK_3_LINT_VERIFICATION:
  STATUS: PASS | FAIL
  COMMANDS: [
    { cmd: [lint-fix], exit_code: 0 },
    { cmd: [lint-check], exit_code: 0 }
  ]
  AUTO_FIXED: [count]
  REMAINING_ERRORS: 0 | [ { rule, file, line } ]
  WARNINGS: [count]
```

---

## Check 4 — Test verification

**Purpose:** ensure all tests pass and new code has appropriate coverage.

**PASS:** all tests pass (exit 0), no unjustified skips, coverage thresholds met (if configured), no flaky failures.

**FAIL:** any test failure, coverage below threshold, test timeout, test infrastructure errors.

Commands → language reference.

**Failure handling:** identify failing tests → categorize (test bug → fix the test; implementation bug → fix the code; environmental → fix test setup) → spawn fix subagent → re-run failing tests first (faster feedback), then full suite after fix. Max 3 retries.

**Output shape:**
```
CHECK_4_TEST_VERIFICATION:
  STATUS: PASS | FAIL
  COMMAND: [command run]
  EXIT_CODE: 0 | [non-zero]
  DURATION: 45.2s
  TESTS_RUN: [count]
  TESTS_PASSED: [count]
  TESTS_FAILED: [count]
  TESTS_SKIPPED: [count]
  COVERAGE: [percent]
  FAILURES: [] | [ { test, file, error } ]
```

---

## Check 5 — Security scan

**Purpose:** detect secrets, debug code, and security vulnerabilities before code reaches production.

**PASS:** no hardcoded secrets, no console.log/print in production code, no debug flags enabled, no known vulnerable deps (if scanned).

**FAIL:** secrets detected (API keys, passwords, tokens), debug code in production paths, debug flags left enabled, critical vulnerabilities in deps.

### 5a. Secrets detection

Use whichever tool is installed; pick the first available:

```bash
# git-secrets
git secrets --scan

# gitleaks
gitleaks detect --source .

# trufflehog
trufflehog filesystem .

# Manual patterns (fallback)
grep -r "API_KEY\|SECRET\|PASSWORD\|TOKEN" src/ --include="*.ts" --include="*.js"
grep -r "sk-\|pk_\|api_key\|secret_key" src/
```

**Common secret patterns:**
```
# AWS
AKIA[0-9A-Z]{16}
aws_secret_access_key

# API Keys (generic)
[aA][pP][iI]_?[kK][eE][yY].*=.*['"][a-zA-Z0-9]{20,}['"]

# Private Keys
-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----

# Tokens
(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}     # GitHub
xox[baprs]-[0-9a-zA-Z-]+                    # Slack
```

### 5b. Console / debug code detection

Language-specific — see the matching reference file. Allowed exceptions: logger framework calls (`logger.info`, `logger.debug`), error handling in catch blocks (if configured), test files, development-only files.

### 5c. Debug flag detection

```bash
# Environment checks
grep -rn "NODE_ENV.*development\|DEBUG.*true\|SKIP_AUTH" src/

# Disabled security
grep -rn "verify.*false\|secure.*false\|https.*false" src/

# TODO/FIXME with security implications
grep -rn "TODO.*security\|FIXME.*auth\|HACK.*bypass" src/
```

### 5d. Dependency vulnerability scan

Per-language commands in the matching reference (`npm audit`, `pip-audit`, `govulncheck`, `cargo audit`).

### Failure handling

- **Secrets detected** → CRITICAL. Must remove before proceeding.
- **Console logs** → WARNING. Auto-remove or justify with logger.
- **Debug flags** → WARNING. Must disable for production.
- **Vulnerabilities** → varies by severity (CRITICAL blocks; others warn).

**Output shape:**
```
CHECK_5_SECURITY_SCAN:
  STATUS: PASS | FAIL
  SCANS_RUN: [
    { scan: "secrets", status: "PASS", findings: 0 },
    { scan: "console_logs", status: "WARN", findings: 3 },
    { scan: "debug_flags", status: "PASS", findings: 0 },
    { scan: "dependencies", status: "PASS", findings: 0 }
  ]
  CRITICAL_FINDINGS: 0 | [count]
  WARNINGS: [count]
  DETAILS: [] | [ { type, file, line } ]
```

---

## Check 6 — Diff review

**Purpose:** verify only intended changes are present; no unintended modifications.

**PASS:** all changes relate to the current phase/task, no unrelated file modifications, file count within expected range, no accidental deletions or additions, no formatting-only changes to unrelated files.

**FAIL:** changes outside scope, unexpected file additions/deletions, modifications to protected files, large diffs in files that should have minimal changes.

### 6a. Changed-file inventory

```bash
git diff --name-only HEAD~1          # list
git diff --name-status HEAD~1        # with status (A/M/D)
git diff --name-only main...HEAD     # compared to base branch
git diff --stat HEAD~1               # with line counts
```

### 6b. Scope verification

```bash
# Expected patterns (input to verification)
EXPECTED_PATTERNS=(
  "src/auth/*"
  "tests/auth/*"
  "src/types/auth.ts"
)

CHANGED_FILES=$(git diff --name-only HEAD~1)

for file in $CHANGED_FILES; do
  matches_expected=false
  for pattern in "${EXPECTED_PATTERNS[@]}"; do
    if [[ $file == $pattern ]]; then matches_expected=true; break; fi
  done
  if ! $matches_expected; then echo "UNEXPECTED: $file"; fi
done
```

### 6c. File count verification

```bash
COUNT=$(git diff --name-only HEAD~1 | wc -l)
if [ $COUNT -lt $MIN_FILES ] || [ $COUNT -gt $MAX_FILES ]; then
  echo "WARNING: Changed $COUNT files, expected $MIN_FILES-$MAX_FILES"
fi
```

### 6d. Protected files check

```bash
PROTECTED_FILES=(
  "package-lock.json"
  ".env*"
  "*.lock"
  "docker-compose.yml"
  "Dockerfile"
  ".github/workflows/*"
)

for file in $CHANGED_FILES; do
  for protected in "${PROTECTED_FILES[@]}"; do
    if [[ $file == $protected ]]; then echo "PROTECTED FILE CHANGED: $file"; fi
  done
done
```

### 6e. Diff size analysis

```bash
git diff --stat HEAD~1

git diff --numstat HEAD~1 | while read added deleted file; do
  total=$((added + deleted))
  if [ $total -gt 500 ]; then echo "LARGE DIFF: $file (+$added -$deleted)"; fi
done
```

### Failure handling

1. **Unexpected files** → review. Valid → update expected scope. Invalid → revert unintended changes.
2. **Protected files** → require explicit approval.
3. **Large diffs** → review for scope creep.
4. **Missing expected files** → investigate incomplete implementation.

**Output shape:**
```
CHECK_6_DIFF_REVIEW:
  STATUS: PASS | FAIL
  FILES_CHANGED: [count]
  EXPECTED_RANGE: [min-max]
  SCOPE_VIOLATIONS: 0 | [list]
  PROTECTED_FILES_CHANGED: 0 | [list]
  LARGE_DIFFS: 0 | [list]
  SUMMARY: [ added, modified, deleted counts ]
  DETAILS: [ { file, status, lines } ]
```

---

## Integration with implement-phase

As Step 2 of implement-phase, this skill runs all 6 checks and returns a structured result.

**Input context:**
```
VERIFICATION_INPUT:
  phase_number: 2
  phase_name: "Authentication Service"
  plan_path: docs/plans/auth-implementation.md
  expected_file_patterns: ["src/auth/*", "tests/auth/*"]
  expected_file_range: [5, 15]
  protected_files: ["package-lock.json", ".env"]
  skip_checks: []          # optional
```

**Output format:**
```
VERIFICATION_LOOP_STATUS: PASS | FAIL
CHECKS_RUN: 6
CHECKS_PASSED: 6 | [count]
CHECKS_FAILED: 0 | [count]
FAILED_CHECKS: [] | [ { check, name, error, details } ]
REPORT:
  check_1_build:    { status, duration }
  check_2_types:    { status, duration }
  check_3_lint:     { status, auto_fixed, duration }
  check_4_tests:    { status, tests_run, tests_passed, coverage, duration }
  check_5_security: { status, secrets_found, console_logs, duration }
  check_6_diff:     { status, files_changed, scope_violations, duration }
TOTAL_DURATION: [seconds]
```

When PASS, the caller (implement-phase) proceeds immediately to Step 3 (Integration Testing) — no user pause. See `implement-phase/SKILL.md` for the continuous-execution contract.

**Retry logic (handled by implement-phase):**
```
1. Invoke verification-loop
2. If any check FAILS:
   a. Identify failure type
   b. Spawn fix subagent with failure context
   c. Re-run verification-loop (or just failed checks)
   d. Repeat until PASS (max 3 retries per check)
3. If all checks PASS:
   a. Proceed to Step 3 (Integration Testing)
```

---

## Standalone invocation

```
/verification-loop

# With specific checks
/verification-loop checks:build,types,tests

# Skip checks
/verification-loop skip:security,diff

# Specific project path
/verification-loop path:./packages/auth
```

---

## Configuration

Auto-detects project type and uses appropriate defaults. Override via project config:

```json
// package.json or .verification.json
{
  "verification": {
    "checks": {
      "build":   { "command": "<command>", "timeout": "<ms>" },
      "types":   { "command": "<command>", "timeout": "<ms>" },
      "lint":    { "command": "<command>", "autoFix": true },
      "tests":   { "command": "<command>", "coverage": { "threshold": 80 } },
      "security":{ "scanSecrets": true, "scanConsoleLogs": true, "excludePatterns": [] },
      "diff":    { "protectedFiles": [], "maxFileCount": 50 }
    }
  }
}
```

**Environment variables:**
```bash
VERIFICATION_SKIP_CHECKS=<comma-separated>
VERIFICATION_BUILD_TIMEOUT=<ms>
VERIFICATION_TEST_TIMEOUT=<ms>
VERIFICATION_SECRETS_SCAN=<bool>
VERIFICATION_CONSOLE_LOG_SCAN=<bool>
```

---

## Best practices

**Check authors:**
1. Order by speed — fast checks first for rapid feedback.
2. Keep checks independent — each runs in isolation.
3. Clear error messages — include file, line, fix suggestion.
4. Support auto-fix where possible.
5. Cache when possible to avoid redundant work.

**Verification consumers:**
1. Run locally before commit to catch issues before CI.
2. Trust the verification — if it passes, proceed confidently.
3. Fix root causes — don't skip checks, fix the underlying issues.
4. Review security warnings — even non-blocking findings need attention.
5. Keep scope tight — large diffs often indicate scope creep.

**CI/CD integration:**
1. Run full verification, don't skip checks.
2. Cache dependencies to speed build/install checks.
3. Parallelize where possible (independent checks can run concurrently).
4. Fail fast on first failure to save CI time.
5. Report clearly — surface which check failed and why.

---

## Troubleshooting

| Issue | Cause | Solution |
|---|---|---|
| Build fails with missing deps | `node_modules` out of sync | Run `npm install` first |
| Type errors in `node_modules` | Wrong `@types/*` versions | Update or remove conflicting `@types` |
| Lint auto-fix causes more errors | Conflicting rules | Review ESLint/Prettier config |
| Tests timeout | Slow tests or hanging processes | Increase timeout or fix test |
| Security scan false positive | Valid use of flagged pattern | Add to exclude list with comment |
| Diff scope violation | Unrelated file touched | Review and revert or expand scope |

**Debug mode:**
```
/verification-loop --verbose

# Or
VERIFICATION_DEBUG=true /verification-loop
```

---

## Appendix: quick reference

### Check summary

| Check | Purpose | Blocks on |
|---|---|---|
| 1. Build | Compilation | Any error |
| 2. Types | Type safety | Any error |
| 3. Lint | Code quality | Errors (not warnings) |
| 4. Tests | Correctness | Any failure |
| 5. Security | Production safety | Secrets, critical vulns |
| 6. Diff | Change discipline | Scope violations |

### Minimum viable verification (pre-commit hook)

```bash
# Fast path: build + types + lint
npm run build && npx tsc --noEmit && npm run lint
```

### Full verification (pre-merge)

```bash
# All 6 checks
npm run build && \
npx tsc --noEmit && \
npm run lint && \
npm test && \
npm run security:scan && \
./scripts/verify-diff.sh
```

---

## Related skills

- `implement-phase` — parent skill that invokes verification-loop in Step 2
- `code-review` — follows verification-loop in the implement-phase pipeline
- `security-review` — deep security analysis (beyond Check 5)
