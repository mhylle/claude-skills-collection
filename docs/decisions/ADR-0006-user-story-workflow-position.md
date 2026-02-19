# ADR-0006: User Story Workflow Position

> **Quick Reference** | Status: Accepted | Date: 2026-02-17
> **Decision**: User stories sit upstream of create-plan, parallel to ADRs, after brainstorming.
> **Context**: Need to define where user stories fit in the brainstorm → plan → implement workflow.
> **Alternatives**: After create-plan (derived from plan), independent of create-plan
> **Impact**: user-story skill, create-plan skill, brainstorm skill, overall workflow

---

## Context

The existing workflow is `brainstorm → create-plan → implement-plan`. User stories introduce a requirements layer, but its position relative to existing skills affects how information flows through the pipeline.

## Decision

**We will position user stories upstream of create-plan, parallel to ADRs.**

Workflow becomes: `brainstorm → (ADRs + user stories) → create-plan → implement-plan`. User stories define *what* users need; create-plan defines *how* to build it.

## Alternatives Considered

| Option | Pros | Cons | Why Not |
|--------|------|------|---------|
| After create-plan | Plan informs stories | Stories become documentation, not requirements | Defeats purpose as input to planning |
| Independent | No coupling | No integration benefit; orphaned artifacts | Misses workflow synergy |

## Consequences

- **Positive**: Requirements are defined before technical planning; create-plan can consume stories as input
- **Negative**: Adds a step to the workflow (mitigated: skill is optional, not mandatory)
- **Requires**: create-plan should check for existing user stories; brainstorm output should suggest story creation

## Related

- [ADR-0005](./ADR-0005-shared-format-user-stories-create-plan.md): Format contract enabling the handoff
- [ADR-0001](./ADR-0001-separate-plan-spec-from-progress-tracking.md): Plan specification this feeds into
