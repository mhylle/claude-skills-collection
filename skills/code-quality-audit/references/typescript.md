# TypeScript / Node.js — code quality audit reference

Same shape as `javascript.md` with TS-aware tooling. The main SKILL.md calls these.

## Tool choices

| Axis | Tool | Why |
|------|------|-----|
| Coverage | `jest --coverage` (with ts-jest) or `vitest --coverage` | TS-native, lcov + json summary |
| Complexity | `eslint` with `@typescript-eslint/parser` and `complexity` rule | Handles TS syntax correctly |
| Module size | `cloc` / `wc -l` with TS globs | Language-neutral |
| Dependencies | `dependency-cruiser` (preferred) or `madge` with `--ts-config` | dependency-cruiser understands TS paths and barrel files better |
| Mutation | `stryker` with `@stryker-mutator/typescript-checker` | De facto standard |

## Standard exclusions

```
node_modules/
dist/
build/
coverage/
.next/
.nuxt/
**/*.d.ts
**/*.test.ts
**/*.spec.ts
**/__tests__/**
**/__mocks__/**
```

Note the `*.d.ts` exclusion — declaration files inflate module-size counts without being real code.

## Commands

### Tool availability check

Check `node_modules/.bin/` directly — quieter than `npx --no-install`, which emits stderr noise on missing tools:

```bash
[ -x node_modules/.bin/jest ]      && echo "jest: ok"      || echo "jest: MISSING"
[ -x node_modules/.bin/depcruise ] && echo "depcruise: ok" || echo "depcruise: MISSING"
[ -x node_modules/.bin/madge ]     && echo "madge: ok"     || echo "madge: MISSING"
[ -x node_modules/.bin/stryker ]   && echo "stryker: ok"   || echo "stryker: MISSING"
command -v cloc >/dev/null 2>&1    && echo "cloc: ok"      || echo "cloc: MISSING"
```

Avoid `npx --no-install <tool> --version 2>/dev/null` — npx still emits a multi-line error when a tool is missing, making the audit look broken.

Install commands:
- Jest + ts-jest: `npm install --save-dev jest ts-jest @types/jest`
- dependency-cruiser: `npm install --save-dev dependency-cruiser`
- Stryker: `npm install --save-dev @stryker-mutator/core @stryker-mutator/typescript-checker @stryker-mutator/jest-runner`

### Coverage
```bash
npx jest --coverage --coverageReporters=json-summary --coverageReporters=text \
  > /tmp/code-quality-audit-coverage.log 2>&1
```

Or for vitest: `npx vitest run --coverage --reporter=default`. Check `package.json` scripts/devDependencies to decide.

Parse `coverage/coverage-summary.json` → `total.lines.pct` and `total.branches.pct`.

### Complexity
```bash
npx eslint --no-eslintrc \
  --parser @typescript-eslint/parser \
  --rule '{"complexity": ["error", 10]}' \
  --format json \
  'src/**/*.{ts,tsx}' \
  > /tmp/code-quality-audit-complexity.log 2>&1 || true
```

Parse JSON; each `ruleId == "complexity"` message carries the computed complexity. Report functions over 10 (warn) and 20 (fail).

### Module size
```bash
find src -type f \( -name '*.ts' -o -name '*.tsx' \) \
  ! -name '*.d.ts' \
  ! -name '*.test.ts' ! -name '*.spec.ts' \
  ! -path '*/node_modules/*' \
  -exec wc -l {} + | sort -rn | head -20
```

Flag files over 300 LOC (warn) and 500 LOC (fail).

### Dependencies
```bash
npx depcruise --output-type err-long --ts-config tsconfig.json src/ \
  > /tmp/code-quality-audit-deps.log 2>&1 || true
```

Count `circular` violations. Any > 0 is a fail.

For per-module fan-in/out:
```bash
npx depcruise --output-type json --ts-config tsconfig.json src/ \
  > /tmp/code-quality-audit-deps-full.log 2>&1
```

Parse `.modules[].dependents.length` for fan-in. Flag modules with fan-in > 15 as "hot modules".

If dependency-cruiser isn't installed, fall back to madge:
```bash
npx madge --circular --ts-config tsconfig.json --extensions ts,tsx --json src/
```

**madge fallback caveat**: madge detects cycles but doesn't compute fan-in as a first-class number. If you had to fall back to madge, the Dependencies row should still show the cycle status truthfully, and the ⊘ Skipped section must explicitly note: *"Fan-in analysis requires dependency-cruiser (not installed); cycle detection ran via madge and is sufficient for the cycles threshold."* Silently omitting fan-in data is worse than flagging the gap.

### Mutation
```bash
npx stryker run --reporters json,clear-text \
  > /tmp/code-quality-audit-mutation.log 2>&1
```

Parse `reports/mutation/mutation.json` → `.metrics.mutationScore`. Warn below 60, fail below 40.

**Slow**: tell the user before starting. If `stryker.conf.json` doesn't exist, ask before running `npx stryker init` — it writes files to the repo.
