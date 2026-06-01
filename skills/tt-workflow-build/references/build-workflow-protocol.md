# Building the build workflow — construction detail

How the parent constructs and drives the dynamic `Workflow` that `/tt-workflow-build` starts. **This is reference detail to follow while writing the workflow — it is NOT a decision gate.** The skill's flow is fixed (ensure project → start workflow → drive to done); this file just says how to write the script and integrate its results. Read alongside `workflow-tasktracker-contract.md`.

## The model (parent-owns)

In-run workflow agents share ONE MCP process / agentId, so they cannot write to tasktracker (contract R1). Therefore: **agents do the compute in worktrees and return schema results; the PARENT integrates, gates, and is the sole tasktracker writer — serially, one slice at a time.**

## Per-wave script skeleton

```js
export const meta = {
  name: 'tt-workflow-build-run',
  description: 'Parallel worktree build; agents return git patches + intents; parent integrates + gates',
  phases: [{ title: 'Build' }],
}

const SLICE_RESULT = {
  type: 'object', additionalProperties: false,
  required: ['taskId', 'status', 'patch', 'ownedPaths'],
  properties: {
    taskId:   { type: 'string' },
    status:   { type: 'string', enum: ['DONE', 'PARTIAL', 'BLOCKED'] },
    summary:  { type: 'string' },
    patch:        { type: 'string', description: 'output of `git add -A && git diff --cached`, repo-root git-format, OWNED files only' },
    ownedPaths:   { type: 'array', items: { type: 'string' }, description: 'every repo-root path the patch touches — for the parent ownership check' },
    unitTests:    { type: 'string', description: 'owned-scope tests run + result' },
    deferredTests:{ type: 'string', description: 'tests NOT runnable in isolation (need shared-file wiring) — the PARENT runs these post-integration' },
    integrationIntents: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['file', 'change'], properties: { file: {type:'string'}, change: {type:'string'} } } },
    designNotes: { type: 'string' },   // parent → NEW sub-task, never the locked phase body
    defects:   { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity','title'], properties: { severity:{type:'string'}, title:{type:'string'}, repro:{type:'string'} } } },
    learnings: { type: 'array', items: { type: 'string' } },
    frictions: { type: 'array', items: { type: 'string' } },
    blockers:  { type: 'string' },
  },
}

phase('Build')
// args = {slices:[{taskId, title, ownedScope, acceptanceCriteria, leaseToken}], invariantContext, projectName, apiBase}
// (parent pre-acquires a per-slice lease and passes its token in — see "Measuring parallel build time")
const results = await parallel(
  args.slices.map((s) => () =>
    agent(
      `Build slice "${s.title}" (taskId ${s.taskId}) in ${args.projectName}.
Context (already read — do NOT re-fetch): ${JSON.stringify(args.invariantContext)}
OWNED files (edit ONLY these): ${JSON.stringify(s.ownedScope)}
ACs to satisfy: ${JSON.stringify(s.acceptanceCriteria)}
HARD RULES:
 - Edit ONLY owned files. For any SHARED file (*.module.ts provider lists, barrels,
   app.module.ts, migrations dir, package.json, route tables) DO NOT edit — add an
   integrationIntents entry instead.
 - "Green" = your OWNED unit tests. Tests needing shared wiring you can't add → list in deferredTests.
 - You MUST NOT call setActiveTask or ANY tasktracker write tool. Reads are fine.
 - When done: \`git add -A && git diff --cached\`; put that patch verbatim in "patch", list paths in "ownedPaths".
 - MEASURE YOUR BUILD TIME: if a leaseToken was provided (${s.leaseToken}), curl POST ${args.apiBase}/tasks/${s.taskId}/heartbeat with header X-TaskTracker-Lease-Token: ${s.leaseToken} right after you start AND right before you return. That brackets your build on the slice's OWN lease timer (AC6: distinct lease → its own task_time_log row) and does NOT touch the shared MCP, so no collision. Do nothing else with tasktracker.
 - Return SLICE_RESULT; never prose. If you can't finish: PARTIAL (safe partial patch) or BLOCKED (empty patch + blocker).`,
      { label: `build:${s.taskId.slice(0,8)}`, phase: 'Build', schema: SLICE_RESULT, isolation: 'worktree' }
    )
  )
)
return { slices: results.filter(Boolean) }
```

No wall-clock/RNG in the script (contract R5). Bound the wave to ~min(16, cores-2) and `log()` any deferred overflow (R8).

## Measuring parallel build time (per-agent leases) — the correct fix, not a "no data" placeholder

Build agents run in worktrees off the shared stdio MCP, so they can't use the parent's single active-task pointer to clock their build. They measure their OWN time via the per-agent work-lease registry over the REST API:

1. BEFORE the fan-out, the PARENT acquires one lease per slice, each under a DISTINCT agent identity, and passes the lease TOKEN into that slice's agent via `args`:
   - mint a JWT: `POST <apiBase>/auth/mcp-token`, headers `x-mcp-api-key: <key from ~/.config/tasktracker-mcp/.env>` + `X-TaskTracker-Agent-Id: mcp:wfbuild:<sliceTaskId>` (unique per slice → distinct agentId → its own concurrent lease, AC2/AC3).
   - acquire: `POST <apiBase>/leases/acquire {taskId:<slice>}`, `Bearer <jwt>` → `{ id, token }`.
2. Each agent heartbeats with its token at start + before return → the build span lands on the slice's OWN `task_time_log` row (AC6).
3. After integrating the slice, the parent releases the lease (`DELETE <apiBase>/leases/<id>`), closing the row; `getTimeSummary` for the slice then reflects REAL build effort, not just the parent's integration time.

**Throttle caveat (real, being fixed correctly):** `/auth/mcp-token` is rate-limited to ~5 mints/60s, so a wave wider than that can't all be pre-leased at once *today*. That is closed by the tracked backend change (a batch / agent-scoped mint that lifts the cap for agent identities) — NOT by abandoning measurement. Until it lands: pre-lease up to the throttle budget; only for a slice that genuinely could not be leased, log a principle-#11 `logFriction("no data: build time for slice <id> unmeasured — mint throttle")`. That honesty fallback is for the genuinely-unmeasurable remainder ONLY, never a substitute for measuring the slices you can.

## Selecting a wave (parent, before the run)

`getReadyTasks(projectId)` → the dependency-unblocked LEAF frontier. Take the mutually-independent slices with **DISJOINT OWNED-file sets** (shared-file overlap is fine — the parent merges intents). Read project-invariant context (principles, architecture, ACs) ONCE and pass it in as data (R3). If only ONE leaf is ready (or it's the bootstrap), the parent does that slice inline — the bridge — then re-evaluates.

## Integrating each returned slice (parent, serially)

For each slice, in turn — **`setActiveTask(<slice>)` FIRST** so the integration+gate work heartbeats against it:

- **Branch on status.** BLOCKED → don't integrate, log the blocker, leave the task open, exclude its dependents from the next wave. PARTIAL → integrate only if self-consistent + gates pass; do NOT mark completed; log a friction; exclude dependents.
- **Resume-safety.** If the task is already `completed` (a re-run), SKIP application — its edits are already in the tree.
- **Ownership check.** Assert every `ownedPaths` entry is in this slice's `ownedScope`, not in another slice's, and not a shared/barrel file. On violation: reject the patch, log a defect, route via the intent path.
- **Apply.** Write `patch` to a temp file and `git apply --3way`; on hunk reject, re-derive by hand. Owned sets are disjoint, so clean apply is expected.
- **Apply shared intents yourself**, deterministically ordered (e.g. by taskId); the next build/typecheck gate catches contradictions (two providers on one token).

## Gating + recording (parent) — every item mandatory, none skippable

With the slice still active, on the INTEGRATED tree (where the agent's `deferredTests` — DI/route/integration — finally run). This is the parallel-path equivalent of `/tt-implement-phase`'s exit conditions — a slice is NOT `completed` until ALL hold (a rushed wave loop must not integrate-and-complete with any skipped):

1. **Requirement link** — the slice task has a linked requirement in its hierarchy (`listRequirementTaskLinks`); if missing, `linkRequirementToTask` before completing. (Parallel equivalent of `/tt-workflow-run`'s Gate-3 link check.)
2. **verification-loop** (build / type / lint / test / security-grep / diff) → clean.
3. **AC proof** — every acceptance criterion of the slice's requirement has a passing test on the integrated tree; mark each satisfied: `updateAcceptanceCriterion({ criterionId, satisfied: true, satisfiedByTaskId: <slice> })`. Zero unsatisfied linked ACs.
4. **`code-review`** → clean PASS.
5. **`/security-review`** when the slice touches a sensitive surface (auth / authz / input / crypto / payment / uploads / API endpoints / DB queries) → clean PASS; else N/A.
6. **Architecture** — register/refresh `ArchitectureComponent`s for any new/changed structural piece this slice added (principle #8), then `scanArchitectureDrift` vs the pre-run baseline → **no net-new drift** (fix-loop: register the delta until clean).
7. **`getDefectStats`** → no new defects above the pre-run baseline.

A gate failure is a fix loop, not a pause. Then: `designNotes` → a NEW sub-task (`createTask`, never the locked phase body, R4); `updateTaskStatus(completed)`; `logDefect`/`logLearning`/`logFriction` from the envelope.

## Terminal DoD gate (parent, when the backlog drains)

Before declaring the build done, assert the whole project is provably complete — not just "no more ready tasks": all implementation phases `completed`, **zero unsatisfied ACs** on linked requirements, `getDefectStats` shows zero open defects, `scanArchitectureDrift` shows no net-new drift vs the run's start, and `getProjectReadiness` passes. (Until the server-side `getProjectDoneness` gate ships — tracked — this is parent-enforced by reading those tools and refusing "done" on any failure.)

## Wave loop + done

Re-run `getReadyTasks` (only ACTUALLY-completed tasks unblock dependents — PARTIAL/BLOCKED don't). New independent wave → next `Workflow` run. `pauseActiveTask` before any human-wait; `clearActiveTask` when the run finishes. Stop only at a human gate (deploy) or a genuine blocker — never because "this step isn't parallel."

## Resumability

The `Workflow` run is journaled — resume with `Workflow({scriptPath, resumeFromRunId})`; completed slices return cached patches. Integration is idempotent (skip already-`completed` tasks at the working-tree level).
