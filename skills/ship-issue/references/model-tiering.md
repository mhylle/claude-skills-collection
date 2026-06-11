# Model Tiering

Authoritative model assignments for the ship-issue pipeline. Every agent in this pipeline runs on a pinned model. This document is the single source of truth for which agent runs on which model and why.

## Tier Table

| Agent / Role | Pinned Model ID | Tier Rationale |
|--------------|-----------------|----------------|
| issue-planner | `claude-fable-5` | Plan synthesis requires deep reasoning over an issue, its codebase context, and acceptance-criteria design. Frontier judgment quality directly determines everything downstream. |
| merge-gate-reviewer | `claude-fable-5` | Reviewing a full PR diff for correctness, design, and merge-worthiness is the highest-judgment task in the pipeline. The APPROVE/FIX verdict gates the merge. |
| orchestrator skill | Fable 5 main session | Not an agent file — the `/ship-issue` skill runs in the user's main Claude Code session, which is Fable 5. It inherits the session; there is no frontmatter to pin. Stage transitions, gate handling, and ship-or-fix decisions on conflicting evidence all require frontier judgment. |
| tdd-implementer | `claude-opus-4-8` | Sustained, deep implementation work under a TDD contract: writing failing tests from acceptance criteria, then driving the implementation to green across potentially many files. |
| staging-e2e-verifier | `claude-sonnet-4-6` | Mechanical live verification against staging via Playwright MCP: follow explicit steps, interact, capture evidence, report pass/fail. No open-ended judgment required. |
| staging-log-verifier | `claude-sonnet-4-6` | Mechanical log inspection: run the configured log command or query, scan for error signatures, cite offending lines, report clean/dirty. No open-ended judgment required. |

## Pinning Rules

### Rule 1: Pin the full model ID in every agent frontmatter

Every agent markdown file in `agents/` MUST set `model:` in its frontmatter to the complete model ID string exactly as listed above — `claude-fable-5`, `claude-opus-4-8`, or `claude-sonnet-4-6`.

- **No aliases.** Aliases can be repointed to a different underlying model without any change to this repository; a pinned full ID cannot drift.
- **No `inherit`.** An inheriting agent runs on whatever model the calling session happens to use, which breaks the tier assignments above.
- **No omission.** A missing `model:` field is equivalent to `inherit` and is treated as a defect.

The orchestrator skill is the one deliberate exception: it is not an agent file and runs in the Fable 5 main session by definition.

### Rule 2: No mid-task model switching

Once a task is dispatched to an agent on a pinned model, that task runs to completion on that model. Nothing in any skill, agent, or prompt may change a task's model while the task is in flight.

**Technical rationale: prompt caches are model-scoped.** The prompt cache accumulated during a task — system prompt, agent definition, loaded files, conversation history — is keyed to the model serving it. Switching the model mid-flight invalidates the entire accumulated cache: every cached token must be reprocessed from scratch at full cost, and the new model re-interprets the full context without the continuity the original model had built up. The result is a silent degradation in both cost and output quality. Mid-task switching is therefore prohibited by design, not merely discouraged.

### Rule 3: Fix cycles are fresh tasks on the same tier

When a stage fails or the merge-gate-reviewer returns a FIX verdict, the failed task is **never resumed under a different model**. Instead:

1. The orchestrator composes a new task containing the failure evidence (FIX blockers, failing CI output, E2E evidence, dirty log lines).
2. That new task is dispatched as a **fresh task** to the **same agent on the same pinned model** that owns the work (fix work goes to `tdd-implementer` on `claude-opus-4-8`; plan regeneration goes to `issue-planner` on `claude-fable-5`).
3. The fresh task builds its own model-scoped cache from a clean start — no stale mid-task state, no cross-model handoff.

### Rule 4: No fallback, no downgrade — by design

There is **no fallback path and no downgrade path anywhere in this pipeline**. No condition — repeated failures, cost pressure, model load, timeout — permits substituting a cheaper model, escalating to a different model mid-task, or "falling back" to another tier. If a tier's model cannot complete its work, the stage fails or blocks per [stage-contracts.md](stage-contracts.md), and the remedy is a fresh task on the same tier or human intervention. Any instruction that introduces fallback or downgrade language is a policy violation.

## Related

- [ADR-0007: Model-tier pinning and no mid-task switching](../../../docs/decisions/ADR-0007-model-tier-pinning-no-mid-task-switching.md) — the decision record behind these rules
- [prompt-rules.md](prompt-rules.md) — how prompts must be written for each tier
- [stage-contracts.md](stage-contracts.md) — which tier executes each stage
