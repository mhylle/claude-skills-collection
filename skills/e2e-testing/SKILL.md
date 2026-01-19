---
name: e2e-testing
description: Comprehensive E2E testing skill using Playwright MCP for systematic web application testing. This skill should be used when users need to test web-based systems end-to-end, set up test regimes, run exploratory tests, or analyze test history. Triggers on requests like "test my webapp", "set up E2E tests", "run the tests", "what's been flaky", or when validating web application functionality. The skill observes and reports only - it never fixes issues. Supports three modes - setup (create test regime), run (execute tests), and report (analyze results).
---

# E2E Testing Skill

## Overview

A comprehensive E2E testing skill using Playwright MCP for systematic testing of any web-based system. The skill:

- **Observes and reports** - Never fixes issues, only documents them
- **Discovers paths** - Finds undocumented functionality at runtime
- **Tracks history** - Identifies flaky areas and suggests variations
- **Produces dual reports** - Human-readable and machine-readable formats

## Orchestration Model

This skill operates as an **orchestrator** for test execution. Playwright MCP interactions are extremely context-heavy and will exhaust orchestrator context if run directly.

### Architecture

| Role | Responsibility |
|------|----------------|
| **Orchestrator** | Reads regime, plans execution, tracks progress, synthesizes results |
| **Subagents** | Execute Playwright MCP tests, write results to files, return concise summaries |

### Key Principles

1. **ALL Playwright MCP interactions go through subagents** - The orchestrator never directly invokes Playwright tools
2. **Subagents write detailed output to files** - Only return summaries in chat
3. **Orchestrator coordinates and synthesizes** - Reads result files, generates reports, updates history
4. **Parallel execution where possible** - Group independent scenarios for concurrent subagent execution

### Subagent Communication Pattern

```
Orchestrator                          Subagent
    |                                     |
    |-- Spawn with scenario list -------->|
    |                                     |-- Run Playwright MCP
    |                                     |-- Capture evidence
    |                                     |-- Write to results file
    |<-- Return: pass/fail + file path ---|
    |
    |-- Read result file
    |-- Update tracking
```

Reference: `docs/references/subagent-guidelines.md`

## Prerequisites

Before using this skill, verify Playwright MCP is available:

1. Check for `playwright` in MCP server configuration
2. If missing, add to Claude settings:
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

If Playwright MCP is unavailable, inform the user and provide setup instructions before proceeding.

## Mode Selection

This skill operates in three modes. Determine mode from user request:

| User Request | Mode |
|--------------|------|
| "Set up tests for...", "Create test regime" | **Setup** |
| "Run the tests", "Test the...", "Execute tests" | **Run** |
| "Show test results", "What failed?", "What's flaky?" | **Report** |

If unclear, ask: "Would you like to set up a test regime, run existing tests, or view reports?"

---

## Setup Mode

**Purpose**: Create or update test regime through interactive discovery.

**Note on Orchestration**: While Setup Mode involves interactive user dialogue, heavy Playwright exploration (Step 2) should use subagents. The orchestrator handles user interaction and regime creation; subagents perform browser automation and return discovered elements.

### Entry Points

Determine entry point from user context:

| Context | Entry |
|---------|-------|
| User provides URL | URL Exploration |
| User describes system purpose | Description-Based |
| User points to documentation | Documentation Extraction |
| Combination of above | Combined Flow (recommended) |

### Setup Workflow

#### Step 1: Gather Initial Context

Ask for any missing information:
- **URL**: Base URL of the application
- **Purpose**: What does this system do? (1-2 sentences)
- **Key workflows**: What are the critical user journeys?
- **Existing docs**: Any README, user stories, or specs?

#### Step 2: Explore Application (via Subagent)

Spawn an exploration subagent with instructions:

```
Task: Explore application at [base_url]

Instructions:
1. Navigate to base URL
2. Capture accessibility snapshot
3. Identify all navigation elements, interactive elements, key pages
4. Write discoveries to: tests/e2e/discovery/exploration-{timestamp}.json
5. Return: Summary of pages found + file path

Output format for file:
{
  "pages": [...],
  "navigation_elements": [...],
  "interactive_elements": [...],
  "forms": [...],
  "requires_auth": [...]
}
```

For each discovered element, note:
- Element type and purpose
- Alternative paths to reach it
- Required preconditions (login, etc.)

#### Step 3: Discover Alternative Paths

While exploring, actively look for:
- Multiple ways to accomplish the same goal
- Hidden or non-obvious functionality
- Edge cases in navigation

Document discoveries as: "Found alternative: [description]"

#### Step 4: Define Test Scenarios

For each key workflow, create scenario with:

```yaml
scenario: [Descriptive name]
description: [What this tests]
preconditions:
  - [Required state before test]
blocking: [true/false - does failure prevent other tests?]
steps:
  - action: [navigate/click/type/verify/wait]
    target: [selector or description]
    value: [input value if applicable]
    flexibility:
      type: [exact/contains/ai_judgment]
      criteria: [specific rules or judgment prompt]
success_criteria:
  - [What must be true for pass]
alternatives:
  - [Alternative path if primary fails]
```

#### Step 5: Create Test Regime File

Write regime to `tests/e2e/test_regime.yml`:

```yaml
# Test Regime: [Application Name]
# Created: [YYYY-MM-DD]
# Last Updated: [YYYY-MM-DD]

metadata:
  application: [Name]
  base_url: [URL]
  description: [Purpose]

global_settings:
  screenshot_every_step: true
  capture_network: true
  capture_console: true
  discovery_cap: 5  # Max new paths to discover per run

blocking_dependencies:
  - scenario: login
    blocks: [profile, settings, checkout]  # These won't run if login fails

scenarios:
  - scenario: [name]
    # ... scenario definition
```

#### Step 6: Present Regime for Review

Show user:
1. Summary of discovered scenarios
2. Blocking dependencies identified
3. Alternative paths found
4. Ask for confirmation or modifications

---

## Run Mode

**Purpose**: Execute tests sequentially with full evidence capture.

### CRITICAL: Test Status Integrity

**Principle: No Invalid Skips**

A test should only have three outcomes:

| Status | Meaning |
|--------|---------|
| **PASSED** | The feature works as specified |
| **FAILED** | The feature doesn't work or doesn't exist |
| **SKIPPED** | Only for legitimate environmental reasons (see below) |

#### Valid Reasons to Skip a Test

- Test environment unavailable (database down, service unreachable)
- Explicit `@skip` decorator for documented WIP features with ticket reference
- Platform-specific tests running on wrong platform
- External dependency unavailable (third-party API down)

#### Invalid Reasons to Skip (Mark as FAILED Instead)

| Situation | Correct Status | Notes Format |
|-----------|----------------|--------------|
| Feature doesn't exist in UI | **FAILED** | "Expected [feature] not found. Feature not implemented." |
| Test wasn't executed/completed | **FAILED** | "Test not executed. [What wasn't verified]." |
| Test would fail | **FAILED** | That's the point of testing |
| "Didn't get around to it" | **FAILED** | Incomplete test coverage is a failure |
| Feature works differently than spec | **FAILED** | "Implementation doesn't match specification: [details]" |

#### Rationale

The purpose of a test is to **fail when something doesn't work**. Marking missing features or unexecuted tests as "skipped" produces artificially inflated pass rates and hides real issues. A test report that only shows green isn't useful if it achieved that by ignoring problems.

#### Implementation Examples

**When a test cannot find the expected UI element or feature:**
```
Status: FAILED
Notes: "FAILED: Expected 'Add to Cart' button not found. Feature not implemented or selector changed."
```

**When a test is not fully executed:**
```
Status: FAILED
Notes: "FAILED: Test not executed. Checkout flow verification was not completed - stopped at payment step."
```

**When environment is genuinely unavailable (valid skip):**
```
Status: SKIPPED
Notes: "SKIPPED: Payment gateway sandbox unavailable. Ticket: PAY-123"
```

---

### Pre-Run (Orchestrator)

The orchestrator performs these steps directly (no Playwright):

1. **Verify regime exists**: Check for `tests/e2e/test_regime.yml`
   - If missing: "No test regime found. Would you like to run Setup mode first?"

2. **Load history**: Check for `tests/e2e/test_history.json`
   - If exists: Note previously flaky scenarios for extra attention

3. **Group scenarios for execution**:
   - Identify independent scenarios that can run in parallel
   - Respect blocking dependencies (run blockers first)
   - Create scenario groups for subagent distribution

4. **Create TodoWrite tracking**:
   - Add todo item for each scenario group
   - Track overall test run progress

5. **Verify Playwright MCP**: Confirm browser automation is available for subagents

### Execution (Subagents)

For each scenario group, spawn a test execution subagent:

```
Task: Execute E2E test scenarios

Scenarios: [list of scenario definitions from regime]
Base URL: [from regime metadata]
Credentials: [if needed]

Instructions:
1. Start fresh - no cached state
2. For each scenario:
   a. Check preconditions
   b. Execute each step via Playwright MCP
   c. Capture evidence (screenshots, DOM, network, console)
   d. Evaluate success using flexibility criteria
   e. Try alternatives if primary path fails
3. Write detailed results to: tests/e2e/results/{scenario-name}.json
4. Return ONLY: scenario name, pass/fail, result file path

Result file format:
{
  "scenario": "name",
  "result": "pass|fail|blocked",
  "duration_ms": 1234,
  "steps": [...],
  "evidence_paths": [...],
  "discoveries": [...],
  "error": null | { "step": N, "message": "..." }
}
```

#### Execution Rules for Subagents

**Rule 1: Always Start Fresh**
Every test run starts from Step 1 of Scenario 1. Never skip steps or use cached state.

**Rule 2: Result Status**
- PASS: Step completed successfully
- FAIL: Step failed OR element not found OR feature missing
- BLOCKED: Dependent on a failed blocking scenario
- SKIPPED: Only for valid environmental reasons (see Test Status Integrity)

**Rule 3: Failure Handling**
1. Mark as failed with full evidence
2. Try alternatives if defined in scenario
3. Continue to next scenario (let orchestrator handle blocking logic)
4. Never fix - document only

**Rule 4: Runtime Discovery**
Note any undocumented paths discovered during execution:
- New navigation options not in regime
- Alternative ways to complete actions
- Unexpected UI states

Include discoveries in result file for orchestrator review.

### Post-Run (Orchestrator)

After all test subagents complete:

1. **Read result files** from `tests/e2e/results/`
   - Aggregate pass/fail counts
   - Identify regressions vs. history
   - Flag flaky scenarios

2. **Spawn report subagent**:
   ```
   Task: Generate test reports

   Input: tests/e2e/results/*.json
   Output:
     - tests/e2e/reports/YYYY-MM-DD-HHmmss-report.md
     - tests/e2e/reports/YYYY-MM-DD-HHmmss-report.json

   Return: Report file paths + summary stats
   ```

3. **Spawn history update subagent**:
   ```
   Task: Update test history

   Input:
     - Current results: tests/e2e/results/*.json
     - History file: tests/e2e/test_history.json

   Instructions:
     - Append current run to history
     - Recalculate flaky scenarios
     - Generate suggested variations for flaky areas

   Return: Updated flaky count + new suggestions count
   ```

4. **Present summary to user**:
   - Overall pass/fail counts
   - Critical failures (blocking scenarios)
   - Regressions (newly failing)
   - Offer next steps

### Subagent Instructions for Test Execution

Each test subagent receives specific instructions. Use this template:

```markdown
## Test Execution Subagent

You are executing E2E tests via Playwright MCP. Follow these instructions exactly.

### Input
- **Scenarios**: [YAML scenario definitions]
- **Base URL**: [URL]
- **Credentials**: [if applicable]

### Execution Protocol
1. Navigate to base URL
2. For each scenario in order:
   - Verify preconditions
   - Execute each step using Playwright MCP tools
   - Capture screenshot after each action
   - Log network requests and console output
   - Evaluate success criteria per step

### Evidence Capture
For each step, save:
- Screenshot: `tests/e2e/evidence/{scenario}/step-{N}/screenshot.png`
- DOM snapshot: `tests/e2e/evidence/{scenario}/step-{N}/dom.html`
- Network log: `tests/e2e/evidence/{scenario}/step-{N}/network.json`
- Console log: `tests/e2e/evidence/{scenario}/step-{N}/console.txt`

### Output Requirements
Write detailed results to: `tests/e2e/results/{scenario}.json`

Return to orchestrator (chat response):
```
Scenario: {name}
Result: {PASS|FAIL|BLOCKED}
File: tests/e2e/results/{scenario}.json
```

Keep response under 10 lines per scenario. All details go in the file.

### What NOT to Do
- Do NOT update TodoWrite (orchestrator's job)
- Do NOT fix failing tests
- Do NOT make architectural decisions
- Do NOT explore beyond assigned scenarios
```

### Flexibility Criteria Evaluation

For each success check, apply the configured flexibility type:

| Type | Evaluation Method |
|------|-------------------|
| `exact` | String/value must match exactly |
| `contains` | Target must contain specified text |
| `ai_judgment` | Use AI reasoning: "Does this accomplish [goal]?" |

For `ai_judgment`, provide confidence level:
- **High**: Clear success/failure
- **Medium**: Likely success/failure but some ambiguity
- **Low**: Uncertain, recommend manual review

### Evidence Bundle

Evidence is captured and written by test execution subagents. The orchestrator only references file paths from result files.

**Directory Structure** (written by subagents):

```
tests/e2e/evidence/
  scenario-name/
    step-01/
      screenshot.png
      dom.html
      network.json
      console.txt
    step-02/
      ...
```

**Orchestrator Access**: Read evidence paths from `tests/e2e/results/{scenario}.json` to include in reports. Do not read evidence files directly unless user requests specific details.

### History Integration

History updates are performed by a dedicated subagent (see Post-Run Orchestrator section). The subagent:

1. **Compares to previous runs**:
   - Same scenario passed before but failed now? Flag regression
   - Same scenario failed before? Note persistent issue
   - Intermittent pass/fail? Mark as flaky

2. **Updates history file**:
```json
{
  "runs": [
    {
      "timestamp": "ISO-8601",
      "scenarios": {
        "scenario-name": {
          "result": "pass|fail|blocked|skipped",
          "result_notes": "Details about the result",
          "duration_ms": 1234,
          "steps_completed": 5,
          "confidence": "high|medium|low",
          "discoveries": []
        }
      }
    }
  ],
  "flaky_scenarios": ["scenario-1", "scenario-2"],
  "suggested_variations": [
    {
      "scenario": "login",
      "variation": "Test with special characters in password",
      "reason": "Failed 3/10 runs with complex passwords"
    }
  ]
}
```

**Result status rules** (see Test Status Integrity):
- `pass`: Feature works as specified
- `fail`: Feature doesn't work, doesn't exist, or test incomplete
- `blocked`: Depends on failed blocking scenario
- `skipped`: ONLY for valid environmental reasons (with ticket reference)

3. **Generates variations for flaky areas**:
   - If scenario failed 3+ times in last 10 runs: Auto-suggest new test variations
   - Add to `suggested_variations` in history
   - Return summary to orchestrator: flaky count + new suggestions count

---

## Report Mode

**Purpose**: Generate actionable reports from test results.

**Note on Orchestration**: Report generation is handled by a dedicated report subagent (spawned in Post-Run). The orchestrator reads the generated reports and presents summaries to the user. For standalone report requests (not after a run), spawn a report subagent to read result files and generate reports.

### Report Types

Generate both reports after every run (via report subagent):

#### Human-Readable Report

Output to `tests/e2e/reports/YYYY-MM-DD-HHmmss-report.md`:

```markdown
# E2E Test Report: [Application Name]

**Run Date**: YYYY-MM-DD HH:mm:ss
**Duration**: X minutes
**Result**: X passed, Y failed, Z blocked, W skipped

## Summary

| Scenario | Result | Duration | Confidence |
|----------|--------|----------|------------|
| Login | PASS | 2.3s | High |
| Checkout | FAIL | 5.1s | High |

## Failures

### Checkout Flow

**Step Failed**: Step 3 - Click "Complete Purchase"
**Error**: Button not found within timeout

**Evidence**:
- Screenshot: `evidence/checkout/step-03/screenshot.png`
- Expected: Button with text "Complete Purchase"
- Actual: Page showed error message "Session expired"

**Reproduction Steps**:
1. Navigate to https://app.example.com
2. Login with test credentials
3. Add item to cart
4. Click checkout
5. [FAILS HERE] Click "Complete Purchase"

**Suggested Investigation**:
- Session timeout may be too aggressive
- Check if login state persists through checkout flow

## Discoveries

Found 2 undocumented paths:
1. **Alternative checkout**: Guest checkout available via footer link
2. **Quick reorder**: "Buy again" button on order history

## Flaky Areas

Based on history (last 10 runs):
- `search-results`: 7/10 pass rate - timing issue suspected
- `image-upload`: 8/10 pass rate - file size variations

## Suggested New Tests

Based on failures and history:
1. Test session persistence during long checkout
2. Test guest checkout flow (discovered)
3. Add timeout resilience to search tests
```

#### Machine-Readable Report

Output to `tests/e2e/reports/YYYY-MM-DD-HHmmss-report.json`:

```json
{
  "metadata": {
    "application": "App Name",
    "base_url": "https://...",
    "run_timestamp": "ISO-8601",
    "duration_ms": 123456,
    "regime_version": "hash-of-regime-file"
  },
  "summary": {
    "total": 10,
    "passed": 7,
    "failed": 2,
    "blocked": 1,
    "skipped": 0
  },
  "scenarios": [
    {
      "name": "checkout",
      "result": "fail",
      "duration_ms": 5100,
      "confidence": "high",
      "failed_step": {
        "index": 3,
        "action": "click",
        "target": "button:Complete Purchase",
        "error": "Element not found",
        "evidence_path": "evidence/checkout/step-03/"
      },
      "reproduction": {
        "playwright_commands": [
          "await page.goto('https://app.example.com')",
          "await page.fill('#username', 'test')",
          "await page.click('button:Login')",
          "await page.click('.add-to-cart')",
          "await page.click('button:Checkout')",
          "// FAILED: await page.click('button:Complete Purchase')"
        ]
      },
      "alternatives_tried": [
        {
          "path": "Use keyboard Enter instead of click",
          "result": "fail"
        }
      ]
    }
  ],
  "discoveries": [
    {
      "type": "alternative_path",
      "description": "Guest checkout via footer",
      "location": "footer > a.guest-checkout",
      "tested": true,
      "result": "pass"
    }
  ],
  "history_analysis": {
    "regressions": ["checkout"],
    "persistent_failures": [],
    "flaky": ["search-results", "image-upload"]
  },
  "suggested_actions": [
    {
      "type": "investigate",
      "scenario": "checkout",
      "reason": "New regression - passed in previous 5 runs"
    },
    {
      "type": "add_test",
      "scenario": "guest-checkout",
      "reason": "Discovered undocumented path"
    }
  ]
}
```

### Report Presentation

After generating reports:

1. **Display summary** to user:
   - Overall pass/fail counts
   - Critical failures (blocking scenarios)
   - Regressions (newly failing)

2. **Highlight actionable items**:
   - What needs investigation
   - Discovered paths to add to regime
   - Suggested test variations

3. **Offer next steps**:
   - "Would you like to add the discovered paths to the test regime?"
   - "Should I update the regime with suggested variations?"
   - "Ready to share the machine report with the bug-fix skill?"

---

## Quality Checklist

Before completing any mode, verify:

### Setup Mode
- [ ] All entry points explored (URL, description, docs)
- [ ] Exploration subagent used for Playwright discovery
- [ ] Alternative paths documented
- [ ] Blocking dependencies identified
- [ ] Flexibility criteria defined for dynamic content
- [ ] Test regime file created and valid YAML

### Run Mode
- [ ] Test regime loaded and parsed
- [ ] Scenarios grouped for parallel execution
- [ ] TodoWrite tracking created
- [ ] Test subagents spawned (not running Playwright directly)
- [ ] Result files collected from all subagents
- [ ] Report subagent generated both report formats
- [ ] History subagent updated test history
- [ ] Summary presented to user

### Report Mode
- [ ] Both human and machine reports generated
- [ ] Reproduction steps included for failures
- [ ] Evidence paths valid and accessible
- [ ] History analysis included
- [ ] Actionable suggestions provided

---

## Resources

### references/

- `test-regime-schema.md` - Complete YAML schema for test regime files
- `flexibility-criteria-guide.md` - How to define and evaluate flexible success criteria
- `history-schema.md` - JSON schema for test history tracking

### Report Templates

Report templates are embedded in this skill. The machine-readable format is designed for consumption by a future bug-fix skill.
