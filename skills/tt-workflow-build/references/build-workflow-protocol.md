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
// args = {slices:[{taskId, title, ownedScope, acceptanceCriteria}], invariantContext, projectName}
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
 - Return SLICE_RESULT; never prose. If you can't finish: PARTIAL (safe partial patch) or BLOCKED (empty patch + blocker).`,
      { label: `build:${s.taskId.slice(0,8)}`, phase: 'Build', schema: SLICE_RESULT, isolation: 'worktree' }
    )
  )
)
return { slices: results.filter(Boolean) }
```

No wall-clock/RNG in the script (contract R5). Bound the wave to ~min(16, cores-2) and `log()` any deferred overflow (R8).

## Selecting a wave (parent, before the run)

`getReadyTasks(projectId)` → the dependency-unblocked LEAF frontier. Take the mutually-independent slices with **DISJOINT OWNED-file sets** (shared-file overlap is fine — the parent merges intents). Read project-invariant context (principles, architecture, ACs) ONCE and pass it in as data (R3). If only ONE leaf is ready (or it's the bootstrap), the parent does that slice inline — the bridge — then re-evaluates.

## Integrating each returned slice (parent, serially)

For each slice, in turn — **`setActiveTask(<slice>)` FIRST** so the integration+gate work heartbeats against it:

- **Branch on status.** BLOCKED → don't integrate, log the blocker, leave the task open, exclude its dependents from the next wave. PARTIAL → integrate only if self-consistent + gates pass; do NOT mark completed; log a friction; exclude dependents.
- **Resume-safety.** If the task is already `completed` (a re-run), SKIP application — its edits are already in the tree.
- **Ownership check.** Assert every `ownedPaths` entry is in this slice's `ownedScope`, not in another slice's, and not a shared/barrel file. On violation: reject the patch, log a defect, route via the intent path.
- **Apply.** Write `patch` to a temp file and `git apply --3way`; on hunk reject, re-derive by hand. Owned sets are disjoint, so clean apply is expected.
- **Apply shared intents yourself**, deterministically ordered (e.g. by taskId); the next build/typecheck gate catches contradictions (two providers on one token).

## Gating + recording (parent)

With the slice still active, run gates on the INTEGRATED tree (this is where the agent's `deferredTests` — DI/route/integration tests — finally run): `verification-loop` → `code-review` (clean PASS) → `scanArchitectureDrift` (vs baseline) → `getDefectStats` (no new defects). A gate failure is a fix loop, not a pause. Then: `designNotes` → a NEW sub-task (`createTask`, planning-exempt) never the locked phase body (R4); `updateTaskStatus(completed)`; `logDefect`/`logLearning`/`logFriction` from the envelope.

## Wave loop + done

Re-run `getReadyTasks` (only ACTUALLY-completed tasks unblock dependents — PARTIAL/BLOCKED don't). New independent wave → next `Workflow` run. `pauseActiveTask` before any human-wait; `clearActiveTask` when the run finishes. Stop only at a human gate (deploy) or a genuine blocker — never because "this step isn't parallel."

## Resumability

The `Workflow` run is journaled — resume with `Workflow({scriptPath, resumeFromRunId})`; completed slices return cached patches. Integration is idempotent (skip already-`completed` tasks at the working-tree level).
