# Claude Code Skills Collection

Custom skills and agents for Claude Code that enhance codebase research, context management, and implementation planning workflows.

## Contents

### Skills

Skills are invoked via the `Skill` tool in Claude Code.

| Skill | Description |
|-------|-------------|
| **codebase-research** | Orchestrates comprehensive codebase research by decomposing queries into parallel sub-agent tasks. Focuses exclusively on documenting and explaining code as it exists. |
| **context-saver** | Preserves working context to disk for seamless continuation across chat sessions. Extracts signal from noise, capturing essential state while discarding ephemeral details. |
| **create-plan** | Creates detailed implementation plans through interactive research and iteration. Designs feature specifications and technical work plans. |
| **implement-plan** | Executes approved technical implementation plans with verification checkpoints. Implements pre-approved development plans with defined phases and success criteria. |
| **iterate-plan** | Updates existing implementation plans through user feedback with thorough research and validation. Refines technical approaches in existing plans. |

### Agents

Agents are specialized sub-agents launched via the `Task` tool for parallel execution.

| Agent | Description |
|-------|-------------|
| **codebase-analyzer** | Traces implementation details with precise file:line references. Pure documentarian - explains what exists without critique. |
| **codebase-locator** | Finds files by topic/feature. A "Super Grep/Glob/LS" for locating all files related to a specific feature. |
| **codebase-pattern-finder** | Finds concrete code examples of patterns, usage examples, and implementation conventions. |
| **docs-analyzer** | Extracts high-value insights from documentation, ADRs, and design documents. Filters noise and extracts decisions, constraints, and specifications. |
| **docs-locator** | Finds documentation, research notes, design documents, and historical context within project directories. |
| **web-search-researcher** | Researches information not in training data using web search. For APIs, libraries, current best practices, and troubleshooting. |

## Installation

### Quick Install (Recommended)

```bash
./install.sh
```

This will:
1. Copy skills to `~/.claude/skills/`
2. Copy agents to `~/.claude/agents/`

### Manual Install

Copy the directories to your Claude config:

```bash
# Skills
cp -r skills/* ~/.claude/skills/

# Agents
cp agents/*.md ~/.claude/agents/
```

## Usage

### Using Skills

Skills are triggered when their conditions match or explicitly invoked:

```
# Research a codebase topic
skill: codebase-research

# Save current session context
skill: context-saver

# Create an implementation plan
skill: create-plan
```

### Using Agents

Agents are launched via the Task tool in Claude Code's system prompt. They run as specialized sub-agents:

```
# In Claude Code conversation
"Let me use the codebase-analyzer agent to trace how authentication works..."
```

## Skill/Agent Philosophy

These tools follow key principles:

1. **Document, Don't Critique**: Codebase agents explain what exists without suggesting improvements unless asked
2. **Parallel Execution**: Skills decompose work into parallel sub-agent tasks for efficiency
3. **Signal Extraction**: Context-saver and analyzers focus on capturing essential information, discarding noise
4. **Precise References**: All code analysis includes file:line references for easy navigation

## Directory Structure

```
claude-skills-collection/
├── skills/
│   ├── codebase-research/
│   │   └── SKILL.md
│   ├── context-saver/
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── context-template.md
│   ├── create-plan/
│   │   └── SKILL.md
│   ├── implement-plan/
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── plan-format.md
│   └── iterate-plan/
│       └── SKILL.md
├── agents/
│   ├── codebase-analyzer.md
│   ├── codebase-locator.md
│   ├── codebase-pattern-finder.md
│   ├── docs-analyzer.md
│   ├── docs-locator.md
│   └── web-search-researcher.md
└── README.md
```

## License

MIT
