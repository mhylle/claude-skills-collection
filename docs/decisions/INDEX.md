# Architectural Decision Records

Quick reference index for all architectural decisions. Read this file first to identify relevant ADRs.

## Active Decisions

| ADR | Decision | Impact | Date |
|-----|----------|--------|------|
| [0001](./ADR-0001-separate-plan-spec-from-progress-tracking.md) | Use Task tools for progress tracking; plans become pure specification | create-plan, implement-plan, implement-phase | 2026-01-23 |
| [0002](./ADR-0002-modular-verification-skills.md) | Add verification/quality skills as modular, independently-invocable components | implement-phase, new skills, install.sh | 2026-01-24 |
| [0003](./ADR-0003-user-story-file-organization.md) | One file per epic with central INDEX.md for user stories | user-story skill, docs/user-stories/ | 2026-02-17 |
| [0004](./ADR-0004-hierarchical-story-numbering.md) | Hierarchical IDs (EPIC-01.F-01.T-01) for user stories | user-story skill, create-plan integration | 2026-02-17 |
| [0005](./ADR-0005-shared-format-user-stories-create-plan.md) | Task-level stories share structure with create-plan phases | user-story skill, create-plan skill | 2026-02-17 |
| [0006](./ADR-0006-user-story-workflow-position.md) | User stories upstream of create-plan, parallel to ADRs | user-story, create-plan, brainstorm, workflow | 2026-02-17 |

## Superseded Decisions

| ADR | Was | Replaced By | Date |
|-----|-----|-------------|------|
| (none) | | | |

## By Category

### Workflow & Planning
- [ADR-0001](./ADR-0001-separate-plan-spec-from-progress-tracking.md): Separate plan specification from progress tracking
- [ADR-0002](./ADR-0002-modular-verification-skills.md): Modular verification and quality skills
- [ADR-0006](./ADR-0006-user-story-workflow-position.md): User stories upstream of create-plan, parallel to ADRs

### User Stories
- [ADR-0003](./ADR-0003-user-story-file-organization.md): One file per epic with central INDEX.md
- [ADR-0004](./ADR-0004-hierarchical-story-numbering.md): Hierarchical numbering (EPIC-01.F-01.T-01)
- [ADR-0005](./ADR-0005-shared-format-user-stories-create-plan.md): Shared format contract with create-plan

### Authentication & Security
(none yet)

### Data & Storage
(none yet)

### API Design
(none yet)

### Infrastructure
(none yet)
