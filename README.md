# Claude Code Skills Collection

Custom skills and agents for Claude Code that enhance codebase research, context management, and implementation planning workflows.

> **New to this workflow?** See the [Workflow Overview](documentation/01-workflow-overview.md) for a step-by-step guide.

## Built on Claude Code Task Tools

> **This skill collection uses Claude Code's native Task tools for progress tracking.**

Progress tracking is handled entirely through Claude Code's built-in Task system:

| Tool | Purpose |
|------|---------|
| `TaskCreate` | Create tasks for each phase with dependencies |
| `TaskUpdate` | Mark tasks as `in_progress` or `completed` |
| `TaskList` | View all tasks with status and blockers |
| `TaskGet` | Get full task details including description |

**Benefits:**
- **Persistent** - Tasks survive session restarts
- **Cross-session** - Share progress across multiple terminals
- **Dependency tracking** - Blocked tasks visible, execute in order
- **No file pollution** - Progress tracked in memory, not plan files

Plans remain pure specification documents. See [Progress Tracking](#progress-tracking-with-task-tools) for details.

## Claude Code 2.1.x Feature Alignment

This collection uses modern Claude Code skill features (v2.1.16+):

| Feature | Skills Using It | Purpose |
|---------|-----------------|---------|
| `context: fork` | brainstorm, team-brainstorm, user-story, create-plan, implement-plan, implement-phase, codebase-research, agent-creator | Run in isolated subagent context |
| `agent: Explore/Plan` | brainstorm, user-story, create-plan, codebase-research | Specify subagent type for forked context |
| `allowed-tools` | code-review, verification-loop, security-review, adversarial-reviewer, codebase-research, strategic-compact | Restrict available tools (read-only enforcement) |
| `argument-hint` | implement-plan, implement-phase, adr, e2e-testing, code-review, adversarial-reviewer, context-saver, prompt-generator | Show usage hints in autocomplete |
| `disable-model-invocation` | context-saver, prompt-generator | User-only invocation (no auto-trigger) |
| `user-invocable: false` | implement-phase | Hide from user menu (internal skill) |

### Argument Substitution

Skills support the new argument syntax:
- `$0`, `$1`, `$2` - Positional arguments
- `$ARGUMENTS` - All arguments
- `${CLAUDE_SESSION_ID}` - Session tracking

Example: `/implement-plan docs/plans/my-feature.md` passes the path as `$0`.

## Implementation Workflow

The core workflow for implementing features follows this hierarchy:

```
                  ┌─────────────────┐   ┌──────────────────────┐
                  │   brainstorm    │   │   team-brainstorm    │
                  │  (quick, solo)  │   │  (deep, agent team)  │
                  └────────┬────────┘   └──────────┬───────────┘
                           └────────────┬──────────┘
                                       │
                           ┌───────────┼───────────┐
                           ▼                       ▼
                  ┌─────────────────┐   ┌──────────────────┐
                  │      adr        │   │   user-story     │
                  │  (decisions)    │   │ (requirements)   │
                  └────────┬────────┘   └──────────┬───────┘
                           └────────────┬──────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │  create-plan    │
                              │ (spec → phases) │
                              └────────┬────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              implement-plan                                   │
│                           (orchestrates all phases)                           │
│                                                                               │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                      │
│   │   Phase 1   │───▶│   Phase 2   │───▶│   Phase N   │───▶ Complete        │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                      │
│          │                  │                  │                              │
│          ▼                  ▼                  ▼                              │
│   ┌─────────────────────────────────────────────────────────────────────┐    │
│   │                    implement-phase (per phase)                       │    │
│   │  ┌────────────────────────────────────────────────────────────┐     │    │
│   │  │ Step 1: Implementation (subagents) [TDD mode: tests first] │     │    │
│   │  │ Step 2: verification-loop (6-phase exit conditions) ─────┐│     │    │
│   │  │ Step 3: Integration Testing (API/UI via Playwright)      ││     │    │
│   │  │ Step 4: code-review ─────────────────────────────────────┼┼──┐  │    │
│   │  │         ├─► security-review (optional OWASP audit) ──────┼┼──┼─┐│    │
│   │  │ Step 5: ADR Compliance ──────────────────────────────────┼┼──┼─┼┤    │
│   │  │ Step 6: Plan Sync                                        ││  │ ││    │
│   │  │ Step 7: Prompt Archival                                  ││  │ ││    │
│   │  │ Step 8: Completion Report                                ││  │ ││    │
│   │  └──────────────────────────────────────────────────────────┼┼──┼─┼┘    │
│   └─────────────────────────────────────────────────────────────┼┼──┼─┼─────┘
│                                                                 ││  │ │      │
│         ┌───────────────────────────────────────────────────────┘│  │ │      │
│         │              ┌─────────────────────────────────────────┘  │ │      │
│         │              │              ┌──────────────────────────────┘ │      │
│         │              │              │              ┌─────────────────┘      │
│         ▼              ▼              ▼              ▼                        │
│   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌─────────────────┐           │
│   │verification│  │code-review│  │security-  │  │      adr        │           │
│   │   -loop   │  │           │  │  review   │  │                 │           │
│   └───────────┘  └───────────┘  └───────────┘  └─────────────────┘           │
│    (default)                      (optional)                                  │
└───────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │   e2e-testing   │
                              │  (validation)   │
                              └────────┬────────┘
                                       │
                                       ▼
                        ┌──────────────────────────┐
                        │   continuous-learning    │
                        │ (extract session patterns)│
                        └──────────────────────────┘
```

### Workflow Stages

| Stage | Skill | Purpose |
|-------|-------|---------|
| **Ideation** | `brainstorm` | Refine rough ideas through Socratic questioning |
| **Deep Ideation** | `team-brainstorm` | Adversarial multi-perspective analysis using agent teams |
| **Requirements** | `user-story` | Generate hierarchical user stories with acceptance criteria |
| **Planning** | `create-plan` | Create detailed, phased implementation plans |
| **Deep Planning** | `team-create-plan` | Team-based planning with adversarial design review |
| **Iteration** | `iterate-plan` | Update plans based on feedback |
| **Execution** | `implement-plan` | Orchestrate full plan execution (solo) |
| **Team Execution** | `team-implement-plan` | Small team: Implementer + adversarial Reviewer |
| **Parallel Execution** | `team-implement-plan-full` | Full team: parallel waves + cross-phase Reviewer |
| **Phase Work** | `implement-phase` | Execute single phase with quality gates |
| **Quality** | `code-review` | Verify code quality, patterns, ADR compliance |
| **Adversarial Quality** | `adversarial-reviewer` | Subagent-based hostile review (Saboteur, New Hire, Security Auditor) to break self-review blind spots |
| **Comprehensive Audit** | `codebase-audit` | Long-running full-codebase audit — partitions the repo, delegates to adversarial-reviewer per partition, synthesizes a written remediation report |
| **Security** | `security-review` | OWASP-aligned security audit (optional step) |
| **Verification** | `verification-loop` | 6-phase verification: build, type, lint, test, security, diff |
| **Metrics Gate** | `code-quality-audit` | Coverage, complexity, module size, deps, mutation — gate or on-demand |
| **Decisions** | `adr` | Document architectural decisions |
| **Testing** | `e2e-testing` | End-to-end validation with Playwright |
| **Evaluation** | `eval-harness` | Formal capability/regression testing with metrics |
| **Learning** | `continuous-learning` | Extract patterns from sessions for reuse |

## Skills

Skills are invoked via the `Skill` tool or `/skill-name` shorthand.

### Planning & Implementation

| Skill | Trigger | Description |
|-------|---------|-------------|
| **brainstorm** | `/brainstorm`, "explore this idea" | Interactive idea refinement using Socratic questioning |
| **team-brainstorm** | `/team-brainstorm`, "deep brainstorm" | Adversarial brainstorm using agent teams (Devil's Advocate, Optimist, Creative Explorer, Researcher) |
| **user-story** | `/user-story`, "create user stories" | Generate hierarchical user stories (epics/features/tasks) with Given/When/Then acceptance criteria |
| **create-plan** | `/create-plan`, "plan the implementation" | Creates detailed implementation plans through research |
| **team-create-plan** | `/team-create-plan`, "team plan" | Team-based planning with Architect, Risk Analyst, Researcher |
| **iterate-plan** | "update the plan", "iterate on this plan" | Updates existing plans based on feedback |
| **implement-plan** | `/implement-plan`, "implement the plan" | Orchestrates execution of complete plans (subagent mode) |
| **team-implement-plan** | `/team-implement-plan` | Small team: Implementer + Reviewer + optional Integrator |
| **team-implement-plan-full** | `/team-implement-plan-full` | Full team: per-phase implementers + shared Reviewer, parallel waves |
| **implement-phase** | Called by implement-plan | Executes single phase with all quality gates |
| **workflow-guide** | `/workflow-guide` | Recommends solo, small team, or full team mode based on task |

### Quality & Documentation

| Skill | Trigger | Description |
|-------|---------|-------------|
| **code-review** | `/code-review`, Step 3 of implement-phase | Systematic review: SRP, patterns, ADR compliance |
| **adversarial-reviewer** | `/adversarial-reviewer`, "adversarial review", "critical review", "audit this repo" | Spawns three hostile-persona subagents (Saboteur, New Hire, Security Auditor) in parallel; each must find ≥1 issue; cross-persona findings get severity-promoted. Default mode reviews a diff; `--codebase [path]` reviews a whole repo/subtree with strategic per-persona deep-dives |
| **codebase-audit** | `/codebase-audit`, "comprehensive codebase review", "thorough audit", "code due diligence" | Long-running full-coverage audit. Partitions the repo, delegates to `/adversarial-reviewer --codebase` per partition, synthesizes systemic findings, produces written remediation report. Resumable. Pairs with `code-quality-audit` for qualitative + quantitative picture |
| **adr** | `/adr`, "document decision" | Creates Architecture Decision Records |
| **e2e-testing** | `/e2e-testing`, "test my webapp" | E2E testing with Playwright MCP |
| **security-review** | `/security-review`, auth/input code | 10-category OWASP-aligned security audit |
| **verification-loop** | `/verification-loop`, "verify implementation" | 6-phase verification: build, type, lint, test, security, diff |
| **code-quality-audit** | `/code-quality-audit`, "audit code quality", "run mutation testing" | Coverage + complexity + module size + dependency cycles + mutation score. Gate or on-demand modes |
| **eval-harness** | `/eval-harness`, "run evals" | Formal evaluation framework with pass@k metrics |

### Research & Context

| Skill | Trigger | Description |
|-------|---------|-------------|
| **codebase-research** | "how does X work" | Parallel codebase research with sub-agents |
| **context-saver** | `/context-saver`, "save context" | Preserves session state for continuation |
| **prompt-generator** | `/prompt`, "generate prompt" | Creates implementation prompts for phases |

### Learning & Optimization

| Skill | Trigger | Description |
|-------|---------|-------------|
| **continuous-learning** | Stop hook, "save learnings" | Extracts patterns from sessions to `~/.claude/skills/learned/` |
| **strategic-compact** | PreToolUse hook | Suggests `/compact` at logical boundaries, not arbitrary thresholds |
| **skill-visualizer** | `/skill-visualizer`, "visualize skills" | Generate interactive HTML visualizations of skills and codebase |

### Development

| Skill | Trigger | Description |
|-------|---------|-------------|
| **agent-creator** | "create agent", "build agent" | Creates composable AI agent systems in NestJS |

### Pipeline (Issue → Merge)

| Skill | Trigger | Description |
|-------|---------|-------------|
| **ship-issue** | `/ship-issue <issue-number-or-url>` | One-command GitHub issue → merged PR pipeline across nine stages (preflight, plan, implement, review, ci, cloud_review, deploy, e2e, logs) with **exactly two human gates** — plan approval and merge confirmation. Model-tiered: **Fable 5** plans, orchestrates, and runs the merge-gate review; **Opus 4.8** implements (TDD); **Sonnet 4.6** runs staging E2E and log checks. File-based run state gives lossless crash-resume; per-stage time tracking (work / gate-wait / crash-gap, with a per-model-tier rollup) is embedded in the Gate 2 merge brief. Pair with the single-file `dashboard.py` for a live view. |

> **Overview page:** open [`skills/ship-issue/pipeline.html`](skills/ship-issue/pipeline.html) in a browser for a one-page tour — the skill, its five agents, and the full stage-flow diagram with model-tier colour-coding (self-contained, no dependencies).

## Agents

Agents are specialized sub-agents launched via the `Task` tool for parallel execution.

| Agent | Purpose |
|-------|---------|
| **codebase-analyzer** | Traces implementation with file:line references |
| **codebase-locator** | Finds files by topic/feature ("Super Grep/Glob") |
| **codebase-pattern-finder** | Finds concrete code examples and patterns |
| **docs-analyzer** | Extracts insights from docs, ADRs, design docs |
| **docs-locator** | Finds documentation and research notes |
| **web-search-researcher** | Web research for APIs, libraries, troubleshooting |
| **browser-verification-agent** | UI testing via Playwright MCP with screenshot evidence |

### ship-issue pipeline agents

Each agent **pins its model** in frontmatter — the tier is part of the contract, never switched mid-task (prompt caches are model-scoped; ADR-0007). A fix cycle is always a fresh task on the same tier, never a resumed task on a different model.

| Agent | Model | Purpose |
|-------|-------|---------|
| **issue-planner** | `claude-fable-5` (Fable 5) | Turns a GitHub issue + codebase into the plan presented at Gate 1. Outcome-prompted (ADR-0008). |
| **merge-gate-reviewer** | `claude-fable-5` (Fable 5) | Last-line diff review at the merge gate; verdict contract APPROVE / FIX (itemized blockers). Outcome-prompted. |
| **tdd-implementer** | `claude-opus-4-8` (Opus 4.8) | Tests-first implementation, UI components, API routes; receives reviewer/CI/E2E blockers verbatim on fix cycles. |
| **staging-e2e-verifier** | `claude-sonnet-4-6` (Sonnet 4.6) | Runs the plan's E2E scenarios against the live staging URL via Playwright MCP; PASS/FAIL/FLAKY/BLOCKED with screenshot evidence. |
| **staging-log-verifier** | `claude-sonnet-4-6` (Sonnet 4.6) | Scans staging service logs over the deploy window; CLEAN vs ERRORS_FOUND with cited lines. |

## Installation

### Quick Install

```bash
./install.sh
```

Installs to:
- Skills: `~/.claude/skills/`
- Agents: `~/.claude/agents/`
- Hooks: `~/.claude/hooks.json`

### What Gets Installed

**Hooks** (automatic behaviors):

| Hook Type | Name | Trigger | Purpose |
|-----------|------|---------|---------|
| **PreToolUse** | tmux-dev-block | `npm run dev` etc. | Block dev servers outside tmux |
| **PreToolUse** | tmux-reminder | Long-running commands | Suggest tmux for session persistence |
| **PreToolUse** | git-push-review | `git push` | Reminder to review before push |
| **PreToolUse** | doc-file-warn | `.md/.txt` creation | Warn about docs outside `docs/` structure |
| **PreToolUse** | strategic-compact | Edit/Write/Read | Suggest `/compact` at logical boundaries |
| **PostToolUse** | pr-url-logger | `gh pr create` | Log PR URL and review command |
| **PostToolUse** | prettier-format | JS/TS file edits | Auto-format with Prettier |
| **PostToolUse** | typescript-check | `.ts/.tsx` edits | Run `tsc --noEmit` and show errors |
| **PostToolUse** | console-log-warn | JS/TS file edits | Warn about `console.log` statements |
| **Stop** | console-log-audit | Session end | Audit modified files for `console.log` |
| **Stop** | continuous-learning | Session end | Extract patterns to `~/.claude/skills/learned/` |
| **SessionStart** | load-context | Session start | Detect saved context files in `docs/context/` |
| **PreCompact** | save-context-remind | Before `/compact` | Remind to save context before compaction |

### Manual Install

```bash
cp -r skills/* ~/.claude/skills/
cp agents/*.md ~/.claude/agents/
cp hooks.json ~/.claude/hooks.json
```

### Hooks Only

If you only want to update hooks without reinstalling skills:

```bash
cp hooks.json ~/.claude/hooks.json
```

**Restart Claude Code after installation.**

### CLAUDE.md Integration

Enforce the skill workflow in your projects using the init script:

```bash
# Initialize a project with workflow enforcement
./init-workflow.sh ~/projects/myapp           # Standard level (recommended)
./init-workflow.sh ~/projects/myapp minimal   # Lightweight reminder
./init-workflow.sh ~/projects/myapp strict    # Full enforcement

# Or from within your project
cd ~/projects/myapp && /path/to/init-workflow.sh .
```

This script:
- Creates `docs/plans/`, `docs/brainstorms/`, `docs/user-stories/`, `docs/adr/`, `logs/` directories
- Appends workflow rules to existing CLAUDE.md (non-destructive)
- Creates new CLAUDE.md from template if none exists
- Backs up existing CLAUDE.md before modifying

**Enforcement levels:**

| Level | Description |
|-------|-------------|
| `minimal` | Basic 5-line workflow reminder |
| `standard` | Workflow + quality gates + key rules (recommended) |
| `strict` | Complete enforcement with orchestrator pattern, ADRs, security triggers |

**Resources:**
- **[CLAUDE.md Snippets](docs/claude-md-snippets.md)** - All modular snippets for manual customization
- **[Enforcement Rules](docs/enforcement-rules.md)** - Complete rule reference
- **[CLAUDE.md Template](templates/CLAUDE.md.template)** - Full project template

> **Ready to start?** Check out the [Workflow Overview](documentation/01-workflow-overview.md) for a complete guide.

## Usage Examples

### Full Implementation Workflow

```bash
# 1. Brainstorm the idea
/brainstorm
> "I want to add user authentication to the app"

# 2. Define requirements (parallel with ADRs)
/user-story docs/brainstorms/2026-02-17-user-auth.md
> Creates docs/user-stories/EPIC-01-user-auth.md + INDEX.md

# 3. Create a plan
/create-plan
> Creates docs/plans/auth-implementation.md

# 4. Implement the plan
/implement-plan docs/plans/auth-implementation.md
> Executes phases with quality gates

# 5. Run E2E tests
/e2e-testing run
```

### Quick Code Review

```bash
/code-review
> Review the changes in src/auth/
```

### Adversarial Review (Before Merge)

```bash
/adversarial-reviewer --diff main...HEAD
> Spawns Saboteur, New Hire, and Security Auditor subagents in parallel.
> Each must find at least one issue. Findings caught by 2+ personas are
> promoted one severity level. Produces BLOCK / CONCERNS / CLEAN verdict.
```

Use this when `/code-review` came back clean too easily, or before merging
PRs with no human reviewer. The subagent isolation is what breaks the
self-review trap — each persona reviews with no knowledge of prior
conclusions.

### Adversarial Codebase Audit (Inherited / Unfamiliar Repo)

```bash
/adversarial-reviewer --codebase
/adversarial-reviewer --codebase src/api
> Maps the codebase (structure, entry points, churn, tests), then each
> persona strategically deep-reads 5-10 files chosen by its own lens —
> Saboteur picks churning/stateful files, New Hire picks entry-point and
> knowledge-silo files, Security Auditor picks trust boundaries. Produces
> HIGH-RISK / MEDIUM-RISK / LOW-RISK verdict plus a "most-concerning area"
> summary.
```

Use this for onboarding audits, inherited-repo assessments, and periodic
tech-debt checks. Findings are strategic-depth, not exhaustive —
intentionally, because exhaustive whole-repo review from three personas
isn't feasible.

### Comprehensive Codebase Audit (Long-Running, Full Coverage)

```bash
/codebase-audit
/codebase-audit src/                 # scope to subtree
/codebase-audit --resume             # pick up from crash / previous session
/codebase-audit --only api           # re-review just one partition
> Maps repo → proposes partition plan → STOPS for user approval →
> sequentially runs /adversarial-reviewer --codebase on each partition →
> synthesizes systemic findings → produces docs/audits/.../REPORT.md with
> risk register, architectural themes, and a remediation roadmap.
```

This is a multi-step orchestrator that delegates each partition review to
the adversarial-reviewer skill. Expect 200K-500K tokens and 30-60 minutes
for a typical ~500-file repo. Resumable — losing your session mid-audit
doesn't lose the work. Pair with `/code-quality-audit` for the quantitative
complement (coverage, complexity, cycles, mutation).

### Document a Decision

```bash
/adr
> Document the decision to use JWT instead of sessions
```

## Quality Gates (implement-phase)

Each phase passes through these gates:

```
┌─────────────────────────────────────────────────────────────────┐
│                       PHASE PIPELINE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────┐                                         │
│  │ 1. Implementation   │ ─── Subagents write code               │
│  │    [TDD optional]   │     (tests first if tdd_mode: true)    │
│  └─────────┬──────────┘                                         │
│            │ PASS                                                │
│            ▼                                                     │
│  ┌────────────────────┐                                         │
│  │ 2. verification-loop│ ─── 6-phase exit conditions (default)  │
│  │    Build,Type,Lint, │     Build → Type → Lint → Test →       │
│  │    Test,Security,   │     Security → Diff                    │
│  │    Diff             │                                         │
│  └─────────┬──────────┘                                         │
│            │ ALL 6 PASS                                          │
│            ▼                                                     │
│  ┌────────────────────┐                                         │
│  │ 3. Integration Test │ ─── Claude tests via API/Playwright    │
│  └─────────┬──────────┘                                         │
│            │ PASS                                                │
│            ▼                                                     │
│  ┌────────────────────┐     ┌───────────────────┐               │
│  │ 4. Code Review      │────▶│ security-review   │ (optional)   │
│  │    SRP, Patterns    │     │ OWASP audit       │               │
│  └─────────┬──────────┘     └───────────────────┘               │
│            │ PASS                                                │
│            ▼                                                     │
│  ┌────────────────────┐                                         │
│  │ 5. ADR Compliance   │ ─── Follow & document decisions        │
│  └─────────┬──────────┘                                         │
│            │ PASS                                                │
│            ▼                                                     │
│  ┌────────────────────┐                                         │
│  │ 6. Plan Sync        │ ─── Verify work items completed        │
│  └─────────┬──────────┘                                         │
│            │ PASS                                                │
│            ▼                                                     │
│  ┌────────────────────┐                                         │
│  │ 7. Prompt Archive   │ ─── Move prompt to completed/          │
│  └─────────┬──────────┘                                         │
│            │ PASS                                                │
│            ▼                                                     │
│  ┌────────────────────┐                                         │
│  │ 8. Complete         │ ─── Report to orchestrator             │
│  └────────────────────┘                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Mandatory Exit Conditions** (non-negotiable):
- `verification-loop` must PASS (all 6 phases: Build, Type, Lint, Test, Security, Diff)
- Code review must be clean **PASS** (not PASS_WITH_NOTES)
- **All recommendations must be fixed** - recommendations are blocking, not optional
- ADR compliance must PASS

**Optional steps** can be enabled via plan metadata:
- `security_review: true` - Adds OWASP security audit step after code review
- `tdd_mode: true` - Enforces RED → GREEN → REFACTOR cycle with 80% coverage

## Prompt Integration

The `prompt-generator` skill creates phase prompts that are automatically discovered:

```
prompt-generator → docs/prompts/phase-N-name.md
                          ↓
implement-plan discovers prompts automatically
                          ↓
implement-phase uses prompt for orchestration
                          ↓
On completion → docs/prompts/completed/
```

## Orchestrator Pattern

**Critical**: implement-plan and implement-phase are ORCHESTRATORS. They never write code directly.

```
implement-plan (ORCHESTRATOR)
    │   ⛔ NEVER writes code
    │   ⛔ NEVER uses Write/Edit tools
    │
    └── implement-phase (ORCHESTRATOR)
            │   ⛔ NEVER writes code
            │
            └── Subagents (DO the work)
                    ✅ Write code
                    ✅ Create files
                    ✅ Run tests
```

Subagents must be **concise** - return only STATUS, FILES, ERRORS. Large outputs go to disk.

## Code Review: Clean Baseline Principle

Every phase must end clean. Therefore:
- **All errors at review time were introduced by this phase**
- **All errors are blocking** - no exceptions
- **Inherited codebase errors = our job to fix**

## Directory Structure

```
claude-skills-collection/
├── skills/
│   ├── adr/
│   ├── adversarial-reviewer/      # NEW: Hostile-persona subagent review (Saboteur/New Hire/Security)
│   ├── agent-creator/
│   ├── brainstorm/
│   ├── code-quality-audit/       # NEW: Metrics gate (coverage, complexity, size, deps, mutation)
│   ├── code-review/
│   ├── codebase-audit/            # NEW: Long-running full-codebase audit orchestrator
│   ├── codebase-research/
│   ├── context-saver/
│   ├── continuous-learning/      # NEW: Pattern extraction
│   ├── create-plan/
│   ├── e2e-testing/
│   ├── eval-harness/             # NEW: Formal evaluation framework
│   ├── implement-phase/
│   ├── implement-plan/
│   ├── iterate-plan/
│   ├── prompt-generator/
│   ├── security-review/          # NEW: OWASP security audit
│   ├── strategic-compact/        # NEW: Smart compaction suggestions
│   ├── skill-visualizer/         # NEW: Interactive HTML visualizations
│   ├── team-brainstorm/          # Agent team adversarial brainstorm
│   ├── user-story/               # Hierarchical user stories with Given/When/Then
│   ├── team-create-plan/         # NEW: Agent team planning (Architect + Risk Analyst + Researcher)
│   ├── team-implement-plan/      # NEW: Small review team (Implementer + Reviewer)
│   ├── team-implement-plan-full/ # NEW: Full parallel team (per-phase + shared Reviewer)
│   ├── workflow-guide/           # NEW: Recommends workflow mode
│   ├── ship-issue/               # NEW: Issue→merge pipeline (SKILL.md, references/, scripts/dashboard.py)
│   └── verification-loop/        # 6-phase verification
├── agents/
│   ├── browser-verification-agent.md  # NEW: UI testing
│   ├── codebase-analyzer.md
│   ├── codebase-locator.md
│   ├── codebase-pattern-finder.md
│   ├── docs-analyzer.md
│   ├── docs-locator.md
│   ├── issue-planner.md               # NEW: ship-issue planner (Fable 5)
│   ├── merge-gate-reviewer.md         # NEW: ship-issue merge-gate review (Fable 5)
│   ├── tdd-implementer.md             # NEW: ship-issue implementer (Opus 4.8)
│   ├── staging-e2e-verifier.md        # NEW: ship-issue staging E2E (Sonnet 4.6)
│   ├── staging-log-verifier.md        # NEW: ship-issue staging logs (Sonnet 4.6)
│   └── web-search-researcher.md
├── docs/
│   ├── decisions/                # ADRs
│   └── plans/                    # Implementation plans
├── install.sh
└── README.md
```

## Design Principles

1. **Orchestration over Implementation**: Skills coordinate, subagents execute - never write code directly
2. **Quality Gates**: Every phase must pass ALL verification steps before proceeding
3. **Clean Baseline**: Every phase ends clean; all errors are blocking, no exceptions
4. **Context Preservation**: Subagents return concise responses; large outputs go to disk
5. **Extensibility**: Pipeline steps can be added without core changes
6. **Parallel Execution**: Independent tasks run concurrently via background subagents
7. **Precise References**: All analysis includes file:line references
8. **Task-Based Progress**: Progress tracked via Claude Code Task tools, not file modifications

## Progress Tracking with Task Tools

This skill collection uses **Claude Code's native Task tools** for all progress tracking. This replaces the traditional approach of modifying plan file checkboxes.

### Why Task Tools?

| Traditional Approach | Task Tools Approach |
|---------------------|---------------------|
| Modify plan file checkboxes `[x]` | `TaskUpdate(status: "completed")` |
| Parse markdown for progress | `TaskList` returns structured data |
| Single session only | Cross-session persistence |
| File conflicts in teams | Shared task state |
| Progress mixed with spec | Clean separation |

### Task Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                      TASK LIFECYCLE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  create-plan                                                     │
│      │                                                           │
│      ▼                                                           │
│  TaskCreate ─────────────────────────────────────────────────┐  │
│      │  subject: "Phase 1: Setup"                            │  │
│      │  description: "Phase objective..."                    │  │
│      │  activeForm: "Implementing Phase 1"                   │  │
│      │                                                       │  │
│      ▼                                                       │  │
│  TaskUpdate(addBlockedBy) ───────────────────────────────┐  │  │
│      │  Phase 2 blocked by Phase 1                       │  │  │
│      │  Phase 3 blocked by Phase 2                       │  │  │
│      │  ...                                              │  │  │
│      │                                                   │  │  │
│      ▼                                                   │  │  │
│  implement-plan                                          │  │  │
│      │                                                   │  │  │
│      ▼                                                   │  │  │
│  TaskList ◄──────────────────────────────────────────────┘  │  │
│      │  Shows: pending, in_progress, completed, blocked     │  │
│      │                                                      │  │
│      ▼                                                      │  │
│  TaskUpdate(status: "in_progress") ─────────────────────┐  │  │
│      │  Mark phase as started                           │  │  │
│      │                                                  │  │  │
│      ▼                                                  │  │  │
│  implement-phase executes...                            │  │  │
│      │                                                  │  │  │
│      ▼                                                  │  │  │
│  TaskUpdate(status: "completed") ◄──────────────────────┘  │  │
│      │  Mark phase as done                                 │  │
│      │  Unblocks dependent phases                          │  │
│      │                                                     │  │
│      ▼                                                     │  │
│  Next pending task... ◄────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Multi-Session Support

Tasks persist on the filesystem and can be shared across Claude Code sessions:

```bash
# Session 1: Start implementation
CLAUDE_CODE_TASK_LIST_ID=plan-my-feature claude
> /implement-plan docs/plans/my-feature.md
# ... complete Phase 1, 2 ...

# Session 2: Resume from another terminal
CLAUDE_CODE_TASK_LIST_ID=plan-my-feature claude
> /implement-plan docs/plans/my-feature.md
# Automatically resumes from Phase 3
```

### Task Status Display

```
Tasks (2 done, 3 open):
  ✓ #1 Phase 1: Setup
  ✓ #2 Phase 2: Core Logic
  ● #3 Phase 3: Integration (in_progress)
  ◻ #4 Phase 4: Testing › blocked by #3
  ◻ #5 Phase 5: Documentation › blocked by #4
```

### Plan Files Remain Specifications

With Task tools handling progress, plan files remain pure specification documents:

- **No checkbox modifications** during implementation
- **Phase status** tracked via TaskUpdate, not `[x]` markers
- **Work item verification** done by querying TaskList
- **Clean diffs** - plan changes only when spec changes

This separation ensures plans are always authoritative specifications, not progress trackers.

## License

MIT
