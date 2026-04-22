---
name: code-quality-audit
description: Run code quality audits covering test coverage, cyclomatic complexity, module sizes, dependency structure (cycles, fan-in/out), and mutation testing. Produces a prioritized report and acts as a quality gate. Use whenever the user wants to audit code quality, check coverage, find complex or oversized modules, detect dependency cycles, run mutation tests, assess technical debt, or gate a phase on quality thresholds. Triggers on "audit code quality", "check coverage", "run mutation testing", "find complex modules", "check for cycles", "/code-quality-audit", or automatically before marking an implementation phase complete.
allowed-tools: Read, Glob, Grep, Bash, Write
---

# Code Quality Audit

Systematic audit of a codebase along five axes: **test coverage, cyclomatic complexity, module size, dependency structure, and mutation testing**. Produces a single prioritized report and, when invoked as a gate, returns a pass/fail verdict.

---

## Scope — what this audits and what it doesn't

This skill measures **mechanical code-quality metrics** on the current source tree. That's it. Keep this distinction sharp because many user prompts bundle unrelated questions under words like "gate" or "quality":

**In scope:**
- Test coverage (line + branch, measured by a coverage tool)
- Cyclomatic complexity per function (measured by a static analyzer)
- Module/file size in LOC
- Dependency graph cycles and fan-in/out
- Mutation score (tests actually kill injected mutations)

**Out of scope — do not attempt:**
- Plan-vs-code auditing ("is phase 3 of PLAN.md actually implemented?") — that's a different task, not this skill
- Architectural drift from design docs / ADRs
- Business-logic correctness review
- Security review (there's a separate `security-review` skill)
- Lint / type-check errors (there's `verification-loop` for that)
- Whether tests pass — a 100%-failing test suite with 80% coverage still passes this audit's coverage axis. The gate is about *measured metrics*, not CI health.

If a user's prompt mixes scopes (e.g. "is phase 3 shippable?"), interpret it as: *"are my five code-quality metrics within threshold for the code as it stands?"* That's the only question this skill answers. Surface the narrow framing in the report's preamble if the prompt was broader, so the user knows what they did and didn't get.

---

## Design Philosophy

### Why these five axes?

Each catches a different class of problem that the others miss:

| Axis | Catches | Why it matters |
|------|---------|---------------|
| Coverage | Untested code paths | You can't trust code you haven't exercised |
| Complexity | Hard-to-reason-about functions | Complex code hides bugs and resists change |
| Module size | Over-stuffed files | Large modules accrete responsibilities and become change-amplifiers |
| Dependencies | Cycles, tight coupling, god-modules | Structural debt is expensive to unwind later |
| Mutation | Tests that run code but don't assert meaningfully | High coverage with weak assertions is a false sense of safety |

Coverage alone can be gamed (run it, don't assert it). Complexity alone misses the "it's simple but untested" case. Mutation testing is the most expensive check but the only one that directly measures whether tests would catch regressions. That's why it's worth running even when slow — the user has explicitly chosen to run everything each time.

### Universal thresholds, project overrides

Defaults apply across languages because the underlying phenomena are language-agnostic — a function with cyclomatic complexity 25 is hard to reason about whether it's Python or Java. Projects can override via a `.code-quality.json` file at the repo root when their context calls for different bars (legacy codebases, research code, etc.).

### Warn vs fail

Two threshold tiers per metric:
- **Warn**: reported, never blocks
- **Fail**: blocks in gate mode, reported in on-demand mode

The purpose is to surface emerging problems (warn) without crying wolf, and hard-stop genuine regressions (fail).

---

## When to use this skill

**Automatically** — when invoked by implement-phase as a quality gate before marking a phase complete.

**On-demand** — whenever the user asks to audit, check coverage, find complex code, check for dependency cycles, run mutation testing, or assess technical debt. Also triggers on `/code-quality-audit`.

---

## Invocation modes

The skill runs in one of two modes — determine which from context:

### Gate mode
Invoked by implement-phase or when the user says "gate" / "before I mark this complete" / "can I ship this". Behavior:
- Run all five axes
- Produce the full report
- Return a **verdict: PASS** if no fail-thresholds breached, **FAIL** otherwise
- The caller uses the verdict to decide whether to proceed

Note: "gate" in this skill means *code-quality metrics gate*, not *project plan gate*. If the user says "run the gate for phase 3", do not interpret "phase 3" as a plan milestone to audit against — just run the metrics. If you suspect the user wanted plan-vs-code verification, say so in the preamble ("Interpreting 'gate' as a metrics check — if you meant plan-vs-code verification, that's a different tool") and still run the metrics.

### On-demand mode
Invoked by an explicit user ask ("audit the code quality", "check coverage"). Behavior:
- Run all five axes
- Produce the full report
- Do **not** block — surface findings and recommend fixes by priority
- No pass/fail verdict

If the user's intent is ambiguous, default to on-demand and say so.

---

## Workflow

### Step 1: Detect the stack

Look for well-known manifests to identify the language/ecosystem:

| Found | Stack | Reference file |
|-------|-------|----------------|
| `package.json` with `typescript` dep or `tsconfig.json` | TypeScript | `references/typescript.md` |
| `package.json` without TypeScript | JavaScript | `references/javascript.md` |
| `pyproject.toml`, `setup.py`, or `requirements.txt` | Python | `references/python.md` |

Multi-stack repos: pick the **primary** stack (the one with the most source files) and audit that. Mention the secondary stack in the report so the user knows it wasn't covered.

If no supported stack is detected, stop and tell the user which stacks are supported. Don't guess — a wrong audit is worse than no audit.

### Step 2: Load the reference

Read only the matching reference file. It contains the exact commands to run for that stack, expected output formats, and parsing notes. Ignore the others — there's no benefit to loading reference files you won't use.

### Step 3: Check tool availability

Before running anything, verify each tool the reference calls for is installed. Use **quiet** checks that don't print errors on the happy path — redirect stderr to `/dev/null` and check exit codes. The reference files give the exact incantation per tool. For each missing tool:
- Record it as a **gap** in the report (not an error)
- Skip that axis rather than fail the whole audit
- Keep the availability-check output out of the conversation unless the user asks; it's noise

Rationale: a partial audit is more useful than no audit. The user can install the missing tool after seeing what's covered. And a wall of "command not found" errors at the start makes users think the audit broke when it didn't.

In gate mode, missing tools for fail-threshold axes count as a fail — you can't gate on a check you didn't run. The fail-threshold axes are **coverage, complexity, module size, dependencies, and mutation** (all five have `fail_below` / `fail_above` defaults; see Thresholds). In other words: every axis can block the gate, and a missing tool on any of them is itself a blocker. This is deliberate — the whole point of a gate is to stop shipping with blind spots, and an unmeasured axis is a blind spot.

If a project wants to opt a specific axis out of blocking (e.g. legacy codebase with no realistic mutation-testing budget), set that axis's `fail_below` / `fail_above` to a permissive value in `.code-quality.json`, or remove the fail threshold entirely. Don't hand-wave it in the report.

### Step 4: Load thresholds

Start with the defaults below. If `.code-quality.json` exists at the repo root, merge its values over the defaults. Malformed config → use defaults and note the parse error in the report.

### Step 5: Run the axes

Execute the commands from the reference file. Capture raw output (save to `/tmp/code-quality-audit-<axis>.log` so the user can inspect) and extract the metrics you need. Run axes sequentially — parallel runs of coverage + mutation on the same codebase can interfere on some tooling.

Mutation testing is slow (often 5–30 min). Tell the user it's running before kicking it off so they're not surprised by the wait. If it exceeds 30 minutes, offer to skip it for this run.

### Step 6: Aggregate and apply thresholds

For each finding, classify as `pass`, `warn`, or `fail` by comparing against thresholds. Collect every warn/fail into the report.

### Step 7: Produce the report

Use the format below. Keep it tight — the user reads this to decide what to do, not to study raw numbers.

**The summary table is the report's contract.** It must be the first thing after the header, and it must list all five axes even when one is skipped. The status column tells the user in one glance which axes passed, warned, failed, or were skipped. Every axis must have a row — a 4-row table is a bug.

**When mutation is skipped, qualitative test-quality notes are still welcome** in the Warnings section. The user's underlying concern — "are my tests actually testing anything?" — matters whether or not mutmut/stryker ran. If you can inspect the test suite and see that the assertions are trivially weak (`toBeDefined()`, `isinstance(...)`, `assert result is not None`), call that out as a warning with reasoning, even without a mutation score. Frame it as a qualitative observation, not a measured metric.

### Step 8: Recommend fixes (on-demand mode only)

After the report, list the top 3–5 things to fix, ordered by impact. Impact heuristic: a fail in a hot module (imported often) outranks a fail in a leaf; a failing assertion gap (low mutation score on a critical path) outranks a long-but-simple module.

---

## Thresholds (defaults)

```json
{
  "coverage": {
    "line":    { "warn_below": 70, "fail_below": 50 },
    "branch":  { "warn_below": 60, "fail_below": 40 }
  },
  "complexity": {
    "cyclomatic_per_function": { "warn_above": 10, "fail_above": 20 }
  },
  "module_size": {
    "lines_per_file": { "warn_above": 300, "fail_above": 500 }
  },
  "dependencies": {
    "cycles": { "fail_above": 0 }
  },
  "mutation": {
    "score_percent": { "warn_below": 60, "fail_below": 40 }
  }
}
```

A project-level `.code-quality.json` with the same shape overrides any subset. Unset fields keep their default.

---

## Report format

Produce this exact structure:

```markdown
# Code Quality Audit — <repo name>

**Mode:** <gate | on-demand>
**Stack:** <detected stack>
**Verdict:** <PASS | FAIL>   <!-- gate mode only -->

## Summary

| Axis          | Status | Key number             |
|---------------|--------|------------------------|
| Coverage      | ...    | 72% line / 58% branch  |
| Complexity    | ...    | 3 functions over 20    |
| Module size   | ...    | 2 files over 500 LOC   |
| Dependencies  | ...    | 0 cycles               |
| Mutation      | ...    | 54% mutation score     |

Status is one of: ✓ pass / ⚠ warn / ✗ fail / ⊘ skipped

## Findings

### ✗ Fails
<every fail, one per bullet, with file:line and the number>

### ⚠ Warnings
<every warn, one per bullet>

### ⊘ Skipped
<tools that weren't installed, with the install command>

## Recommendations   <!-- on-demand mode only -->
1. <top-priority fix with reasoning>
2. ...
```

Keep numeric output integer-like where possible (72% not 72.3417%). The user doesn't need more precision than that.

---

## Edge cases

- **Monorepos** — if multiple independent projects live in subdirs, ask the user which one to audit. Don't try to audit all of them in one run; the thresholds and tool configs differ per project.
- **Generated code** — exclude `dist/`, `build/`, `node_modules/`, `.venv/`, migrations, and auto-generated files from complexity and size checks. The reference files list the standard exclusions.
- **Test files** — coverage counts tests as "covered" but not "covering". Don't count test files toward module-size or complexity fails — they're often legitimately long and complex (table-driven tests, fixtures).
- **First-run projects** — if there are zero tests, coverage and mutation will both be 0%. Report this as a fail (in gate mode) with the honest message that there's nothing to measure, rather than burying it.
- **User-stated scope doesn't match reality** — if the user describes the repo as "a few hundred files" but the audited tree is 5 files, don't silently proceed. Include a one-line "scope note" in the report preamble: `**Scope note:** audited N source files — if you meant a different root, re-run against that path.` Don't pad the numbers or pretend the repo is bigger than it is.
- **Static analysis disagrees with reality** — if a tool reports "no issues" but a quick file read suggests otherwise (e.g., `pycycle` says "no cycles" but you can see an obvious circular import), trust your eyes *and* report both. Note the tool's false negative in the report so the user knows to investigate the toolchain config (often a package-layout mismatch). Don't silently override the tool — surface the discrepancy.

---

## Language support

- `references/javascript.md` — JavaScript / Node.js
- `references/typescript.md` — TypeScript / Node.js
- `references/python.md` — Python

To add a new language, create `references/<lang>.md` following the structure of the existing references (tool choices, commands, parsing notes, standard exclusions). Add detection rules to Step 1 above.
