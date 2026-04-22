# Subagent Communication Protocol

Every subagent spawn from `implement-phase` should follow this protocol. Context preservation is paramount — verbose subagent responses are the single biggest waste of orchestrator context.

---

## Required response-format block

Include this block, or an equivalent one, in **every** subagent prompt:

```
RESPONSE FORMAT: Be concise. Return ONLY:
- STATUS: PASS/FAIL
- FILES: list of files created/modified
- ERRORS: brief error description (omit if none)

DO NOT include:
- Step-by-step explanations of what you did
- Code snippets (they're in the files)
- Suggestions for next steps
- Restating the original task

For large outputs, WRITE TO DISK:
- Test results → logs/test-[feature].log
- Build output → logs/build-[phase].log
- Error traces → logs/error-[task].log
Return only: "Full output: logs/[filename].log"
```

---

## Good vs. bad subagent responses

**Bad (wastes context):**
```
"I have successfully created the SummaryAgentService. First, I analyzed
the requirements and determined that we need to implement three methods:
summarize(), retry(), and handleError(). I created the file at
src/agents/summary-agent/summary-agent.service.ts with the following
implementation: [300 lines of code]. The service uses dependency
injection to receive the OllamaService. I also updated the module file
to register the service. You should now be able to run the tests..."
```

**Good (preserves context):**
```
STATUS: PASS
FILES: src/agents/summary-agent/summary-agent.service.ts (created),
       src/agents/summary-agent/summary-agent.module.ts (modified)
ERRORS: None
```

---

## Disk-based communication for large data

| Data type | Write to | Return |
|---|---|---|
| Test output (>20 lines) | `logs/test-[name].log` | "Tests: 47 passed. Full: logs/test-auth.log" |
| Build errors | `logs/build-[phase].log` | "Build FAIL. Details: logs/build-phase2.log" |
| Lint results | `logs/lint-[phase].log` | "Lint: 3 errors. See logs/lint-phase2.log" |
| Stack traces | `logs/error-[task].log` | "Error in X. Trace: logs/error-task.log" |
| Generated code review | `logs/review-[phase].md` | "Review complete. Report: logs/review-phase2.md" |

---

## General subagent spawn template

```
Task (run_in_background: true): "<one-sentence goal>.

Context: Phase [N] - [Name]
Requirements:
- [Requirement 1]
- [Requirement 2]

<optional: project conventions / coding standards pointers>

RESPONSE FORMAT: Be concise. Return only STATUS, FILES, ERRORS.
Write verbose output to logs/[task].log"
```

`run_in_background: true` is the default for implementation and verification work so the orchestrator doesn't block on long-running tasks. For single-shot lookups (e.g., "does this file exist"), leave it off.

---

## Coding standards reference

All implementation subagent prompts must reference project coding standards. The standard pointer:

```
CODING STANDARDS (MANDATORY):
- Services: <500 lines, single responsibility
- Interfaces: Required for DTOs and response types
- Errors: Domain exceptions, no empty catch blocks
- Logging: Use project logger, no console.log
Ref: docs/standards/CODING_STANDARDS.md
```

Include this, or a project-specific equivalent, in any subagent that writes production code.
