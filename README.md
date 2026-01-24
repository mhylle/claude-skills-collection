# Claude Code Skills Collection

Custom skills and agents for Claude Code that enhance codebase research, context management, and implementation planning workflows.

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

## Implementation Workflow

The core workflow for implementing features follows this hierarchy:

```
                              ┌─────────────────┐
                              │   brainstorm    │
                              │  (idea → spec)  │
                              └────────┬────────┘
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
| **Planning** | `create-plan` | Create detailed, phased implementation plans |
| **Iteration** | `iterate-plan` | Update plans based on feedback |
| **Execution** | `implement-plan` | Orchestrate full plan execution |
| **Phase Work** | `implement-phase` | Execute single phase with quality gates |
| **Quality** | `code-review` | Verify code quality, patterns, ADR compliance |
| **Security** | `security-review` | OWASP-aligned security audit (optional step) |
| **Verification** | `verification-loop` | 6-phase verification: build, type, lint, test, security, diff |
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
| **create-plan** | `/create-plan`, "plan the implementation" | Creates detailed implementation plans through research |
| **iterate-plan** | "update the plan", "iterate on this plan" | Updates existing plans based on feedback |
| **implement-plan** | `/implement-plan`, "implement the plan" | Orchestrates execution of complete plans |
| **implement-phase** | Called by implement-plan | Executes single phase with all quality gates |

### Quality & Documentation

| Skill | Trigger | Description |
|-------|---------|-------------|
| **code-review** | `/code-review`, Step 3 of implement-phase | Systematic review: SRP, patterns, ADR compliance |
| **adr** | `/adr`, "document decision" | Creates Architecture Decision Records |
| **e2e-testing** | `/e2e-testing`, "test my webapp" | E2E testing with Playwright MCP |
| **security-review** | `/security-review`, auth/input code | 10-category OWASP-aligned security audit |
| **verification-loop** | `/verification-loop`, "verify implementation" | 6-phase verification: build, type, lint, test, security, diff |
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

### Development

| Skill | Trigger | Description |
|-------|---------|-------------|
| **agent-creator** | "create agent", "build agent" | Creates composable AI agent systems in NestJS |

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
| Hook | Skill | Trigger | Purpose |
|------|-------|---------|---------|
| PreToolUse | `strategic-compact` | Before each tool call | Monitor session complexity, suggest `/compact` at logical boundaries |
| Stop | `continuous-learning` | Session end | Extract valuable patterns and save to `~/.claude/skills/learned/` |

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

## Usage Examples

### Full Implementation Workflow

```bash
# 1. Brainstorm the idea
/brainstorm
> "I want to add user authentication to the app"

# 2. Create a plan
/create-plan
> Creates docs/plans/auth-implementation.md

# 3. Implement the plan
/implement-plan docs/plans/auth-implementation.md
> Executes phases with quality gates

# 4. Run E2E tests
/e2e-testing run
```

### Quick Code Review

```bash
/code-review
> Review the changes in src/auth/
```

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

**Extensible**: Optional steps can be enabled via plan metadata:
- `security_review: true` - Adds OWASP security audit step after code review
- `tdd_mode: true` - Enforces RED → GREEN → REFACTOR cycle with 80% coverage

> **Note**: `verification-loop` is the **default** exit condition in Step 2, not optional.

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
│   ├── agent-creator/
│   ├── brainstorm/
│   ├── code-review/
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
│   └── verification-loop/        # NEW: 6-phase verification
├── agents/
│   ├── browser-verification-agent.md  # NEW: UI testing
│   ├── codebase-analyzer.md
│   ├── codebase-locator.md
│   ├── codebase-pattern-finder.md
│   ├── docs-analyzer.md
│   ├── docs-locator.md
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
