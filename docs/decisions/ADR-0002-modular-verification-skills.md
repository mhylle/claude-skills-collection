# ADR-0002: Modular Verification and Quality Skills

> **Quick Reference** | Status: Accepted | Date: 2026-01-24
> **Decision**: Add verification and quality skills as modular, independently-invocable components.
> **Context**: Enhancing skill system with security, verification, learning, and eval capabilities.
> **Alternatives**: Monolithic verification skill combining all checks
> **Impact**: implement-phase, new skills directory, install.sh

---

## Context

The skill system needs enhancement with security review, verification loops, continuous learning, strategic compaction, eval harness, and TDD mode capabilities (inspired by everything-claude-code repo). These can be added as one monolithic skill or as separate modular components.

## Decision

**We will implement each enhancement as a standalone, modular skill.**

Each skill will be independently invocable and optionally integrated into implement-phase as additional pipeline steps.

## Alternatives Considered

| Option | Pros | Cons | Why Not |
|--------|------|------|---------|
| Monolithic skill | Single invocation, unified reporting | Less flexible, harder to maintain, can't use pieces independently | Violates single responsibility, limits adoption patterns |
| Modular skills | Maximum flexibility, independent testability, incremental adoption | More files to maintain | Selected - benefits outweigh maintenance cost |

## Consequences

- **Positive**: Skills can be used independently, composed together, or integrated into pipelines
- **Positive**: Non-breaking changes to existing workflow; users adopt incrementally
- **Negative**: More skill files to maintain (6 new skills)
- **Requires**: Update implement-phase to support optional skill steps; update install.sh

## Related

- [ADR-0001](./ADR-0001-separate-plan-spec-from-progress-tracking.md): Task tools integration affects how skills track progress
