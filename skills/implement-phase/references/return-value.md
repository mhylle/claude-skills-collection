# Return value

When `implement-phase` is called by `implement-plan`, it returns a structured result. This is the full schema.

```
PHASE_RESULT:
  phase_number: 2
  phase_name: "Authentication Service"
  task_id: [task_id from input context]
  task_status: "completed"
  status: COMPLETE | FAILED | BLOCKED

  steps:
    implementation: PASS
    exit_conditions: PASS
    integration_testing: PASS
    code_review: PASS
    adr_compliance: PASS
    plan_sync: PASS
    prompt_archival: PASS | SKIPPED

  files_changed:
    created: [list]
    modified: [list]

  integration_tests:
    api_tests: { passed: X, failed: 0 }
    ui_tests: { passed: Y, failed: 0 }
    evidence: "logs/integration-test-phase-2.log"

  new_adrs: [list or empty]

  prompt:
    used: true | false
    original_path: "docs/prompts/phase-2-data-pipeline.md"
    archived_to: "docs/prompts/completed/phase-2-data-pipeline.md"

  code_review_details:
    blocking_issues_found: [count]
    blocking_issues_fixed: [count]
    recommendations_found: [count]
    recommendations_fixed: [count]   # Must equal recommendations_found

  user_verification:                  # Should usually be empty
    []
    # Only include items that truly cannot be automated, e.g.:
    # - "Verify physical device display"
    # - "Check email arrived in inbox"

  learnings:
    patterns_extracted: [count]
    saved_to: "~/.claude/skills/learned/"

  ready_for_next: true | false
  blocker: null | "description of blocker"
```

## Status values

- `COMPLETE` — all required steps passed, phase is shippable.
- `FAILED` — one or more steps exhausted retries without passing. `implement-plan` should decide whether to pause the whole plan.
- `BLOCKED` — hit a genuine blocking element (permission, infrastructure, credentials, etc.). `blocker` field describes what unblocks it.

## Step status values per step

| Step | Valid values |
|---|---|
| implementation | PASS, FAIL |
| exit_conditions | PASS, FAIL |
| integration_testing | PASS, FAIL |
| code_review | PASS |
| adr_compliance | PASS |
| plan_sync | PASS, FAIL |
| prompt_archival | PASS, SKIPPED, FAIL (non-blocking) |

Note: `code_review` can only be reported as PASS in the return value. PASS_WITH_NOTES and NEEDS_CHANGES must be resolved via fix loops before the step can be marked done.

## `ready_for_next`

- `true` when `status == COMPLETE` and no user-facing blockers remain.
- `false` when `status != COMPLETE` or `user_verification` has items that must be confirmed before the next phase runs.
