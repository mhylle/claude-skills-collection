# PHASE_RESULT and the Blocker Protocol

What the phase returns to its caller, and how a phase stops when only a person can unblock it.

## PHASE_RESULT

Your final message is this block, at most ~40 lines. `/tt-implement-plan` and `/tt-workflow-run` parse it; on a standalone run the main conversation relays it to the user.

```
PHASE_RESULT:
  status:        PASS | BLOCKED | FAILED
  phase:         <phase task id> — <title>
  phase_status:  completed | completed_with_caveat | in_progress | blocked   # the row as you leave it
  caveat:        <one line — only with completed_with_caveat>
  preflight:     <the Step 0 summary>
  sub_tasks:     <X>/<Y> completed; archived: <id — reason>; open: <id — title — status>
  steps:         implementation, verification_loop, integration_tests, code_review,
                 security_review, architecture, adr, task_tree, insights
                 — each PASS | FAIL | N/A | NOT_RUN
  evidence:
    files_changed: <N> created, <M> modified — <paths>
    verification:  verification-loop <k>/6 PASS — <log path>
    integration:   <X>/<Y> scenarios PASS; ACs satisfied <n>/<linked count>
    code_review:   PASS after <k> fix rounds; notes: <the review's NOTES, or "none">
    security:      PASS after <k> rounds | N/A — <one-line reason>
    drift:         baseline <missing/stale/orphaned counts> → end <counts>
  dispatch:      implementer ×<n> (<e> escalated to opus), mechanic ×<n>, reviewer ×<n>
                 (<f> on fable); in-context steps: <list or "none">
  new_adrs:      [ADR-NNNN, ...] or []
  insights_logged: defects <n> (open <n>), learnings <n>, frictions <n>, upstream <n> — <ids>
  candidate_principle: <text — omit if none; surfaced, never auto-added>
  learned_skills: [<proposed learned-<slug> — description>]   # from continuous-learning; omit if none
  manual_verification: [<only checks Step 3 could not automate>]
  blocked:                                     # BLOCKED only
    step:     <number + name — where Resume From Step restarts>
    kind:     Permission | Infrastructure | Credentials | External | Ambiguous | Destructive
    task:     <blocked sub-task id> (status blocked, blockedReason set)
    details:  <what failed and why>
    needs:    <the decision or action required from the user>
    options:  A) <recommended> B) <alternative> C) <abort phase>
    drift_baseline: <Step 0 scan keys — passed back on resume>
    resume:   /tt-implement-phase <phase id>, Resume From Step: <step> + the user's decision
  failed:        <step + what exhausted its rounds>   # FAILED only
  time:          <getTimeSummary({taskId: <phase id>}) total, or "no data">
  active_task:   left on <phase id> for the caller | cleared (standalone)
```

Put in: counts, statuses, ids, caveats, the candidate principle and learned-skill proposals (both need the user's decision), and the `dispatch` line, which is how the cost of the role split gets measured.

Leave out: per-file diffs (the caller can read the task tree), sub-task bodies (the pre-flight titles are enough), and step-by-step narration (the `steps` and `evidence` lines carry it).

## Blocker protocol

A blocker is something you cannot fix yourself. Valid blockers: permission denied, infrastructure unavailable, missing credentials, an external service down, a requirement that is ambiguous in a way only a person can settle, or a destructive operation such as dropping a production database. Failing tests, lint, build and type errors, review findings, transient API errors and a UI element not found on the first try are fix rounds, not blockers.

You can't ask the user from a forked run, so persist the blocker and return:

```
1. Mark the blocked sub-task (or the phase, if no sub-task is in play):
   tasktracker_updateTaskStatus({taskId, status: "blocked", version,
     blockedReason: "<what failed + what is needed to unblock it>"})
2. Log it as insight-cookbook.md prescribes, with relatedTaskId = the blocked task:
   logDefect when a bug is the cause; logFriction for infrastructure, permissions,
   credentials or an ambiguous requirement.
3. Run Step 8's active-task step (not its completion writes), then return the
   PHASE_RESULT with status BLOCKED and the `blocked` section filled: the step, the kind,
   what is needed, 2–3 concrete options with the recommended one first (for example
   A) resolve and continue, B) skip this verification and proceed with the risk,
   C) abort the phase), and the Step 0 drift baseline.
```

The caller puts the options to the user and re-invokes you with `Resume From Step`, the user's decision and the BLOCKED `PHASE_RESULT`. Step 0 then re-reads the phase and reopens the blocked sub-task, and the run continues from the blocked step, not from Step 1.
