# Claude Code Skills Collection

Custom skills and agents for Claude Code that enhance codebase research, context management, and implementation planning workflows.

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
┌──────────────────────────────────────────────────────────────────────────┐
│                           implement-plan                                  │
│                        (orchestrates all phases)                          │
│                                                                           │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│   │   Phase 1   │───▶│   Phase 2   │───▶│   Phase N   │───▶ Complete    │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                  │
│          │                  │                  │                          │
│          ▼                  ▼                  ▼                          │
│   ┌─────────────────────────────────────────────────────┐                │
│   │              implement-phase (per phase)             │                │
│   │  ┌─────────────────────────────────────────────┐    │                │
│   │  │ Step 1: Implementation (subagents)          │    │                │
│   │  │ Step 2: Exit Condition Verification         │    │                │
│   │  │ Step 3: code-review ──────────────────────┐ │    │                │
│   │  │ Step 4: ADR Compliance ───┐               │ │    │                │
│   │  │ Step 5: Plan Sync         │               │ │    │                │
│   │  │ Step 6: Completion Report │               │ │    │                │
│   │  └───────────────────────────┼───────────────┼─┘    │                │
│   └──────────────────────────────┼───────────────┼──────┘                │
│                                  │               │                        │
│                                  ▼               ▼                        │
│                           ┌──────────┐    ┌─────────────┐                │
│                           │   adr    │    │ code-review │                │
│                           └──────────┘    └─────────────┘                │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │   e2e-testing   │
                              │  (validation)   │
                              └─────────────────┘
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
| **Decisions** | `adr` | Document architectural decisions |
| **Testing** | `e2e-testing` | End-to-end validation with Playwright |

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

### Research & Context

| Skill | Trigger | Description |
|-------|---------|-------------|
| **codebase-research** | "how does X work" | Parallel codebase research with sub-agents |
| **context-saver** | `/context-saver`, "save context" | Preserves session state for continuation |
| **prompt-generator** | `/prompt`, "generate prompt" | Creates implementation prompts for phases |

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

## Installation

### Quick Install

```bash
./install.sh
```

Installs to:
- Skills: `~/.claude/skills/`
- Agents: `~/.claude/agents/`

### Manual Install

```bash
cp -r skills/* ~/.claude/skills/
cp agents/*.md ~/.claude/agents/
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
┌─────────────────────────────────────────────────────────┐
│                    PHASE PIPELINE                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐                                   │
│  │ 1. Implementation │ ─── Subagents write code         │
│  └────────┬─────────┘                                   │
│           │ PASS                                        │
│           ▼                                             │
│  ┌──────────────────┐                                   │
│  │ 2. Exit Conditions│ ─── Build, Runtime, Functional   │
│  └────────┬─────────┘                                   │
│           │ ALL PASS                                    │
│           ▼                                             │
│  ┌──────────────────┐                                   │
│  │ 3. Code Review    │ ─── SRP, Patterns, Quality       │
│  └────────┬─────────┘                                   │
│           │ PASS or PASS_WITH_NOTES                     │
│           ▼                                             │
│  ┌──────────────────┐                                   │
│  │ 4. ADR Compliance │ ─── Follow & document decisions  │
│  └────────┬─────────┘                                   │
│           │ PASS                                        │
│           ▼                                             │
│  ┌──────────────────┐                                   │
│  │ 5. Plan Sync      │ ─── Update plan checkboxes       │
│  └────────┬─────────┘                                   │
│           │ PASS                                        │
│           ▼                                             │
│  ┌──────────────────┐                                   │
│  │ 6. Prompt Archive │ ─── Move prompt to completed/    │
│  └────────┬─────────┘                                   │
│           │ PASS                                        │
│           ▼                                             │
│  ┌──────────────────┐                                   │
│  │ 7. Complete       │ ─── Report to orchestrator       │
│  └──────────────────┘                                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Extensible**: New steps can be added (security-scan, performance-check, etc.)

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
│   │   ├── SKILL.md
│   │   └── references/
│   ├── agent-creator/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── brainstorm/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── code-review/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── codebase-research/
│   │   └── SKILL.md
│   ├── context-saver/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── create-plan/
│   │   └── SKILL.md
│   ├── e2e-testing/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── implement-phase/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── implement-plan/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── iterate-plan/
│   │   └── SKILL.md
│   └── prompt-generator/
│       ├── SKILL.md
│       └── references/
├── agents/
│   ├── codebase-analyzer.md
│   ├── codebase-locator.md
│   ├── codebase-pattern-finder.md
│   ├── docs-analyzer.md
│   ├── docs-locator.md
│   └── web-search-researcher.md
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

## License

MIT
