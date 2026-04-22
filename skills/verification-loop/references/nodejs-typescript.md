# Verification commands — Node.js / TypeScript

Commands the 6-check verification loop runs on a Node.js or TypeScript project. Load this file when the project detection says `nodejs` or `typescript`.

---

## Package manager detection

```bash
detect_package_manager() {
  if [ -f "pnpm-lock.yaml" ]; then
    echo "pnpm"
  elif [ -f "yarn.lock" ]; then
    echo "yarn"
  elif [ -f "bun.lockb" ]; then
    echo "bun"
  else
    echo "npm"
  fi
}
```

Substitute the detected manager everywhere you see `npm` below if the project uses something else (pnpm, yarn, bun).

---

## Check 1 — Build

```bash
# Standard build
npm run build

# Or if build script not defined, compile TypeScript
npx tsc --noEmit   # Type check only
npx tsc            # Full compilation

# Common build tools
npx vite build           # Vite
npx next build           # Next.js
npx nest build           # NestJS
npx webpack              # Webpack
npx esbuild src/index.ts --bundle --outdir=dist  # esbuild
```

---

## Check 2 — Types (TypeScript only)

```bash
# Standard type check
npx tsc --noEmit

# With specific config
npx tsc --noEmit --project tsconfig.json

# For monorepos with references
npx tsc --noEmit --build

# NestJS (may have separate tsconfig)
npx tsc --noEmit --project tsconfig.build.json
```

Plain-JS projects skip Check 2 (or run `npm run typecheck` if the project has a JSDoc-based typecheck script).

---

## Check 3 — Lint

```bash
# ESLint
npx eslint . --ext .ts,.tsx,.js,.jsx

# With auto-fix (run first to resolve mechanical issues)
npx eslint . --ext .ts,.tsx,.js,.jsx --fix

# Prettier (formatting)
npx prettier --check .
npx prettier --write .

# Combined project script (if configured)
npm run lint

# Biome (modern alternative)
npx biome check .
npx biome check . --apply     # auto-fix
```

Auto-fix pattern: run with `--fix` / `--write` first, then re-run the check without it and assert clean.

---

## Check 4 — Tests

```bash
# Jest
npm test
npx jest
npx jest --coverage

# Vitest
npx vitest run
npx vitest run --coverage

# Mocha
npx mocha

# Specific directories
npx jest src/auth/__tests__/
npx vitest run src/auth/

# Coverage report
npm test -- --coverage --coverageReporters=text
```

---

## Check 5 — Security (dep-vuln scan)

Node-specific:
```bash
npm audit
npm audit --production
```

The other Check 5 categories (secrets, console-log detection, debug flags) are cross-language — see SKILL.md for patterns.

Node-specific console-log detection:
```bash
grep -rn "console\.log\|console\.debug\|console\.warn\|console\.error" src/ \
  --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx"

# Exclude test files
grep -rn "console\.log" src/ \
  --include="*.ts" --exclude="*.test.ts" --exclude="*.spec.ts"
```

Allowed exceptions: logger framework calls (`logger.info`, `logger.debug`), error handling in catch blocks if configured, test files.
