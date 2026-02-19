# ADR-0004: Hierarchical Story Numbering Scheme

> **Quick Reference** | Status: Accepted | Date: 2026-02-17
> **Decision**: Use hierarchical IDs (EPIC-01.F-01.T-01) for user stories at all levels.
> **Context**: Need a numbering scheme that conveys parent-child relationships across epic/feature/task levels.
> **Alternatives**: Flat sequential (US-001), slug-based (user-auth-login)
> **Impact**: user-story skill, create-plan integration, story cross-references

---

## Context

User stories exist at three levels (epic, feature, task). A numbering scheme must convey hierarchy, enable referencing at any level, and work naturally with the one-file-per-epic organization.

## Decision

**We will use hierarchical IDs: `EPIC-NN`, `EPIC-NN.F-NN`, `EPIC-NN.F-NN.T-NN`.**

Examples: `EPIC-01`, `EPIC-01.F-03`, `EPIC-01.F-03.T-02`. Each level appends to the parent ID.

## Alternatives Considered

| Option | Pros | Cons | Why Not |
|--------|------|------|---------|
| Flat sequential (US-001) | Simple | No hierarchy visible; ambiguous level | Can't tell epic from task |
| Slug-based (user-auth-login) | Readable | No ordering; verbose; hard to cross-reference | Doesn't scale; inconsistent naming |

## Consequences

- **Positive**: Parent-child relationships visible at a glance; enables referencing at any level
- **Negative**: IDs become longer at task level (manageable at 3 levels deep)
- **Requires**: Consistent use across epic files and INDEX.md

## Related

- [ADR-0003](./ADR-0003-user-story-file-organization.md): File structure these IDs live within
