---
name: tt-workflow-run
description: Tasktracker-native autonomous build-loop orchestrator. Drives a first-class `workflow_run` end-to-end — create the run (Gate 1 lifecycle completeness + Gate 2 zero-defects-in), then loop while `getNextReadyTask(projectId)` returns a slice — `setActiveTask` → record a pre-slice `scanArchitectureDrift` baseline → delegate the slice to `/tt-implement-phase` (which does the code work, registers the architecture delta in-slice, and auto-logs defects/learnings/frictions) → re-scan drift (Gate 3 architecture-followed) + re-read `getDefectStats` (Gate 2 delta) → read `getTimeSummary` for measured time + classify the slice's layer → `workflow_recordIteration` (appends an immutable by-layer measured-only projection version) → `pauseActiveTask` before any human gate — until the backlog drains, then `workflow_completeRun`. Loose coupling (brainstorm Fork B): the run is pure tasktracker data driven by a thin skill over EXISTING MCP tools + `/tt-implement-phase`; there is NO backend-callable Workflow API and `/loop` is only an optional outer cadence. The skill logs the RUN'S OWN insights too — a "no data" friction when heartbeating was off for a slice (principle #11), a learning on notable patterns, a defect for any new error above baseline. Use whenever the user wants to "run the workflow", "start an autonomous build loop", "drive the backlog to done", "dogfood the run", or "/tt-workflow-run" AND the work is tracked in tasktracker with a passable lifecycle. Triggers on "tt workflow run", "/tt-workflow-run", "start a workflow run", "run the build loop", "autonomous loop (tasktracker)", "drive the next-ready backlog". Prefer this over /tt-implement-plan when you want measured-time projection + per-slice drift/defect gates + a versioned remaining-effort series on top of phase execution; /tt-implement-plan just runs phases in order with no run entity, no projection, no per-slice gate ledger.
user-invocable: true
argument-hint: "[project-slug-or-id] [run-name]"
---

# tt-workflow-run

A thin, tasktracker-native orchestrator that turns an autonomous Claude Code build loop into a **visible, auditable, resumable, projectable** `workflow_run`. It is the **session layer** between the loop (which executes) and the tasktracker spine (project → phase → task → requirement+AC → time-log → insight).

It does **not** merely record the loop — it **enforces** the lifecycle through three backend gates that already exist (shipped in P99–P101), measures real build-time per slice, auto-logs insights, verifies architecture is *followed* each slice, and re-projects remaining effort from **measured time only** as an append-only versioned series.

> **Design source of truth:** brainstorm `92898896` → "Solution Description (v1)" doc `ba161e43-7697-4167-9fc7-f314ca68c3af`. The four forks are LOCKED (A: new entity; B: loose coupling; C: lean v1 dogfooded, UI v2; D: getTimeLog preview folded in). Re-read it before changing this skill.

## How this differs from /tt-implement-plan

| | `/tt-implement-plan` | `/tt-workflow-run` (this skill) |
|---|---|---|
| Unit driven | the plan's phase tasks, in author order | a first-class `workflow_run` over the **next-ready** backlog |
| Slice selection | next pending phase | `tasktracker_getNextReadyTask(projectId)` — dependency-free, ranked |
| Pre-conditions | readiness `plan` row satisfied | **Gate 1** (lifecycle completeness) + **Gate 2** (zero-defects-in), enforced server-side as 412 |
| Per-slice gates | none | **Gate 3** architecture-followed (drift hash-diff) + Gate 2 defect-delta, every slice |
| Time / projection | none | `getTimeSummary` measured ms → `workflow_recordIteration` appends a by-layer projection **version** |
| Run entity | none | `workflow_run` row with status machine + projection series; resumable across sessions |
| Insight logging | per-phase, via `/tt-implement-phase` | per-phase **plus** the run's OWN insights (no-data friction, patterns, new-defect) |

If you just want to execute phases in order with no measured run, use `/tt-implement-plan`. If you want the run entity + measured projection + per-slice gates on top, use this skill. Both delegate the actual code work to `/tt-implement-phase`.

## CRITICAL: Orchestrator pattern (kept from /tt-implement-plan)

> **THIS SESSION IS THE RUN ORCHESTRATOR + the SINGLE writer of run state. IT NEVER IMPLEMENTS CODE DIRECTLY — it delegates each slice to `/tt-implement-phase`.** That holds in every environment. One level down, `/tt-implement-phase` writes code via subagents when a subagent-dispatch tool exists, or **in-context itself when none does** (its graceful-degradation mode). Run-state writes (workflow_* MCP calls) are always yours and always main-context, regardless of mode.

```
tt-workflow-run (this session — RUN ORCHESTRATOR + the SINGLE writer of run state)
    │   ⛔ NEVER writes code     ⛔ NEVER uses Write/Edit     (in EVERY mode)
    └── /tt-implement-phase (per-slice executor)
            ├── orchestrated mode → Subagents write code / create files / run tests
            └── in-context mode  → tt-implement-phase does it directly (no subagent tool)
```

| DO (this session) | DO NOT |
|---|---|
| Create + drive the `workflow_run` (start/record/pause/complete) | Write code or edit files |
| `setActiveTask` / `pauseActiveTask` / `clearActiveTask` | Edit a locked phase body (HTTP 422) |
| Pick the next slice via `getNextReadyTask` | Invent a new backend Workflow API (none exists — Fork B) |
| Delegate each slice to `/tt-implement-phase` | Estimate a slice's duration (principle #11) |
| Run the two start gates + three per-slice gates | Advance past a blocked gate without resolving it |
| Log the run's own defects/learnings/frictions | Bury insights in chat narrative |

This skill is **main-loop-only**: it calls sibling skills via the `Skill` tool (which stays in the main loop), never via an `Agent` dispatch. The `tasktracker_workflow_*` MCP tools are module-cached at MCP boot — if one isn't visible, the MCP needs a restart (mcp-server/CLAUDE.md), not a workaround. **This restart caveat applies ONLY to those MCP tools.** The built-in `Workflow` and `Agent` tools are top-level main-loop tools — never MCP, never in `ToolSearch`, never affected by an MCP restart; don't conflate the two.

## The MCP surface this skill uses (all already shipped, P100/P101)

Exact tool names — note the `tasktracker_` prefix + `workflow_` infix:

| Tool | Role in the loop | Active-task |
|---|---|---|
| `tasktracker_workflow_startRun` | Create + start a run; runs **Gate 1 + Gate 2**; 412 on failure (run persists as `enforcing`). `acknowledgeBaseline: true` pins the current open-defect count as the run baseline (bootstrap fallback only). | EXEMPT (first-contact, like createProject) |
| `tasktracker_getNextReadyTask` | Pick the next dependency-free slice. `null` ⇒ backlog drained ⇒ complete. | EXEMPT (read) |
| `tasktracker_workflow_setCurrentTask` | Point the run at the picked slice (no iteration recorded). | requires active task (heartbeats) |
| `tasktracker_scanArchitectureDrift` | Baseline (slice start) + re-scan (slice end). Returns bucketed `missing` / `stale` / `orphaned`. | EXEMPT (read) |
| `tasktracker_getDefectStats` | Re-read `.open` for the Gate 2 delta vs baseline. | EXEMPT (read) |
| `tasktracker_getTimeSummary` | Measured (stopped-segment-only) ms for the slice task. | EXEMPT (read) |
| `tasktracker_workflow_recordIteration` | Runs the **advance gates** (Gate 3 reqs-link + architecture-followed, Gate 2 defect-delta), records the iteration, appends a projection version, and auto-logs the "no data" friction when `hadHeartbeatData: false`. 412 on a blocked advance (run → `blocked_on_gate`). | requires active task (heartbeats) |
| `tasktracker_workflow_pauseRun` / `resumeRun` | Pause before a human gate / resume after. | requires active task |
| `tasktracker_workflow_completeRun` / `abandonRun` | Terminal. | requires active task |
| `tasktracker_workflow_getRun` / `listRuns` | Inspect run + projection series. | EXEMPT (read) |

`recordIteration` key inputs (get these right — they drive the gates + projection):
- `runId`, `taskId`, `layer` (required) — layer ∈ `backend|frontend|fullstack|docs|infra` (project-estimate.py taxonomy).
- `measuredMs` — from `getTimeSummary` (bigint → pass as a string for large values; defaults to 0).
- `measurementSource` — `'timer'` (summed stopped segments) or `'wallclock'` (manual fallback).
- `hadHeartbeatData` — **false** when the slice produced no heartbeat-backed time-log data → triggers the run's own "no data" friction (R3 / principle #11).
- `baselineDrift` / `drift` — the slice-START and slice-END `scanArchitectureDrift` outputs as `{missing:[file...], stale:["componentId:file"...], orphaned:["componentId:file"...]}` key arrays. Net-new at end vs baseline blocks the advance + logs a defect.
- `remainingByLayer` — per-layer count of the run's remaining pending dependency-free slices: the projection multiplier (`projected = Σ_layer remaining×mean`). Omit the whole object on the final slice and the projection trends to ~0.
- `projectionTrigger` — defaults `'slice_complete'`; use `'scope_change'` / `'defect_baseline_shift'` for re-projections not driven by a finished slice.

## Workflow

### Step 0 — Locate the project + pre-flight the gates (this session, inline)

```
1. tasktracker_listProjects({search})  — or use the argument hint → projectId.
2. tasktracker_getProject({projectId}) — confirm solutionDescription is non-null (Gate 1 input).
3. tasktracker_getProjectReadiness({projectId}) — the requirements row must read `satisfied`
   and unlinkedTaskCount must be 0 for the run's subtree (Gate 1).
4. tasktracker_getDefectStats({projectId}) — note `.open`. This is the Gate 2 input AND the run baseline.
```

Do **not** try to pre-satisfy a gate by editing data behind the run's back. If Gate 1 will fail (no solution description, requirements not satisfied, unlinked tasks), STOP — the project needs `/tt-create-plan` / requirement linking first. If Gate 2 will fail (open defects), see the **Bootstrap nuance** below — the strict posture refuses to start; the documented fallback is `acknowledgeBaseline`.

### Step 1 — Start the run (Gates 1 + 2)

```
tasktracker_workflow_startRun({
  projectId,
  name: "<run name>",
  acknowledgeBaseline: <true ONLY for the documented bootstrap case — see below>,
  brainstormId?: <originating brainstorm>,
  sessionId?: <current session>,
})
```

- **Strict (default):** with zero open defects + a passing lifecycle, the run transitions to `running` with `baselineDefectCount = 0`. Strict zero-defects-in now holds for the whole run.
- **412:** the start gate failed. The run row persists in status `enforcing` so you can inspect the structured body (unlinked task ids / open-defect count). Fix the cause (link tasks, resolve defects, or acknowledge the baseline) and retry — do not route around the gate.

`startRun` is active-task-EXEMPT (it CREATES the run). Right after a successful start, the first `setActiveTask` (Step 2) begins heartbeating.

#### Bootstrap nuance (read once — this is the inaugural-run case)

A project that already has an open defect cannot pass strict Gate 2 — but that open defect is often exactly the *first thing the loop should fix*. The documented bootstrap path:

1. Start with `acknowledgeBaseline: true`. The run pins `baselineDefectCount = N` (the current open count). Only NEW defects **above** N block advance; the N pre-existing ones don't.
2. Make the **inaugural slice** a fix-task for one of those baseline defects (`tasktracker_createFixTask({defectInsightId})` — stamps `metadata.fixesInsightId` so the fix-time rolls into `getDefectStats.timeOnDefects`). Running it resolves the defect, dropping `.open` back toward 0.
3. After the baseline defects are cleared, **strict zero-defects-in holds** for every subsequent slice — a new defect above the (now lower) baseline blocks advance and is attributed as "ours" (principle #14: pre-existing is not a thing).

`acknowledgeBaseline` is a one-time bootstrap concession, not a routine knob. Once the backlog is clean, future runs start strict (baseline 0).

### Step 2 — The loop (per-slice protocol)

Loop while `getNextReadyTask` returns a slice. Each iteration is the brainstorm's per-slice protocol, one step per call:

```
loop:
  slice = tasktracker_getNextReadyTask({projectId})
  if slice == null: break                         # backlog drained → Step 3

  # 2a. Focus + point the run at the slice
  tasktracker_setActiveTask(slice.id)             # heartbeats start; digest carries principles + body
  tasktracker_workflow_setCurrentTask({runId, taskId: slice.id})

  # 2b. Pre-slice drift baseline (Gate 3 input — baseline-subtracted so only the slice's delta is charged)
  baselineDrift = tasktracker_scanArchitectureDrift({projectId})   # capture missing/stale/orphaned key arrays

  # 2c. Delegate the actual work to /tt-implement-phase
  Skill(skill="tt-implement-phase"): Execute the slice.
    Context: project, phase/slice task id = slice.id, sub-tasks (getTask), linked requirements + ACs,
             principles from the setActiveTask digest.
    /tt-implement-phase: does the code (via subagents), registers the architecture delta in the SAME
    slice (principle #8 — so the slice's own drift re-scan stays clean), runs verification-loop +
    code-review + ADR compliance, and auto-logs defects/learnings/frictions with relatedTaskId = slice.id.

  # 2d. Slice-end gate inputs
  endDrift  = tasktracker_scanArchitectureDrift({projectId})       # Gate 3 delta
  defects   = tasktracker_getDefectStats({projectId})              # Gate 2 delta (.open vs run baseline)
  time      = tasktracker_getTimeSummary({taskId: slice.id})       # measured (stopped-only) ms
  layer     = classify(slice)                                      # backend|frontend|fullstack|docs|infra

  # 2e. Record the iteration → appends a projection version (runs the advance gates server-side)
  tasktracker_workflow_recordIteration({
    runId, taskId: slice.id, layer,
    measuredMs: time.totalMs (as string if large),
    measurementSource: time had data ? 'timer' : 'wallclock',
    hadHeartbeatData: <true iff getTimeSummary returned measured data>,
    baselineDrift, drift: endDrift,
    remainingByLayer: <per-layer count of remaining pending dependency-free slices>,  # omit on last slice
  })
  # 412 here ⇒ the advance was BLOCKED (Gate 3 net-new drift / missing req link, or Gate 2 new defect).
  #   The run is now blocked_on_gate. Resolve the cause (re-register the arch delta, link the requirement,
  #   or fix the new defect) within /tt-implement-phase, then re-record. Do NOT skip the slice.

  # 2f. Pause before any human gate
  tasktracker_pauseActiveTask()   # before any message that waits on the human (their think-time isn't work)
```

#### The run's OWN insights (R3 — log these, don't narrate them)

`/tt-implement-phase` logs the slice's insights. ON TOP of that, **this skill** logs the run's own:

| Condition | Tool | Notes |
|---|---|---|
| The slice produced no heartbeat-backed time data | `recordIteration({hadHeartbeatData:false})` auto-logs it, OR `tasktracker_logFriction` | "no data" — never estimate the duration (principle #11). The auto-log stamps run_id + iteration_id. |
| A notable cross-slice pattern emerged | `tasktracker_logLearning` | E.g., "drift baseline-subtraction means an unrelated stale component never blocks an unrelated slice." |
| `.open` rose above the run baseline | `tasktracker_logDefect` | The new error is "ours" (principle #14). recordIteration also blocks the advance. |

Per R3, auto-logged slice insights carry `relatedTaskId = slice.id` AND their `metadata` is stamped with `run_id` + `iteration_id` (no new column). When you log the run's own insight manually, set `relatedTaskId` to the slice and reference the run/iteration in the body.

#### Classifying the slice layer

Map the slice to the project-estimate.py taxonomy: `frontend` (Angular templates/components/styles), `backend` (NestJS services/controllers/entities), `fullstack` (both in one slice), `docs` (markdown/skill files), `infra` (CI, compose, migrations-only). When a slice touches both backend + frontend, classify `fullstack` (don't split the iteration).

### Step 3 — Complete the run

When `getNextReadyTask` returns `null`:

```
tasktracker_workflow_completeRun({runId})          # terminal; sets ended_at
tasktracker_workflow_getRun({runId})               # confirm the projection series is populated
tasktracker_getDefectStats({projectId})            # confirm .open == baseline (no nets introduced)
tasktracker_clearActiveTask()
```

Then emit the closing summary (counts, the projection series, insights logged this run, manual verification still owed) in chat — not as a file. If the run ended deliberately short, use `abandonRun` instead and say why.

### Optional outer cadence — /loop

Loose coupling (Fork B) means `/loop` is **orthogonal**: you can wrap the whole skill in `/loop <interval> /tt-workflow-run <project>` for an unattended cadence, but the run does not depend on it. The run entity + gates + projection are pure tasktracker data; `/loop` just re-invokes the skill, which resumes the same run (the active-task pointer + run row persist across sessions).

## Handling a blocked gate

A 412 is the system working, not a failure to route around.

| Where | Cause | Resolution |
|---|---|---|
| `startRun` 412 | Gate 1: no solution description / requirements not satisfied / unlinked tasks | Fix the lifecycle (`/tt-create-plan`, link requirements), then retry. |
| `startRun` 412 | Gate 2: open defects, no ack | Resolve them, OR start with `acknowledgeBaseline: true` and clear them as inaugural slices. |
| `recordIteration` 412 | Gate 3: net-new drift (a new file no component cites; an edited component whose driftHash wasn't refreshed) | Register/refresh the architecture component in-slice (principle #8), then re-record. |
| `recordIteration` 412 | Gate 3: the slice task has no requirement link in its hierarchy | Link it to a requirement, then re-record. |
| `recordIteration` 412 | Gate 2: `.open` rose above baseline | The new defect is ours — fix it (a follow-up slice), then re-record. |

On any 412 the run sits in `enforcing` (start) or `blocked_on_gate` (advance). `pauseActiveTask` before surfacing the blocker to the user; resume from the blocked step, not from Step 0.

## Anti-patterns to avoid

- ❌ Writing code in this session. Delegate every slice to `/tt-implement-phase`.
- ❌ Inventing a backend Workflow API. Fork B is loose coupling — the loop is a skill over existing MCP tools only.
- ❌ Estimating a slice's duration when heartbeating was off. The answer is "no data" → friction (principle #11). Never synthesize a `measuredMs`.
- ❌ Skipping `setActiveTask` before a slice — no heartbeats, no measured time, the projection goes blind.
- ❌ Routing around a gate (editing data to dodge a 412, or skipping a blocked slice). Resolve the cause.
- ❌ Editing a locked phase/slice body. Design notes go to a sub-task; the body is the contract.
- ❌ `acknowledgeBaseline: true` as a routine convenience. It is a one-time bootstrap concession; once clean, start strict.
- ❌ Re-deriving scope from the brainstorm mid-run. The slice's task body (from `setActiveTask`) is the locked contract.
- ❌ Burying the run's own defects/learnings/frictions in chat. Log them via `logDefect`/`logLearning`/`logFriction`.
- ❌ Running this as an `Agent`-dispatched subagent — invoke it in the main loop; call siblings via `Skill`.

## Quality checklist

- [ ] Step 0: project located; Gate 1 inputs (solution description, requirements satisfied, zero unlinked) checked; Gate 2 baseline (`.open`) noted.
- [ ] Step 1: `startRun` ran the gates; strict by default; `acknowledgeBaseline` used ONLY for the documented bootstrap case, with the inaugural slice resolving a baseline defect.
- [ ] Step 2: every slice did `setActiveTask` + `setCurrentTask`, captured a pre-slice drift baseline, delegated to `/tt-implement-phase`, re-scanned drift + re-read defect stats, read `getTimeSummary`, and `recordIteration`'d with the right layer + drift arrays + `remainingByLayer`.
- [ ] R3: slice insights carry `relatedTaskId` + run_id/iteration_id; the run logged its OWN "no data" friction whenever heartbeating was off.
- [ ] `pauseActiveTask` before every human-gate message.
- [ ] No locked-body edits; no invented backend API; no synthesized durations.
- [ ] Step 3: `completeRun`; projection series populated; `.open` back at baseline; `clearActiveTask`.
- [ ] No code written in this session (Write/Edit unused); all slice code came from `/tt-implement-phase` (via its subagents, or its in-context mode when no subagent tool exists).

## Resources

This skill reuses the tasktracker references already shipped with the sibling skills:
- `/tt-implement-phase` `references/insight-cookbook.md` — when/how to `logDefect` / `logLearning` / `logFriction`.
- `/tt-workflow-audit` `references/workflow-tasktracker-contract.md` — the shared `tt-workflow-*` contract (parent owns writes, no Date/RNG in any workflow script, MCP reachability, prod safety). This skill is sequential (single active task) — it does NOT use the parallel `Workflow` tool — but the active-task / locked-body / prod-write rules in that contract still apply. **Namespace note:** the `tasktracker_workflow_*` MCP tools this skill uses (`workflow_startRun`, `workflow_recordIteration`, …) are run-TRACKING tools — NOT the built-in `Workflow` orchestration tool; they only share the word "workflow". The siblings `/tt-workflow-audit` and `/tt-workflow-build` are the ones that invoke the built-in `Workflow` tool.

### Related skills
- `/tt-implement-phase` — per-slice executor. This skill delegates every slice to it.
- `/tt-implement-plan` — the no-run-entity alternative: executes phases in order without projection or per-slice gates.
- `/tt-create-plan` — upstream: produces the requirements + linked tasks Gate 1 checks for.
- `/loop` — optional outer cadence; orthogonal to the run.
- `/code-review`, `/verification-loop`, `/adr` — quality gates inside `/tt-implement-phase`.

## Key principles

1. **Orchestrate, never implement.** `/tt-implement-phase` (→ subagents) does the code; this session drives the run.
2. **Loose coupling (Fork B).** The run is pure tasktracker data over existing MCP tools; no backend Workflow API; `/loop` optional.
3. **Enforce, don't record.** The three gates (lifecycle, zero-defects-in, architecture-followed) are 412s, not advisories.
4. **Measured time only (principle #11).** Projection consumes `getTimeSummary` (stopped segments); no heartbeat data ⇒ "no data" friction, never an estimate.
5. **Zero-error invariant (principle #14).** A defect above baseline is ours and blocks advance. `acknowledgeBaseline` is a one-time bootstrap.
6. **Active-task discipline.** `setActiveTask` per slice, `pauseActiveTask` before human waits, `clearActiveTask` on completion.
7. **The run logs its own insights.** Friction / learning / defect for the loop itself — in tasktracker, not chat.
8. **Locked bodies are sacred.** Slice scope is the contract; notes go to sub-tasks.
