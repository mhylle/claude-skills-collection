---
name: workflow-guide
description: Recommend which workflow mode fits the task at hand — solo (implement-plan), small team (team-implement-plan with Implementer + Reviewer), or full team (team-implement-plan-full with parallel per-phase implementers + shared Reviewer). Factors in task complexity, risk, parallelism of the work, and token budget. Use when the user asks which workflow to pick, is unsure whether to go solo or team-based, mentions "which mode should I use", asks "solo or team for this", or is about to kick off execution without having chosen a mode. Triggers on "/workflow-guide", "which workflow mode", "solo or team", "pick a workflow".
context: fork
---

# Workflow Guide

A lightweight decision skill that recommends the appropriate workflow mode based on your task characteristics.

## Overview

The skills collection offers three parallel workflow modes. This guide helps you choose the right one by asking a few targeted questions about your task.

| Mode | Ideation | Planning | Implementation |
|------|----------|----------|---------------|
| **Solo** | `/brainstorm` | `/create-plan` | `/implement-plan` |
| **Small team** | `/team-brainstorm` | `/team-create-plan` | `/team-implement-plan` |
| **Full team** | `/team-brainstorm` | `/team-create-plan` | `/team-implement-plan-full` |

## Initial Response

When invoked, respond:

> "I'll help you pick the right workflow mode. Let me ask a few quick questions about your task."

## Assessment Questions

Ask these questions in order. After the user answers, you may have enough information to recommend immediately — do not ask unnecessary questions.

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

## Decision Matrix

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
