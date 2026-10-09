# Workflow Modes Guide

Run `/workflow-guide` to get a recommendation for your task — it holds the decision table (TaskTracker or file-based first, then the shape of the work). This page summarises the lanes it chooses between.

## Lanes

| Lane | Commands | For |
|------|----------|-----|
| File-based pipeline | `/brainstorm` → `/create-plan` → `/implement-plan` | Projects not tracked in TaskTracker; plans live in `docs/plans/` |
| TaskTracker pipeline | `/brainstorm` → `/tt-create-plan` → `/tt-implement-plan` | Projects tracked in TaskTracker, run phase by phase |
| Autonomous run | `/tt-workflow-run` | Draining a TaskTracker backlog with per-slice gates and measured time |
| Unattended loop | `/tt-create-build-loop`, then `/loop` | A TaskTracker project that keeps building while you are away |
| Parallel build | `/tt-workflow-build` | Many independent pieces of a TaskTracker project built at once |
| Parallel audit | `/tt-workflow-audit` | Read-only analysis at scale of a TaskTracker project (`/codebase-audit` for untracked repos) |
| Issue to merge | `/ship-issue <issue>` | One GitHub issue to a merged PR, with two human gates (manual-only) |

Skip brainstorming when the requirement is already clear:

```
/create-plan "Fix date formatting in dashboard"
/implement-plan docs/plans/2026-02-07-date-fix.md
```

## Parallel lanes

`/tt-workflow-build` and `/tt-workflow-audit` use the Claude Code `Workflow` tool when it is enabled (`/config` → "Dynamic workflows") and fall back to parallel subagents when it is not. They pay off when the units are independent and their results merge cleanly afterwards; work where each step depends on the last belongs in a sequential lane.

## Review Escalation: `/adversarial-reviewer`

Available in every lane. Use it as an opt-in escalation when automated `code-review` came back clean but you want a second-opinion hostile pass before merging. The skill spawns three isolated-context subagent personas (Saboteur, New Hire, Security Auditor) in parallel — each must surface at least one issue, and findings caught by 2+ personas are promoted one severity level.

Reach for it whenever `code-review` passed suspiciously easily, before merging a self-authored PR with no human reviewer, or after a long session when fatigue is likely. Run it against the final integrated branch rather than per phase.

Token cost is ~15-25K per invocation in diff mode (three persona subagents plus synthesis). Cheap insurance before a merge.

**Codebase mode** (`/adversarial-reviewer --codebase [path]`) is a separate beast: whole-repo audit where each persona strategically deep-reads 5-10 files chosen by its own lens rather than exhausting the codebase. Use for onboarding audits, inherited-repo assessments, and periodic tech-debt checks — not as a pre-merge gate. Produces a HIGH-RISK / MEDIUM-RISK / LOW-RISK verdict (distinct from merge-decision BLOCK/CONCERNS/CLEAN). Token cost scales with repo size during the mapping step; expect ~40-80K for a typical ~300-file repo.

**Full-coverage audit** (`/codebase-audit [path]`) is a different skill that **delegates** to adversarial-reviewer. Where `--codebase` strategically samples in one pass, `codebase-audit` partitions the repo and runs a sampled adversarial review per-partition, then synthesizes systemic findings across partitions into a written report. Use for onboarding audits of inherited repos, due diligence, and periodic comprehensive tech-debt reviews. Expect 200K-500K tokens for ~500 files and explicit user approval at the partition-plan checkpoint before the spend starts. Resumable from crashes. Produces `docs/audits/.../REPORT.md`.
