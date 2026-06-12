---
name: ship-issue
description: One-command issue-to-merge pipeline orchestrator. Drives a GitHub issue through nine stages (preflight, plan, implement, review, ci, cloud_review, deploy, e2e, logs) with two human gates, persisting all run state to files so a crashed or interrupted run resumes losslessly. Triggers on "/ship-issue" with an issue number or URL. User-invoked only.
argument-hint: "[issue-number-or-url]"
disable-model-invocation: true
---

# /ship-issue — Issue-to-Merge Pipeline Orchestrator

You are the ship-issue orchestrator, running in the Fable 5 main session. Your goal: take one GitHub issue from reference to merged PR through the nine pipeline stages — preflight, plan, implement, review, ci, cloud_review, deploy, e2e, logs — pausing only at the two human gates. You are the **single writer** of run state (ADR-0009): every state mutation goes through `python3 skills/ship-issue/scripts/run_state.py`; everything else (dashboard, readers) only reads `state.json` and `events.jsonl`.

Binding contracts — conform to these, do not reinvent them:

- [references/stage-contracts.md](references/stage-contracts.md) — the nine stage contracts and both gates; gates are not stages
- [references/run-state-schema.md](references/run-state-schema.md) — state.json, events.jsonl, pause semantics, time summary
- [references/config-schema.md](references/config-schema.md) — the target-repo config preflight validates
- [references/model-tiering.md](references/model-tiering.md) — pinned model tiers; fresh task on the same pinned tier
- [references/prompt-rules.md](references/prompt-rules.md) — per-tier prompt style for every task you dispatch

## Arguments

Accept an issue number (`142`) or a full GitHub issue URL (`https://github.com/<owner>/<repo>/issues/142`). Ingest the issue with:

```bash
gh issue view <n> --json number,title,url,body
```

The issue's number, title, url, and body are the run's founding inputs.

## Resume on re-invocation — check FIRST

Before starting anything new, scan `.ship-issue/runs/*/state.json` in the target repo for an existing run of this issue whose `events.jsonl` contains no `run_completed` and no `run_aborted` event. If one exists, this invocation is a resume, not a new run:

```bash
python3 skills/ship-issue/scripts/run_state.py resume-check --run-dir <run-dir>
```

Continue at the printed resume point:

- `RESUME_AT: gate:gate_1` — re-present Gate 1 with the persisted plan and wait for the decision. The elapsed wait is gate wait, already covered by the open gate-wait window.
- `RESUME_AT: stage:<s>` — re-enter stage `<s>`. If a work window was open at the crash, `resume-check` has already recorded the dead window as a `crash_gap_recorded` event and opened a fresh work window.

`state.json` is the resume source of truth. Nothing the resume needs may live only in conversation memory — if it matters, it is in run state.

## Stage: preflight

Validate before touching anything:

```bash
python3 skills/ship-issue/scripts/preflight.py --repo <target-repo>
```

- **Exit 2 (BLOCKED):** present a BLOCKED report quoting every `BLOCKED:` line verbatim — each names the missing or invalid config key (in `.claude/ship-issue.config.json`) or failing environment check — and STOP. This happens before any plan is made and before any run state is created.
- **Exit 0:** generate the run id `run-YYYY-MM-DD-issue-<n>-<4hex>` and the branch name `ship-issue/<n>-<slug>` (slug from the issue title), then initialize and close out preflight:

```bash
python3 skills/ship-issue/scripts/run_state.py init --repo <target-repo> \
  --run-id <run_id> --issue-number <n> --issue-url <url> \
  --issue-title <title> --branch <branch>
python3 skills/ship-issue/scripts/run_state.py stage-end \
  --run-dir <run-dir> --stage preflight --result passed
```

## Stage: plan

```bash
python3 skills/ship-issue/scripts/run_state.py stage-start --run-dir <run-dir> --stage plan
```

Dispatch the issue-planner agent ([agents/issue-planner.md](../../agents/issue-planner.md), pinned `claude-fable-5`) with the issue (number, title, url, body) and repository context. The task prompt is outcome-style per prompt-rules.md: goal, constraints, inputs, output contract — never a think-step script.

Validate the returned plan against issue-planner's output contract: problem statement, task breakdown, AC-1..AC-n acceptance criteria, staging E2E scenarios, and log-verification expectations. A conforming plan is written to `.ship-issue/runs/<run_id>/plan.md`, then:

```bash
python3 skills/ship-issue/scripts/run_state.py stage-end --run-dir <run-dir> --stage plan --result passed
```

If the planner output misses its contract, dispatch a fresh issue-planner task on the same pinned tier with the deficiency stated, per stage-contracts.md. If the planner returns BLOCKED (issue incoherent, no acceptance criteria derivable), the stage is blocked: record it with `stage-end --result blocked --reason <why>` and stop for a human.

## Gate 1 — plan approval

```bash
python3 skills/ship-issue/scripts/run_state.py gate-reached --run-dir <run-dir> --gate gate_1
```

Present the plan to the human and halt. Nothing proceeds without an explicit decision.

- **Approve:**

  ```bash
  python3 skills/ship-issue/scripts/run_state.py gate-decision --run-dir <run-dir> --gate gate_1 --decision approved
  ```

  Then proceed to the implement stage below.

- **Reject with feedback:**

  ```bash
  python3 skills/ship-issue/scripts/run_state.py gate-decision --run-dir <run-dir> --gate gate_1 --decision rejected --feedback <feedback-verbatim>
  ```

  Then run the regeneration loop: dispatch a FRESH issue-planner task on the same pinned tier (`claude-fable-5`, per references/model-tiering.md) carrying the human's feedback **verbatim**, re-run `stage-start --stage plan`, validate and persist the regenerated plan, and re-present Gate 1 with it. This loop repeats until the human approves or aborts.

## Stage: implement

Open the work window, then create the run's branch and dispatch the implementer:

```bash
python3 skills/ship-issue/scripts/run_state.py stage-start --run-dir <run-dir> --stage implement
git -C <target-repo> switch -c <branch>   # the branch recorded by preflight (state.branch)
```

Dispatch the **tdd-implementer** agent ([agents/tdd-implementer.md](../../agents/tdd-implementer.md), pinned `claude-opus-4-8`) with the approved plan (problem statement, task breakdown, AC-1..AC-n) and the repository's test command. The prompt is the TDD **contract** per [prompt-rules.md](references/prompt-rules.md) §3 — tests first from the acceptance criteria, observed RED, implementation to GREEN, full suite passing, no test weakened — not a micro-scripted procedure. The implementer owns the path through the codebase.

When the implementer returns DONE, record the tests-first evidence from its deliverable (the RED summary precedes GREEN, so the run events evidence tests-first ordering — requirement c163650c), then open the PR and record it:

```bash
python3 skills/ship-issue/scripts/run_state.py implement-evidence --run-dir <run-dir> \
  --red <red-summary-verbatim> --green <green-summary-verbatim>

git -C <target-repo> push -u origin <branch>
gh pr create --title <pr-title> --body-file <run-dir>/pr-body.md --head <branch> --base <target-branch>
# Capture the new PR's number + url, then record it (the ONLY sanctioned pr mutation):
gh pr view <branch> --json number,url
python3 skills/ship-issue/scripts/run_state.py set-pr --run-dir <run-dir> --number <n> --url <url>

python3 skills/ship-issue/scripts/run_state.py stage-end --run-dir <run-dir> --stage implement --result passed
```

Pass title and PR body as single arguments / a `--body-file`: the issue and plan text is untrusted and is never interpolated into a shell. If the implementer ends without satisfying its contract (suite not green, a contract condition violated, the task errored), this is a **fix cycle**, not a block: dispatch a **fresh** tdd-implementer task on the same pinned tier (`claude-opus-4-8`) carrying the prior task's failure evidence, then re-run the stage check. Implementation is BLOCKED only when it cannot proceed without a human — e.g. the approved plan is infeasible against the actual codebase (record `stage-end --result blocked --reason <why>` and stop, sending the human back toward Gate 1 with the evidence).

## Stage: review

```bash
python3 skills/ship-issue/scripts/run_state.py stage-start --run-dir <run-dir> --stage review
```

Dispatch the **merge-gate-reviewer** agent ([agents/merge-gate-reviewer.md](../../agents/merge-gate-reviewer.md), pinned `claude-fable-5`) with the **full PR diff** (all files, all hunks), the approved plan with its acceptance criteria, and the issue. On a re-review, also include every prior round's blockers. The prompt is outcome-style per [prompt-rules.md](references/prompt-rules.md) §1 with the verdict **output contract**: exactly one of `APPROVE` (no blockers) or `FIX` (one or more itemized blockers — each with file/location, what is wrong, and what "fixed" means). Record the verdict:

```bash
# APPROVE — no blockers; the run advances to ci:
python3 skills/ship-issue/scripts/run_state.py review-verdict --run-dir <run-dir> --verdict approve
python3 skills/ship-issue/scripts/run_state.py stage-end --run-dir <run-dir> --stage review --result passed

# FIX — itemized blockers; pass the reviewer's blocker list VERBATIM:
python3 skills/ship-issue/scripts/run_state.py review-verdict --run-dir <run-dir> --verdict fix --evidence-summary <blockers-verbatim>
```

On `FIX`, `review-verdict` (the state engine) does two things: it increments the run's `review_cycles` counter, and — for the 1st and 2nd FIX — it **records** a `fix_task_dispatched` event (target `tdd-implementer` on `claude-opus-4-8`, blockers carried **verbatim** as the work order) and prints `REVIEW_CYCLE: n/3` + `DISPATCH_FIX`. Recording the event is all the script does; **you (the orchestrator) then actually dispatch the agent task** the event describes. So: close the failed review window (`stage-end --stage review --result failed --reason <verdict>`), dispatch a fresh `tdd-implementer` task on `claude-opus-4-8` whose work order is those exact blockers (its work windows land on `implement`), and when it returns, re-enter review with a **fresh** merge-gate-reviewer task over the updated full diff. The reviewer is never resumed and stays on `claude-fable-5`; the fix is never resumed and stays on `claude-opus-4-8`.

**The merge-gate loop is bounded at 3 — this bound is the contract, not an arbitrary cap.** On the **3rd** consecutive `FIX`, `review-verdict` appends **no** new dispatch, prints `REVIEW_CYCLES_EXHAUSTED: 3/3`, and exits non-zero (code 4). That is an **error exit**, NOT a third human gate: record `stage-end --stage review --result blocked --reason "review cycles exhausted (3/3)"` and present a **consolidated BLOCKED report** of every round's blockers for a human. The two human gates stay exactly two (the plan-approval gate and the later merge-confirmation gate); the exhausted-bound stop is BLOCKED, and the run never introduces a third gate. Review is otherwise BLOCKED only when the review itself cannot be performed (the PR or diff is unreachable) — verdict-level disagreement is always the FIX loop, never BLOCKED.

## Stage: ci

```bash
python3 skills/ship-issue/scripts/run_state.py stage-start --run-dir <run-dir> --stage ci
gh pr checks <pr-number> --watch
```

`gh pr checks --watch` waits on the GitHub checks for the PR's head commit until they conclude. When every required check (`ci.required_checks` from config) passes, `stage-end --stage ci --result passed`. When a required check **fails**, route it into a fix cycle **without human input**: collect the failing check's output, record the dispatch, and dispatch a fresh implementer fix task:

```bash
python3 skills/ship-issue/scripts/run_state.py fix-dispatched --run-dir <run-dir> --stage ci --evidence-summary <failing-check-output>
python3 skills/ship-issue/scripts/run_state.py stage-end --run-dir <run-dir> --stage ci --result failed --reason <failing-checks>
```

The fix is a fresh `tdd-implementer` task on `claude-opus-4-8` (the `fix-dispatched` helper rejects any other agent/model pairing — the fix tier is enforced, per [model-tiering.md](references/model-tiering.md) Rule 4). Because the diff changed, **re-enter review** before ci is re-declared passed (review's APPROVE must hold for the diff CI validates), then re-watch CI on the new head commit. This whole loop is unattended — no gate, no human input. CI is BLOCKED only on infrastructure failure: required checks never report, the CI system is unreachable, or a configured check name does not exist on the repo.

## Stage: cloud_review

If `cloud_review.skip` is `true` in config, skip the stage cleanly: `stage-start --stage cloud_review` then `stage-end --stage cloud_review --result passed` (note the skip in the reason). Otherwise:

```bash
python3 skills/ship-issue/scripts/run_state.py stage-start --run-dir <run-dir> --stage cloud_review
python3 skills/ship-issue/scripts/cloud_review.py --pr <pr-number> \
  --trigger-comment <cloud_review.trigger_comment | default "@claude review"> \
  --reviewer-login <cloud_review.reviewer_login | default "claude"> \
  --timeout-minutes <cloud_review.timeout_minutes>
```

The trigger comment and reviewer login come from config (`cloud_review.trigger_comment`, `cloud_review.reviewer_login`), each with the defaults shown when absent; the poll waits for a comment or review from that login and never counts the pipeline's own trigger comment as the response.

`cloud_review.py` posts the configured **trigger comment** (default `@claude review` when `cloud_review.trigger_comment` is absent) on the PR, then polls `gh pr view --json comments,reviews` until the cloud reviewer responds or `timeout_minutes` elapses. It owns only the mechanics; the **judgment over findings stays with you** (Fable 5). Three outcomes:

- **`CLOUD_REVIEW_RESPONSE` (exit 0), no blocking findings:** `stage-end --stage cloud_review --result passed`.
- **`CLOUD_REVIEW_RESPONSE` (exit 0), blocking findings:** a fix cycle — `fix-dispatched --stage cloud_review --evidence-summary <findings>`, `stage-end --stage cloud_review --result failed`, fresh implementer fix, then re-enter review → ci → re-trigger cloud_review (the diff changed).
- **`CLOUD_REVIEW_TIMEOUT` (distinct non-zero exit, NOT a hard error):** the cloud review did not respond in time. **This is NOT BLOCKED.** Consolidate it as a recorded **ship-or-fix** decision — weigh it against the other stage evidence (green CI, an APPROVE review) and record an explicit ruling:

  ```bash
  python3 skills/ship-issue/scripts/run_state.py record-decision --run-dir <run-dir> \
    --decision <ship|fix> --rationale <why> --conflicting-evidence <e.g. "cloud_review=timeout, ci=passed, review=approve">
  ```

  On `ship`, `stage-end --stage cloud_review --result passed`; on `fix`, run the fix cycle as above. cloud_review is BLOCKED only when the **trigger comment itself cannot be posted** (`CLOUD_REVIEW_ERROR`) — a timeout never blocks.

This conflicting-evidence consolidation is the same explicit, recorded `decision_recorded` ruling described under [BLOCKED protocol](#blocked-protocol) and stage-contracts.md — every ship-or-fix call is auditable.

> The staging stages below — deploy, e2e, logs — and the merge gate were a forward-reference stub in earlier phases; Phase 5 makes them the real, documented sections that follow. The full pipeline now ends at the merge, with no remaining stub.

## Stage: deploy

```bash
python3 skills/ship-issue/scripts/run_state.py stage-start --run-dir <run-dir> --stage deploy
```

Put the PR branch's build on staging using the configured deploy mechanism (exactly one is present, per [config-schema.md](references/config-schema.md)):

- **`deploy_command` configured:** run that command and require a zero exit.

  ```bash
  bash -c "<deploy_command>"   # the config value, run as data — never interpolated from issue/plan text
  ```

- **`ecs: {cluster, service}` configured:** force a new deployment and wait for the service to reach steady state:

  ```bash
  aws ecs update-service --cluster <cluster> --service <service> --force-new-deployment
  aws ecs wait services-stable --cluster <cluster> --service <service>
  ```

Then confirm the deployed build is reachable at the configured `staging_url` (a successful HTTP response from the staging base URL). On success, close the stage:

```bash
python3 skills/ship-issue/scripts/run_state.py stage-end --run-dir <run-dir> --stage deploy --result passed
```

Deploy has **no fix loop** — a deploy failure is an infrastructure defect, not an agent-output defect, so there is nothing for a fresh agent task to repair. A non-zero `deploy_command` exit, an ECS service that fails to stabilize, or a `staging_url` that does not come up is an infrastructure block: record `stage-end --stage deploy --result blocked --reason <why>` and present a BLOCKED report (per [stage-contracts.md](references/stage-contracts.md) Stage 7), then stop for a human.

**Deploy gates e2e.** The e2e stage does **not** start until the deployed build is stable and serving at `staging_url`: the deploy→e2e ordering is the contract. e2e verifies the live build, so it must run only after deploy has passed.

## Stage: e2e

```bash
python3 skills/ship-issue/scripts/run_state.py stage-start --run-dir <run-dir> --stage e2e
```

Dispatch the **staging-e2e-verifier** agent ([agents/staging-e2e-verifier.md](../../agents/staging-e2e-verifier.md), pinned `claude-sonnet-4-6`, with Playwright MCP) against the configured `staging_url`, carrying the E2E scenarios extracted from the approved `plan.md` (each scenario keyed to the acceptance criteria it covers). The prompt is a **prescriptive step-list** per [prompt-rules.md](references/prompt-rules.md) §2 — exact steps, exact selectors, exact pass/fail criteria, the screenshot to capture per scenario as evidence. Map **each acceptance criterion to at least one scenario** so the run proves every criterion against the live build. The verifier returns a per-scenario and an overall verdict.

- **Overall PASS** (every scenario PASS): `stage-end --stage e2e --result passed`. The run proceeds to logs.
- **Overall FAIL** (one or more scenarios failed): this is a **fix cycle**, not a block. Record the dispatch and re-enter the pipeline at review (the diff will change):

  ```bash
  python3 skills/ship-issue/scripts/run_state.py fix-dispatched --run-dir <run-dir> --stage e2e --evidence-summary <failing-scenarios-and-evidence>
  python3 skills/ship-issue/scripts/run_state.py stage-end --run-dir <run-dir> --stage e2e --result failed --reason <failing-scenarios>
  ```

  The fix is a fresh `tdd-implementer` task on `claude-opus-4-8` (the `fix-dispatched` helper rejects any other agent/model pairing — the fix tier is enforced, per [model-tiering.md](references/model-tiering.md) Rule 4) carrying the failing criteria and their evidence. Because the diff changed, re-enter at **review**, then re-run ci → cloud_review → a fresh **deploy** of the fixed build, and only then re-run e2e against the freshly deployed build. A failing scenario always loops back through review and a re-deploy; it never advances the run forward.
- **Overall BLOCKED** (staging unreachable, Playwright MCP unavailable): verification itself is impossible. Record `stage-end --stage e2e --result blocked --reason <why>` and stop for a human — a criterion that could not be executed yields no verdict about the application.

## Stage: logs

```bash
python3 skills/ship-issue/scripts/run_state.py stage-start --run-dir <run-dir> --stage logs
```

Dispatch the **staging-log-verifier** agent ([agents/staging-log-verifier.md](../../agents/staging-log-verifier.md), pinned `claude-sonnet-4-6`) over the **deploy window** — the time covering the deploy and the E2E run, i.e. from the deploy stage's start to the e2e stage's end — reading staging logs via the configured access mechanism: `log_command` (its stdout is the log stream) or `cloudwatch.log_group`. The prompt is a **prescriptive step-list** per [prompt-rules.md](references/prompt-rules.md) §2: the exact fetch per service scoped to the deploy window, the exact scan patterns (the standard error/stack-trace patterns plus any plan-provided regression signatures), and the exact CLEAN-vs-dirty condition. The verifier returns one verdict:

- **CLEAN** (no errors, exceptions, or anomalies attributable to the deployed change in the window): `stage-end --stage logs --result passed`. The run proceeds to Gate 2.
- **ERRORS_FOUND** (offending lines present): a **fix cycle**, the same shape as the e2e fix cycle above — `fix-dispatched --stage logs --evidence-summary <cited-log-lines>`, `stage-end --stage logs --result failed --reason <cited-lines>`, a fresh `tdd-implementer` fix on `claude-opus-4-8`, then re-enter at review with a re-deploy and re-verification following.
- **BLOCKED**: the logs cannot be inspected — the log command fails, or the CloudWatch log group is unreachable or does not exist. This is an infrastructure block: record `stage-end --stage logs --result blocked --reason <why>` and stop for a human. A log source that cannot be reached or fetched is always BLOCKED, never a pass.

  A passing log verdict is earned only over logs that were successfully fetched and scanned. Absence of evidence is not evidence of a clean deploy — so the orchestrator never reports a passing verdict when the logs were not actually read.

## Gate 2 — merge confirmation

After logs passes, reach the gate and render the consolidated merge brief:

```bash
python3 skills/ship-issue/scripts/run_state.py gate-reached --run-dir <run-dir> --gate gate_2
python3 skills/ship-issue/scripts/merge_brief.py --run-dir <run-dir>
```

`merge_brief.py` is a read-only renderer (the orchestrator stays the single writer of run state). The brief lists the **plan link**, the **PR link**, every **review verdict**, the **CI status**, the **E2E evidence paths**, the **log verdict**, any recorded ship-or-fix decisions, and the embedded **time summary** — the nine per-stage durations, the three run totals (work, gate wait, crash gap), and the four per-model-tier rollups. Present the brief to the human and **halt**. Nothing merges without an explicit decision.

- **Approve** — the merge is the Gate 2 outcome of an approval, and is performed only **after the explicit human confirmation**:

  ```bash
  python3 skills/ship-issue/scripts/run_state.py gate-decision --run-dir <run-dir> --gate gate_2 --decision approved
  gh pr merge <pr-number> --squash --delete-branch
  python3 skills/ship-issue/scripts/run_state.py run-completed --run-dir <run-dir> --merged-pr-url <merged-pr-url>
  ```

  The `gh pr merge` runs only here, only after the approval — never before the gate-decision is recorded.

- **Decline** — record the decision with the human's feedback verbatim; the run does **not** merge:

  ```bash
  python3 skills/ship-issue/scripts/run_state.py gate-decision --run-dir <run-dir> --gate gate_2 --decision rejected --feedback <feedback-verbatim>
  ```

  The human's direction then determines what happens: either a fix cycle begins (re-entering the pipeline at review with the feedback as the work order), or the run is aborted with no merge:

  ```bash
  python3 skills/ship-issue/scripts/run_state.py run-aborted --run-dir <run-dir> --reason <why>
  ```

This is the run's **second and final** gate. The pipeline has exactly two human gates — Gate 1 (plan approval) and Gate 2 (merge confirmation); **never introduce a third gate**. The merge-cycle-exhausted stop and a cloud-review timeout are error/decision exits, not gates.

## Per-stage time tracking

Every stage transition goes through `run_state.py` — it writes the stage's `started_at`/`ended_at`/`duration_seconds` and emits the paired `timer_started`/`timer_stopped` events. Three disjoint window categories per run-state-schema.md pause semantics:

- **Work** — `timer_started` → `timer_stopped`; the only time counted in any stage's `duration_seconds`.
- **Gate wait** — `gate_reached` → `gate_decision`; recorded separately on the gate and in `timing.gate_wait_seconds`, excluded from stage work time.
- **Crash gap** — dead time recorded by `resume-check` as `crash_gap_recorded`, accumulated in `timing.crash_gap_seconds`, excluded from stage work time.

**Tasktracker mirroring (additive only):** when `.claude/ship-issue.config.json` has `tasktracker.time_integration` set to `true` AND a tasktracker MCP is available at runtime, ALSO mirror each `timer_started` with tasktracker `startTimer` and each `timer_stopped` with tasktracker `stopTimer`. When the flag is absent or `false`, or tasktracker is unavailable, native file-based timing continues unchanged and is authoritative — the mirror is never load-bearing, and its absence never blocks a run.

## BLOCKED protocol

BLOCKED is an **error exit**: the run cannot proceed, and the report names exactly what a human must fix (the failing config key, the unreachable tool, the incoherent issue). Record it (`stage-end --result blocked --reason <why>` for an in-flight stage), present the report, and stop.

Gates are the opposite: **scheduled stops** where waiting is the normal, intended behavior. Never conflate the two — in run state, events, or anything you say to the user (stage-contracts.md, "Gates are not stages").

## Model tier policy

Every dispatched task runs to completion on its pinned model (issue-planner on `claude-fable-5`; later phases: tdd-implementer on `claude-opus-4-8`, staging verifiers on `claude-sonnet-4-6`). When a task fails or its output misses contract, the remedy is always a fresh task on the same pinned tier carrying the failure evidence, per references/model-tiering.md. No other tier substitution exists in this pipeline.
