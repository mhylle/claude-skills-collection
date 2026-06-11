# ADR-0007: Model-Tier Pinning and No Mid-Task Switching

> **Quick Reference** | Status: Accepted | Date: 2026-06-11
> **Decision**: Every ship-issue agent pins a full model ID in frontmatter; fix cycles are fresh tasks on the same tier; no instruction may permit mid-task model change.
> **Context**: Ship-issue agents run on three tiers (`claude-fable-5`, `claude-opus-4-8`, `claude-sonnet-4-6`); model identity must be deterministic and stable for the whole life of a task.
> **Alternatives**: Model aliases, inherit-from-session, downgrade-on-failure
> **Impact**: ship-issue skill, agent roster, model-tiering.md, prompt-rules.md

---

## Context

The ship-issue pipeline assigns agents to three model tiers: `claude-fable-5` for judgment-heavy roles (issue-planner, merge-gate-reviewer, plus the orchestrator skill in the Fable 5 main session), `claude-opus-4-8` for the tdd-implementer, and `claude-sonnet-4-6` for the mechanical staging verifiers. Tier assignment is a quality decision per role, so the model an agent runs on must be deterministic — not subject to alias repointing, caller-session variation, or runtime substitution. The pipeline also has fix loops (review FIX verdicts, CI failures, E2E failures, dirty logs), which raises the question of what model handles repair work after a failure.

## Decision

**Every agent pins a full model ID in its frontmatter; fix cycles are fresh tasks dispatched to the same tier; and no skill, agent, or prompt instruction may permit changing a task's model while the task is in flight.**

Pinned IDs are the complete strings `claude-fable-5`, `claude-opus-4-8`, and `claude-sonnet-4-6` — never aliases, never `inherit`, never omitted. The technical core of the no-switching rule: **prompt caches are model-scoped**. A task's accumulated cache — system prompt, agent definition, loaded files, conversation history — is keyed to the model serving it; switching the model mid-flight invalidates the entire cache, forcing full-cost reprocessing and handing the remaining work to a model without the continuity the original had built. That is a silent degradation of both cost and quality, so it is prohibited structurally rather than discouraged. Pinning full IDs additionally eliminates alias drift: an alias can be repointed to a different underlying model with no change in this repository, whereas a pinned ID cannot. When a task fails or receives a FIX verdict, it is never resumed under another model — the orchestrator dispatches a new task, carrying the failure evidence, to the same agent on the same pinned model. No fallback or downgrade path exists by design.

## Alternatives Considered

| Option | Pros | Cons | Why Not |
|--------|------|------|---------|
| Model aliases | Shorter strings; auto-track newest model | Alias repoint silently changes the running model; tier assignments become unverifiable | Drift on alias repoint defeats deterministic tiering |
| Inherit-from-session | Zero frontmatter config | Agent's model depends on whoever invoked it; verifiers could run on any tier | Model identity must be a property of the agent, not the caller |
| Downgrade-on-failure | Appears to save cost on retries | Mid-task switch invalidates the model-scoped cache; quality cliff on the hardest work (the failing case); violates tier policy | Cache loss plus quality cliff exactly when quality matters most |

## Consequences

- **Positive**: Deterministic model per role, verifiable by reading frontmatter; cache continuity within every task; fix tasks start with clean model-scoped caches; no silent quality/cost degradation paths exist
- **Negative**: Adopting a new model version requires editing every pinned frontmatter (mitigated: the roster is small and model-tiering.md lists every pin in one table)
- **Requires**: Every ship-issue agent file sets `model:` to a full pinned ID; the orchestrator implements fix cycles as fresh same-tier task dispatches; review of any pipeline doc rejects fallback/downgrade language

## Related

- [ADR-0008](./ADR-0008-prompt-style-policy-by-tier.md): Prompt style policy for the same tiers
- [model-tiering.md](../../skills/ship-issue/references/model-tiering.md): The tier table and pinning rules this decision mandates
- [prompt-rules.md](../../skills/ship-issue/references/prompt-rules.md): Per-tier prompt contracts
