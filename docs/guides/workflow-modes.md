# Workflow Modes Guide

Three parallel execution modes let you choose the right balance of depth, speed, and cost.

## Mode Overview

| Mode | Ideation | Planning | Implementation |
|------|----------|----------|---------------|
| **Solo** | `/brainstorm` | `/create-plan` | `/implement-plan` |
| **Small Team** | `/team-brainstorm` | `/team-create-plan` | `/team-implement-plan` |
| **Full Team** | `/team-brainstorm` | `/team-create-plan` | `/team-implement-plan-full` |

Mix and match freely. Use `/team-brainstorm` then `/create-plan` then `/implement-plan` — any combination works.

Use `/workflow-guide` to get a recommendation based on your task.

## When to Use Each Mode

### Solo Mode (Default)

**Best for:** Quick features, bug fixes, clear requirements, sequential work.

| Stage | How It Works | Token Cost |
|-------|-------------|------------|
| `/brainstorm` | Single agent applies Six Thinking Hats, SCAMPER, Premortem | ~8-12K |
| `/create-plan` | Single agent researches codebase, proposes design, writes plan | ~15-20K |
| `/implement-plan` | Orchestrator delegates to implement-phase subagents | ~30-40K/phase |

**Choose when:**
- Requirements are clear
- 1-3 phases, straightforward implementation
- Speed and token efficiency matter most
- The task follows established patterns

### Small Team Mode

**Best for:** Quality-sensitive work, moderate complexity, when adversarial review matters.

| Stage | How It Works | Token Cost |
|-------|-------------|------------|
| `/team-brainstorm` | 4 teammates debate: Devil's Advocate, Optimist, Creative Explorer, Researcher | ~25-40K |
| `/team-create-plan` | 3 teammates: Architect proposes, Risk Analyst challenges, Researcher validates | ~40-60K |
| `/team-implement-plan` | Implementer writes code, Reviewer independently verifies quality per phase | ~60-80K/phase |

**Choose when:**
- Multiple valid design approaches exist
- Quality and correctness matter more than speed
- The plan has 3-5 phases
- You want real adversarial review, not just automated checks

### Full Team Mode

**Best for:** Large, parallelizable work with independent modules.

| Stage | How It Works | Token Cost |
|-------|-------------|------------|
| `/team-brainstorm` | Same as Small Team | ~25-40K |
| `/team-create-plan` | Same as Small Team | ~40-60K |
| `/team-implement-plan-full` | Per-phase implementers run in parallel waves, shared cross-phase Reviewer | ~100-150K/wave |

**Choose when:**
- Plan has 4+ phases with independent work streams
- Multiple phases can execute in parallel (no code dependencies)
- Speed of execution is worth the token cost
- The feature spans multiple modules/layers

## Decision Matrix

| Scope | Stakes | Parallelism | Recommendation |
|-------|--------|-------------|---------------|
| Small | Any | N/A | **Solo** |
| Moderate | Low | Any | **Solo** |
| Moderate | Medium | No | **Solo** |
| Moderate | Medium | Yes | **Small Team** |
| Moderate | High | Any | **Small Team** |
| Large | Low | No | **Solo** |
| Large | Low | Yes | **Small Team** |
| Large | Medium | No | **Small Team** |
| Large | Medium | Yes | **Full Team** |
| Large | High | No | **Small Team** |
| Large | High | Yes | **Full Team** |

## Token Cost Comparison

For a typical 4-phase plan:

| Mode | Brainstorm | Planning | Implementation | Total |
|------|-----------|----------|---------------|-------|
| Solo | 10K | 18K | 140K (4 × 35K) | ~168K |
| Small Team | 32K | 50K | 280K (4 × 70K) | ~362K |
| Full Team | 32K | 50K | 300K (2 waves × 150K) | ~382K |

Full Team is only marginally more expensive than Small Team for total tokens, but significantly faster when phases can run in parallel.

## Prerequisites

Agent teams require the experimental feature flag:

```json
// ~/.claude/settings.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Solo mode works without any special configuration.

## Examples

### Example 1: Simple Bug Fix

```
/create-plan "Fix date formatting in dashboard"
/implement-plan docs/plans/2026-02-07-date-fix.md
```

Solo mode. No team needed for a focused fix.

### Example 2: New Feature with Trade-offs

```
/team-brainstorm "Add OAuth2 with Google and GitHub"
/team-create-plan docs/brainstorms/2026-02-07-oauth2-team.md
/team-implement-plan docs/plans/2026-02-07-oauth2.md
```

Small team throughout. Adversarial brainstorm explores trade-offs, team planning produces robust design, team implementation catches quality issues.

### Example 3: Large Parallel Feature

```
/team-brainstorm "Build notification system (email, push, in-app)"
/team-create-plan docs/brainstorms/2026-02-07-notifications-team.md
/team-implement-plan-full docs/plans/2026-02-07-notifications.md
```

Full team for implementation. Email, push, and in-app channels can be built in parallel as separate phases, then integrated.

### Example 4: Hybrid Approach

```
/team-brainstorm "Redesign data pipeline"
/create-plan  # Solo planning — the brainstorm already clarified the design
/team-implement-plan docs/plans/2026-02-07-pipeline.md  # Team for quality
```

Mix modes based on where you need depth.

## Review Escalation: `/adversarial-reviewer`

Available in all three modes. Use it as an opt-in escalation when automated `code-review` came back clean but you want a second-opinion hostile pass before merging. The skill spawns three isolated-context subagent personas (Saboteur, New Hire, Security Auditor) in parallel — each must surface at least one issue, and findings caught by 2+ personas are promoted one severity level.

When to reach for it per mode:

| Mode | When to add adversarial review |
|------|-------------------------------|
| Solo | Whenever `code-review` passed suspiciously easily, before merging a self-authored PR with no human reviewer, or after a long session when fatigue is likely. |
| Small Team | Already has an adversarial Reviewer per phase; add this pre-merge as a final sanity check on the accumulated diff rather than per-phase. |
| Full Team | Same as Small Team — use it against the final integrated branch, not per-wave. |

Token cost is ~15-25K per invocation in diff mode (three persona subagents plus synthesis). Cheap insurance before a merge.

**Codebase mode** (`/adversarial-reviewer --codebase [path]`) is a separate beast: whole-repo audit where each persona strategically deep-reads 5-10 files chosen by its own lens rather than exhausting the codebase. Use for onboarding audits, inherited-repo assessments, and periodic tech-debt checks — not as a pre-merge gate. Produces a HIGH-RISK / MEDIUM-RISK / LOW-RISK verdict (distinct from merge-decision BLOCK/CONCERNS/CLEAN). Token cost scales with repo size during the mapping step; expect ~40-80K for a typical ~300-file repo.

**Full-coverage audit** (`/codebase-audit [path]`) is a different skill that **delegates** to adversarial-reviewer. Where `--codebase` strategically samples in one pass, `codebase-audit` partitions the repo and runs a sampled adversarial review per-partition, then synthesizes systemic findings across partitions into a written report. Use for onboarding audits of inherited repos, due diligence, and periodic comprehensive tech-debt reviews. Expect 200K-500K tokens for ~500 files and explicit user approval at the partition-plan checkpoint before the spend starts. Resumable from crashes. Produces `docs/audits/.../REPORT.md`.
