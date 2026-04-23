---
name: codebase-audit
description: Long-running comprehensive adversarial audit of an entire codebase. Orchestrates partition-by-partition adversarial reviews by delegating to /adversarial-reviewer --codebase <partition>, then synthesizes a cross-partition risk register and a written remediation report. Unlike /adversarial-reviewer --codebase (which samples strategically from the whole repo in one pass), this skill methodically covers the full scope over a long session, is resumable after crashes, and produces a consulting-style deliverable. Use for onboarding audits of inherited codebases, pre-acquisition code due diligence, periodic tech-debt health checks, or when the user asks for a "comprehensive / thorough / exhaustive / deep / no-stone-unturned review of the codebase". Triggers on "/codebase-audit", "comprehensive codebase review", "full codebase audit", "thorough audit", "code due diligence", "tech debt audit", "what am I inheriting (comprehensive)". Different from /adversarial-reviewer --codebase (strategic sample, single pass) and /code-quality-audit (metrics-based: coverage/complexity/cycles/mutation).
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Skill, TaskCreate, TaskUpdate, TaskList, TaskGet
argument-hint: "[path] [--resume | --only <partition-name> | --force]"
---

# Codebase Audit

Long-running comprehensive adversarial audit. Orchestrates per-partition reviews through `/adversarial-reviewer --codebase`, then synthesizes findings into a written report. Designed for **methodical full coverage**, not strategic sampling — use when the user wants the whole thing reviewed and is willing to spend the tokens and time.

## Positioning

| Skill | What it does | Coverage | Output | When |
|-------|-------------|----------|--------|------|
| `/code-review` | Per-phase quality gate | Changed files | Verdict + notes | During implementation |
| `/adversarial-reviewer` (diff) | Hostile pre-merge review | Changed files | BLOCK/CONCERNS/CLEAN | Before a merge |
| `/adversarial-reviewer --codebase` | Adversarial sample of repo | 5-10 files per persona | HIGH/MEDIUM/LOW-RISK + most-concerning area | Quick whole-repo sanity check |
| **`/codebase-audit`** | **Methodical full audit** | **Every partition** | **Written report + risk register** | **Onboarding / due diligence / tech-debt review** |
| `/code-quality-audit` | Metrics: coverage, complexity, cycles, mutation | Whole repo (metric-based) | Numeric gate | Quantitative health |

Pair `codebase-audit` with `code-quality-audit` for a complete picture: this skill gives you the *qualitative* adversarial read; `code-quality-audit` gives you the *quantitative* one.

## Usage

```
/codebase-audit                        # Audit CWD
/codebase-audit src/                   # Scope to a subtree
/codebase-audit --resume               # Pick up from last checkpoint
/codebase-audit --only api             # Re-run a specific partition
/codebase-audit --force                # Ignore existing partition reports (re-review everything)
```

**Expect 200K-500K tokens and 30-60 minutes of wall clock for a typical ~500-file repo.** This is a deliberate investment. Confirm with the user before kicking off if the cost would surprise them.

## Workflow

### Step 1: Scope and map

Determine the scope root (path argument, or CWD). Build the map:

1. `git ls-files | wc -l` — total file count (or `find . -type f` if not a git repo).
2. `git ls-files | head -500` + `tree -L 3` — structural overview.
3. Read: `README.md`, `CLAUDE.md`, `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod`, top-level `*.config.*`.
4. `git log --pretty=format: --name-only --since=180.days | sort | uniq -c | sort -rn | head -50` — recent churn.
5. Locate test directories; compute rough test-to-source ratio.
6. Detect monorepo structure (`packages/`, `apps/`, workspace configs) — these are natural partition boundaries.

Write a one-page **codebase map** summarizing what you learned. This goes into the audit directory so future steps and the user can reference it.

### Step 2: Partition plan — STOP for user approval

Create the audit workspace:

```
docs/audits/YYYY-MM-DD-<repo-name>/
├── map.md                     # from Step 1
├── plan.md                    # from Step 2 (this step)
├── partitions/                # per-partition reports (populated in Step 3)
└── REPORT.md                  # final synthesis (produced in Step 5)
```

Propose a partition plan in `plan.md`. Partition strategy, in priority order:

1. **Monorepo workspaces** (`packages/*`, `apps/*`) — each workspace is one partition.
2. **Top-level src directories** (`src/api`, `src/domain`, `src/ui`, etc.) — each is one partition.
3. **By concern** when the repo is flat — group files by feature / module using directory names and import graphs.

Each partition should be **50-150 files**. Too small = wasted orchestration overhead. Too large = exceeds `/adversarial-reviewer --codebase`'s sampling sweet spot (which expects ~300-500 files max).

Record each partition with:
- **Name** (short, kebab-case)
- **Path(s)** (glob-compatible)
- **File count**
- **Rationale** (why this is a coherent chunk)

Then **stop and show the plan to the user**. This is the token-commitment checkpoint. Ask:

> "Here's the partition plan: N partitions, estimated cost ~XYZ tokens. Approve, modify, or narrow scope?"

Do not proceed to Step 3 without explicit user approval. A user who sees 15 partitions and wanted 3 should catch it here, not after the audit is half-done.

Use `TaskCreate` to register one task per partition. This makes progress visible and resumable.

### Step 3: Per-partition adversarial review

For each partition (honor `TaskList` ordering):

1. **Check for existing report** at `docs/audits/.../partitions/<partition-name>.md`. If it exists and `--force` was not passed, skip this partition (resume behavior) — mark task complete, move on.
2. **Mark task in_progress** via `TaskUpdate`.
3. **Invoke the adversarial-reviewer skill** on the partition path:

   ```
   /adversarial-reviewer --codebase <partition-path>
   ```

   Capture the full output (three persona sections + synthesis + verdict + most-concerning area).
4. **Write the partition report** to `docs/audits/.../partitions/<partition-name>.md`. The file should contain:
   - Partition metadata (path, file count, date reviewed)
   - The verbatim adversarial-reviewer output
5. **Mark task completed.**

If a partition invocation fails (timeout, tool error), mark the task failed, write an error stub to the partition file, and continue with the next partition. Don't let one partition kill the whole audit.

**Do not batch the reviews in parallel.** Sequential is safer here — adversarial-reviewer itself spawns three persona subagents, so parallelism is already happening at that level. Stacking parallelism on top can exhaust rate limits and causes contention on subagent dispatch.

### Step 4: Cross-partition synthesis

After all partitions are complete, read every `partitions/*.md` file and look for patterns that no single partition could see:

1. **Systemic findings.** A finding flagged in 2+ partitions — for example, "missing input validation at module boundaries" showing up across `api`, `webhook`, and `cli`. Systemic = highest severity.
2. **Architectural anti-patterns.** Cross-cutting concerns (logging, error handling, auth, config) implemented inconsistently across partitions. Not visible from inside a single partition.
3. **Dependency risk concentration.** A fragile module that many other partitions depend on. Use `grep` / import analysis to find these.
4. **Security posture across layers.** Are trust boundaries consistently enforced? Does internal-only data leak to public-facing modules?
5. **Test coverage dead zones.** Which partitions are notably less tested than others?

Write a `synthesis.md` with the findings grouped by the patterns above.

### Step 5: The report

Produce `REPORT.md`. This is the deliverable — assume the reader won't read the per-partition files. Structure:

```markdown
# Codebase Audit Report: <repo-name>

**Date:** YYYY-MM-DD
**Scope:** <path> (N files across K partitions)
**Overall health:** HEALTHY / CONCERNING / AT-RISK / DEGRADED

## Executive Summary
3-5 sentences. Single most important thing to fix. Single biggest risk. Overall shape.

## Risk Register
Prioritized table. One row per distinct finding:

| # | Severity | Area | Finding | Detected in | Recommended action |
|---|----------|------|---------|-------------|-------------------|
| 1 | CRITICAL | auth | SQL injection in session middleware | api, admin | Parameterize queries |
| 2 | HIGH | data | No migration rollback procedure | data, worker | Add reversible migrations |
...

Order by severity, then by breadth (systemic issues above single-partition).

## Systemic Issues
Findings that appeared in multiple partitions, with the list of partitions they appeared in.

## Architectural Themes
Cross-cutting concerns reviewed at the whole-repo level.

## Per-partition Index
| Partition | Verdict | Critical | Warnings | Report |
|-----------|---------|----------|----------|--------|
| api | HIGH-RISK | 3 | 7 | partitions/api.md |
...

## Remediation Roadmap
Prioritized, with rough effort estimates:

1. **Immediate (this week):** items that block safe operation
2. **Short-term (this quarter):** items that degrade the codebase if ignored
3. **Medium-term (this year):** tech-debt paydown
4. **Defer or accept:** items that aren't worth fixing given current priorities

## Methodology Note
One paragraph explaining how the audit was conducted (partitions, `/adversarial-reviewer --codebase` per partition, synthesis pass) so the reader can judge the evidence.
```

### Step 6: Hand off

Tell the user:
- The report is at `docs/audits/.../REPORT.md`
- Per-partition evidence is in `partitions/`
- Estimated total token spend (read from the session if available)
- Suggest running `/code-quality-audit` if they want the quantitative complement

## Overall Health Ratings

| Rating | Criteria |
|--------|----------|
| **HEALTHY** | No critical findings, few warnings, tests present, no systemic issues |
| **CONCERNING** | No criticals but clear warnings clusters, inconsistencies, or thin tests |
| **AT-RISK** | 1-2 CRITICALs, or cross-partition systemic issues, or significant test gaps |
| **DEGRADED** | Multiple CRITICALs, clear decay patterns, broken architectural boundaries |

## Resume Behavior

The audit is **resumable by default.** A re-run of `/codebase-audit` (or explicit `--resume`) will:

1. Detect existing `docs/audits/.../plan.md` → skip Step 1 and Step 2.
2. For each partition in the plan, check `partitions/<name>.md` — skip if exists.
3. Continue from the first incomplete partition.

If the user passes `--force`, ignore existing partition reports and re-review everything. This is for when the codebase has changed significantly since the last audit.

If the user passes `--only <partition-name>`, re-review just that partition (useful after fixes, or if a partition's first review was flaky).

The audit directory name includes the date, so re-runs the next day create a fresh audit rather than muddying yesterday's. Users who specifically want to continue yesterday's audit should pass `--resume <audit-dir-name>` (e.g., `--resume 2026-04-23-myapp`).

## Anti-Patterns

| Anti-pattern | Why it's wrong |
|-------------|----------------|
| Kicking off a 20-partition audit without user approval | Hundreds of K tokens is not a "background task." The user must opt in after seeing the plan. |
| Running partitions in parallel | adversarial-reviewer already spawns three subagents per call. Layering parallelism causes rate-limit pressure and concurrency bugs in subagent dispatch. |
| Skipping the synthesis step and shipping the per-partition files as the report | The systemic findings are the whole point. A stack of per-partition reports is evidence, not a deliverable. |
| Reusing persona logic inline instead of delegating | Two copies of the persona briefs drift. Always invoke `/adversarial-reviewer --codebase <partition>`. |
| Dumping the map into the partition-level briefs | `/adversarial-reviewer --codebase` builds its own map for its scope. Don't pre-feed it; keep partitions clean. |
| Treating the final report as a merge decision | This is a health assessment for a codebase, not a gate on a change. Use HEALTHY/CONCERNING/AT-RISK/DEGRADED, not BLOCK/CLEAN. |
| Letting one failed partition abort the audit | Mark the partition failed, move on. The report's methodology note should disclose any skipped partitions. |

## Relationship to Other Skills

- **Delegates to:** `adversarial-reviewer` (one call per partition, `--codebase` mode)
- **Complements:** `code-quality-audit` — qualitative (this skill) + quantitative (that skill) gives you the complete picture
- **Different from:** `codebase-research` — that skill explains *how the code works*; this skill assesses *what's wrong with it*
- **Not a replacement for:** `code-review` or `security-review` — per-change quality gates still belong in their own skills

## Design Note: Why This Is a Separate Skill

`adversarial-reviewer --codebase` does strategic sampling — 5-10 files per persona, one parallel pass, done in minutes. That's the right shape for a quick "is this repo okay?" answer.

Comprehensive audit is a different shape: multi-stage (scope → partition → per-partition → synthesis → report), long-running (tens of minutes), resumable (checkpoints on disk), and produces a **written document** rather than a verdict paragraph. Stuffing this into adversarial-reviewer would have bloated that skill past usefulness and confused its single-unit-of-review purpose.

This skill is an **orchestrator** — it does nothing the delegated skill can't do; it arranges the work so that full coverage becomes feasible, which no single `adversarial-reviewer` invocation can achieve.
