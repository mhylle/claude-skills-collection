---
name: workflow-guide
description: Recommend which workflow mode fits the task at hand — solo (implement-plan), small team (team-implement-plan with Implementer + Reviewer), full team (team-implement-plan-full with parallel per-phase implementers + shared Reviewer), or a dynamic workflow (the Workflow tool — deterministic parallel fan-out across tens-to-hundreds of background agents for large read/analyze/audit/research jobs, e.g. /tt-workflow-audit). Factors in task complexity, risk, parallelism, work shape (analyze vs implement), and token budget. Use when the user asks which workflow to pick, is unsure whether to go solo or team-based, mentions "which mode should I use", asks "solo or team for this", "should I use a workflow", "parallel audit", or is about to kick off execution without having chosen a mode. Triggers on "/workflow-guide", "which workflow mode", "solo or team", "pick a workflow", "dynamic workflow or team".
---

# Workflow Guide

A lightweight decision skill that recommends the appropriate workflow mode based on your task characteristics.

## Overview

The skills collection offers three **team-shaped** workflow modes for the ideation → planning → implementation pipeline, plus a fourth **dynamic-workflow** lane on a different axis (deterministic parallel fan-out for analyze/audit/research work).

| Mode | Ideation | Planning | Implementation | Best for |
|------|----------|----------|---------------|----------|
| **Solo** | `/brainstorm` | `/create-plan` | `/implement-plan` | Sequential, focused work |
| **Small team** | `/team-brainstorm` | `/team-create-plan` | `/team-implement-plan` | Adversarial review, moderate scope |
| **Full team** | `/team-brainstorm` | `/team-create-plan` | `/team-implement-plan-full` | Parallel phases + live cross-phase review |
| **Dynamic workflow** | — | — | `/tt-workflow-audit` (and future `tt-workflow-*`) | Large, parallel, read/analyze/audit/research fan-out with aggregable output |

**The first three vary on the same axis** (scope × stakes × parallelism, for *implementing a plan*). **Dynamic workflow is a different axis** — it's about *work shape*: a job that is embarrassingly parallel, mostly read/analyze, with aggregable per-unit output, and benefits from deterministic resumable orchestration. Decide work shape FIRST (Question 0), then — if it's an implement-the-plan job — pick solo/small/full team.

> **Hit a problem with TaskTracker itself while working?** If an MCP tool misbehaves, a workflow rule is confusing, or a capability is missing, report it upstream with `tasktracker_reportToTaskTracker({type:'defect'|'improvement', title, body})` — it files into the central TaskTracker system project (the continual-correction loop), not your own backlog. This is orthogonal to mode selection; do it whenever the friction is about the tooling, not your project.

## Initial Response

When invoked, respond:

> "I'll help you pick the right workflow mode. Let me ask a few quick questions about your task."

## Assessment Questions

Ask these questions in order. After the user answers, you may have enough information to recommend immediately — do not ask unnecessary questions.

### Question 0: Work shape (ask first)

> "Is this about *building/changing* something (implement a plan), or *analyzing across many units* (audit, research, classify a backlog, scan every file/component)?"
>
> - **A) Implement** — write/change code toward a goal → continue to Question 1 (solo / small / full team).
> - **B) Analyze-at-scale** — a large, parallel, read/analyze-heavy job with aggregable per-unit output (audit the whole repo, find all duplicates/drift, research N sources, generate per-phase briefs) → **Dynamic Workflow** (skip Q1–Q3). For tasktracker projects, route to `/tt-workflow-audit` (or another `tt-workflow-*`).

If B, recommend Dynamic Workflow and read the **caveats** below before kicking it off. If A, proceed:

### Question 1: Scope

> "How would you describe the scope of this work?"
>
> - **A) Small** — A single feature, bug fix, or focused change (1-2 files, clear requirements)
> - **B) Moderate** — Multiple related changes across several files (3-10 files, some design decisions needed)
> - **C) Large** — A system-level change, new subsystem, or multi-phase project (10+ files, architectural decisions required)

### Question 2: Stakes

> "How critical is quality for this change?"
>
> - **A) Low** — Internal tooling, prototype, or experiment. Speed matters more than perfection
> - **B) Medium** — Production code, but well-tested area. Standard quality expectations
> - **C) High** — Security-sensitive, user-facing, or high-risk area. Adversarial review needed

### Question 3: Parallelism Potential

Only ask this if Scope is Moderate or Large:

> "Can parts of this work be done independently and in parallel?"
>
> - **A) No** — Each step depends on the previous one
> - **B) Somewhat** — Some parts are independent, but there are key dependencies
> - **C) Yes** — Multiple phases could proceed simultaneously with clear boundaries

## Recommendation Logic

Use the answers to recommend a mode:

### Solo Mode

**Recommend when:**
- Scope is Small (regardless of other answers)
- Scope is Moderate AND Stakes are Low
- Scope is Moderate AND Parallelism is No

**Why:** Minimal overhead, fastest for focused work. The orchestrator + subagent pattern handles sequential implementation efficiently.

**Token cost:** ~30-40K per phase

### Small Team Mode

**Recommend when:**
- Scope is Moderate AND Stakes are Medium or High
- Scope is Moderate AND Parallelism is Somewhat
- Scope is Large AND Parallelism is No
- Scope is Large AND Stakes are Medium (and phases are sequential)

**Why:** Adds adversarial review without the overhead of parallel execution. The Implementer/Reviewer dynamic catches issues that automated checks miss.

**Token cost:** ~60-80K per phase

### Full Team Mode

**Recommend when:**
- Scope is Large AND Parallelism is Somewhat or Yes
- Scope is Large AND Stakes are High
- Any combination where the plan has 4+ phases with independent work streams

**Why:** Parallel execution across phases with cross-phase review. Worth the coordination cost when you have genuinely independent work streams.

**Token cost:** ~100-150K per wave

### Dynamic Workflow Mode (mechanism C — the Workflow tool)

**How it's triggered (read first):** the `Workflow` tool is a top-level **BUILT-IN** of the main loop (like `Bash`/`Edit`/`Agent`), **not** an MCP tool — it NEVER appears in `ToolSearch`, so never look for it there and never read a ToolSearch miss as "unavailable" (that false negative is the bug this note exists to prevent). Two launch paths: (1) **DIRECT** — a `tt-workflow-*` skill invokes the built-in `Workflow` tool directly, or the user asks in plain language ("create a workflow"); the `tt-workflow-*` skills are a convenience wrapper over the same built-in, not the only entry point. (2) **ultracode** (effort menu → xhigh) lets Claude auto-decide. The first run shows a confirmation gate; dynamic workflows cost meaningfully more tokens.

**Recommend when (from Question 0 = B):**
- The job is large, **embarrassingly parallel**, and **read/analyze-heavy** with **aggregable per-unit output** — audit every file/component, find all duplicates or architecture drift, research N sources, generate per-phase briefs, classify a backlog.
- You want **deterministic, resumable** orchestration over tens-to-hundreds of units, governed by a shared token budget, that survives a crash/rate-limit and resumes without re-running completed units.

**Why:** code-driven (not model-driven) fan-out with schema-checked per-agent output and journaled resume — strictly better than Agent Teams for throughput when units don't need to negotiate live. For tasktracker projects, use `/tt-workflow-audit` (more `tt-workflow-*` skills as they land).

**Don't use it for:** sequential dependent work, anything that must branch on results mid-run (a deterministic script can't), or live debate between a few agents (that's **Full/Small Team**). The *parallel-write* implement variant waits on the work-lease registry — until then, write-heavy parallel implementation stays **Full Team**.

**Token cost:** scales with fan-out; governed by the shared token budget (set a target like `+500k` to bound it).

**⚠️ TaskTracker caveats (read before running):** the workflow *script* orchestrates and the *parent / main loop* performs **all** tasktracker writes — parallel agents are **read-only** and return schema output the parent applies serially (single global active-task pointer; agents can't each hold one). Background workflow agents **can** reach the tasktracker MCP (API-key stdio, probe-verified) but **must not** call `setActiveTask` or any write tool. Full rules: **`~/.claude/skills/tt-workflow-audit/references/workflow-tasktracker-contract.md`**.

## Decision Matrix

> First apply **Question 0**: if the work is analyze-at-scale (audit / research / classify / scan-everything), recommend **Dynamic Workflow** (`/tt-workflow-audit`) and skip this matrix. The matrix below is for *implement-the-plan* work only.

| Scope | Stakes | Parallelism | Recommendation |
|-------|--------|-------------|---------------|
| Small | Any | N/A | **Solo** |
| Moderate | Low | Any | **Solo** |
| Moderate | Medium | No | **Solo** |
| Moderate | Medium | Somewhat/Yes | **Small Team** |
| Moderate | High | Any | **Small Team** |
| Large | Low | No | **Solo** |
| Large | Low | Somewhat/Yes | **Small Team** |
| Large | Medium | No | **Small Team** |
| Large | Medium | Somewhat/Yes | **Full Team** |
| Large | High | No | **Small Team** |
| Large | High | Somewhat/Yes | **Full Team** |

## Output Format

After assessment, present the recommendation:

```
## Recommendation: [Mode Name]

**Your answers:** Scope: [answer] | Stakes: [answer] | Parallelism: [answer]

### Why this mode?
[1-2 sentences explaining the fit]

### What to do next

| Stage | Command |
|-------|---------|
| Ideation (if needed) | `/{command}` |
| Planning | `/{command}` |
| Implementation | `/{command}` |

### Alternative to consider
[If the recommendation is borderline, mention the adjacent mode and when to switch]
```

## Examples

### Example 1: Small bug fix

> **User:** "I need to fix a date formatting bug in the dashboard."
>
> **Assessment:** Scope: Small. No further questions needed.
>
> **Recommendation:** Solo mode. Use `/create-plan` then `/implement-plan`.

### Example 2: New authentication system

> **User:** "I want to add OAuth2 support with Google and GitHub providers."
>
> **Assessment:** Scope: Large (new subsystem, multiple integration points). Stakes: High (security-sensitive). Parallelism: Somewhat (Google and GitHub providers are independent, but share auth infrastructure).
>
> **Recommendation:** Full Team mode. Use `/team-brainstorm` to explore the design, `/team-create-plan` for adversarial planning, `/team-implement-plan-full` for parallel provider implementation with shared review.

### Example 3: Refactoring a module

> **User:** "I want to refactor the data processing module to use the new streaming API."
>
> **Assessment:** Scope: Moderate (multiple files, design decisions). Stakes: Medium (production code). Parallelism: No (sequential refactoring).
>
> **Recommendation:** Solo mode. The refactoring is sequential by nature. Use `/create-plan` then `/implement-plan`. Consider Small Team if you want adversarial review of the refactoring approach during planning (`/team-create-plan`).

### Example 4: Audit an inherited codebase

> **User:** "I need to find all the architecture drift, duplicate tasks, and risky modules across this whole repo."
>
> **Assessment:** Question 0 = B (analyze-at-scale) — embarrassingly parallel, read/analyze-heavy, aggregable per-unit output, large scope.
>
> **Recommendation:** Dynamic Workflow. Use `/tt-workflow-audit` — it partitions the repo/backlog/components, fans out one read-only agent per partition, aggregates a risk register, and (with your OK) writes fix tasks back under a Bug Fix phase **from the parent**. Resumable if it's interrupted. No team mode needed — the units don't negotiate, they just report.
