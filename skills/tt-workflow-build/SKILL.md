---
name: tt-workflow-build
description: Tasktracker-native PARALLEL build/work executor on the Claude Code Workflow tool. The write-heavy sibling of /tt-workflow-audit — instead of read-only analysis, it fans out worktree-isolated agents that DO work (write code, generate, transform) on mutually-independent ready tasks, each returning a schema-validated result (diffs for its OWNED files + integration intents for shared files + defects/learnings/frictions). The PARENT (this main-loop session) owns the tasktracker spine — it integrates each returned slice serially into the real checkout, runs every quality gate (verification-loop, code-review, scanArchitectureDrift, getDefectStats), drives active-task + timekeeping + status + insights, then picks the next dependency-unblocked wave. Use when a tasktracker project has several INDEPENDENT ready tasks that can be built in parallel and the results aggregate — a fan of sibling features/modules, a batch of isolated fixes, parallel scaffolding. Triggers on "/tt-workflow-build", "build these in parallel", "parallel build (tasktracker)", "fan out the ready tasks", "workflow-build", or a parallelize-the-backlog request inside a tasktracker project. Prefer this over /tt-implement-plan or /tt-workflow-run (both SEQUENTIAL) when the ready slice is wide and independent; prefer /tt-workflow-audit when the work is read-only analysis; prefer /tt-implement-plan when phases are dependent or must adapt mid-run (a deterministic workflow can't branch mid-flight).
context: fork
user-invocable: true
argument-hint: "[project-slug-or-id] [phase-or-wave-hint]"
---

# tt-workflow-build

Parallel, **tasktracker-correct** execution of *real work* on the Claude Code `Workflow` tool. It fills the last quadrant of the `tt-workflow-*` tier:

| Skill | Engine | Agents | Work shape |
|---|---|---|---|
| `tt-workflow-audit` | `Workflow` tool | **read-only** analyze | parallel findings → parent writes |
| `tt-workflow-run` | sequential loop | one active slice at a time | dependent / adaptive build |
| `tt-implement-plan` | sequential | one phase at a time | dependent build |
| **`tt-workflow-build`** (this) | `Workflow` tool | **write** in worktrees | **parallel independent build** |

The shape is the **hybrid** from `/tt-workflow-audit`, extended to writes: the parent scouts a *wave* of independent ready tasks inline, fans the build out through one `Workflow` run (worktree-isolated), then **integrates + gates + tracks every slice serially in the tail**. The agents do the heavy compute; tasktracker is the governance harness around them.

## CRITICAL: the contract is non-negotiable

> **Read `references/workflow-tasktracker-contract.md` first.** It is the shared contract for every `tt-workflow-*` skill, grounded in verified facts about the live system. This skill adds the **write-heavy** rules (R6 worktree intents) on top.

The one rule you cannot break:

```
The Workflow SCRIPT orchestrates.
Parallel agent() calls do WORK IN WORKTREES and return SCHEMA results
  (diffs for OWNED files + intents for SHARED files) — they perform NO
  tasktracker writes and NEVER call setActiveTask.
The PARENT (this main-loop session) integrates, gates, and writes to
  tasktracker — SERIALLY, one slice at a time.
```

**Why (verified, and re-confirmed for this skill):** the active task is a **single process-global pointer**; in-session workflow agents **share one MCP process and one agentId** (`mcp:<CLAUDE_CODE_SESSION_ID>`, memoized in `agent-id.js`). So even though the per-agent work-lease registry now ships, parallel agents in one Workflow run **cannot** each hold their own leased active-task through the shared MCP — they would collide on the one-live-lease-per-agent index. The leases relax cross-**session** concurrency, not in-**run** concurrency. Hence the parent remains the sole tasktracker writer. (See the contract's closing note.)

| DO (parent) | DON'T |
|---|---|
| Pick a wave of **mutually-independent** ready tasks | Fan out tasks with unmet dependencies or shared-file collisions |
| Read project-invariant context once, pass it down | Let agents re-fetch principles/architecture N× |
| Fan out worktree-isolated agents that build + return diffs/intents | Let an agent call `setActiveTask` or any write tool |
| Integrate each returned slice into the real checkout serially | Let two agents edit the same OWNED file |
| Apply SHARED-file integration intents yourself | Let agents edit barrels / module files / migrations |
| Run every quality gate per slice before completing its task | Mark a task complete on an agent's say-so without gating |
| Drive active-task / status / insights / timekeeping (parent) | Edit a locked phase body |

## When to use / when not

**Use it when** a tasktracker project has **several independent ready tasks** whose work is parallelizable and aggregates: a fan of sibling feature modules, a batch of isolated bug fixes, parallel scaffolding of disjoint components, a set of per-file transforms. Each slice owns a **disjoint** set of files.

**Don't use it when** the ready tasks are **dependent or must adapt to each other mid-run** (use `/tt-implement-plan` or `/tt-workflow-run` — a deterministic workflow can't branch on a sibling's result mid-flight), when the work is read-only analysis (use `/tt-workflow-audit`), when a single change touches mostly shared files (no parallelism to win — the parent would serialize it all anyway), or when the project isn't in tasktracker.

## Workflow

> **A "slice" is a LEAF-level ready task**, not a phase. Phases own sub-tasks and a locked body; you fan out the buildable leaves. If `getReadyTasks` hands back a phase, descend to its ready leaf sub-tasks first.

### Step 0 — Locate project + the parallel wave (parent, inline)

```
1. tasktracker_listProjects({search}) / argument hint → projectId.
2. tasktracker_getReadyTasks({projectId})  → the dependency-unblocked LEAF frontier.
3. Filter to a WAVE of MUTUALLY-INDEPENDENT slices (AC5):
   - no unmet dependency (getReadyTasks already guarantees this), AND
   - DISJOINT OWNED-file sets — no two slices in the wave edit the same OWNED
     feature file. (SHARED files are EXEMPT from this rule — overlap on
     app.module.ts / barrels / migrations is EXPECTED and is reconciled by the
     parent in Step 3; it does NOT force slices into separate waves.)
   If two ready tasks would edit the same OWNED file, keep ONE this wave.
4. BOUND the wave to ~min(16, cores-2) (the runtime concurrency cap, contract R8).
   Excess independent slices wait for the next wave — and you MUST log() the
   deferral so the run report never reads as "all ready tasks built" when some
   were only queued.
```

If the ready frontier is a single leaf or all slices collide on owned files, this skill has no parallelism to offer — fall back to `/tt-implement-plan`.

### Step 1 — Read invariant context once + classify files (parent, inline)

Read principles, architecture components, and each slice's task body + linked requirements/ACs **once**, in the parent (contract R3). Then classify, per slice, the files it will touch:

- **OWNED** (feature-local — the agent edits freely in its worktree): the slice's own module/component/spec files. Owned sets are disjoint *across slices in a wave* (Step 0).
- **SHARED / barrel** (the agent must NOT edit — returns an *intent* instead): `*.module.ts` provider arrays, `app.module.ts`, entity/barrel `index.ts`, the migrations dir, frontend barrels, route tables, `package.json`. Multiple slices MAY target the same shared file — that's normal; the parent merges their intents in Step 3. (Contract R6.)

Pass the per-slice `ownedScope` + ACs + invariant context into the agents as **data**.

### Step 2 — Fan out the build (the Workflow run, worktree-isolated)

Invoke the `Workflow` tool. One agent per slice, `isolation: 'worktree'`, returning the R6 envelope. **The returned git patch — not the worktree — is the source of truth; worktrees are abandoned after the run.** Skeleton:

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
    patch:       { type: 'string', description: 'output of `git add -A && git diff --cached` rooted at repo root (git-format, a/ b/ prefixes), covering ONLY owned files' },
    ownedPaths:  { type: 'array', items: { type: 'string' }, description: 'every repo-root path the patch touches — for the parent ownership check' },
    unitTests:   { type: 'string', description: 'what owned-scope tests were run + their result' },
    deferredTests: { type: 'string', description: 'tests NOT runnable in isolation because they need shared-file wiring (parent runs these post-integration)' },
    integrationIntents: {                 // SHARED files the parent edits (never the agent)
      type: 'array',
      items: { type: 'object', additionalProperties: false,
        required: ['file', 'change'],
        properties: { file: { type: 'string' }, change: { type: 'string', description: 'e.g. add Provider X to module Y; export Z from barrel; migration spec' } } },
    },
    designNotes: { type: 'string' },                                   // parent → NEW sub-task, never phase body
    defects:   { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity','title'], properties: { severity: {type:'string'}, title: {type:'string'}, repro: {type:'string'} } } },
    learnings: { type: 'array', items: { type: 'string' } },
    frictions: { type: 'array', items: { type: 'string' } },
    blockers:  { type: 'string' },
  },
}

phase('Build')
// `args` carries {slices:[{taskId, title, ownedScope, acceptanceCriteria}], invariantContext, projectName}
const results = await parallel(
  args.slices.map((s) => () =>
    agent(
      `Build tasktracker slice "${s.title}" (taskId ${s.taskId}) in project ${args.projectName}.
Context (already read — do NOT re-fetch): ${JSON.stringify(args.invariantContext)}
Your OWNED files (edit ONLY these): ${JSON.stringify(s.ownedScope)}
Acceptance criteria to satisfy: ${JSON.stringify(s.acceptanceCriteria)}
Build the slice in your worktree.
HARD RULES:
 - Edit ONLY your owned files. For any SHARED file (a *.module.ts provider list,
   a barrel index.ts, app.module.ts, the migrations dir, package.json, a route
   table) DO NOT edit it — add an entry to integrationIntents instead.
 - "Green" is scoped to your OWNED code: write + run the UNIT tests for your owned
   files and get THOSE green. Tests that need the shared-file wiring you were
   forbidden to add (DI registration, barrel export, a route) you CANNOT run in
   isolation — do NOT edit shared files to make them pass; instead list them in
   "deferredTests" so the parent runs them after wiring. Your "DONE" means
   "owned code built + owned unit tests green", not "integrated-green".
 - You MUST NOT call setActiveTask or ANY tasktracker write tool
   (create/update/log/batch/status). Reads are fine.
 - When done: run \`git add -A && git diff --cached\` and put that patch text
   VERBATIM into "patch", and list every path it touches in "ownedPaths".
 - Return the SLICE_RESULT schema. Never return prose in place of it.
 - If you cannot finish: status PARTIAL (return the safe partial patch + what's
   left) or BLOCKED (empty patch + the blocker in "blockers"). Do not fake DONE.`,
      { label: `build:${s.taskId.slice(0,8)}`, phase: 'Build', schema: SLICE_RESULT, isolation: 'worktree' }
    )
  )
)
return { slices: results.filter(Boolean) }
```

Pass `args` as real JSON. **No wall-clock / RNG builtins** in the script (contract R5) — vary labels by taskId, not randomness. Worktree isolation is a guard, not a guarantee — the *owned vs shared* discipline + the Step 3 ownership check are the belt-and-suspenders (contract R6).

### Step 3 — Integrate each slice serially (parent) — set active task FIRST

For each returned slice, **in turn** (never in parallel — the real checkout is shared). **Branch on status before integrating:**

```
A. tasktracker_setActiveTask(<slice taskId>)   ← FIRST, so all the integration +
   gate MCP calls below heartbeat against THIS slice (this is what makes the
   Step 5 time attribution real, not a claim).

B. If status is BLOCKED:  do NOT integrate. Record the blocker as an insight
   (Step 5), leave the task OPEN, and mark this slice failed for Step 6's
   wave re-planning. Skip to the next slice.
   If status is PARTIAL:  integrate only if the partial patch is self-consistent
   and gates pass; otherwise skip it. Either way do NOT mark it completed — leave
   it in_progress and log a friction. Exclude its dependents from the next wave.

C. Resume-safety: if the slice's task is ALREADY 'completed' in tasktracker
   (a re-run after a crash), SKIP application — its edits are already in the tree.

D. Ownership check (worktree-isolation is a guard, not a guarantee): assert every
   path in ownedPaths is in THIS slice's ownedScope, is NOT in any other slice's
   scope, and is NOT a shared/barrel file. On violation, REJECT the patch, log a
   defect, and route the change through the integration-intent path instead.

E. Apply the patch: write `patch` to a temp file and run
   `git apply --3way <patch>` (paths are repo-root, git-format). If a hunk
   rejects, fall back to re-deriving the edit from the diff by hand. Owned sets
   are disjoint across the wave, so clean application is the expected case.

F. Apply integrationIntents YOURSELF (the parent is the ONLY writer of shared
   files). Multiple slices targeting the SAME shared file is expected: apply
   their intents in a deterministic order (e.g. by taskId), then let the Step 4
   build/typecheck gate catch any contradiction (two providers on one token, a
   duplicate import).
```

### Step 4 — Quality gates, per slice (parent) — AC4

With the slice still the active task, run the SAME gates the sequential path runs — **on the INTEGRATED tree** (this is also where the agent's `deferredTests` — the DI/route/integration tests it couldn't run in isolation — finally run, now that the wiring is in):

```
- verification-loop  (build / type / lint / test / security / diff)
- the slice's deferredTests (integration / DI / route tests needing the wiring)
- code-review        (clean PASS; fix-and-re-review on NEEDS_CHANGES)
- scanArchitectureDrift   (compare against the baseline read in Step 1)
- getDefectStats          (no new defects above baseline)
```

A gate failure is a **fix loop**, not a pause: fix in-context (or re-dispatch a fix agent), re-run, then proceed. The parent owns "integrated-green" — the agent only owned "unit-green". Cross-slice interactions surface here even though slices built in isolation.

### Step 5 — Record the slice in tasktracker (parent) — AC1 + timekeeping

The slice has been the active task since Step 3A, so its heartbeats have measured the integration + gate wall time. Now, while it is still active:

```
For a DONE + gated slice:
  if designNotes present:
    tasktracker_createTask({type:'subtask', parentId:<phase>, title:'Note: …'})   # planning-exempt
    → write designNotes onto THAT sub-task (NEVER the locked phase body — R4/422)
  tasktracker_updateTaskStatus(<slice taskId>, "completed")
  defects   → tasktracker_logDefect
  learnings → tasktracker_logLearning
  frictions → tasktracker_logFriction

For PARTIAL/BLOCKED (from Step 3B): do NOT complete. logFriction (PARTIAL) or
  log the blocker (BLOCKED); leave the task in_progress/open.
```

Timekeeping is honest-but-coarse: the parent's heartbeat measures the **integration + gate** wall time per slice (`getTimeSummary` wallMs, accruing since Step 3A). The parallel *build* compute happens inside agents that share no tasktracker identity, so it is NOT separately attributed — **say so in the run report; never estimate it** (principle: no time estimates / "no data" is the honest answer).

### Step 6 — Advance to the next wave (parent)

Re-plan against **actual** completions, not assumed ones:

```
1. Re-run tasktracker_getReadyTasks({projectId}).  Only tasks whose deps ACTUALLY
   completed this wave are now ready — a PARTIAL/BLOCKED slice did NOT unblock its
   dependents, and they correctly stay out of the next wave.
2. If a new independent wave exists → loop to Step 0.
3. tasktracker_pauseActiveTask  before any turn that waits on the human
   (the run report, a confirmation, or a hand-off).
4. When the frontier is empty / only-collides / only the dependent tail remains:
   stop (or hand the dependent tail to /tt-implement-plan), then
   tasktracker_clearActiveTask to close the run cleanly.
```

### Resumability

The Workflow run is journaled. On a rate-limit/crash mid-wave, resume with `Workflow({scriptPath, resumeFromRunId})` — completed slices return cached agent patches; only unfinished ones re-run. Integration is made idempotent at the **working-tree** level by Step 3C (skip applying a patch whose task is already `completed`) — without that guard, re-applying an already-applied patch double-applies or rejects. Tasktracker writes are idempotent per task (completing a completed task is a no-op).

## Anti-patterns

- ❌ An agent calling `setActiveTask` or any tasktracker write tool. Agents build + return; the parent writes.
- ❌ Two slices owning the same OWNED file in one wave. Owned sets MUST be disjoint per wave — that's the basis for conflict-free integration. (SHARED-file overlap is fine and expected — the parent merges intents.)
- ❌ An agent editing a shared barrel / `*.module.ts` / migration directly. It returns an `integrationIntent`; the parent applies it.
- ❌ Applying an agent's patch without the Step 3D ownership check, or by hand-guessing instead of `git apply`. Verify paths ∈ ownedScope, then `git apply --3way`.
- ❌ Marking a slice `completed` on the agent's `status: DONE` without running the parent gates (incl. its `deferredTests`) on the integrated tree (AC4).
- ❌ Marking a PARTIAL or BLOCKED slice `completed`, or assuming it unblocked its dependents in the next wave. Re-plan Step 6 against ACTUAL completions.
- ❌ Integrating slices in parallel. The real checkout is shared — integrate serially.
- ❌ Trusting "green" from an agent that secretly edited a shared file to make an integration test pass. Green is owned-unit-scoped for agents; integrated-green is the parent's job.
- ❌ Wall-clock / RNG builtins in the workflow script (breaks resume).
- ❌ Leaving the active task set at run end. `pauseActiveTask` before a human wait; `clearActiveTask` when the run finishes.
- ❌ Running this as an `Agent`-dispatched subagent — the `Workflow` tool is main-loop-only. Invoke this skill in the main session; call siblings via `Skill`.
- ❌ Estimating the parallel build time. Report measured wall time; say what isn't attributed.

## Quality checklist

- [ ] Slices are LEAF-level ready tasks with DISJOINT OWNED-file sets; wave bounded to ~min(16,cores-2); any deferred overflow `log()`-ed (Step 0).
- [ ] Invariant context read ONCE in the parent and passed to agents as data.
- [ ] Per-slice owned vs shared files classified; agents forbidden from shared files + all writes + setActiveTask; "green" scoped to owned unit tests, wiring-dependent tests deferred to the parent.
- [ ] Agents ran with `isolation: 'worktree'` and returned the SLICE_RESULT schema (a `git diff --cached` patch + ownedPaths + intents), not prose; the patch is the source of truth.
- [ ] No wall-clock/RNG builtins in the script; labels vary by taskId.
- [ ] `setActiveTask(<slice>)` set BEFORE integration (Step 3A) so heartbeats actually measure the integration+gate window.
- [ ] Ownership check ran before applying each patch; patch applied via `git apply --3way`; shared-file intents merged by the parent serially.
- [ ] PARTIAL/BLOCKED slices NOT marked completed; Step 6 re-planned against actual completions.
- [ ] Every gate (verification-loop, the slice's deferredTests, code-review, drift, defect-stats) ran on the INTEGRATED tree before completing each task (AC4).
- [ ] Parent drove active-task / status / insights; no agent wrote to tasktracker (AC1). `pauseActiveTask` before human waits; `clearActiveTask` at run end.
- [ ] Measured wall time reported; unattributed parallel-build compute disclosed, not estimated.
- [ ] On interruption, resumed via `resumeFromRunId`; already-completed slices' patches skipped at the working-tree level (Step 3C).
- [ ] tt-workflow-run / tt-workflow-audit / tt-implement-plan untouched (AC7 — this skill is additive).

## Resources

### references/
- `workflow-tasktracker-contract.md` — the shared contract every `tt-workflow-*` skill obeys (parent-owns-writes, read-only-or-worktree agents, locked body, no Date/RNG, R6 worktree intents, prod safety, MCP reachability). **Read it first.**

### Related skills
- `/tt-workflow-audit` — the read-only analyze sibling (same engine + contract).
- `/tt-workflow-run`, `/tt-implement-plan` — the SEQUENTIAL executors; use them for dependent/adaptive work.
- `/tt-implement-phase` — the per-phase executor; the dependent tail of a build hands off here.
- `/workflow-guide` — routes here when the work is parallel-build-at-scale with independent slices.
- `/verification-loop`, `/code-review` — the per-slice gates the parent runs.

## Key principles

1. **Parent owns every tasktracker write and every shared-file edit.** Agents build owned files in worktrees and return diffs + intents.
2. **Independence is by FILES, not just dependencies.** Disjoint owned sets are what make parallel integration conflict-free; collisions go to separate waves.
3. **Gates run on the integrated tree.** Isolation speeds the build; correctness is proven after integration, per slice, before completion.
4. **Scout inline, fan out, integrate + gate + track in the tail.** Hybrid orchestration; deterministic + resumable.
5. **Wave-parallel, sequential across waves.** Each wave unblocks the next; dependent work waits.
6. **Measure, don't estimate.** Report the parent-measured wall time; disclose what the parallel agents' time can't attribute.
