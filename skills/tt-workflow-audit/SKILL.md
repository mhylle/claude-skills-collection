---
name: tt-workflow-audit
description: Tasktracker-native project-wide parallel audit using the Claude Code Workflow tool (dynamic workflows). Partitions a repo / backlog / architecture and fans out read-only agents (one per partition) that return schema-checked findings, aggregates them into a deduplicated, ranked risk register, and OPTIONALLY writes fixes back as tasks under a Bug Fix phase — with all tasktracker writes done by the PARENT, never the parallel agents (single global active-task pointer). Journaled and resumable, so a rate-limit or crash mid-audit resumes without re-running completed partitions. Use for large, embarrassingly-parallel, read/analyze-heavy jobs where each unit is self-contained and the output aggregates — audit every file/component for risk, find all architecture drift (scanArchitectureDrift) or duplicate tasks (detectDuplicates/auditDuplicates), per-file tech-debt sweep, test-coverage or security-surface scan across a whole project. Triggers on "/tt-workflow-audit", "audit the whole repo", "parallel audit", "scan every file/component", "find all drift/duplicates", "tech-debt sweep (tasktracker)", or any whole-project analyze-at-scale request inside a session with a tasktracker project. Prefer this over /codebase-audit or /code-quality-audit when the project is tracked in tasktracker AND you want the findings written back as tasks; prefer it over team-* modes when the units don't need to negotiate live (they just report).
context: fork
user-invocable: true
argument-hint: "[project-slug-or-id] [audit-mode]"
---

# tt-workflow-audit

A tasktracker-native, **Workflow-tool-backed** project-wide audit. It is the first concrete skill in the `tt-workflow-*` tier — the "parallel **and** tasktracker-correct" quadrant that neither the sequential `tt-*` skills nor the tasktracker-blind `team-*` skills covered.

The shape is a **hybrid**: the parent (this session) scouts and partitions inline, fans the analysis out through one `Workflow` run, then does all writes in the tail. The parallel agents only read and report.

## CRITICAL: the contract is non-negotiable

> **Read `references/workflow-tasktracker-contract.md` before running.** It is the shared contract for every `tt-workflow-*` skill, grounded in verified facts about the live system.

The one rule you cannot break:

```
The Workflow SCRIPT orchestrates.
Parallel agent() calls are READ/ANALYZE-ONLY and return schema output.
The PARENT (this main-loop session) performs ALL tasktracker writes — serially.
```

Why (verified): the active task is a **single process-global pointer**, parallel workflow agents **share one session id + one MCP process**, and the shared stdio MCP **cannot attribute a tool call to a specific agent**. So no agent may call `setActiveTask` or any write-gated tool — it would clobber the shared pointer and bill time to the wrong task. Reads are fine (gate-exempt and reachable in background runs, probe-verified).

| DO (parent) | DON'T |
|---|---|
| Read project-invariant context once, pass it down | Let agents re-fetch the same context N× |
| Partition the audit scope | Let agents call `setActiveTask` |
| Fan out read-only agents via `Workflow` | Let agents call `logDefect`/`updateTaskStatus`/`batchCreate*` |
| Aggregate findings → risk register | Edit a locked phase body |
| Write fixes back in the tail (with an active task set) | Write back destructively without a dry-run + confirmation |

## How this differs from the other audit skills

| | `/code-quality-audit` | `/codebase-audit`, `/adversarial-reviewer --codebase` | `/tt-workflow-audit` (this) |
|---|---|---|---|
| Engine | metrics tools | sequential / small Task fan-out | **Workflow tool** — deterministic parallel fan-out, journaled, resumable |
| Output | metrics report | written report / risk register | schema-checked risk register **+ optional tasktracker tasks** |
| Tasktracker | none | none | native — write-back as Bug-Fix-phase tasks, insight logging, all parent-owned |
| Resumes after crash/rate-limit | no | no | **yes** (completed partitions cached) |

Use this when the project is in tasktracker AND you want findings to become tracked work. Use the others for pure-report or metrics-only runs.

## When to use / when not

**Use it when** the job is large, embarrassingly parallel, read/analyze-heavy, with aggregable per-unit output: audit every file/component, find all architecture drift or duplicate tasks, a per-file tech-debt sweep, a coverage/security-surface scan.

**Don't use it when** the work is sequential or must branch on results mid-run (a deterministic script can't adapt mid-flight — use plain subagents), or when a few agents must debate live (use `/team-*`), or when the project isn't in tasktracker (use `/codebase-audit`).

## Workflow

### Step 0 — Locate the project + scope (parent, inline)

```
1. tasktracker_listProjects({search})  (or use the argument hint) → project id.
2. tasktracker_getProject({projectId}) → understand the project.
3. Decide the AUDIT MODE (argument or ask):
   - architecture-drift   → inputs from scanArchitectureDrift / listArchitectureComponents
   - duplicate-backlog    → detectDuplicates / auditDuplicates over the task tree
   - file-risk            → per-file tech-debt / complexity / smell sweep
   - coverage-gaps        → per-module test-coverage analysis
   - security-surface     → per-entrypoint security review
   - (compose modes if the user wants a full sweep)
```

### Step 1 — Read project-invariant context once + partition (parent, inline)

Read the things every agent would otherwise re-fetch (principles, architecture components, the task tree, the file list) **once**, in the parent, and pass them into the agents as data (contract R3). Then build the **partition list** — the unit of parallelism:

- file-risk → a list of files/dirs (glob the repo; group into balanced partitions).
- architecture-drift → the registered components.
- duplicate-backlog → the task tree (or sub-trees).
- coverage-gaps / security-surface → modules / entrypoints.

This is the discover-the-work-list scouting the Workflow tool docs call for: scope the partitions inline, *then* fan out.

### Step 2 — Fan out read-only analysis (the Workflow run)

Invoke the `Workflow` tool with a script that `parallel()`s (or `pipeline()`s) one **read-only** agent per partition, each returning schema-checked findings. The agent prompt MUST forbid `setActiveTask` and every write tool. Skeleton:

```js
export const meta = {
  name: 'tt-workflow-audit-run',
  description: 'Read-only parallel audit fan-out; parent does all tasktracker writes',
  phases: [{ title: 'Audit' }],
}

const FINDING = {
  type: 'object', additionalProperties: false,
  required: ['partition', 'findings'],
  properties: {
    partition: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'severity', 'location', 'detail'],
        properties: {
          title:    { type: 'string' },
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
          location: { type: 'string', description: 'file:line or component/task id' },
          detail:   { type: 'string' },
          suggestedFix: { type: 'string' },
        },
      },
    },
  },
}

phase('Audit')
// `args` carries {partitions, invariantContext} passed in by the parent.
const results = await parallel(
  args.partitions.map((p) => () =>
    agent(
      `Audit partition "${p.id}" of project ${args.projectName}. Mode: ${args.mode}.
Context (already read — do NOT re-fetch): ${JSON.stringify(args.invariantContext)}
Scope: ${JSON.stringify(p.scope)}
READ ONLY. Report findings against the schema. You MUST NOT call setActiveTask or ANY tasktracker write tool (no create/update/log/batch). Reads are fine.`,
      { label: `audit:${p.id}`, phase: 'Audit', schema: FINDING }
    )
  )
)
return { findings: results.filter(Boolean).flatMap((r) => r.findings) }
```

Pass `args` as real JSON (`{partitions, invariantContext, projectName, mode}`). For a write-heavy variant that edits code, add `isolation: 'worktree'` and have agents return `integrationIntents` (contract R6) — but a pure audit is read-only and needs no worktrees.

**No `Date.now()` / `Math.random()` / `new Date()` in the script** (contract R5). Vary agent labels by partition id, not RNG.

### Step 3 — Aggregate into a risk register (parent, plain code/reasoning)

Collect the workflow's return, **dedupe** (same file:line / same component) and **rank** by severity. This is ordinary parent-side work — not an agent, not a write.

### Step 4 — Present the register (parent)

Show the user the ranked register: counts by severity, the top findings with `location` + `suggestedFix`. If coverage was bounded (sampled, top-N), `log`/state what was dropped (contract R8) — never imply full coverage silently.

### Step 5 — Optional write-back (parent only, gated)

If the user wants findings tracked:

```
1. Confirm with the user (this writes to PRODUCTION).
2. Ensure a "Bug Fix" phase exists (or create one — createTask/createPhaseFromTemplate are planning-exempt).
3. tasktracker_setActiveTask(<Bug Fix phase or coordination task>)   ← parent owns the pointer
4. tasktracker_batchCreateTasks(register.map(toFixTask))             ← planning-exempt, atomic
5. For findings worth an insight: tasktracker_logDefect(...)         ← gated; needs the active task set in (3)
6. tasktracker_clearActiveTask()
```

**Dry-run/report mode is the default** for any first run; only create tasks after the user sees the register and confirms. Never `batchDelete*` from an audit.

### Resumability

The audit is journaled. If a run is interrupted (rate-limit, crash, network), **resume it** with `Workflow({scriptPath, resumeFromRunId})` — completed partitions return cached results; only the unfinished ones re-run. This is the main reason to prefer a workflow over a sequential audit for large scopes.

## Anti-patterns

- ❌ An agent calling `setActiveTask` or any write tool. Agents read and report; the parent writes.
- ❌ Each agent re-reading principles/architecture/the task tree. Read once in the parent, pass down.
- ❌ `Date.now()`/`Math.random()`/`new Date()` in the workflow script (breaks resume).
- ❌ Editing a locked phase body with findings. Route to a sub-task (parent) or a Bug-Fix-phase task.
- ❌ Creating fix tasks in prod before the user has seen the register and confirmed.
- ❌ Silently capping coverage (top-N / sampling) without saying so.
- ❌ Running this as an `Agent`-dispatched subagent — the `Workflow` tool is main-loop-only; invoke this skill in the main session.

## Quality checklist

- [ ] Project + audit mode resolved (Step 0).
- [ ] Project-invariant context read ONCE in the parent and passed into agents as data.
- [ ] Partition list built before the workflow runs.
- [ ] Every agent prompt forbids `setActiveTask` + all write tools; agents returned schema findings only.
- [ ] No `Date.now()`/RNG in the script; labels vary by partition id.
- [ ] Findings deduped + ranked into a risk register (parent-side).
- [ ] Bounded coverage (if any) disclosed, not silent.
- [ ] Write-back (if any) done by the parent with an active task set, after user confirmation; dry-run first.
- [ ] On interruption, resumed via `resumeFromRunId` rather than re-run from scratch.

## Resources

### references/
- `workflow-tasktracker-contract.md` — the shared contract every `tt-workflow-*` skill obeys (parent-owns-writes, read-only agents, locked body, no Date/RNG, worktree intents, prod safety, MCP reachability). **Read it first.**

### Related skills
- `/workflow-guide` — routes here when the work is analyze-at-scale (Question 0 = B).
- `/codebase-audit`, `/adversarial-reviewer --codebase`, `/code-quality-audit` — non-tasktracker / report-only audit alternatives.
- `/tt-create-plan`, `/tt-implement-plan` — where the fix tasks this audit creates get planned and executed.

## Key principles

1. **Parent owns every tasktracker write.** Agents read and report.
2. **Scout inline, fan out, write in the tail.** Hybrid orchestration.
3. **Read project-invariant context once.** Don't fan out N× identical reads.
4. **Deterministic, resumable.** Journaled run; resume on interruption.
5. **Disclose coverage.** No silent truncation.
6. **Write-back is gated.** Production writes only after the user sees the register and confirms.
