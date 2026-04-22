# JavaScript / Node.js — code quality audit reference

Commands and parsing notes for auditing JS projects. The main SKILL.md calls these.

## Tool choices

| Axis | Tool | Why |
|------|------|-----|
| Coverage | `jest --coverage` or `c8` (for non-jest projects) | Most ubiquitous; outputs lcov + summary json |
| Complexity | `eslint` with `complexity` rule, or `escomplex` via `complexity-report` | ESLint is already likely installed |
| Module size | `cloc` or `wc -l` with exclusions | Simple, reliable |
| Dependencies | `madge` | Detects cycles, reports fan-in/out |
| Mutation | `stryker` (`@stryker-mutator/core`) | De facto standard for JS |

## Standard exclusions

Always exclude these from complexity / size / coverage:
```
node_modules/
dist/
build/
coverage/
.next/
.nuxt/
**/*.min.js
**/*.test.js
**/*.spec.js
**/__tests__/**
**/__mocks__/**
```

## Commands

### Tool availability check

Check `node_modules/.bin/` directly for installed dev-deps — faster and quieter than `npx --no-install`, which prints scary stderr on missing tools:

```bash
# Each check prints "tool: ok" or "tool: MISSING", nothing else
[ -x node_modules/.bin/jest ]    && echo "jest: ok"    || echo "jest: MISSING"
[ -x node_modules/.bin/madge ]   && echo "madge: ok"   || echo "madge: MISSING"
[ -x node_modules/.bin/stryker ] && echo "stryker: ok" || echo "stryker: MISSING"
command -v cloc >/dev/null 2>&1  && echo "cloc: ok"    || echo "cloc: MISSING"
```

Don't use `npx --no-install <tool> --version 2>/dev/null` — `npx` still prints a multi-line error on the happy path when the tool is missing, and those errors land in the user's view making the audit look broken when it isn't.

If a tool is missing, note the install command:
- Jest: `npm install --save-dev jest`
- Madge: `npm install --save-dev madge`
- Stryker: `npm install --save-dev @stryker-mutator/core @stryker-mutator/jest-runner`
- cloc: system package (`apt install cloc` / `brew install cloc`)

### Coverage
```bash
npx jest --coverage --coverageReporters=json-summary --coverageReporters=text \
  > /tmp/code-quality-audit-coverage.log 2>&1
```

Parse `coverage/coverage-summary.json` → `total.lines.pct` and `total.branches.pct`.

If the project uses vitest instead of jest: `npx vitest run --coverage --reporter=default`. Check `package.json` scripts for clues before choosing.

### Complexity
```bash
npx eslint --no-eslintrc \
  --rule '{"complexity": ["error", 10]}' \
  --format json \
  'src/**/*.{js,jsx}' \
  > /tmp/code-quality-audit-complexity.log 2>&1 || true
```

The `|| true` is deliberate — eslint exits non-zero when it finds violations, which is the signal we want, not an error. Parse the JSON output; each message with `ruleId == "complexity"` includes the computed complexity in `message` (e.g., "Function 'foo' has a complexity of 14").

Count functions over 10 (warn) and over 20 (fail). Report the worst 5 with file:line.

### Module size
```bash
cloc --json --exclude-dir=node_modules,dist,build,coverage,.next \
  --not-match-f='\.(test|spec)\.' \
  src/ \
  > /tmp/code-quality-audit-size.log 2>&1
```

For per-file sizes (cloc gives aggregate), use:
```bash
find src -type f \( -name '*.js' -o -name '*.jsx' \) \
  ! -path '*/node_modules/*' \
  ! -name '*.test.js' ! -name '*.spec.js' \
  -exec wc -l {} + | sort -rn | head -20
```

Flag files over 300 LOC (warn) and over 500 LOC (fail).

### Dependencies
```bash
npx madge --circular --json src/ > /tmp/code-quality-audit-deps.log 2>&1 || true
```

Output is a JSON array of cycles. Any non-empty array is a fail (default threshold: 0 cycles allowed). List each cycle in the report.

For fan-in/fan-out, add:
```bash
npx madge --json src/ > /tmp/code-quality-audit-deps-full.log 2>&1
```

Modules with fan-in > 15 are "hot modules" — flag them in the report so the user knows where a fail matters most.

**madge-only caveat**: madge's JSON gives you the adjacency list and cycles, but not a first-class "fan-in" number — you compute it by counting how many keys list each module as a dependency. If that's too much for this run and you just want the cycle check, say so explicitly in the report's ⊘ Skipped section: *"Fan-in analysis requires dependency-cruiser (not installed); cycle detection ran via madge and is sufficient for the cycles threshold."* Don't silently omit fan-in data — a missing piece that looks like a present piece is worse than an explicit gap.

### Mutation
```bash
npx stryker run --reporters json,clear-text \
  > /tmp/code-quality-audit-mutation.log 2>&1
```

Parse `reports/mutation/mutation.json` → `.metrics.mutationScore`. Warn below 60, fail below 40.

**Slow**: tell the user before starting. Typical runtime 5–30 min for small/medium projects.

If no `stryker.conf.json` exists, run `npx stryker init` first — but ask the user before modifying their repo.
