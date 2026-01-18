# Phase Steps Reference

Configuration and extension guide for the implement-phase execution pipeline.

## Default Phase Steps

The default pipeline executes these steps in order:

| Step | Name | Required | Skill Dependency | Gate Criteria |
|------|------|----------|------------------|---------------|
| 1 | implementation | Yes | None | All tasks complete, tests pass |
| 2 | exit_conditions | Yes | None | Build, runtime, functional all pass |
| 3 | code_review | Yes | code-review | PASS or PASS_WITH_NOTES |
| 4 | adr_compliance | Yes | adr | All applicable ADRs followed |
| 5 | plan_sync | Yes | None | Plan file updated correctly |
| 6 | prompt_archival | No | None | Prompt moved to completed/ (if provided) |
| 7 | completion_report | Yes | None | Report generated |

## Step Configuration Schema

```yaml
step:
  name: string           # Unique identifier
  display_name: string   # Human-readable name
  required: boolean      # If false, can be skipped
  skill: string | null   # Skill to invoke, or null for built-in
  gate_criteria: string  # Description of pass/fail criteria
  retry_limit: number    # Max retries before escalation (default: 3)
  timeout_ms: number     # Step timeout (default: 300000 = 5 min)
  conditions:            # Optional conditional execution
    phase_types: []      # Only run for these phase types
    metadata_flags: []   # Only run if these flags are set
```

## Adding Custom Steps

### Example: Security Scan Step

```yaml
step:
  name: security_scan
  display_name: "Security Scan"
  required: false
  skill: security-scan
  gate_criteria: "No high/critical vulnerabilities"
  retry_limit: 1
  conditions:
    phase_types: ["authentication", "authorization", "data-handling"]
    metadata_flags: ["security_sensitive"]
```

### Example: Performance Check Step

```yaml
step:
  name: performance_check
  display_name: "Performance Check"
  required: false
  skill: null  # Built-in
  gate_criteria: "No performance regressions > 10%"
  conditions:
    metadata_flags: ["performance_critical"]
```

### Example: Documentation Update Step

```yaml
step:
  name: docs_update
  display_name: "Documentation Update"
  required: false
  skill: null
  gate_criteria: "Relevant docs updated"
  conditions:
    phase_types: ["api", "public-interface"]
```

## Step Insertion Points

New steps can be inserted at specific positions:

```
BEFORE: implementation
  → Pre-implementation checks (e.g., dependency audit)

AFTER: implementation, BEFORE: exit_conditions
  → Post-implementation, pre-verification (e.g., formatting)

AFTER: exit_conditions, BEFORE: code_review
  → Post-verification checks (e.g., coverage threshold)

AFTER: code_review, BEFORE: adr_compliance
  → Post-review checks (e.g., security scan)

AFTER: adr_compliance, BEFORE: plan_sync
  → Pre-sync operations (e.g., changelog entry)

AFTER: plan_sync, BEFORE: completion_report
  → Post-sync operations (e.g., notification)
```

## Conditional Step Execution

### By Phase Type

Phase types are inferred from the phase name or can be set in plan metadata:

```markdown
## Phase 2: Authentication Service
<!-- phase_type: authentication -->
```

Common phase types:
- `setup` - Environment, dependencies
- `foundation` - Core structures, interfaces
- `authentication` - Auth-related code
- `authorization` - Permission-related code
- `api` - API endpoints
- `data-handling` - Data processing
- `integration` - Connecting components
- `testing` - Test coverage
- `documentation` - Docs updates

### By Metadata Flags

Flags can be set in the plan header:

```markdown
---
phase_config:
  security_sensitive: true
  performance_critical: false
  public_api: true
---
```

Or per-phase:

```markdown
## Phase 3: Payment Processing
<!-- flags: security_sensitive, compliance_required -->
```

## Step Output Schema

Each step must return a structured result:

```yaml
step_result:
  name: string
  status: PASS | FAIL | SKIPPED | BLOCKED

  # On PASS
  summary: string
  metrics: {}  # Step-specific metrics

  # On FAIL
  error: string
  details: string
  recoverable: boolean
  fix_suggestion: string

  # On SKIPPED
  reason: string  # Why it was skipped

  # On BLOCKED
  blocker: string
  options: []
  recommendation: string
```

## Built-in Step Implementations

### Step 1: Implementation

**Input**: Phase tasks from plan
**Process**:
1. Parse phase tasks
2. Identify parallelizable tasks
3. Spawn test subagents first
4. Spawn implementation subagents
5. Monitor completion
6. Collect changed files

**Output**:
```yaml
status: PASS
files_created: [list]
files_modified: [list]
tests_written: count
tests_passing: count
```

### Step 2: Exit Conditions

**Input**: Exit conditions from plan
**Process**:
1. Parse exit conditions (build, runtime, functional)
2. Spawn verification subagents in parallel
3. Aggregate results
4. If any fail, spawn fix subagents and re-verify

**Output**:
```yaml
status: PASS
build_verification: PASS
runtime_verification: PASS
functional_verification: PASS
details: {}
```

### Step 3: Code Review

**Input**: Phase context, changed files
**Process**:
1. Invoke code-review skill
2. Receive structured review
3. If NEEDS_CHANGES, spawn fixes and re-review

**Output**:
```yaml
status: PASS_WITH_NOTES
dimensions:
  service_delegation: PASS
  framework_standards: PASS
  adr_compliance: PASS
  plan_sync: PASS
  general_quality: PASS
blocking_issues: 0
recommendations: [list]
```

### Step 4: ADR Compliance

**Input**: Changed files, existing ADRs
**Process**:
1. Read ADR INDEX.md
2. Identify applicable ADRs
3. Check compliance
4. Identify new decisions needing documentation
5. Invoke adr skill for new decisions

**Output**:
```yaml
status: PASS
applicable_adrs: [list]
compliance: {}
new_adrs_created: [list]
```

### Step 5: Plan Sync

**Input**: Completed tasks, step results
**Process**:
1. Mark tasks complete in plan
2. Update exit condition checkboxes
3. Add ADR references
4. Note deviations

**Output**:
```yaml
status: PASS
tasks_marked: count
checkboxes_updated: count
adr_refs_added: count
deviations_noted: count
```

### Step 6: Completion Report

**Input**: All step results
**Process**:
1. Aggregate all step outputs
2. Format completion report
3. List manual verification items

**Output**:
```yaml
status: PASS
report: string
manual_verification: [list]
ready_for_next: boolean
```

## Error Recovery

### Per-Step Retry Logic

```
attempt = 1
while attempt <= retry_limit:
  result = execute_step()
  if result.status == PASS:
    return result
  if not result.recoverable:
    escalate_to_user()
    return
  fix_result = spawn_fix_subagent(result.fix_suggestion)
  attempt += 1
escalate_to_user()
```

### Cross-Step Recovery

If a later step fails due to issues from an earlier step:

1. Identify root cause step
2. Return to that step
3. Fix and re-run from there
4. Continue forward

Example: Code review finds implementation issues
→ Return to implementation step
→ Fix issues
→ Re-run from implementation forward

## Future Step Ideas

| Step | Purpose | Trigger |
|------|---------|---------|
| `dependency_audit` | Check for vulnerable deps | Always |
| `license_check` | Verify license compliance | New deps added |
| `coverage_gate` | Ensure test coverage threshold | Always |
| `performance_baseline` | Capture performance metrics | Performance phases |
| `accessibility_check` | A11y compliance | UI phases |
| `api_compatibility` | Check breaking changes | API phases |
| `changelog_entry` | Add to CHANGELOG | Feature phases |
| `release_notes` | Draft release notes | Final phase |
