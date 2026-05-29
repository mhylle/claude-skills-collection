# Workflow ↔ TaskTracker Contract

The non-negotiable rules for driving **tasktracker** from a Claude Code **dynamic workflow** (the `Workflow` tool — deterministic JS orchestrating tens-to-hundreds of background agents). Every `tt-workflow-*` skill obeys this contract. Read it before writing or running one.

> **One sentence:** the workflow *script* orchestrates, the *parent / main loop* performs **all** tasktracker writes, and parallel `agent()` calls are **read/analyze-only** and return schema-checked data the parent then writes — serially.

---

## Why this contract exists (verified facts, not style)

These were measured against the live system (`/home/mhylle/projects/mhylle.com/tasktracker`) and a live probe. They are the reason the rules below are hard, not preferences:

1. **The active task is a single PROCESS-GLOBAL pointer.** One file, `~/.config/tasktracker-mcp/active-task`, holds one task id (mirrored by a module singleton in `heartbeat.js`). It is **not** per-session. `CLAUDE_CODE_SESSION_ID` shards only the UI Session row, not this pointer.

2. **Writes are gated behind an active task.** The MCP rejects every non-read, non-planning write tool when no active task is set (`index.js` write-gate; backend `RequiresActiveTaskGuard`). Gated tools include `updateTaskStatus`, `batchUpdateStatus`/`batchUpdateTasks`/`batchDeleteTasks`, `logDefect`, `logFriction`, `recordBrainstormDecision`, `addAcceptanceCriterion`, `updateRequirement`, `completeWithCaveat`. **Exempt:** all reads, the planning creators (`createTask`/`batchCreateTasks`/`createPhaseFromTemplate`/`createRequirement`/`createArchitectureComponent`), and `logLearning` (housekeeping-allowlisted).

3. **Parallel workflow agents share ONE session and ONE MCP process** (probe-measured: 5/5 concurrent agents reported the *identical* `CLAUDE_CODE_SESSION_ID`, distinct PIDs but one parent). Consequences:
   - They all read/write the **same** global active-task pointer → if any calls `setActiveTask`, it clobbers the pointer for all of them and the heartbeat bills time to the wrong task.
   - The shared stdio MCP **cannot attribute a tool call to a specific agent** — calls carry no agent tag. So a per-agent map *inside* the MCP is not viable either.

4. **The MCP IS reachable from background workflow agents** (probe-measured: 5/5 loaded the tool schema via `ToolSearch` and a read-only `listProjects` succeeded on the first try, no prompt, no gate error). The "MCP may be absent on early bg turns" caveat applies to *interactively/OAuth-authenticated* connectors, **not** to an API-key stdio server like tasktracker. Reads work in bg; writes still need the active-task pointer the parent owns.

5. **The `Workflow` tool is main-loop-only.** It is not in any subagent's catalog, and `workflow()` nesting throws beyond one level. A `tt-workflow-*` skill must therefore run in the **main / `context: fork`** context — never as an `Agent`-dispatched subagent that then tries to spin up a workflow. Invoke sibling skills via the `Skill` tool (stays in the main loop), not via `Agent`.

6. **The MCP targets PRODUCTION** (`https://mhylle.com/api/tasktracker`, no localhost). Every write hits prod; `batchDeleteTasks` is atomic multi-delete.

---

## The rules

### R1 — Parent owns all state writes
`setActiveTask` / `pauseActiveTask` / `clearActiveTask` and **every write-gated tool** are called **only** by the parent (the main-loop orchestrator that ran the skill). The parent has the stable MCP connection and is the sole owner of the active-task pointer. Parallel `agent()` calls **never** touch the pointer or write status/insights/decisions.

### R2 — Agents are read/analyze-only and return schema
Each `agent()` call reads code/data, reasons, and returns a **schema-checked** result. Standard envelope fields a skill should collect and the parent then applies:

```
{
  findings:      [ ... ],          // the analysis payload
  filesChanged:  [ ... ],          // if the agent edited code (worktree mode)
  designNotes:   "…",              // routed to a sub-task by the parent, NEVER the phase body
  defects:       [ {severity, title, repro} ],   // parent calls logDefect
  learnings:     [ {category, text} ],           // parent calls logLearning
  frictions:     [ {category, text} ],           // parent calls logFriction
  integrationIntents: {newEntities, newProviders, newExports, migrationSpec}  // worktree mode
}
```
The agent prompt must explicitly forbid calling any tasktracker write tool and any `setActiveTask`.

### R3 — Reads are allowed from agents, but don't fan out N× identical reads
Reads are gate-exempt and reachable in bg. Still, prefer passing **already-read, project-invariant context** (principles, architecture, the task tree) *into* the agents as data rather than having each of N agents re-fetch it. Read once in the parent, pass down.

### R4 — Never edit a locked phase body
Once a phase has children its description is immutable (HTTP 422). Anything discovered mid-run goes to a **sub-task** the parent creates — never the phase body.

### R5 — No wall-clock / RNG in the workflow script
`Date.now()`, `new Date()`, and `Math.random()` are unavailable in workflow scripts (they break journaled resume). Inject timestamps/ids as `args`, stamp them after the workflow returns, or compute them inside an `agent()`. Vary per-agent prompts/labels by index, not by RNG.

### R6 — Worktree isolation for write-heavy fan-out; integration-intents for shared files
When agents mutate files in parallel, run them with `isolation: 'worktree'`. Classify files **owned** (feature-local, edited freely) vs **shared/barrel** (`backend/src/entities/index.ts`, `app.module.ts`, every `*.module.ts` provider array, the migrations dir, frontend barrels). Agents **never** edit shared files — they return `integrationIntents`, and the **parent applies them serially** to the real checkout. Worktree isolation is a guard, not a guarantee (recurring guard-bypass bug class) — the parent-owns-shared-files rule is the belt-and-suspenders. Note: tasktracker MCP is *user-scoped*, so it survives the worktree `cd`.

### R7 — Verify MCP presence before any bg write; keep write-back in the parent tail
For any unattended/bg run that writes back (e.g. `createFixTask` / `batchCreateTasks` under a Bug Fix phase), the parent first confirms the MCP is reachable, then sets an active task, then writes — serially, in the tail after the fan-out joins. Prefer the planning-exempt creators. For destructive ops (`batchDelete*`/`batchUpdate*`), run **dry-run/report mode first** and surface the planned mutation set; never destructively write from an unattended run without confirmation.

### R8 — Respect the shared token budget; never silently cap coverage
Concurrency is runtime-capped (~`min(16, cores-2)`); the token budget is shared across the main loop and all workflows. If the skill bounds coverage (top-N, sampling, no-retry), `log()` what was dropped — silent truncation reads as "covered everything" when it didn't.

---

## Canonical skeleton (parent-owns-writes)

```js
export const meta = {
  name: 'tt-workflow-<name>',
  description: '…',
  phases: [{ title: 'Analyze' }, { title: 'Write-back' }],
}

// PARENT (before the workflow): read project-invariant context ONCE, pass it down.
// Set the active task in the PARENT if write-back will happen.

phase('Analyze')
const FINDING = { type: 'object', additionalProperties: false, required: ['findings'], properties: { /* … */ } }

const results = await parallel(
  partitions.map((p) => () =>
    // READ-ONLY agent. Prompt MUST forbid setActiveTask + any write tool.
    agent(`Analyze partition ${p.id}. READ ONLY. Return findings as schema. Do NOT call any tasktracker write tool or setActiveTask.`,
      { label: `audit:${p.id}`, phase: 'Analyze', schema: FINDING })
  )
)

const register = dedupeAndRank(results.filter(Boolean).flatMap(r => r.findings))  // plain code in the script
return { register }   // hand back to the PARENT

// PARENT (after the workflow returns): the ONLY writer.
//   tasktracker_setActiveTask(<bug-fix-phase or coordination task>)
//   tasktracker_batchCreateTasks(register.map(toFixTask))   // planning-exempt
//   tasktracker_logDefect / logLearning for each (gated — needs the active task)
//   tasktracker_clearActiveTask()
```

---

## Decision rule — when a `tt-workflow-*` skill is the right tool

Use a **dynamic workflow** only when the work is **large, embarrassingly-parallel, read/analyze-heavy, with aggregable per-unit output, and benefits from deterministic resumable orchestration** (audits, per-file/-component findings, research fan-out, classifying a backlog). Use **Agent Teams** when a few agents must negotiate live (real adversarial debate). Use **plain subagents** for sequential/adaptive work where one orchestrator reads each result and adapts the next step — including the live-active-task-driven implement/fix loop, which a deterministic workflow cannot do mid-run.

See also (background memory): `reference-tasktracker-concurrency-model`, `reference-tasktracker-mcp-location`, `reference-workflow-tool-main-loop-only`, `project-concurrency-rearchitecture`. Once the work-lease registry (project `577a42ad`, phases 93–97) ships, parallel agents may hold their **own** server-issued leases and this "parent funnels all writes" rule relaxes for the lease-token REST path — until then it is absolute.
