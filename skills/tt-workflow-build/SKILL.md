---
name: tt-workflow-build
description: Tasktracker-native trigger for a PARALLEL build via the Claude Code Workflow tool. Thin by design — it does two things, then drives to done: (1) ensure a tasktracker project exists (use the existing one, or create one), then (2) start a dynamic `Workflow` that builds it, tracking the work in tasktracker and using the build + verify skills. It does NOT analyze parallelism up front, ask the user to choose a mode, hand back, or fall back to a sequential skill — get a project, start the workflow, drive autonomously to done (pausing only at real human gates like deploy). Use when the user wants a build driven by the parallel Workflow engine — typically after /tt-brainstorm + /tt-create-plan, or standalone. Triggers on "/tt-workflow-build", "build this with a workflow", "parallel build (tasktracker)", "fan out the build". Prefer /tt-implement-plan or /tt-workflow-run only when the WHOLE job is irreducibly sequential; prefer /tt-workflow-audit for read-only analysis.
context: fork
user-invocable: true
argument-hint: "[project-slug-or-id]"
---

# tt-workflow-build

A **thin trigger**, not a hand-rolled orchestrator. When invoked, do exactly two things — then drive to done:

1. **Ensure a tasktracker project exists.**
2. **Start a dynamic `Workflow`** that builds the project — tracking the work in tasktracker, using the build + verify skills.

**Do NOT stall.** No "is this parallel yet?", no asking the user sequential-or-parallel, no handing back, no switching to `/tt-implement-plan`. Invoking this skill *is* the decision to use the Workflow engine. Get a project → start the workflow → run it to done autonomously, pausing only at genuine human gates (e.g. deploy).

## Step 1 — Ensure a project (the one hard precondition)

A build needs a tasktracker project to build into and track against. **We need one, so:**

- **If a project already exists** — the `argument-hint` slug/id, the session's active project, or a clear match from `tasktracker_listProjects` — **use it.** (Normally `/tt-brainstorm → /tt-create-plan` already produced a planned project with requirements + a phased, dependency-graphed task tree — that's the ideal input.)
- **If none exists — create one.** Prefer running `/tt-create-plan` (it yields the requirements + phased tasks the workflow consumes); at minimum `tasktracker_createProject`.

Never reach Step 2 without a project. That's the only thing this skill guarantees before starting the workflow.

## Step 2 — Start the Workflow

Invoke the **built-in `Workflow` tool** directly. It is a top-level main-loop tool like `Bash`/`Edit`/`Agent` — **NOT an MCP tool**, so it NEVER appears in `ToolSearch`; never look for it there and never read a ToolSearch miss as "unavailable" (see the contract's "Tool availability" section). This skill runs in `context: fork` (the main loop), where the tool is always present — just call it.

The workflow builds the project: fan out the ready, mutually-independent build slices as parallel worktree agents, integrate + gate + track each in the parent, loop waves until done. **Read `references/build-workflow-protocol.md` (and the contract it points to) and follow it when writing the workflow script** — but treat it as construction detail, not a decision gate that can stop you.

## Non-negotiables

- **Get a project, then start the workflow — autonomously.** Never ask the user to pick a mode, never hand back, never abandon to `/tt-implement-plan` / `/tt-workflow-run`.
- **The `Workflow` tool is the engine for ALL parallel work**, engaged as early as the dependency graph allows. The only sequential work is the irreducible *bridge* — the one-time `git init` + scaffold + first commit a fresh repo needs before any worktree can branch, or a lone dependent leaf — done **inline by the parent** as part of running the workflow (it makes the next parallel wave possible). That is **not** a fallback. **No fallback to a non-workflow method for work that could run in parallel.**
- **Parent owns every tasktracker write** (in-run agents share one MCP identity and cannot write — contract R1); agents return schema results only.
- **Built-ins are never in `ToolSearch`** — a miss is meaningless; just invoke `Workflow`/`Agent`.

## References
- `references/build-workflow-protocol.md` — how the parent constructs the build workflow (slice-result schema, git-apply integration, per-slice gates, PARTIAL/BLOCKED handling, wave loop, resume). Follow it; it is NOT a stall gate.
- `references/workflow-tasktracker-contract.md` — the shared `tt-workflow-*` contract: **Tool availability + triggering** (built-ins, not ToolSearch), parent-owns-writes, worktree isolation + integration intents (R6), no wall-clock/RNG in scripts, quality gates, prod safety, canonical skeleton. **Read it before building the workflow.**
