# ADR-0001: Separate Plan Specification from Progress Tracking

> **Quick Reference** | Status: Accepted | Date: 2026-01-23
> **Decision**: Use Task tools for progress tracking; plans become pure specification documents.
> **Context**: Current plans mix spec and status via checkboxes, causing duplication and no cross-session persistence.
> **Alternatives**: Keep checkbox-based tracking, hybrid approach with both systems
> **Impact**: create-plan, implement-plan, implement-phase, plan-format.md

---

## Context

The plan workflow (create-plan, implement-plan, implement-phase) currently uses markdown checkboxes (`- [ ]` / `- [x]`) for both task specification and progress tracking. This creates duplication between plan files and TodoWrite, lacks cross-session persistence, and prevents dependency-based execution ordering.

## Decision

**We will use Claude Code's Task tools for progress tracking while plans become pure specification documents.**

Plans define WHAT to build (phases, work items, exit conditions). Tasks track progress toward completion (status, dependencies, ownership).

## Alternatives Considered

| Option | Pros | Cons | Why Not |
|--------|------|------|---------|
| Keep checkboxes | No changes needed | No persistence, no dependencies, parsing required | Status quo problems persist |
| Hybrid approach | Backward compatible | Duplication, complexity, two sources of truth | Violates single responsibility |

## Consequences

- **Positive**: Cross-session persistence, native dependency tracking, cleaner plan files, multi-agent coordination
- **Negative**: Existing checkbox-based plans will not work (clean break chosen over backward compatibility)
- **Requires**: Coordinated update of plan-format.md, create-plan, implement-plan, and implement-phase skills

## Related

- See `docs/brainstorms/2026-01-23-task-tools-skill-integration.md` for detailed analysis
- See `docs/brainstorms/2026-01-23-task-tools-workflow-integration.md` for Task tool API research
