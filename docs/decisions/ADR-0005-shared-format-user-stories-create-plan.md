# ADR-0005: Shared Format Contract Between User Stories and Create-Plan

> **Quick Reference** | Status: Accepted | Date: 2026-02-17
> **Decision**: Task-level user stories share the same structure as create-plan phases (objective, tasks, exit conditions).
> **Context**: User stories feed into create-plan; a shared format eliminates manual translation between the two.
> **Alternatives**: Reference-only (manual mapping), auto-import (programmatic consumption)
> **Impact**: user-story skill, create-plan skill, shared reference file

---

## Context

Task-level user stories are the direct input to create-plan phases. Without a shared format, the transition from "what the user needs" (stories) to "how we build it" (plan) requires manual translation, creating friction and risking information loss.

## Decision

**We will use a shared format for task-level stories and create-plan phases.**

Both use the same structure: Objective, Tasks (tests first), and Exit Conditions (build/runtime/functional verification). User stories add Given/When/Then acceptance criteria on top of this shared base.

## Alternatives Considered

| Option | Pros | Cons | Why Not |
|--------|------|------|---------|
| Reference only | Loose coupling | Manual mapping; error-prone translation | Friction defeats the purpose |
| Auto-import | Zero translation | Tight coupling; fragile if formats drift | Over-engineering for current needs |

## Consequences

- **Positive**: Task stories map directly to plan phases; Given/When/Then becomes exit conditions
- **Negative**: Format changes must be coordinated across both skills
- **Requires**: A shared reference file (`skills/user-story/references/shared-format.md`) documenting the contract

## Related

- [ADR-0001](./ADR-0001-separate-plan-spec-from-progress-tracking.md): Plan specification format this builds on
- [ADR-0006](./ADR-0006-user-story-workflow-position.md): Where stories sit in the workflow
