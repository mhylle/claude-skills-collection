# Skills & Agents Maintenance Audit — Holistic View

**Date:** 2026-04-22
**Scope:** All skills under `skills/` and agents under `agents/`, evaluated against the current Claude Code platform (Opus 4.7) and against each other.

---

> **Revised finding (2026-04-22, same day):** After reading each agent file, I revised the recommendation on the 6 "redundant" agents. Do **not** delete them. The overlap with built-in `Explore` / `WebSearch` is real at the what-they-do level, but each agent encodes non-trivial prompt engineering the built-ins don't provide — in particular the documentarian discipline that suppresses Claude's default urge to critique and suggest improvements. 7 skills reference these agents. Deletion would cost real value. See §2 and §7 for the corrected stance.

## Executive summary

The collection contains **27 skills** and **7 agents** totaling ~13,900 lines of SKILL.md content. Three findings dominate this audit:

1. **Several skills predate current Claude Code features and now overlap with built-ins.** Auto-memory, built-in subagents (`Explore`, `general-purpose`), Task tools, WebSearch/WebFetch, context7 MCP, and automatic compaction all landed after many of these skills were authored. The strongest candidates for retirement or consolidation: `codebase-locator`, `codebase-analyzer`, `codebase-pattern-finder`, `docs-locator`, `docs-analyzer`, `web-search-researcher`, and parts of `context-saver` / `continuous-learning`.

2. **Skill bloat is the single biggest quality risk.** 11 of 27 skills exceed the 500-line guidance from the skill-creator documentation, four exceed 1000 lines. Large skills are harder for Claude to load, harder to reason about, and harder to maintain. `implement-phase` (1744 LOC), `eval-harness` (1415), `verification-loop` (1243), and `continuous-learning` (1057) are the main offenders.

3. **The collection covers planning, execution, and review well, but has clear gaps in writing-phase support** — no skill helps *author* tests, refactor code systematically, write release notes, or debug root causes. These gaps are more likely to matter in day-to-day use than any of the current skills' overlaps.

Everything below is my best reading. I've listed my own blind spots in the last section.

---

## 1. Inventory at a glance

### Skills (27), by category

| Category | Skills | Notes |
|---|---|---|
| Ideation | `brainstorm`, `team-brainstorm`, `deep-brainstorm`, `user-story` | 3 brainstorm variants is defensible (single/team/multi-session) but borderline |
| Planning | `create-plan`, `team-create-plan`, `iterate-plan`, `workflow-guide`, `prompt-generator` | `prompt-generator` may be obsolete (see §3) |
| Execution | `implement-plan`, `implement-phase`, `team-implement-plan`, `team-implement-plan-full` | Four skills, clear shape: solo/small/full + the phase-level unit-of-work |
| Quality | `verification-loop`, `code-review`, `security-review`, `code-quality-audit`, `e2e-testing`, `eval-harness` | Six. Each attacks a different lens; boundaries need clearer docs (see §2) |
| Research & docs | `codebase-research`, `adr` | `codebase-research` competes with built-in `Explore` |
| Session / context | `context-saver`, `strategic-compact`, `continuous-learning` | All three overlap with built-in memory/compaction to varying degrees |
| Meta / tooling | `agent-creator`, `skill-visualizer` | `agent-creator` is NestJS-specific — narrow |

### Agents (7)

| Agent | Status |
|---|---|
| `browser-verification-agent` | Unique — Playwright MCP driver, no built-in equivalent |
| `codebase-locator` | Overlaps with built-in `Explore` |
| `codebase-analyzer` | Overlaps with built-in `Explore` |
| `codebase-pattern-finder` | Overlaps with built-in `Explore` |
| `docs-locator` | Overlaps with built-in `Explore` |
| `docs-analyzer` | Overlaps with built-in `Explore` + context7 MCP |
| `web-search-researcher` | Overlaps with built-in `WebSearch` + `WebFetch` |

Six of seven agents arguably duplicate built-in functionality. This is the loudest signal in the audit.

---

## 2. Overlaps with current Claude Code built-ins

Claude Code has evolved a lot. These overlaps weren't problems when the skills were written — they are now.

### Subagents

The Claude Code environment now provides subagent types via the `Agent` tool, including:
- `general-purpose` — multi-step research and code execution
- `Explore` — fast codebase exploration with thoroughness levels (quick/medium/very thorough)
- `Plan` — architect-style implementation planning

These collectively cover what six of your seven custom agents do. Specifically:

- **`codebase-locator`** → `Explore` with "Find files related to X" prompt at `quick` thoroughness
- **`codebase-analyzer`** → `Explore` with "How does X work" prompt at `very thorough`
- **`codebase-pattern-finder`** → `Explore` with "Find patterns for X" prompt
- **`docs-locator`** → `Explore` scoped to docs/ or docs-analyzer equivalents
- **`docs-analyzer`** → `Explore` + the context7 MCP for external library docs
- **`web-search-researcher`** → Built-in `WebSearch` tool (no agent needed for most uses)

**Original recommendation:** Delete 5–6 of these agents, keep `browser-verification-agent`. Update callers to use built-in `Explore` / `WebSearch`.

**Revised after reading the files (same day):** Keep all 7. The documentarian discipline ("DO NOT critique / DO NOT suggest improvements / DO NOT propose refactoring") repeated across the three `codebase-*` agents is genuine prompt engineering that `Explore` doesn't replicate. `docs-analyzer` encodes a decision-extraction framework. `web-search-researcher` encodes a 4-phase research methodology with source-authority gating. These aren't 1:1 replaceable by `Explore` without loss. And 7 skills reference them, so deletion has a migration cost on top of the value loss.

**What's still worth doing** (smaller scope): consider consolidating the three `codebase-*` agents into a single multi-mode `codebase-doc` agent — their documentarian doctrine is identical; only the output formats differ. That's a refactor, not a retirement.

### Memory / session persistence

The Claude Code platform now has an auto-memory system with typed entries (`user`, `feedback`, `project`, `reference`) living in `~/.claude/projects/.../memory/`. This was not a thing when `context-saver` and `continuous-learning` were written.

- **`context-saver`** — intended to save session state for handoff. The memory system covers *long-lived knowledge*. It does **not** cover "snapshot my in-flight session context to a single handoff doc I can paste into a new chat." That narrow role still has value. But the skill currently reads as if it's the general memory solution, which it no longer is. **Verdict:** keep, but rewrite the description and SKILL.md to position it as a *session-handoff doc generator*, not a memory substitute.

- **`continuous-learning`** — extracts patterns from sessions and outputs them as learned skills. The memory `feedback` type now handles the "capture what the user corrected me on" use case automatically. The remaining unique role is *promoting patterns into full skills under `~/.claude/skills/learned/`*. That's more ambitious than memory. **Verdict:** narrower role than it claims, and at 1057 lines it's over-engineered for what's left. Either slim it down substantially or retire it in favor of memory.

- **`strategic-compact`** — suggests *when* to compact (logical boundaries vs. arbitrary token thresholds). Automatic compaction is built-in now but isn't boundary-aware. The niche still exists. **Verdict:** keep, but at 693 lines it's too long for what is essentially a suggestion heuristic. Halve it.

### Task tracking

Task tools (`TaskCreate`, `TaskUpdate`, etc.) are native. The `iterate-plan` skill description mentions "migrates old checkbox-based plans to the new Task tools system" — suggesting the migration is already reflected. Good. Verify that `create-plan` and `implement-plan` aren't using older checkbox-based tracking internally.

### Plan mode

Claude Code has a built-in Plan mode with `ExitPlanMode`. Ideally `create-plan` and `iterate-plan` cooperate with this mode rather than reinvent it. Worth checking.

### Web / docs

- **`web-search-researcher` agent** — largely redundant with built-in `WebSearch`.
- **Documentation analysis** — `context7` MCP provides "fetch current documentation for libraries" coverage that `docs-analyzer` used to do for external docs.

---

## 3. Skill-to-skill overlaps (within this collection)

### The three brainstorm skills

`brainstorm` / `team-brainstorm` / `deep-brainstorm` — three skills. They *are* distinct (single agent Socratic / adversarial team / multi-session persistent) but the differences aren't captured in a single decision aid. A user seeing three "brainstorm" skills has to read all three descriptions to pick. 

**Recommendation:** expand `workflow-guide` to also route brainstorm mode selection, or add a short "which brainstorm skill should I use?" decision block to each SKILL.md. Keep all three — the distinctions are real.

### The three implement skills

`implement-plan` / `team-implement-plan` / `team-implement-plan-full` — same shape, and `workflow-guide` already helps route between them. This is well-handled. Leave it.

### The review / quality skills

Five quality-tier skills: `verification-loop`, `code-review`, `security-review`, `code-quality-audit`, `e2e-testing`. Plus `eval-harness` which is a testing framework, not a review skill. Boundaries:

| Skill | What it checks | Axis |
|---|---|---|
| verification-loop | Build, types, lint, tests, security, diff | Per-phase gating |
| code-review | SRP, patterns, ADR compliance | Qualitative |
| security-review | OWASP top 10 + vulnerability patterns | Security-specific |
| code-quality-audit | Coverage, complexity, size, deps, mutation | Quantitative metrics |
| e2e-testing | End-to-end user flows via Playwright | Functional |

These are genuinely different lenses. But **the overlap between `verification-loop`'s "security" check and `security-review` skill needs clarification** — are they redundant, or is `verification-loop` a surface-level check that escalates to `security-review` for depth? I suspect the latter but the docs don't make this clear. Same question between `verification-loop`'s "tests" check and `code-quality-audit`'s coverage/mutation axes.

**Recommendation:** add a short "how these relate" table to each quality skill so users know when to invoke which. Or introduce a `quality-gate-orchestrator` meta-skill that runs them in the right order. (Low priority — the current skills work; the docs just don't explain the hierarchy.)

### `codebase-research` skill vs. built-in `Explore`

`codebase-research` "orchestrates comprehensive codebase research by decomposing user queries into parallel sub-agent tasks." That's exactly what the built-in `Explore` does for single queries, and what spawning multiple `Explore` subagents does for decomposed queries. The skill may still have value as a prompt template for complex multi-angle research, but its 249-line body is worth reviewing to see how much of it is now "just spawn Explore with these prompts."

### `prompt-generator` skill

Description: "Generate implementation prompts for phase-based project execution using an orchestration pattern." This reads like a precursor to the current `implement-plan` → `implement-phase` → subagent cascade. If that cascade now happens automatically, `prompt-generator`'s role may be obsolete. Worth a closer look in the detailed audit.

---

## 4. Gaps — missing skills

Ordered by how often a real software team bumps into them:

1. **Test authoring** — `code-quality-audit` tells you coverage is low; nothing helps you write tests. A `test-author` skill that generates unit/integration tests based on code + style conventions would close this loop. The lack of this is a real operational gap given that coverage is now a gate.

2. **Refactoring** — "extract this duplication", "split this god-class", "replace this conditional with a strategy pattern". Current coverage is zero; `code-quality-audit` *reports* complexity but doesn't help fix it. A `refactor` skill with a small catalog of idiomatic refactors would be high-value.

3. **Debugging / root-cause** — no skill for "something's broken, help me find the cause methodically." A `debug` skill with hypothesis generation, narrowing strategies, and bisect-style investigation would be genuinely useful.

4. **Migration / upgrade** — "upgrade Angular 18 → 20", "migrate from Moment to date-fns", "swap ORM". Cross-codebase mechanical changes with correctness guarantees. Common real-world ask.

5. **Release engineering** — version bump, changelog generation, tag, publish. Mechanical but annoying. A `release` skill that wraps this workflow is small and high-value.

6. **PR authoring** — `review` exists for reviewing PRs. No skill for *writing* a good PR description, responding to review comments, or addressing CI failures on a PR.

7. **Documentation writing** — not API docs (which code-analysis can do), but README updates after features land, CHANGELOG entries, release notes. Currently handled ad hoc.

8. **Dependency hygiene** — lockfile updates, vulnerability scanning (beyond security-review's code-level work), license compliance.

9. **Performance analysis** — profiling, benchmarking, regression detection. The `code-quality-audit` skill measures static metrics but not runtime performance.

10. **Onboarding** — "I just inherited this codebase, give me a 30-minute tour." `codebase-research` partially covers this but the onboarding-specific framing (what matters first, what to ignore) is different.

**My bias:** items 1–3 are where I'd start. Items 4–10 are real but I'd only build them if the user actually hits the pain. Don't build speculatively.

---

## 5. Correctness concerns in existing skills

Observations from frontmatter + size + descriptions. These are *structural flags*, not verdicts — they warrant detailed review in the next pass.

### Oversized SKILL.md files

The skill-creator guidance is "<500 lines ideal." Eleven skills exceed that:

| Skill | Lines | Concern |
|---|---|---|
| implement-phase | **1744** | Massive. The unit-of-work shouldn't be the biggest doc in the collection. Probable candidate for splitting into references/ sub-files |
| eval-harness | **1415** | Enormous for a framework description |
| verification-loop | **1243** | Large but this one may be justified — it codifies 6 checks |
| continuous-learning | **1057** | Over-engineered for what remains after memory subsumes much of it |
| security-review | 771 | Contains an OWASP checklist — may be justified by content density |
| strategic-compact | 693 | Too long for a suggestion heuristic |
| deep-brainstorm | 646 | Long but it covers 5 methodologies |
| e2e-testing | 575 | Borderline; 3 modes × playwright specifics |
| implement-plan | 513 | Borderline |
| code-review | 446 | Under 500; listing for context |

**Recommendation:** the top four (>1000 lines) should be audited for refactoring into SKILL.md + `references/*.md` structure per the skill-creator guidance on "Progressive Disclosure." This reduces what Claude has to load every time the skill fires.

### Vague or underspecified descriptions

- **`eval-harness`**: "Comprehensive evaluation framework for systematic testing, measurement, and quality assurance..." — no trigger phrases, no concrete examples. Likely under-triggers.
- **`workflow-guide`**: "Helps choose between solo, small team, and full team workflow modes" — extremely terse. Probably fine because it's stable, but wouldn't hurt to expand.
- **`strategic-compact`**: "Strategic compaction suggestion framework that monitors session complexity..." — no trigger phrases.

### Suspiciously small

- **`skill-visualizer`**: 88 lines. For an "interactive HTML visualization" skill that uses D3.js, that's not much specification. Likely adequate if the script does the work, but worth verifying.

### Narrow scope declared as general

- **`agent-creator`**: NestJS-specific ("Create composable AI agent systems in **NestJS** projects"). Worth flagging as a domain-specific skill in the categorization rather than grouping with the general meta skills. Users in non-NestJS projects may find it triggering inappropriately.

### Possible inconsistencies

- `iterate-plan` description mentions "Task tools system" migration — implies some plans still use old checkbox format. Need to confirm `create-plan` now emits the new format by default (probably does, based on recent commits).

---

## 6. Self-critique — where this audit is weakest

1. **I judged overlap mostly from descriptions, not SKILL.md bodies.** A skill with a generic description may do highly specific work the description doesn't advertise. Conversely, a skill with a broad description may underdeliver. Detailed audit needed to be sure.

2. **I treated line count as a proxy for quality.** Some skills *should* be long (reference material, multi-step playbooks). `verification-loop`'s 1243 lines may be exactly right because it encodes 6 procedurally-strict checks.

3. **"Overlaps with Claude Code built-ins" depends on what's actually in the current Claude Code environment.** I'm working from the system prompt's tool list and my recollection. Anything I missed about recent Claude Code changes could invalidate these calls.

4. **"Missing skills" is speculative.** Every item in §4 is my projection of what a team might want. The user may not want any of them, or may have better ideas I didn't surface.

5. **No usage data.** I don't know which skills actually trigger in the user's workflow, which ones produce good outputs, which ones the user has silently stopped using. That data would sharpen every recommendation here.

6. **I haven't looked at the SKILL.md bodies for consistency with current Claude Code conventions** (e.g., do they reference `TaskCreate` where they should use it, do they still reference deprecated tools). That's detailed-audit work.

7. **I haven't looked at cross-skill references.** A skill might reference another skill that's changed since; those references could be stale.

---

## 7. Recommendations by priority

### Tier 1 — Should happen soon

1. ~~**Retire the redundant agents.**~~ **Revised: keep them.** Reading the agent files revealed genuine prompt-engineering investment (documentarian discipline, research methodology, decision-extraction framework) that `Explore` and `WebSearch` alone don't replicate. Lower-cost alternative: **consider consolidating the three `codebase-*` agents** into a single multi-mode agent since they share the documentarian doctrine and differ only in output shape.
2. **Split the four >1000-line SKILL.md files** using the Progressive Disclosure pattern (references/ sub-files loaded on demand). Start with `implement-phase` since it's on the hot path.
3. **Rewrite `context-saver` and `continuous-learning`** to clearly position their narrow remaining roles against the built-in memory system, or retire whichever can't justify a narrow role.

### Tier 2 — Good hygiene

4. **Fix vague descriptions** on `eval-harness`, `workflow-guide`, `strategic-compact`.
5. **Add a "which quality skill when" table** to `verification-loop`, `code-review`, `security-review`, `code-quality-audit`, `e2e-testing` so users know the hierarchy.
6. **Add a "which brainstorm skill when" table** to the three brainstorm skills.
7. **Evaluate `prompt-generator`** for retirement — may be obsolete after `implement-plan` cascade.

### Tier 3 — Growth

8. **Build `test-author` skill** — biggest operational gap given `code-quality-audit` is now gating on coverage.
9. **Build `refactor` skill** — paired with `code-quality-audit` to fix what it reports.
10. **Build `debug` skill** — methodical root-cause investigation.
11. Defer other §4 gaps until user bumps into them.

### Tier 4 — Nice to have

12. Rename the `skills/references/` directory (or move its contents elsewhere) to remove the naming ambiguity with individual skill directories.
13. Run `/ultrareview` or equivalent deep review on the four huge SKILL.md files before splitting to catch any correctness bugs.

---

## Next step: detailed view

The holistic view is above. When you want to drill in, suggested order:

1. **Agents first** — smallest change with clearest payoff (delete 6 files, update callers).
2. **Big skills** — detailed read of `implement-phase`, `eval-harness`, `verification-loop`, `continuous-learning` for refactor plan.
3. **Session/context trio** — decide fate of `context-saver` / `continuous-learning` / `strategic-compact` against current memory system.
4. **Gap-filling** — scope `test-author`, `refactor`, `debug`.

Each of these could be its own session. I can also run any of them unattended if you want to batch multiple in one push.
