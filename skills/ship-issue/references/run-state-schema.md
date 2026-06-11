# Run State Schema

The ship-issue pipeline persists all run state in plain files in the target repository. Two files per run: `state.json` (current state, the resume source of truth) and `events.jsonl` (append-only audit log). One orchestrator writes them; everything else — including the dashboard — only reads (see [ADR-0009](../../../docs/decisions/ADR-0009-single-orchestrator-file-run-state-polling-dashboard.md)).

## File locations

Under the **target repo** (the repository the issue belongs to):

```
.ship-issue/runs/<run_id>/state.json
.ship-issue/runs/<run_id>/events.jsonl
```

This convention is fixed: later phases implement against these exact paths. `<run_id>` is unique per run; one issue may accumulate multiple run directories (e.g. an aborted run followed by a fresh one).

## state.json

Current snapshot of the run. Rewritten (atomically replaced) by the orchestrator on every state change.

### Fields

| Field | Type | Semantics |
|-------|------|-----------|
| `run_id` | string | Unique identifier of this run; matches the directory name. |
| `issue` | object | `number` (integer), `url` (string), `title` (string) of the GitHub issue being shipped. |
| `branch` | string | The git branch this run works on; set by preflight. |
| `pr` | object or null | `number` (integer), `url` (string) of the PR; null until implement opens it. |
| `stages` | object | One key per stage, all nine, in pipeline order: `preflight`, `plan`, `implement`, `review`, `ci`, `cloud_review`, `deploy`, `e2e`, `logs`. Each value is an object: `status` — one of `pending`, `running`, `passed`, `failed`, `blocked` — plus timing fields: `started_at` (ISO 8601, null until the stage first starts), `ended_at` (ISO 8601, null until the stage ends; on later work windows, the most recent end), `duration_seconds` (number, null until the stage has ended; **work time only**, accumulated across all of the stage's work windows, excluding gate-wait and crash-gap windows per [Pause semantics](#pause-semantics)). |
| `gates` | object | Keys `gate_1` and `gate_2`. Each value is an object: `state` — one of `not_reached`, `waiting`, `approved`, `rejected` — plus timing fields: `reached_at` (ISO 8601, null until reached), `decided_at` (ISO 8601, null until decided), `wait_seconds` (number, null until decided; the gate-wait window from `gate_reached` to `gate_decision`). |
| `timing` | object | Run-level totals: `work_seconds` (sum of all completed stage work windows), `gate_wait_seconds` (sum of all gate-wait windows), `crash_gap_seconds` (sum of all crash-gap windows). The three categories are disjoint: any second of run lifetime is work, gate wait, or crash gap — never more than one. |
| `created_at` | string | ISO 8601 timestamp of run creation (preflight). |
| `updated_at` | string | ISO 8601 timestamp of the most recent state change. |

Stage `status` semantics follow [stage-contracts.md](stage-contracts.md): `failed` means the stage's internal fix loop is in progress (a fresh fix task has been or is about to be dispatched); `blocked` means the run has error-exited and needs a human.

### Annotated example

```jsonc
{
  // Unique run identifier; matches .ship-issue/runs/<run_id>/
  "run_id": "run-2026-06-11-issue-142-a3f8",

  // The GitHub issue this run ships
  "issue": {
    "number": 142,
    "url": "https://github.com/acme/widgets/issues/142",
    "title": "Add CSV export to the reports page"
  },

  // Branch created by preflight; all commits land here
  "branch": "ship-issue/142-csv-export",

  // PR opened by the implement stage (null before that)
  "pr": {
    "number": 187,
    "url": "https://github.com/acme/widgets/pull/187"
  },

  // All nine stages. status: pending | running | passed | failed | blocked.
  // started_at: null until the stage first starts. ended_at: null until it
  // ends (most recent end on later work windows). duration_seconds: null
  // until ended; WORK time only — accumulated across work windows, gate-wait
  // and crash-gap windows excluded (see Pause semantics).
  "stages": {
    "preflight":    { "status": "passed",  "started_at": "2026-06-11T09:14:02Z", "ended_at": "2026-06-11T09:14:20Z", "duration_seconds": 18 },
    "plan":         { "status": "passed",  "started_at": "2026-06-11T09:14:21Z", "ended_at": "2026-06-11T09:21:40Z", "duration_seconds": 439 },
    "implement":    { "status": "passed",  "started_at": "2026-06-11T09:40:15Z", "ended_at": "2026-06-11T10:52:30Z", "duration_seconds": 4335 },
    "review":       { "status": "passed",  "started_at": "2026-06-11T10:52:35Z", "ended_at": "2026-06-11T11:10:00Z", "duration_seconds": 1045 },
    "ci":           { "status": "passed",  "started_at": "2026-06-11T11:10:05Z", "ended_at": "2026-06-11T11:31:00Z", "duration_seconds": 1255 },
    // In-flight stage: started_at set, ended_at/duration_seconds still null.
    // Live elapsed is computed by readers as now - the current work window's
    // start, never stored (see Time summary, dashboard/reader display contract).
    "cloud_review": { "status": "running", "started_at": "2026-06-11T11:31:10Z", "ended_at": null, "duration_seconds": null },
    "deploy":       { "status": "pending", "started_at": null, "ended_at": null, "duration_seconds": null },
    "e2e":          { "status": "pending", "started_at": null, "ended_at": null, "duration_seconds": null },
    "logs":         { "status": "pending", "started_at": null, "ended_at": null, "duration_seconds": null }
  },

  // Both gates. state: not_reached | waiting | approved | rejected.
  // wait_seconds is the gate-wait window (gate_reached -> gate_decision),
  // recorded separately from stage work time.
  "gates": {
    "gate_1": { "state": "approved",    "reached_at": "2026-06-11T09:21:41Z", "decided_at": "2026-06-11T09:40:12Z", "wait_seconds": 1111 },
    "gate_2": { "state": "not_reached", "reached_at": null, "decided_at": null, "wait_seconds": null }
  },

  // Run-level timing totals. Disjoint categories: work_seconds sums the
  // completed stage work windows (the in-flight stage joins on completion);
  // gate_wait_seconds sums gate-wait windows; crash_gap_seconds sums dead
  // windows recorded on resume after a crash/interrupt.
  "timing": {
    "work_seconds": 7092,
    "gate_wait_seconds": 1111,
    "crash_gap_seconds": 0
  },

  "created_at": "2026-06-11T09:14:02Z",
  "updated_at": "2026-06-11T11:47:33Z"
}
```

## events.jsonl

Append-only audit log: one JSON object per line, never rewritten, never reordered. Every event carries at least `event` (the type) and `ts` (ISO 8601 timestamp); type-specific fields follow.

### Event types

| Event | Fields (beyond `event`, `ts`) | Emitted when |
|-------|-------------------------------|--------------|
| `run_started` | `run_id`, `issue_number`, `issue_url` | Preflight initializes the run. |
| `stage_started` | `stage` | A stage begins (status → `running`). |
| `stage_passed` | `stage` | A stage passes. |
| `stage_failed` | `stage`, `reason` | A stage fails; the internal fix loop will engage. |
| `stage_blocked` | `stage`, `reason` | A stage error-exits; the run halts for a human. |
| `timer_started` | `stage` | A stage **work window** opens — on stage start and again on every post-crash resume of that stage (see [Pause semantics](#pause-semantics)). |
| `timer_stopped` | `stage`, `work_seconds` | A stage work window closes; `work_seconds` is that window's work time. The stage's `duration_seconds` in `state.json` is the sum of `work_seconds` across all its windows. A crash means no `timer_stopped` was written for the open window. |
| `gate_reached` | `gate` (`gate_1` or `gate_2`) | The run arrives at a gate (status → `waiting`). |
| `gate_wait_started` | `gate`, `at` | A gate-wait window opens; emitted with `gate_reached`, matching the gate's `reached_at`. |
| `gate_wait_ended` | `gate`, `at`, `wait_seconds` | A gate-wait window closes; emitted with `gate_decision`, matching the gate's `decided_at`/`wait_seconds`. |
| `gate_decision` | `gate`, `decision` (`approved` or `rejected`), `feedback` | The human decides at a gate. |
| `fix_task_dispatched` | `stage`, `target_agent`, `model`, `evidence_summary` | A fresh fix task is dispatched on the same tier (per [model-tiering.md](model-tiering.md), Rule 3). |
| `crash_gap_recorded` | `stage`, `from`, `to`, `gap_seconds` | On resume after a crash/interrupt, the orchestrator records the dead window between the last persisted event and the resume — `stage` is the stage that was in flight — then opens a new work window with a fresh `timer_started` (see [Pause semantics](#pause-semantics)). |
| `decision_recorded` | `decision` (`ship` or `fix`), `rationale`, `conflicting_evidence` | The orchestrator resolves conflicting stage evidence with an explicit ship-or-fix decision. |
| `run_completed` | `merged_pr_url` | Gate 2 confirmed and the merge performed. |
| `run_aborted` | `reason` | The run ends without merging. |

`stage_started`/`stage_passed`/`stage_failed`/`stage_blocked` mark **status transitions**; `timer_started`/`timer_stopped` mark **work windows** — do not conflate the two. They usually coincide (a stage's first work window opens alongside its `stage_started`), but a post-crash resume opens a new work window with a fresh `timer_started` and **no** new `stage_started`: one `timer_started`/`timer_stopped` pair brackets each work window of a stage, however many windows it takes.

### One-line examples

```json
{"event":"run_started","ts":"2026-06-11T09:14:02Z","run_id":"run-2026-06-11-issue-142-a3f8","issue_number":142,"issue_url":"https://github.com/acme/widgets/issues/142"}
{"event":"stage_started","ts":"2026-06-11T09:14:05Z","stage":"plan"}
{"event":"stage_passed","ts":"2026-06-11T09:21:40Z","stage":"plan"}
{"event":"stage_failed","ts":"2026-06-11T10:02:11Z","stage":"review","reason":"FIX verdict: 2 blockers"}
{"event":"stage_blocked","ts":"2026-06-11T10:30:00Z","stage":"deploy","reason":"ECS service failed to stabilize"}
{"event":"timer_started","ts":"2026-06-11T09:14:21Z","stage":"plan"}
{"event":"timer_stopped","ts":"2026-06-11T09:21:40Z","stage":"plan","work_seconds":439}
{"event":"gate_reached","ts":"2026-06-11T09:21:41Z","gate":"gate_1"}
{"event":"gate_wait_started","ts":"2026-06-11T09:21:41Z","gate":"gate_1","at":"2026-06-11T09:21:41Z"}
{"event":"gate_wait_ended","ts":"2026-06-11T09:40:12Z","gate":"gate_1","at":"2026-06-11T09:40:12Z","wait_seconds":1111}
{"event":"gate_decision","ts":"2026-06-11T09:40:12Z","gate":"gate_1","decision":"approved","feedback":null}
{"event":"fix_task_dispatched","ts":"2026-06-11T10:02:15Z","stage":"review","target_agent":"tdd-implementer","model":"claude-opus-4-8","evidence_summary":"2 review blockers: missing null check in exporter; AC-3 untested"}
{"event":"crash_gap_recorded","ts":"2026-06-11T10:58:03Z","stage":"implement","from":"2026-06-11T10:12:44Z","to":"2026-06-11T10:58:03Z","gap_seconds":2719}
{"event":"decision_recorded","ts":"2026-06-11T11:50:01Z","decision":"fix","rationale":"Cloud review blocker outweighs green CI: unvalidated user input reaches the CSV writer","conflicting_evidence":"ci=passed, cloud_review=blocking finding"}
{"event":"run_completed","ts":"2026-06-11T13:05:44Z","merged_pr_url":"https://github.com/acme/widgets/pull/187"}
{"event":"run_aborted","ts":"2026-06-11T12:00:00Z","reason":"Gate 2 declined: feature deferred"}
```

## Pause semantics

Every second of a run's lifetime falls into exactly one of **three disjoint window categories**. Stage `duration_seconds` records **work time only**; the two non-work categories — gate wait and crash gap — are recorded separately and **excluded from every stage's work time**. This mirrors tasktracker's `pauseActiveTask` semantics: human thinking time and dead time are not work time.

- **Work windows** — a stage's timer is running: from a `timer_started` event to its paired `timer_stopped`. A stage that runs uninterrupted has exactly one work window; a stage interrupted by a crash accumulates `duration_seconds` across **multiple work windows**, one per resume.
- **Gate-wait windows** — from `gate_reached` to `gate_decision`. The pipeline plans these stops; waiting there is normal. The window is recorded as the gate's `wait_seconds` (with paired `gate_wait_started`/`gate_wait_ended` events) and added to `timing.gate_wait_seconds`. It is never counted toward any stage's `duration_seconds` — gates are not stages ([stage-contracts.md](stage-contracts.md)).
- **Crash-gap windows** — dead time between the last recorded activity before a crash or interrupt and the resume on re-invocation. **Detection on resume:** a re-invoked `/ship-issue` compares the resume timestamp against the `ts` of the last persisted event in `events.jsonl`. If the run was not waiting at a gate, that window is recorded as a `crash_gap_recorded` event (`stage` = the stage in flight, `from` = last persisted event `ts`, `to` = resume timestamp, `gap_seconds` = the difference) and added to `timing.crash_gap_seconds`. A crash gap is **never attributed to any stage's `duration_seconds`**: the in-flight stage resumes its work clock at the resume timestamp by opening a new work window (a fresh `timer_started` — the crash left the previous window with no `timer_stopped`). A gap that elapses while a gate is `waiting` is gate wait, not a crash gap — the gate-wait window already covers it.

When the optional `tasktracker.time_integration` config flag is enabled, the orchestrator additionally mirrors these timers into real tasktracker timers — see [config-schema.md](config-schema.md). The file-based timing here is authoritative and works unchanged without it.

## Time summary

For a completed run, the time summary is computed from `state.json` (with `events.jsonl` supplying per-window detail where needed) and comprises:

- **(a) Per-stage durations** — each stage's `duration_seconds` from `state.json`; equivalently, the sum of that stage's `timer_stopped.work_seconds` events across all its work windows.
- **(b) Run total** — `timing.work_seconds`: the sum of stage work. Gate-wait and crash-gap time are **reported as separate totals** alongside it — `timing.gate_wait_seconds` and `timing.crash_gap_seconds` — never folded into the work total.
- **(c) Per-model-tier rollup** — stage work attributed to Fable 5 (`claude-fable-5`), Opus 4.8 (`claude-opus-4-8`), Sonnet 4.6 (`claude-sonnet-4-6`), or the explicit **external** bucket, per this table (derived from the executing tiers in [stage-contracts.md](stage-contracts.md) / [model-tiering.md](model-tiering.md)):

| Bucket | Attributed stage work |
|--------|-----------------------|
| Fable 5 (`claude-fable-5`) | `plan`, `review` (agent stages pinned `claude-fable-5`), **plus** `preflight` — orchestrator-driven, executed in the Fable 5 main session |
| Opus 4.8 (`claude-opus-4-8`) | `implement`, plus every dispatched fix task |
| Sonnet 4.6 (`claude-sonnet-4-6`) | `e2e`, `logs` |
| external (no model tier) | `ci`, `cloud_review`, `deploy` — externally-executed waits on CI, the cloud review service, and deploy infrastructure. These are never silently attributed to a model tier, even though the orchestrator polls or triggers them. |

Fix-cycle work stays tier-pure: a fix task dispatched to tdd-implementer accumulates as work windows on `implement` (it is `claude-opus-4-8` work regardless of which stage's fix loop dispatched it — `fix_task_dispatched` events carry the attribution), and a Gate 1 plan regeneration accumulates on `plan` (`claude-fable-5`). The rollup is therefore the sum of each bucket's stages' `duration_seconds`.

**Consumers:** this summary is what the **Gate 2 merge brief** embeds ([stage-contracts.md](stage-contracts.md)) and what the **dashboard** displays.

### Dashboard/reader display contract

This contract is normative for the dashboard and any other reader:

- The dashboard shows **per-stage durations** and the **run totals** (work, gate wait, and crash gap as the separate totals above).
- For the **in-flight stage**, the dashboard shows **live elapsed**, computed by the reader as `now − the current work window's start` (the most recent `timer_started`). Live elapsed is **never stored**: readers compute it, the orchestrator never writes it ([ADR-0009](../../../docs/decisions/ADR-0009-single-orchestrator-file-run-state-polling-dashboard.md)).

## Durability contract

- **`state.json` is the resume source of truth.** When `/ship-issue` is re-invoked for an existing run, the orchestrator reads `state.json` and resumes at the last incomplete stage (or at the gate that is `waiting`). No state lives only in conversation memory; a crashed or interrupted session loses nothing the resume needs.
- **`events.jsonl` is the audit log.** It answers "what happened and why" — every stage transition, gate decision, fix dispatch, and conflicting-evidence ruling, in order, forever. It is never used for resume logic and never edited after the fact.
- The orchestrator is the **only writer** of both files. The dashboard and any other tooling read them and never write ([ADR-0009](../../../docs/decisions/ADR-0009-single-orchestrator-file-run-state-polling-dashboard.md)).

## Related

- [stage-contracts.md](stage-contracts.md) — the stage and gate semantics these fields encode
- [config-schema.md](config-schema.md) — the optional `tasktracker.time_integration` mirror of these timers
- [ADR-0009: Single orchestrator, file-based run state, polling dashboard](../../../docs/decisions/ADR-0009-single-orchestrator-file-run-state-polling-dashboard.md)
