# Example patterns

Reference examples of each pattern type. Use these as models when extracting new patterns.

---

## Example 1 — Error resolution

```yaml
# ~/.claude/skills/learned/error_resolution/prisma-client-not-generated.yaml
id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
type: error_resolution
created: "2025-01-15T10:30:00Z"
updated: "2025-01-15T10:30:00Z"
version: 1

pattern:
  trigger: "PrismaClientInitializationError: Unable to require"
  symptoms:
    - "Error occurs on first Prisma query"
    - "Usually after schema changes"
    - "Works locally but fails in CI/Docker"
  root_cause: |
    The Prisma Client was not regenerated after schema changes.
    In Docker/CI environments, the generated client in node_modules
    may be stale or missing because it's not committed to git.
  solution:
    steps:
      - "Run 'npx prisma generate' to regenerate the client"
      - "In Docker, add 'prisma generate' to build steps"
      - "In CI, run generate before tests"
    code_example: |
      # Dockerfile
      RUN npx prisma generate

      # package.json
      "scripts": {
        "postinstall": "prisma generate"
      }
  context:
    framework: "Prisma"
    version: ">=4.0.0"
    environment: "Docker, CI/CD"

usage:
  times_applied: 3
  times_successful: 3
  times_failed: 0
  last_applied: "2025-01-20T14:00:00Z"

confidence:
  initial: 0.8
  current: 0.95
  adjustments:
    - date: "2025-01-20T14:00:00Z"
      reason: "Successfully resolved issue for third user"
      delta: 0.05

tags:
  - prisma
  - docker
  - ci-cd
  - database
```

---

## Example 2 — User correction

```yaml
# ~/.claude/skills/learned/user_corrections/test-file-colocation.yaml
id: "b2c3d4e5-f6g7-8901-bcde-f12345678901"
type: user_correction
created: "2025-01-18T09:15:00Z"
updated: "2025-01-18T09:15:00Z"
version: 1

pattern:
  original_approach: |
    Created test files in a separate __tests__ directory at project root,
    mirroring the source directory structure.
  corrected_approach: |
    Place test files adjacent to the source files they test,
    using .test.ts or .spec.ts suffix.
  reasoning: |
    The project follows test colocation pattern for several reasons:
    1. Easier to find tests for a given file
    2. Tests move with source files during refactoring
    3. Encourages writing tests (visible reminder)
    4. Reduces directory navigation
  applies_when:
    - "Creating new test files in this project"
    - "Moving or renaming source files"
    - "Setting up test configuration"
  project_specific: true
  project_identifier: "acme-frontend"

usage:
  times_applied: 2
  times_successful: 2
  times_failed: 0
  last_applied: "2025-01-20T11:00:00Z"

confidence:
  initial: 0.9
  current: 0.95
  adjustments: []

tags:
  - testing
  - project-conventions
  - file-organization
```

---

## Example 3 — Workaround

```yaml
# ~/.claude/skills/learned/workarounds/jest-esm-import-assertions.yaml
id: "c3d4e5f6-g7h8-9012-cdef-123456789012"
type: workaround
created: "2025-01-19T16:45:00Z"

pattern:
  limitation: |
    Jest doesn't support import assertions syntax (import ... with { type: 'json' })
    even with experimental ESM support enabled.
  goal: "Import JSON files in ESM modules being tested with Jest"
  workaround:
    approach: |
      Use createRequire to import JSON files instead of import assertions.
      This works because require() still supports JSON natively.
    steps:
      - "Import createRequire from 'node:module'"
      - "Create a require function scoped to the current module"
      - "Use require() for JSON imports"
    code_example: |
      // Instead of:
      // import config from './config.json' with { type: 'json' };

      // Use:
      import { createRequire } from 'node:module';
      const require = createRequire(import.meta.url);
      const config = require('./config.json');
  caveats:
    - "Slightly more verbose than import assertions"
    - "May need to update when Jest adds proper support"
    - "The require is synchronous, which is fine for JSON"
  better_alternative: |
    When Jest supports import assertions natively, revert to:
    import config from './config.json' with { type: 'json' };
  context:
    tool: "Jest"
    version: "<30.0.0"

confidence:
  initial: 0.85
  current: 0.85

tags:
  - jest
  - esm
  - json
  - import-assertions
```

---

## Example 4 — Debugging technique

```yaml
# ~/.claude/skills/learned/debugging_techniques/react-stale-closure.yaml
id: "d4e5f6g7-h8i9-0123-defg-234567890123"
type: debugging_technique
created: "2025-01-20T08:00:00Z"

pattern:
  problem_class: "React hook state appears to have stale values"
  indicators:
    - "State value is always the initial value in callbacks"
    - "Console.log shows correct state, but callback uses old value"
    - "Adding state to useEffect deps causes infinite loop"
    - "Problem appears in setTimeout, setInterval, or event listeners"
  technique:
    name: "Stale Closure Debugger"
    description: |
      Systematically identify which closure is capturing stale values
      and determine the appropriate fix (ref, functional update, or effect cleanup).
    steps:
      - "Add console.log inside the problematic callback showing the state value"
      - "Add console.log in the component body showing current state"
      - "Compare values — if callback shows old value, it's a stale closure"
      - "Check how the callback is created — is it recreated when state changes?"
      - "If callback is memoized (useCallback), check its dependency array"
      - "Determine fix: useRef for value, functional update for setState, or proper deps"
    tools_used:
      - "React DevTools"
      - "Console logging"
      - "ESLint react-hooks plugin"
  example_application: |
    Problem: onClick handler always logs initial count (0)

    // Problematic code
    const [count, setCount] = useState(0);
    const handleClick = useCallback(() => {
      console.log(count); // Always 0!
    }, []); // Missing count in deps

    // Fix options:
    // 1. Add count to deps: useCallback(() => {...}, [count])
    // 2. Use ref: countRef.current
    // 3. Use functional update: setCount(prev => prev + 1)
  effectiveness:
    typical_time_saved: "30-60 minutes"
    success_rate: "~90%"

tags:
  - react
  - hooks
  - closures
  - debugging
```

---

## Example 5 — Project-specific

```yaml
# ~/.claude/skills/learned/project_specific/acme-api/error-response-format.yaml
id: "e5f6g7h8-i9j0-1234-efgh-345678901234"
type: project_specific
created: "2025-01-17T14:20:00Z"

pattern:
  project:
    identifier: "acme-api"
    path: "/home/user/projects/acme-api"
    description: "Backend API service for Acme Corp"
  pattern:
    name: "Standardized Error Response Format"
    category: "api-design"
    description: |
      All API endpoints must return errors in a standardized format
      with specific fields for client consumption and logging.
    rationale: |
      Enables consistent error handling in frontend clients and
      structured logging in the observability platform.
  examples:
    - file: "src/controllers/users.controller.ts"
      line_range: "45-62"
      description: "Validation error response"
    - file: "src/middleware/error-handler.ts"
      line_range: "12-38"
      description: "Global error handler implementation"
  applies_to:
    - "Creating new API endpoints"
    - "Adding error handling to existing endpoints"
    - "Implementing new error types"
  anti_patterns:
    - "Throwing raw Error objects without transformation"
    - "Returning error strings instead of structured objects"
    - "Using HTTP status codes inconsistently"
  response_format: |
    {
      "error": {
        "code": "VALIDATION_ERROR",
        "message": "Human readable message",
        "details": [...],
        "requestId": "uuid",
        "timestamp": "ISO8601"
      }
    }

tags:
  - api
  - error-handling
  - project-conventions
  - acme-api
```
