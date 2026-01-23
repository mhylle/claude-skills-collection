# Brainstorm: Browser Verification Agent

**Date**: 2026-01-23
**Status**: Ready for Planning

## Executive Summary

A lightweight agent that wraps Playwright MCP to perform single UI verification tasks. Spawned by implement-phase during Step 3 (Automated Integration Testing), it executes one test at a time, captures evidence, and returns a structured response that preserves orchestrator context.

## Idea Evolution

### Original Concept
A Playwright MCP agent for UI verification that can be spawned by implement-phase to perform structured UI testing, following agent response patterns for context preservation.

### Refined Understanding
- **Single test per spawn** - keeps context minimal, enables parallelization
- **AI-to-AI interface** - implement-phase provides natural language test descriptions with assertions
- **Browser context management** - persistent context for session sharing, fresh when needed
- **Evidence-first** - always capture screenshots, write verbose output to disk
- **Wrapper, not replacement** - if Playwright MCP is down, that's a blocking element

### Key Clarifications Made
- Input comes from implement-phase AI, not humans
- Agent does navigation + verification (not just assertion)
- Response format extended: STATUS, SCREENSHOT, OBSERVED, EXPECTED, ERRORS
- Flakiness indicator included (often unacceptable, good to know)
- Element not found = failure (end-user testing perspective)
- No replay traces needed

## Analysis Results

### Strengths (Yellow Hat)
- Massive context savings by isolating each verification
- Parallelizable - independent tests can run concurrently
- Clear evidence trail (screenshots always captured)
- Fits existing agent patterns perfectly
- Reusable beyond implement-phase

### Risks & Concerns (Black Hat + Premortem)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Playwright MCP unavailable | Low | High | Report as blocking element, implement-phase escalates |
| Browser context stale/corrupted | Medium | Medium | Agent checks context health, creates fresh if needed |
| Flaky test blocks phase | Medium | Medium | Report flakiness indicator, let caller decide |
| Screenshots fill disk | Low | Low | Store in dated folders, implement-phase manages cleanup |
| Insufficient test context | Medium | Medium | Fail fast with clear error on missing required fields |
| Selector fragility | Medium | Medium | Document accessibility-first selector patterns |

### Gaps Identified
- [ ] **Timeout configuration** - Need default + override capability
- [ ] **Screenshot naming convention** - Should include test ID and timestamp
- [ ] **Context health check** - How to detect stale browser context

### Enhancement Opportunities (SCAMPER)
- **Substitute**: Use `browser_snapshot` (accessibility tree) for deterministic assertions alongside visual screenshots
- **Adapt**: Borrow evidence collection pattern from e2e-testing skill
- **Modify**: Extend response format with OBSERVED/EXPECTED fields for clarity

### Premortem Findings
- **Failure mode**: Timeout on slow pages → **Prevention**: Configurable timeout with sensible default (30s)
- **Failure mode**: Context corruption → **Prevention**: Health check before test, recreate if needed
- **Failure mode**: Disk space exhaustion → **Prevention**: Dated folders, cleanup guidance in docs

## Structured Concept

### Component 1: Agent Definition

**Name**: `browser-verification-agent`
**Purpose**: Execute single UI verification test via Playwright MCP
**Model**: sonnet
**Color**: yellow

**Core Identity**:
- Wrapper around Playwright MCP
- Single-purpose: one verification per invocation
- Evidence-first: always captures screenshot
- Context-preserving: returns structured, concise response

### Component 2: Input Schema

```yaml
Input:
  test_description: string (required)
    # Natural language description of what to verify
    # Example: "Navigate to /login, enter 'test@example.com' in email field,
    #          click Submit, verify redirect to /dashboard"

  base_url: string (required)
    # Target application URL
    # Example: "http://localhost:3000"

  expected_outcome: string (required)
    # What should happen if test passes
    # Example: "URL contains /dashboard and welcome message is visible"

  session_context: string (optional)
    # "fresh" (default) or "persistent"
    # Use "persistent" to share logged-in state between tests

  timeout_ms: number (optional, default: 30000)
    # Maximum time for test execution

  screenshot_path: string (optional)
    # Override default screenshot location
    # Default: logs/screenshots/{timestamp}-{test-slug}.png
```

### Component 3: Output Schema

```yaml
Output:
  status: enum [PASS, FAIL, FLAKY, BLOCKED]
    # PASS: Test succeeded
    # FAIL: Test failed (assertion or element not found)
    # FLAKY: Passed on retry (include retry count)
    # BLOCKED: Playwright MCP unavailable or infrastructure issue

  screenshot: string
    # Path to captured screenshot
    # Example: "logs/screenshots/2026-01-23-143022-login-flow.png"

  observed: string
    # What actually happened (brief)
    # Example: "Clicked Submit, page redirected to /dashboard,
    #          welcome message 'Hello, test@example.com' visible"

  expected: string
    # Echo back the expected_outcome for comparison

  errors: string (optional)
    # Error details if status is FAIL or BLOCKED
    # Example: "Element 'Submit button' not found after 30s timeout"

  flaky_info: object (optional, only if status is FLAKY)
    retry_count: number
    failure_reason: string

  evidence_log: string (optional)
    # Path to detailed log for verbose output
    # Example: "logs/browser-verification/2026-01-23-143022-login-flow.log"
```

### Component 4: Playwright MCP Tools Used

| Tool | Purpose |
|------|---------|
| `browser_navigate` | Navigate to target URL |
| `browser_snapshot` | Get accessibility tree for element refs |
| `browser_click` | Click elements |
| `browser_type` | Enter text in fields |
| `browser_press_key` | Keyboard actions (Enter, Tab, etc.) |
| `browser_select_option` | Dropdown selection |
| `browser_wait_for` | Wait for conditions |
| `browser_take_screenshot` | Capture visual evidence |

### Component 5: Execution Flow

```
1. Validate inputs (fail fast if missing required fields)
2. Check Playwright MCP availability
   → If unavailable: return BLOCKED
3. Check browser context health
   → If stale or session_context="fresh": create new context
   → If session_context="persistent": reuse existing
4. Execute test steps (parsed from test_description):
   a. browser_navigate to base_url
   b. browser_snapshot to get element refs
   c. Perform actions (click, type, etc.) based on description
   d. browser_snapshot after each major action
   e. browser_wait_for expected conditions
5. Capture screenshot (always)
6. Compare observed state to expected_outcome
7. Return structured response
```

### Component 6: Error Handling

| Error Type | Response |
|------------|----------|
| Playwright MCP unavailable | status: BLOCKED, errors: "Playwright MCP not responding" |
| Element not found | status: FAIL, errors: "Element '{description}' not found" |
| Timeout | status: FAIL, errors: "Timeout waiting for {condition}" |
| Assertion failed | status: FAIL, observed vs expected mismatch |
| Pass on retry | status: FLAKY, include retry_count and failure_reason |
| Unknown error | status: FAIL, errors: full error message, evidence_log: path |

### Component 7: Integration with implement-phase

**Spawning Pattern** (from implement-phase Step 3):

```
Task(subagent_type="browser-verification-agent"):
  "Verify login functionality.

  base_url: http://localhost:3000
  test_description: Navigate to /login, enter 'test@example.com' in email
    field, enter 'password123' in password field, click Login button
  expected_outcome: URL changes to /dashboard, user avatar visible in header
  session_context: fresh

  RESPONSE FORMAT: Return STATUS, SCREENSHOT path, OBSERVED behavior,
  EXPECTED echo, ERRORS if any. Write verbose logs to logs/browser-verification/"
```

**implement-phase receives**:
```
STATUS: PASS
SCREENSHOT: logs/screenshots/2026-01-23-143022-login-test.png
OBSERVED: Navigated to /login, entered credentials, clicked Login,
          redirected to /dashboard, avatar visible in header
EXPECTED: URL changes to /dashboard, user avatar visible in header
```

## Research Findings

### External Best Practices
- Use accessibility snapshots (`browser_snapshot`) for element refs - more stable than CSS selectors
- Keep tests small and single-purpose
- Use `getByRole`, `getByTestId`, accessible labels over CSS/XPath
- Fresh browser context per test prevents state leakage
- Configure traces for CI debugging (but we skip replay per user decision)

### Anti-Patterns to Avoid
- Arbitrary `waitForTimeout` calls - use `browser_wait_for` with conditions
- Sharing browser context between unrelated tests
- Hardcoded test data - use descriptive values in test_description
- Pixel-perfect screenshot assertions - too fragile

### Codebase Context
- Follows agent pattern from `agents/*.md` files
- Uses YAML frontmatter: name, description, model, color
- Includes examples with `<example>` blocks and `<commentary>`
- Response format aligns with subagent communication protocol
- Evidence stored in `logs/` directory pattern

## Architectural Decisions

### Pending Decisions (not yet documented)
- **Screenshot storage strategy**: dated folders vs flat with timestamps
- **Context health check method**: ping test or state validation
- **Retry strategy**: agent-internal or implement-phase controlled

## Recommended Next Steps

1. **Create agent file** using agent-creator skill with this specification
2. **Add to implement-phase** documentation for Step 3 integration
3. **Test with sample app** to validate the flow
4. **Document cleanup strategy** for screenshot accumulation

## Ready for Agent-Creator

**Yes** - The concept is well-defined with clear input/output schemas, execution flow, and integration patterns.

### Agent-Creator Input Summary

```
Name: browser-verification-agent
Purpose: Execute single UI verification test via Playwright MCP, returning
         structured evidence for implement-phase Step 3

Inputs:
  - test_description (string, required): Natural language test steps
  - base_url (string, required): Target application URL
  - expected_outcome (string, required): Success criteria
  - session_context (string, optional): "fresh" or "persistent"
  - timeout_ms (number, optional): Max execution time

Outputs:
  - status: PASS | FAIL | FLAKY | BLOCKED
  - screenshot: path to captured image
  - observed: what actually happened
  - expected: echo of expected_outcome
  - errors: failure details (if any)
  - flaky_info: retry details (if FLAKY)
  - evidence_log: path to verbose log

Tools Required:
  - Playwright MCP (browser_navigate, browser_snapshot, browser_click,
    browser_type, browser_press_key, browser_select_option,
    browser_wait_for, browser_take_screenshot)

Success Criteria:
  - Returns valid status enum
  - Always captures screenshot
  - Observed matches test execution
  - Errors are actionable when present
  - Response is concise (context-preserving)

Evaluation Strategy:
  - format_compliance: Output matches schema
  - completeness: All required fields present
```
