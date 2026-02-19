# ADR-0003: User Story File Organization

> **Quick Reference** | Status: Accepted | Date: 2026-02-17
> **Decision**: Organize user stories as one file per epic with a central INDEX.md for discoverability.
> **Context**: Need a file structure for hierarchical user stories (epic/feature/task) that stays scannable.
> **Alternatives**: Single file per invocation, separate files per level
> **Impact**: user-story skill, docs/user-stories/ directory

---

## Context

The user-story skill produces hierarchical output (epics → features → tasks). A file organization strategy is needed that balances discoverability, file size, and the existing convention established by ADRs (INDEX.md + individual files).

## Decision

**We will use one file per epic with a central INDEX.md.**

Each epic gets its own file at `docs/user-stories/EPIC-NN-slug.md` containing its full feature and task hierarchy. An `INDEX.md` provides a master overview of all epics.

## Alternatives Considered

| Option | Pros | Cons | Why Not |
|--------|------|------|---------|
| Single file per invocation | Simple, one output | Grows large with hierarchy, hard to scan | Violates small-file convention |
| Separate files per level | Maximum granularity | File explosion (dozens of files per epic) | Too fragmented, hard to navigate |

## Consequences

- **Positive**: Follows proven ADR INDEX pattern; each file is one cohesive concern (one epic)
- **Negative**: Epic files may grow if many features/tasks exist (mitigated by recommending max 5 features per epic)
- **Requires**: INDEX.md template and epic file template in skill references

## Related

- [ADR-0004](./ADR-0004-hierarchical-story-numbering.md): Numbering scheme used within epic files
