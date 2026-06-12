# ADR-0010: Testable-Substrate Split for LLM-Executed Skills

> **Quick Reference** | Status: Accepted | Date: 2026-06-12
> **Decision**: Every mechanically-testable ship-issue behavior is extracted into small Python 3 stdlib CLI helpers (run_state.py, preflight.py) under skills/ship-issue/scripts/ that SKILL.md calls and never re-implements in prose; the LLM-interpreted remainder is verified by text-contract greps over SKILL.md and by scenario tests that drive the helpers against a local sandbox repo.
> **Context**: A Claude Code skill is LLM-interpreted markdown, so its behavior cannot be unit-tested directly — yet the ship-issue orchestrator's state transitions, timing, and validation must be provably correct and CI-runnable.
> **Alternatives**: All logic in skill prose, LLM-driven end-to-end tests, single monolithic helper
> **Impact**: ship-issue skill, scripts/, tests/ship-issue

---

## Context

A Claude Code skill is markdown interpreted by an LLM at run time: there is no function to call, so its behavior cannot be unit-tested directly. The ship-issue orchestrator nonetheless contains substantial behavior that must be exactly right — run-state transitions, per-stage timing (work, gate-wait, and crash-gap windows), schema validation, resume detection, and preflight config validation. Leaving that logic in prose means it cannot run in CI, drifts from run-state-schema.md silently, and forces every later pipeline phase to re-derive the same rules. The question decided in Phase 3 of the ship-issue pipeline: where does mechanically-testable behavior live, and how is the untestable remainder verified?

## Decision

**Every mechanically-testable behavior is extracted into small Python 3 stdlib CLI helpers under `skills/ship-issue/scripts/` — `run_state.py` (state transitions, per-stage timing, schema validation, resume detection) and `preflight.py` (config validation) — which SKILL.md instructs the orchestrator to call and never re-implements in prose; the LLM-interpreted remainder is verified by text-contract greps over SKILL.md and by scenario tests that drive the helpers in exactly the sequence the skill prescribes.**

Extraction makes the load-bearing logic deterministic and CI-runnable: transitions, timing windows, validation against run-state-schema.md, and resume detection all execute as ordinary code under ordinary tests, and the skill cannot drift from the schema because it never restates the rules. What remains LLM-interpreted — planner dispatch, gate conversations, BLOCKED presentation — is verified two ways: (a) text-contract greps over SKILL.md assert frontmatter keys, stage names, gate wording, and the absence of the tiering language ADR-0007 and ADR-0008 forbid; (b) scenario tests (dry-run to gate 1, kill-resume, BLOCKED preflight) drive the helpers in exactly the sequence the skill prescribes, so the prescribed choreography is itself executable. Dry-run scenarios run against a local throwaway git repo built per test run by `tests/ship-issue/lib-sandbox.sh`, with PATH-prepended stub `gh` and `aws` binaries — no GitHub, no AWS, deterministic via injected `--ts` timestamps.

## Alternatives Considered

| Option | Pros | Cons | Why Not |
|--------|------|------|---------|
| All logic in skill prose | One artifact; no helper scripts to maintain | Untestable; drifts from run-state-schema.md silently; every later phase re-derives the rules | Prose cannot be executed, so correctness is unverifiable and decays |
| LLM-driven end-to-end tests | Exercises the real interpretation path | Non-deterministic; slow; needs real remotes and credentials; cannot run in CI | A gate that cannot run in CI and never gives the same answer twice is not a gate |
| Single monolithic helper | One CLI to document and invoke | Conflates config validation (no side effects, runs before run state exists) with state mutation (the single-writer engine) | Two CLIs keep the write-path boundary of ADR-0009 explicit |

## Consequences

- **Positive**: Transition, timing, and validation logic is deterministic and runs in CI; the skill cannot drift from run-state-schema.md because it never restates the rules; scenario tests run anywhere with zero external dependencies; the single-writer boundary of ADR-0009 is now enforced by code, since `run_state.py` is the sole mutation path for run state
- **Negative**: Behavior spans two artifacts — SKILL.md and the helpers — that must stay aligned (mitigated: the text-contract greps and helper-sequence scenario tests are exactly that alignment check); genuinely LLM-interpreted behavior such as gate conversations is still only verified indirectly
- **Requires**: Later ship-issue phases (4+) route every new stage or gate transition through `run_state.py` rather than writing state in prose; new skill text is added grep-verifiable (stable frontmatter keys, stage names, and gate wording); `lib-sandbox.sh` is the standard harness for pipeline scenario tests

## Related

- [ADR-0009](./ADR-0009-single-orchestrator-file-run-state-polling-dashboard.md): The single-writer run state for which run_state.py is now the sole mutation path
- [ADR-0007](./ADR-0007-model-tier-pinning-no-mid-task-switching.md): Tier-pinning rules whose forbidden fallback/downgrade language the text-contract greps reject
- [ADR-0008](./ADR-0008-prompt-style-policy-by-tier.md): Per-tier prompt styles likewise enforced by grep over the skill text
- [run-state-schema.md](../../skills/ship-issue/references/run-state-schema.md): The schema run_state.py validates against
- [config-schema.md](../../skills/ship-issue/references/config-schema.md): The config contract preflight.py validates before any run state exists
- [lib-sandbox.sh](../../tests/ship-issue/lib-sandbox.sh): The sandbox library that builds the throwaway repo and stub binaries for scenario tests
