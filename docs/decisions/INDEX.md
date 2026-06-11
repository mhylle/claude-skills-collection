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
| [0007](./ADR-0007-model-tier-pinning-no-mid-task-switching.md) | Pin full model IDs per agent; fix cycles are fresh tasks on the same tier; no mid-task model switching | ship-issue skill, agent roster | 2026-06-11 |
| [0008](./ADR-0008-prompt-style-policy-by-tier.md) | Prompt style by tier: outcome-style (Fable 5), step-lists (Sonnet 4.6), TDD contract (Opus 4.8) | ship-issue skill, agent prompts | 2026-06-11 |
| [0009](./ADR-0009-single-orchestrator-file-run-state-polling-dashboard.md) | Single orchestrator skill, file-based run state, read-only polling dashboard | ship-issue skill, dashboard, run state | 2026-06-11 |

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

### Ship-Issue Pipeline
- [ADR-0007](./ADR-0007-model-tier-pinning-no-mid-task-switching.md): Full model-ID pinning per agent with fresh-task-same-tier fix cycles and no mid-task switching
- [ADR-0008](./ADR-0008-prompt-style-policy-by-tier.md): Per-tier prompt styles — outcome-style, prescriptive step-lists, TDD contract
- [ADR-0009](./ADR-0009-single-orchestrator-file-run-state-polling-dashboard.md): Single orchestrator, plain-file run state, read-only polling dashboard

### Authentication & Security
(none yet)

### Data & Storage
(none yet)

### API Design
(none yet)

### Infrastructure
(none yet)
