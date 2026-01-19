# Claude Skills Collection

A collection of skills for Claude Code that follow an orchestration workflow pattern.

## Orchestration Workflow

This collection emphasizes context preservation through:
- **Orchestrator sessions** that coordinate but never do direct work
- **Subagents** that execute tasks and return concise results
- **File-based communication** for large outputs
- **Context preservation** through checkpointing

See `docs/references/subagent-guidelines.md` for subagent behavior standards.

## Available Skills

### Planning & Implementation
- `/create-plan` - Create detailed implementation plans through research and iteration
- `/implement-plan` - Execute approved plans using orchestrator pattern with subagents
- `/iterate-plan` - Update existing plans through user feedback

### Research & Ideation
- `/codebase-research` - Comprehensive codebase research with parallel sub-agents
- `/brainstorm` - Interactive idea refinement using Socratic questioning

### Context Management
- `/context-saver` - Save session context for continuation
- `/context-loader` - Load saved context into new sessions

### Testing
- `/e2e-testing` - E2E testing with Playwright MCP (orchestrator pattern)

### Utilities
- `/prompt-generator` - Generate orchestration prompts for phase-based execution
- `/branded-presentation-creator` - Create branded PowerPoint presentations

## Key References

- `docs/references/subagent-guidelines.md` - How subagents should behave
- `docs/references/hooks-patterns.md` - Context preservation hooks
- `docs/plans/skills-orchestration-review.md` - Full orchestration pattern documentation

## Quick Start

1. Use `/create-plan` to plan new work
2. Use `/implement-plan` to execute the plan
3. Use `/context-saver` to checkpoint progress
4. Use `/context-loader` to resume in new sessions
