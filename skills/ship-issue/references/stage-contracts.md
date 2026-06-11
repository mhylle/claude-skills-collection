# Stage Contracts

The ship-issue pipeline drives a GitHub issue from plan to merge through **exactly nine stages**, in order: preflight, plan, implement, review, ci, cloud-review, deploy, e2e, logs. Two human gates punctuate the run: Gate 1 between plan and implement, Gate 2 after logs. Gates are not stages (see [Gates are not stages](#gates-are-not-stages)).

Every stage has the same contract shape:

- **Inputs** — what the stage consumes.
- **Outputs** — what the stage produces on success.
- **Pass semantics** — what "passed" means; the run advances to the next stage (or gate).
- **Fail semantics** — an internal loop: the orchestrator dispatches a **fresh task on the same tier** (per [model-tiering.md](model-tiering.md), Rule 3) carrying the failure evidence, then re-runs the stage's check.
- **BLOCKED semantics** — an error exit: the run cannot proceed without a human. The stage is recorded `blocked`, the run halts, and a human must unstick it before `/ship-issue` is re-invoked.
- **Executing tier** — the pinned model, "orchestrator (Fable 5 main session)", or "external system".

Stage statuses and transitions are recorded in run state per [run-state-schema.md](run-state-schema.md). Configuration fields referenced below are defined in [config-schema.md](config-schema.md).

**Time tracking is part of every stage contract:** each stage start writes the stage's `started_at` and emits a `timer_started` event; each stage end writes `ended_at` and the work-only `duration_seconds` and emits the paired `timer_stopped` event — per the timing fields and pause semantics in [run-state-schema.md](run-state-schema.md). `duration_seconds` records work time only; gate-wait and crash-gap windows are recorded separately and never count toward any stage.

## Stage 1: preflight

- **Inputs:** The issue ref passed to `/ship-issue`; the target-repo config at `.claude/ship-issue.config.json`.
- **Outputs:** Initialized run state — a new `state.json` and `events.jsonl` under `.ship-issue/runs/<run_id>/` — and the branch name the run will use.
- **Pass semantics:** All checks hold: the issue exists and is reachable, the config parses and validates against [config-schema.md](config-schema.md), the working tree is clean, and every required tool and credential (GitHub access, deploy mechanism, log access, Playwright MCP) is reachable. Run state is initialized and the run advances to plan.
- **Fail semantics:** None — preflight has no internal fix loop. There is no agent output to repair; every preflight defect is an environment or input defect.
- **BLOCKED semantics:** Any check failure blocks: missing or unresolvable issue, invalid or missing config fields, dirty working tree, unreachable tool or credential. Each of these requires a human to fix the environment or input; the orchestrator records the specific failing check and exits BLOCKED.
- **Executing tier:** orchestrator (Fable 5 main session).

## Stage 2: plan

- **Inputs:** The validated issue (number, title, body, linked context) and repository context.
- **Outputs:** An implementation plan with explicit acceptance criteria, recorded as a plan artifact in run state.
- **Pass semantics:** The issue-planner agent returns a plan that satisfies its output contract — concrete implementation approach plus testable acceptance criteria. The plan artifact is recorded and the run proceeds to **Gate 1**.
- **Fail semantics:** If the planner's output does not satisfy the plan output contract (e.g. missing acceptance criteria), the orchestrator dispatches a fresh plan task to issue-planner on `claude-fable-5` with the deficiency stated. Likewise, a Gate 1 rejection with feedback produces a fresh plan task on the same tier carrying the human's feedback.
- **BLOCKED semantics:** The planner cannot produce a plan at all — e.g. the issue is incoherent or self-contradictory such that no acceptance criteria can be derived. A human must clarify the issue.
- **Executing tier:** issue-planner agent, pinned `claude-fable-5`.

**Followed by GATE 1 (plan approval).** The run halts until a human explicitly approves the plan. See [Gates are not stages](#gates-are-not-stages).

## Stage 3: implement

- **Inputs:** The approved plan (including acceptance criteria), the branch name, repository access.
- **Outputs:** Commits on the run branch; passing local tests with RED-then-GREEN evidence; a PR opened (or updated, on later passes) against the target branch.
- **Pass semantics:** The tdd-implementer agent completes its TDD contract (see [prompt-rules.md](prompt-rules.md), section 3): tests written first from the approved plan's acceptance criteria, observed RED, implementation to GREEN, full local suite passing, no test deleted or weakened, and the PR open with the diff.
- **Fail semantics:** The implementer task ends without satisfying the contract (suite not green, contract condition violated, task errored). The orchestrator dispatches a fresh implement task to tdd-implementer on `claude-opus-4-8` carrying the prior task's failure evidence, and the stage check re-runs.
- **BLOCKED semantics:** Implementation is impossible without a human decision — e.g. the approved plan is infeasible against the actual codebase, or required repository permissions are missing. The orchestrator records why and exits BLOCKED (a plan-infeasibility block sends the human back toward Gate 1 with the evidence).
- **Executing tier:** tdd-implementer agent, pinned `claude-opus-4-8`.

## Stage 4: review

- **Inputs:** The **full PR diff** (all files, all hunks), the approved plan with acceptance criteria, the issue.
- **Outputs:** A recorded verdict: `APPROVE`, or `FIX` with itemized blockers (each: location, defect, definition of fixed).
- **Pass semantics:** Verdict is `APPROVE`. The run advances to ci.
- **Fail semantics:** Verdict is `FIX`. The orchestrator dispatches a fresh fix task to tdd-implementer on `claude-opus-4-8` (same tier as the implementation work it repairs) whose work order is exactly the itemized blockers, then re-runs review with a fresh review task on `claude-fable-5` over the updated full diff. This loop repeats until `APPROVE`; the loop has no built-in iteration cap — it is bounded only by human intervention (aborting the run).
- **BLOCKED semantics:** The review cannot be performed — e.g. the PR or its diff is unreachable. Verdict-level disagreement is never BLOCKED; it is the FIX loop.
- **Executing tier:** merge-gate-reviewer agent, pinned `claude-fable-5`.

## Stage 5: ci

- **Inputs:** The open PR; the `ci.required_checks` list from config.
- **Outputs:** A recorded CI result: every required check's name and conclusion on the PR's head commit.
- **Pass semantics:** Every check named in `ci.required_checks` has completed successfully on the current head commit.
- **Fail semantics:** Any required check fails. The orchestrator collects the failing check's logs/output and dispatches a fresh fix task to tdd-implementer on `claude-opus-4-8`, then re-polls CI on the new head commit. (A CI-relevant fix re-enters review before ci re-passes is declared, since the diff changed — review's APPROVE must hold for the diff that CI validates.)
- **BLOCKED semantics:** CI infrastructure failure — required checks never report, the CI system is unreachable, or a required check name in config does not exist on the repository. A human must repair the CI configuration or infrastructure.
- **Executing tier:** external system (CI), polled by the orchestrator (Fable 5 main session).

## Stage 6: cloud-review

- **Inputs:** The open PR; `cloud_review.trigger_comment` and `cloud_review.timeout_minutes` from config.
- **Outputs:** The cloud review's findings (or a clean result) recorded in run state.
- **Pass semantics:** The orchestrator posts the configured trigger comment on the PR; the cloud review responds within the configured `timeout_minutes` and raises no blocking findings.
- **Fail semantics:** The cloud review raises findings. The orchestrator dispatches a fresh fix task to tdd-implementer on `claude-opus-4-8` with the findings as the work order, then re-triggers the cloud review on the updated PR (re-entering review and ci first, since the diff changed).
- **BLOCKED semantics:** The cloud review does not respond within `timeout_minutes` (config-driven bound), or the trigger comment cannot be posted. A human must investigate the cloud-review integration.
- **Executing tier:** external system (cloud review service), triggered and awaited by the orchestrator (Fable 5 main session).

## Stage 7: deploy

- **Inputs:** The PR branch's build; deploy configuration — `deploy_command`, or `ecs: {cluster, service}` (exactly one is configured, per [config-schema.md](config-schema.md)).
- **Outputs:** The branch's build running on staging, reachable at the configured `staging_url`; deploy output recorded in run state.
- **Pass semantics:** The deploy mechanism completes successfully and `staging_url` serves the deployed build.
- **Fail semantics:** None — deploy has no internal fix loop. A deploy failure is an infrastructure defect, not an agent-output defect, so there is nothing for a fresh agent task to repair.
- **BLOCKED semantics:** The deploy command exits non-zero, the ECS service fails to stabilize, or `staging_url` does not come up. Infrastructure failures require a human; the orchestrator records the deploy output and exits BLOCKED.
- **Executing tier:** external system (deploy infrastructure), invoked by the orchestrator (Fable 5 main session).

## Stage 8: e2e

- **Inputs:** The configured `staging_url`; the approved plan's acceptance criteria; the prescriptive verification steps derived from them.
- **Outputs:** A per-criterion PASS/FAIL report with captured evidence (screenshots/snapshots) recorded in run state.
- **Pass semantics:** The staging-e2e-verifier runs live against staging via Playwright MCP and every acceptance criterion is PASS, each with its evidence reference.
- **Fail semantics:** One or more criteria FAIL. The orchestrator dispatches a fresh fix task to tdd-implementer on `claude-opus-4-8` carrying the failing criteria and evidence; the fix re-enters the pipeline at review (the diff changed), and e2e re-runs after a fresh deploy of the fixed build.
- **BLOCKED semantics:** Verification itself is impossible — staging unreachable, Playwright MCP unavailable. A human must restore the verification environment. (A criterion failing is never BLOCKED; that is the fix path.)
- **Executing tier:** staging-e2e-verifier agent, pinned `claude-sonnet-4-6`, with Playwright MCP.

## Stage 9: logs

- **Inputs:** Staging log access — `log_command`, or `cloudwatch: {log_group}` (exactly one is configured); the time window covering the deploy and E2E run.
- **Outputs:** A verdict of **clean** or **dirty**, with every cited log line that supports a dirty verdict, recorded in run state.
- **Pass semantics:** Verdict is clean — no errors, exceptions, or anomalies attributable to the deployed change in the inspected window. The run proceeds to **Gate 2**.
- **Fail semantics:** Verdict is dirty. The orchestrator dispatches a fresh fix task to tdd-implementer on `claude-opus-4-8` with the cited log lines as evidence; the fix re-enters the pipeline at review, with re-deploy and re-verification following.
- **BLOCKED semantics:** Logs cannot be inspected — the log command fails, or the CloudWatch log group is unreachable or does not exist. A human must restore log access.
- **Executing tier:** staging-log-verifier agent, pinned `claude-sonnet-4-6`.

**Followed by GATE 2 (merge confirmation).** See below.

## Gates are not stages

Gates are **scheduled human decisions**: the pipeline plans to stop there, waiting is the normal and intended behavior, and time spent waiting at a gate is excluded from stage work. Gate-wait time is recorded separately from stage work time: each gate-wait window (`gate_reached` → `gate_decision`) is recorded as the gate's `wait_seconds` and never counts toward any stage's `duration_seconds` — see [run-state-schema.md#pause-semantics](run-state-schema.md#pause-semantics). BLOCKED is the opposite: an **error exit** the pipeline did not plan for, where a human must unstick the run before it can continue. The two must never be conflated in run state, events, or reporting.

A successful run passes through **exactly two gates**:

- **Gate 1 — plan approval.** Sits between plan and implement. The orchestrator presents the plan and halts. Nothing proceeds until the human explicitly approves. If the human rejects with feedback, the orchestrator dispatches a fresh plan task to issue-planner on `claude-fable-5` carrying that feedback, and Gate 1 is presented again with the regenerated plan.
- **Gate 2 — merge confirmation.** Sits after logs. The orchestrator presents a **consolidated merge brief**: the plan link, all review verdicts, CI status, E2E evidence, the log verdict, and the **time summary** — per-stage durations, run total, and per-model-tier rollup, derived per [run-state-schema.md#time-summary](run-state-schema.md#time-summary). The merge is performed only after the human's explicit confirmation. **Merge is the Gate 2 outcome, not a stage.** If the human declines, the run does not merge; the human's direction determines whether a fix cycle begins or the run is aborted.

Gate states (`not_reached`, `waiting`, `approved`, `rejected`) are tracked separately from stage statuses in [run-state-schema.md](run-state-schema.md).

## Conflicting evidence

Stage evidence can conflict — for example, CI is green but the cloud review raises a blocker, or E2E passes while logs are dirty. When it does, the **Fable 5 orchestrator makes an explicit ship-or-fix decision** and records it, with its rationale, as a `decision_recorded` event in the run's events log (see [run-state-schema.md](run-state-schema.md)). Conflicts are never resolved silently: every such decision is auditable after the fact.

## Related

- [run-state-schema.md](run-state-schema.md) — stage statuses, gate states, and the events these contracts emit
- [config-schema.md](config-schema.md) — the config fields preflight validates and stages 5–9 consume
- [model-tiering.md](model-tiering.md) — pinned models per agent and the fresh-task-same-tier rule
- [ADR-0009: Single orchestrator, file-based run state, polling dashboard](../../../docs/decisions/ADR-0009-single-orchestrator-file-run-state-polling-dashboard.md)
