# ADR-0008: Prompt-Style Policy by Tier

> **Quick Reference** | Status: Accepted | Date: 2026-06-11
> **Decision**: Outcome-style prompts for Fable 5 agents, prescriptive step-lists for Sonnet 4.6 verifiers, a TDD contract for the Opus 4.8 implementer.
> **Context**: Prompt shape interacts with model behavior; one style applied across tiers degrades at least one tier.
> **Alternatives**: One uniform prompt style, per-agent ad-hoc style
> **Impact**: ship-issue skill, agent prompts, prompt-rules.md

---

## Context

The ship-issue agent roster spans three model tiers with different prompting characteristics. Prompts written for prior models are often too prescriptive for Fable 5 and reduce its output quality — imperative think-step procedures constrain the model into following a script instead of exercising the judgment it was selected for. The Sonnet 4.6 staging verifiers have the opposite need: mechanical verification produces reproducible verdicts only when given explicit ordered steps, exact commands and selectors, and unambiguous pass/fail criteria. The Opus 4.8 tdd-implementer needs a non-negotiable discipline (tests first, RED before GREEN, no test weakening) without micro-scripting its path through the codebase. Without a policy, prompt style is decided ad hoc per agent author and drifts toward whatever style the author last used.

## Decision

**Prompt style is a per-tier policy: outcome-style for Fable 5 agents, prescriptive step-lists for Sonnet 4.6 verifiers, and a TDD contract for the Opus 4.8 implementer.**

Fable 5 agents (issue-planner, merge-gate-reviewer) and the orchestrator skill body receive goals, constraints, inputs, and output contracts — never imperative think-step procedures, because over-prescription measurably reduces Fable 5 output quality. Sonnet 4.6 verifiers (staging-e2e-verifier, staging-log-verifier) receive explicit ordered steps with exact commands/selectors and unambiguous pass/fail criteria, because mechanical verification benefits from explicit steps. The Opus 4.8 tdd-implementer receives a contract — conditions that must be true of the deliverable (tests first from acceptance criteria, RED before GREEN, suite green, no test deletion/weakening, diff plus test evidence) — with design decisions left to the model. The full per-tier rules and worked good/bad examples live in prompt-rules.md.

## Alternatives Considered

| Option | Pros | Cons | Why Not |
|--------|------|------|---------|
| One uniform prompt style | Single convention to learn; consistent-looking agent files | Mismatched to model behavior: uniform prescription degrades Fable 5; uniform outcome-style makes verifier verdicts irreproducible | A style that suits one tier actively harms another |
| Per-agent ad-hoc style | Maximum author freedom | No policy to review against; style drifts with each author and edit; tier-inappropriate prompts slip through review | Drift is exactly the failure this decision exists to prevent |

## Consequences

- **Positive**: Each tier is prompted in the shape its model performs best under; prompt review has an objective standard; new agents inherit a known-good style by tier
- **Negative**: Authors must know an agent's tier before writing its prompt (mitigated: model-tiering.md maps every agent to its tier in one table)
- **Requires**: prompt-rules.md documents each style with good/bad examples; agent prompt reviews check style-tier match; changes to an agent's tier trigger a prompt rewrite in the new tier's style

## Related

- [ADR-0007](./ADR-0007-model-tier-pinning-no-mid-task-switching.md): The tier assignments this policy keys off
- [prompt-rules.md](../../skills/ship-issue/references/prompt-rules.md): The per-tier rules and examples implementing this decision
