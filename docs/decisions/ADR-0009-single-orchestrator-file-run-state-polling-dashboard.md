# ADR-0009: Single Orchestrator, File-Based Run State, Read-Only Polling Dashboard

> **Quick Reference** | Status: Accepted | Date: 2026-06-11
> **Decision**: One orchestrator skill owns all stage transitions and gates; run state lives in plain files (state.json + events.jsonl) in the target repo; the dashboard is a separate read-only single-file Python stdlib http.server that polls those files and never writes.
> **Context**: A nine-stage autonomous pipeline needs crash-resumable state, an audit trail, and live visibility — without introducing coordination bugs or infrastructure.
> **Alternatives**: DB-backed state, dashboard-as-controller, per-stage sub-skills
> **Impact**: ship-issue skill, dashboard, run state

---

## Context

A `/ship-issue` run spans nine stages, two human gates, fix loops, and external systems (CI, cloud review, staging deploys). The run must survive session crashes and re-invocation, every transition and decision must be auditable afterward, and a human should be able to watch a run's progress live. Each of these needs invites an architecture mistake if answered separately: shared mutable state across multiple writers breeds race conditions; database-backed state adds infrastructure for what is fundamentally single-writer data; and a dashboard with write capability becomes a second controller that can corrupt a run.

## Decision

**A single orchestrator skill owns all stage transitions and gate handling; run state is plain files — `state.json` (resume source of truth) and `events.jsonl` (append-only audit log) under `.ship-issue/runs/<run_id>/` in the target repo; and the dashboard is a separate read-only, single-file Python stdlib `http.server` that polls those files and never writes.**

Single writer means no coordination bugs: the orchestrator is the only process that ever mutates run state, so there is no locking, no merge logic, and no write race by construction. Files mean crash-resumable, inspectable, zero-infrastructure state: a re-invoked `/ship-issue` reads `state.json` and resumes at the last incomplete stage; a human can read both files with any text tool; nothing must be provisioned or kept running. A read-only dashboard cannot corrupt a run: it observes by polling and has no write path, so its failure modes are limited to stale display. Field-level schemas live in run-state-schema.md; the stage and gate semantics the state encodes live in stage-contracts.md.

## Alternatives Considered

| Option | Pros | Cons | Why Not |
|--------|------|------|---------|
| DB-backed state | Queryable; concurrent-access primitives | Requires a running database for data that has exactly one writer; not inspectable with plain tools; couples runs to infrastructure availability | Infrastructure burden for one-writer data the filesystem already handles |
| Dashboard-as-controller | One UI for both watching and steering runs | Two writers to the same run state; race conditions between dashboard actions and orchestrator transitions; dashboard bugs can corrupt runs | Two writers reintroduces the coordination problem the single-writer design eliminates |
| Per-stage sub-skills | Smaller individual skills; stages independently invocable | Run-state ownership fragments across nine writers; transition logic and gate handling duplicated or smeared across skills; partial-run invariants unenforceable | State ownership fragmentation — nine writers is the multi-writer problem at its worst |

## Consequences

- **Positive**: No write races by construction; runs survive crashes and resume from `state.json`; full audit trail in `events.jsonl`; state inspectable with `cat` and `jq`; dashboard is deployable as one Python file with no dependencies and cannot harm a run
- **Negative**: Live visibility is polling-based, so the dashboard can briefly lag the true state; all orchestration logic concentrates in one skill, which must be kept well-factored (mitigated: stage contracts are externalized as reference docs, not inlined logic)
- **Requires**: The orchestrator atomically replaces `state.json` on every transition and only appends to `events.jsonl`; the dashboard opens run files read-only and exposes no mutating endpoint; the file layout convention in run-state-schema.md is treated as a stable contract

## Related

- [stage-contracts.md](../../skills/ship-issue/references/stage-contracts.md): The stage and gate semantics the orchestrator enforces
- [run-state-schema.md](../../skills/ship-issue/references/run-state-schema.md): Field-level schema for state.json and events.jsonl
