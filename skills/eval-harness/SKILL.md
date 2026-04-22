---
name: eval-harness
description: Build evaluation harnesses for AI-assisted implementations — capability evals, regression tests, graders (exact-match, LLM-judge, code-exec, rubric), and standardized metrics (pass@k, accuracy, latency, cost). Use when the user wants to set up or run evals, benchmark agents/skills, create regression test suites for prompts or AI features, compare model/prompt variants, or measure implementation quality. Triggers on "set up evals", "create eval harness", "benchmark this skill", "regression test the prompt", "run evals", "/eval-harness", or any request to systematically measure AI output quality.
argument-hint: "[mode: create|run|report]"
---

# Eval Harness

A skill for building and running evaluation harnesses on AI features. Covers two eval types (capability, regression), three grader types (code, model, human), and the metrics that summarize them (pass@k, pass^k).

---

## Evaluation-driven development (EDD)

Evals are defined **before or alongside** implementation, not after. Success criteria become explicit, measurable, and testable from day one.

**Core principles:**
1. **Define success first** — before implementing a feature, define what "working correctly" means through explicit evaluations.
2. **Measure continuously** — run evals throughout development, not just at the end.
3. **Automate where possible** — prefer automated graders for speed and consistency.
4. **Human review for nuance** — use human graders when quality judgments require context or subjectivity.
5. **Track regressions** — every capability added becomes a regression test.
6. **Iterate on failures** — failed evals provide specific, actionable feedback for improvement.

**Benefits:** clear success criteria (no ambiguity about what "done" means), early problem detection, confidence in changes, tests double as executable specifications, quantitative progress tracking.

**The mindset shift:**
```
Traditional: "Build it, then figure out if it works"
EDD:         "Define what 'works' means, then build to pass those evals"
```

---

## Eval types (summary)

| Type | Purpose | When to use |
|---|---|---|
| **Capability** | Verify new functionality works | Adding features, improving functionality, testing edge cases |
| **Regression** | Protect against unintended breakage | After code changes, before PR merge, after dependency updates |

Full structures and YAML examples → `references/eval-types.md`.

---

## Grader types (summary)

| Type | Strength | When to use |
|---|---|---|
| **Code** (exact match, regex, function output) | Fast, deterministic, cheap | Any codifiable correctness check |
| **Model** (LLM judge with rubric) | Handles semantic variation, tone, quality | Natural-language outputs, multiple valid answers |
| **Human** (Likert, binary, ranking) | Catches what machines miss | Creative content, safety-critical judgments, calibrating auto-graders |

Full configs, implementation sketches, and rubric templates → `references/graders.md`.

---

## Metrics (summary)

| Metric | Question answered | Use case |
|---|---|---|
| pass@1 | "Can it solve this at all?" | Single-shot capability |
| pass@k | "Can it ever solve this?" | Best-of-k capability, retries cheap |
| pass^k | "Can it always solve this?" | Consistency, reliability, production |

Formulas, implementations, and the picking-guide → `references/metrics.md`.

---

## Eval workflow

Four phases. Run them in order when bringing up a new eval suite; rerun phase 3 every time you want a fresh measurement.

### Phase 1 — Define

Create the evaluation specification before or alongside implementation.

```yaml
eval_suite:
  name: "Feature X Evaluation Suite"
  version: "1.0.0"
  description: "Comprehensive evaluation for Feature X"

  config:
    parallel_execution: true
    max_workers: 4
    timeout_global: 3600
    retry_failed: true
    retry_count: 2

  evals:
    - $ref: "./evals/capability/cap-001.yaml"
    - $ref: "./evals/capability/cap-002.yaml"
    - $ref: "./evals/regression/reg-001.yaml"

  reporting:
    format: ["json", "markdown", "html"]
    output_dir: "./eval-results"
    include_details: true
    notify_on_failure: true
```

**Checklist:**
- Define success criteria clearly
- Identify capability evals needed
- Identify regression evals to include
- Choose appropriate grader types
- Set realistic thresholds
- Document edge cases

### Phase 2 — Implement

Build the feature, using evals as guidance.

```
Implementation loop:
1. Write/modify code
2. Run relevant evals locally
3. Fix failures
4. Repeat until evals pass
5. Commit changes
```

**Best practices:**
- Run evals frequently during development
- Start with simple cases, add complexity
- Use failing evals to guide implementation
- **Don't modify evals to pass** (unless the actual requirements changed — and then update baselines explicitly)

### Phase 3 — Evaluate

Run the full evaluation suite and collect results.

```bash
# Run all evals
eval-harness run --suite ./eval-suite.yaml

# Run specific category
eval-harness run --suite ./eval-suite.yaml --category capability

# Run with verbose output
eval-harness run --suite ./eval-suite.yaml --verbose

# Run with specific grader override
eval-harness run --suite ./eval-suite.yaml --grader-type model
```

**Execution flow:** load suite → validate eval definitions → initialize graders (code/model/human queues) → execute evals (parallel where possible) → collect results → aggregate scores and metrics → generate reports.

### Phase 4 — Report

Generate comprehensive evaluation reports.

```yaml
eval_report:
  metadata:
    suite_name: "Feature X Evaluation Suite"
    run_id: "eval-20240120-143052"
    timestamp: "2024-01-20T14:30:52Z"
    duration_seconds: 127
    environment:
      model: "claude-3-5-sonnet"
      version: "1.2.3"

  summary:
    total_evals: 25
    passed: 22
    failed: 3
    skipped: 0
    pass_rate: 0.88

    by_category:
      capability:   { total: 15, passed: 13, pass_rate: 0.867 }
      regression:   { total: 10, passed: 9,  pass_rate: 0.90 }

    by_grader:
      code:  { total: 18, passed: 17 }
      model: { total: 5,  passed: 4 }
      human: { total: 2,  passed: 1 }

  metrics:
    pass_at_1: 0.88
    pass_at_3: 0.96
    pass_hat_3: 0.68

  failures:
    - eval_id: "cap-003"
      name: "Complex nested extraction"
      reason: "Missed nested array handling"
    - eval_id: "cap-011"
      name: "Edge case: empty input"
      reason: "Threw exception instead of returning empty"
    - eval_id: "reg-007"
      name: "API response time regression"
      reason: "Response time 2.3s exceeds 2.0s threshold"

  recommendations:
    - "Improve nested data structure handling"
    - "Add empty input validation"
    - "Investigate response time regression"
```

---

## Eval file format

Suites and evals can be authored as YAML (preferred) or JSON. Full structures, schemas, and directory layouts → `references/file-format.md`.

---

## Integration with implement-phase

The eval harness integrates as an optional quality gate. Configure it in the plan's phase definition:

```yaml
phase:
  name: "Implement user authentication"
  steps:
    - type: "implement"
      description: "Build authentication logic"

    - type: "test"
      description: "Run unit tests"

    - type: "eval"
      description: "Run capability evals"
      config:
        suite: "./evals/auth-capability.yaml"
        required_pass_rate: 0.9
        blocking: true                       # Fail phase if evals fail
        metrics:
          - "pass@1"
          - "pass^3"
```

**Triggering from implement-phase:**

```yaml
eval_trigger:
  when: "after_tests_pass"
  suite: "./evals/feature-x.yaml"

  filters:
    categories: ["capability"]
    tags: ["critical", "feature-x"]

  thresholds:
    pass_at_1: 0.85
    pass_hat_3: 0.70

  on_failure:
    action: "block"
    notification: true
    report_path: "./eval-results/phase-{phase_id}.md"

  on_success:
    action: "continue"
    archive_results: true
```

**In the phase completion report** (auto-included when eval step ran):

```markdown
### Eval Results
| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| pass@1 | 0.92 | 0.85 | PASS |
| pass^3 | 0.78 | 0.70 | PASS |

#### Capability Evals (12/13 passed)
- [x] cap-auth-001: Login flow
- [x] cap-auth-002: Token refresh
- [ ] cap-auth-003: Session timeout (FAILED)
  - Expected: Session expires after 30 min
  - Actual: Session persists indefinitely

#### Regression Evals (8/8 passed)
- [x] reg-auth-001: Password hashing unchanged
- [x] reg-auth-002: Token format stable
```

---

## Quick reference

### Grader selection guide

| Output type | Recommended grader | Rationale |
|---|---|---|
| Exact values | Code (exact match) | Fast, deterministic |
| Formatted text | Code (regex) | Validates structure |
| Code output | Code (function) | Tests correctness |
| Natural language | Model | Handles variation |
| Creative content | Human | Subjective judgment |
| Safety-critical | Human + Model | Double verification |

### Metric selection guide

| Scenario | Recommended metric |
|---|---|
| Code generation (any solution works) | pass@k |
| Production system reliability | pass^k |
| Single-shot capability | pass@1 |
| Best-effort with retries | pass@5 or pass@10 |
| Consistency requirements | pass^3 or pass^5 |

### Common thresholds

| Context | pass@1 | pass@k | pass^k |
|---|---|---|---|
| Development | 0.70 | 0.90 | 0.50 |
| Staging | 0.80 | 0.95 | 0.65 |
| Production | 0.90 | 0.99 | 0.80 |
| Critical | 0.95 | 0.999 | 0.90 |

---

## References (loaded on demand)

- `references/eval-types.md` — capability and regression eval structures with YAML examples
- `references/graders.md` — code / model / human grader configs, prompt templates, rubric examples, calibration
- `references/metrics.md` — pass@k and pass^k formulas, Python implementations, picking guide
- `references/file-format.md` — full YAML/JSON schemas and recommended directory layout
