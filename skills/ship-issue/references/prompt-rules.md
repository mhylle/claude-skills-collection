# Prompt Rules by Tier

How prompts MUST be written for each model tier in the ship-issue pipeline. Prompt style is a per-tier policy, not an author preference: the same prompt shape that helps one tier degrades another. Tier assignments live in [model-tiering.md](model-tiering.md).

## 1. Fable 5 agents — outcome-style prompts

**Applies to:** issue-planner, merge-gate-reviewer (both pinned to `claude-fable-5`), and the orchestrator skill body (Fable 5 main session).

Prompts written for prior models are often too prescriptive and **reduce Fable 5 output quality**. Fable 5 performs best when given the goal, the constraints, the inputs, and the output contract — and left to determine its own approach. Do NOT write imperative think-step procedures ("first read X, then consider Y, then...") for Fable 5 agents.

An outcome-style prompt states:

- **Goal** — what outcome the task must produce.
- **Constraints** — what must hold (policies, scope limits, quality bars).
- **Inputs** — what the agent receives and where it lives.
- **Output contract** — the exact shape and semantics of the deliverable.

### GOOD example (merge-gate-reviewer)

```markdown
## Goal
Decide whether this PR is merge-worthy.

## Inputs
- The full PR diff (all files, all hunks — provided below).
- The approved plan, including its acceptance criteria.
- The issue the PR resolves.

## Constraints
- Judge the diff against the approved plan's acceptance criteria and this
  repository's conventions.
- A blocker is a defect that would make merging this PR wrong: a correctness
  bug, an unmet acceptance criterion, a security flaw, or a test that was
  weakened to pass. Style preferences are not blockers.

## Output contract
Return exactly one verdict:
- `APPROVE` — no blockers. Optionally list non-blocking observations.
- `FIX` — one or more blockers exist. Itemize every blocker with: the file
  and location, what is wrong, and what "fixed" means. The itemized list is
  the complete work order for the fix task; omit nothing you would re-raise
  on re-review.
```

Why this is good: it defines the decision, the evidence, the standard of judgment, and the deliverable's shape — and says nothing about *how* to read the diff or in what order to think.

### BAD example (same agent, over-prescribed)

```markdown
First, read the PR description. Then read each changed file one at a time,
in alphabetical order. For each file, first think about whether the imports
are correct, then think about the function signatures, then think about
error handling. After all files, make a list of concerns. Then re-read the
diff a second time to double-check your list. Then decide APPROVE or FIX.
```

Why this is bad: it dictates a reading order, a fixed per-file checklist, and a mandated re-read — over-prescription that constrains Fable 5 into a weaker reviewer than it would be on its own. The model spends its capacity following the script instead of exercising judgment, and the script inevitably omits failure modes the model would otherwise catch. This is the documented pattern by which prompts written for prior models reduce Fable 5 output quality.

## 2. Sonnet 4.6 verifiers — prescriptive step-lists

**Applies to:** staging-e2e-verifier, staging-log-verifier (both pinned to `claude-sonnet-4-6`).

These agents do mechanical verification, and mechanical verification wants the opposite of outcome-style: **explicit ordered steps, exact commands and selectors, and unambiguous pass/fail criteria**. Ambiguity in a verifier prompt produces inconsistent verdicts; prescription produces reproducible ones.

A verifier prompt states, in order: the exact steps to execute, the exact evidence to capture at each step, and the exact condition that constitutes pass versus fail.

### GOOD example (staging-e2e-verifier, excerpt)

```markdown
1. Navigate to {staging_url}/login.
2. Fill `input[name="email"]` with the test account email from the run
   inputs; fill `input[name="password"]` with the test account password.
3. Click `button[type="submit"]`.
4. Wait for navigation. PASS criterion for this step: the URL path is
   `/dashboard` AND the element `[data-testid="user-avatar"]` is visible.
   FAIL otherwise.
5. Take a screenshot; record it as evidence for acceptance criterion AC-2.
6. Report each acceptance criterion as PASS or FAIL with its evidence
   reference. The overall verdict is PASS only if every criterion is PASS.
```

## 3. Opus 4.8 implementer — TDD contract

**Applies to:** tdd-implementer (pinned to `claude-opus-4-8`).

The implementer prompt is framed as a **contract**: a set of conditions that must be true of the delivered work, stated alongside the implementation discipline they imply. It is neither a bare outcome (the TDD discipline is non-negotiable and must be stated) nor a micro-scripted procedure (the implementation path through the codebase is the model's to choose).

### The contract

The following must be true of every tdd-implementer deliverable:

1. **Tests come first, derived from the plan.** Tests are written from the approved plan's acceptance criteria before any implementation code, and each acceptance criterion is covered by at least one test.
2. **RED before GREEN.** Each new test is run and observed to fail before the implementation that satisfies it is written. A test that passes immediately proves nothing about the change.
3. **Implement until green.** Implementation proceeds until the full local test suite passes — the new tests and all pre-existing ones.
4. **No test deletion or weakening to pass.** Existing tests may not be deleted, skipped, or have their assertions loosened to make the suite green. If a test is genuinely wrong, the contract requires saying so explicitly with justification in the deliverable — never silently editing it into agreement.
5. **The deliverable is the diff plus passing-test evidence.** Commits on the branch, and the test-run output demonstrating RED-then-GREEN for the new tests and a fully passing suite.

### Implied implementation steps

The contract implies this working order — write failing tests from the acceptance criteria, confirm RED, implement, run the suite, iterate until GREEN, then assemble the evidence — while leaving design decisions (file structure, abstractions, refactoring scope) to the implementer.

## Related

- [ADR-0008: Prompt-style policy by tier](../../../docs/decisions/ADR-0008-prompt-style-policy-by-tier.md) — the decision record behind this policy
- [model-tiering.md](model-tiering.md) — which agent runs on which pinned model
