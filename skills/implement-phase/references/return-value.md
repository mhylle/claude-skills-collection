# Return value

Step 8 ends with this block: the phase's closing summary, written in the same session that ran the phase. When `implement-plan` invoked the phase, it reads the block and continues from it. This is the full schema.

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
    saved: ["learned-<slug> — description"]   # from continuous-learning, after the user approved them
    proposed: []                               # unattended runs only: no one could approve, so nothing was written

  ready_for_next: true | false
  blocker: null | "description of blocker"
```

## Status values

- `COMPLETE` — all required steps passed, phase is shippable.
- `FAILED` — one or more steps exhausted retries without passing. `implement-plan` should decide whether to pause the whole plan.
- `BLOCKED` — hit a genuine blocking element (permission, infrastructure, credentials, etc.) in a run the caller said is unattended, so no one could be asked. In an attended run the phase asks the user and resumes instead. `blocker` field describes what unblocks it.

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

Note: `code_review` can only be reported as PASS in the return value. NEEDS_CHANGES (any blocking issue or recommendation) must be resolved via fix loops before the step can be marked done; code-review NOTES never block.

## `ready_for_next`

- `true` when `status == COMPLETE` and no user-facing blockers remain.
- `false` when `status != COMPLETE` or `user_verification` has items that must be confirmed before the next phase runs.
