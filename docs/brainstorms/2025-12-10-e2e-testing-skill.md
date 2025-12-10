# Brainstorm: E2E Testing Skill with Playwright MCP

**Date**: 2025-12-10
**Status**: Ready for Planning

## Executive Summary

A comprehensive E2E testing skill using Playwright MCP that systematically tests any web-based system through exploratory and regime-based testing. The skill observes and reports (never fixes), discovers undocumented paths at runtime, tracks test history for intelligent re-testing, and produces dual reports for humans and machines.

## Idea Evolution

### Original Concept

User wanted to create a testing skill based on `docs/test_workflow.md` - a workflow testing methodology document with sequential execution rules, error fixing requirements, and a hardcoded test query for a Research Agent system.

### Refined Understanding

Through Socratic exploration, the concept evolved from a specific research agent tester to a **general-purpose E2E testing skill** with:
- Playwright MCP for browser automation (not just one system)
- Dynamic test regime setup (not hardcoded queries)
- Test-only focus (observe and report, never fix)
- Flexible success criteria using AI judgment + explicit rules
- Runtime discovery of undocumented paths
- History-aware testing with automatic variation generation
- Dual reporting for humans and future bug-fix skill

### Key Clarifications Made

- Testing scope: Any web-based system, not just research agents
- Re-execution: Literally re-execute from beginning each run
- Test regime: Multi-modal setup (URL exploration + description + docs)
- Failure handling: Mark failed, try alternatives, detect blocking vs non-blocking
- Discovery: Queue, document, and test undocumented paths found at runtime
- Success criteria: AI judgment combined with explicit rules ("flexibility criteria")
- Reports: Human-readable + machine-readable for bug-fix skill consumption
- Evidence: Screenshot at every step, full DOM/network/console capture
- History: Track over time, compare runs, auto-add test variations
- No CI/CD: Interactive/manual use only

## Analysis Results

### Strengths (Yellow Hat)

- **Fills real gap**: No e2e-ui-tester agent exists; skill collection expects Playwright verification
- **Exploratory testing differentiator**: Runtime discovery of undocumented paths is novel and valuable
- **History-aware intelligence**: Auto-adding variations for historically flaky areas is sophisticated
- **Dual reports serve ecosystem**: Human report for developers/QA, machine report enables future automation
- **Flexible success criteria**: AI judgment + explicit rules handles dynamic content gracefully
- **Aligns with existing patterns**: Multi-phase workflows, subagent orchestration, structured output templates

### Risks & Concerns (Black Hat + Premortem)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Playwright MCP not available | Medium | High | Check availability at skill start, provide setup instructions |
| Test regime too complex to maintain | Medium | High | Keep format simple, auto-update from discoveries |
| AI judgment inconsistent | Medium | Medium | Require explicit rules + AI combo, document confidence levels |
| History storage becomes unwieldy | Low | Medium | Define retention policy (30 days detailed, summarize older) |
| Discovery causes test sprawl | Medium | Medium | Cap at 5 per run, require approval to add to regime |
| Reports not actionable | Low | High | Include file:line refs, reproduction steps, screenshots |

### Gaps Identified

- [ ] **Playwright MCP prerequisite check** - Add verification and setup instructions at skill start
- [ ] **Test history storage schema** - Define JSON format for history, retention policy
- [ ] **Discovery sprawl control** - Implement cap and approval mechanism
- [ ] **Confidence scoring system** - Add high/medium/low confidence to AI judgments
- [ ] **Blocking failure heuristics** - Define patterns for detecting blocking failures

### Enhancement Opportunities (SCAMPER)

- **Substitute**: Replace hardcoded queries with dynamic regime files; replace pass/fail with confidence scores
- **Combine**: Unify setup wizard + discovery + docs parsing into single regime builder; bundle screenshot + DOM + network + console as evidence packages
- **Adapt**: Use Playwright accessibility snapshots for flexible assertions; adapt implement-plan's triple tracking for test progress
- **Modify**: Amplify auto-variation generation; reduce by keeping CI/CD out
- **Put to other use**: Discovery documents undocumented features; history data informs regression risk
- **Eliminate**: No fixing (test-only); no exact matching (behavioral validation)
- **Reverse**: Explore-then-document approach instead of define-then-run

### Premortem Findings

- **Failure mode**: Test regime becomes unmaintainable → **Prevention**: Auto-update regime from discoveries, keep format minimal
- **Failure mode**: AI judgments too inconsistent → **Prevention**: Require explicit rules alongside AI, log confidence levels
- **Failure mode**: Discovery sprawl overwhelms → **Prevention**: Cap discoveries, require approval to persist
- **Failure mode**: Reports ignored by developers → **Prevention**: Actionable format with reproduction steps and evidence

## Structured Concept

### Component 1: Test Regime System

**Purpose**: Define what to test in a structured, maintainable format
**Scope**: Test scenarios, steps, success criteria, dependencies, flexibility rules
**Dependencies**: User input (URL, description, docs), Playwright MCP for exploration
**Key Decisions**:
- YAML format for regime files in `tests/e2e/`
- Human-editable AND machine-updatable
- Version controlled with project

### Component 2: Setup Mode

**Purpose**: Create or update test regime through interactive discovery
**Scope**: URL exploration, documentation parsing, user-guided wizard
**Dependencies**: Playwright MCP, user input
**Key Decisions**:
- Three entry points: URL → explore, description → structure, docs → extract
- Interactive discovery during setup captures alternative paths
- Outputs `test_regime.yml` file

### Component 3: Run Mode

**Purpose**: Execute tests sequentially with full re-execution
**Scope**: Step execution, evidence capture, failure handling, runtime discovery
**Dependencies**: Test regime file, Playwright MCP, history data
**Key Decisions**:
- Fine-grained steps (each action = step) with flexibility option
- Full re-execution from step 1 every run
- Mark failed + try alternatives + detect blocking failures
- Queue and test discovered paths after defined tests
- Screenshot at every step + DOM + network + console

### Component 4: Report Mode

**Purpose**: Generate dual reports from test run data
**Scope**: Human-readable report, machine-readable report for bug-fix skill
**Dependencies**: Test run results, evidence artifacts
**Key Decisions**:
- Human report: Summary, pass/fail, screenshots, actionable insights
- Machine report: Structured JSON with full context for automated processing
- Both include reproduction steps with Playwright commands

### Component 5: History System

**Purpose**: Track test results over time for intelligent re-testing
**Scope**: Result storage, comparison, flaky detection, variation generation
**Dependencies**: Previous run data, current run results
**Key Decisions**:
- JSON storage with retention policy (30 days detailed, summarize older)
- Compare current vs previous runs
- Auto-add test variations for historically flaky areas
- Suggest new tests based on patterns

### Component 6: Flexibility Criteria System

**Purpose**: Define success using AI judgment + explicit rules
**Scope**: Behavioral validation, partial matching, confidence scoring
**Dependencies**: Playwright accessibility snapshots, user-defined rules
**Key Decisions**:
- AI judgment: "Does this accomplish the task?"
- Explicit rules: "Must contain X", "Must not contain Y"
- Confidence levels: High/Medium/Low on AI judgments
- Combined evaluation for final pass/fail

## Research Findings

### External Best Practices

- **Playwright MCP** uses accessibility snapshots (YAML format) for AI interaction - no vision models needed
- **Three-agent architecture** (Planner/Generator/Healer) is proven pattern for AI-driven testing
- **Behavioral validation** over exact matching: use role-based locators, auto-retrying assertions
- **Screenshot strategy**: Wait for UI stability, mask dynamic content, set appropriate thresholds
- **Flaky test detection**: Use retry labeling, trace viewer for debugging
- **Anti-patterns to avoid**: Hard-coded waits, CSS class selectors, missing awaits, test dependencies

### Codebase Context

- **No e2e-ui-tester exists** - This fills an identified gap
- **Skill structure patterns**: YAML frontmatter + markdown, multi-phase workflows, references/ subdirectory
- **Agent orchestration**: Task tool with subagent_type, run_in_background for parallelization
- **Output templates**: Structured markdown with metadata, checkboxes, code blocks with file:line refs
- **State tracking**: Triple tracking (file checkboxes + TodoWrite + inline status)
- **Existing skills to follow**: brainstorm (6-phase workflow), implement-plan (orchestration), context-saver (templates)

## Recommended Next Steps

1. **Invoke skill-creator** to scaffold the e2e-testing skill structure
2. **Define test regime YAML schema** with examples
3. **Create report templates** (human and machine formats)
4. **Define history JSON schema** with retention policy
5. **Write SKILL.md** with setup/run/report modes following existing patterns

## Ready for Create-Plan

**Yes**

The concept is well-defined with clear components, decisions made, and patterns to follow from existing skills.

### Suggested Plan Scope

- **Primary deliverables**: SKILL.md, test_regime.yml schema, report templates, history schema
- **Key phases**:
  1. Skill scaffolding with skill-creator
  2. Test regime system (schema + setup mode)
  3. Run mode with evidence capture
  4. Report generation (dual format)
  5. History system integration
- **Critical success factors**:
  - Playwright MCP prerequisite handling
  - Clear mode separation (setup/run/report)
  - Actionable report format
  - Manageable discovery scope
