# Quality Pipeline Distribution Reference

Documents who owns each step of the 8-step `implement-phase` quality pipeline when `implement-plan` drives it.

## The 8-Step Pipeline

| Step | Name | Purpose |
|------|------|---------|
| 1 | Implementation | Write code, create files, implement features |
| 2 | Exit Conditions (verification-loop) | Build, type-check, lint, test, security, diff |
| 3 | Integration Testing | End-to-end API/UI verification |
| 4 | Code Review | Quality review with structured feedback |
| 5 | ADR Compliance | Architectural decision adherence |
| 6 | Plan Sync | Verify work items, update plan status |
| 7 | Prompt Archival | Archive used prompts to completed folder |
| 8 | Completion Report | Generate phase summary |

## Distribution (`implement-plan` + `implement-phase`)

Single orchestrator delegates all work to subagents.

| Step | Owner | Method |
|------|-------|--------|
| 1. Implementation | Subagents | Orchestrator spawns subagents to write code |
| 2. Verification-loop | Subagents | Orchestrator spawns subagent to run checks |
| 3. Integration Testing | Subagents | Orchestrator spawns test subagents |
| 4. Code Review | `devflow:code-review` | Orchestrator invokes skill |
| 5. ADR Compliance | `adr` skill | Orchestrator invokes skill |
| 6. Plan Sync | Orchestrator | Reads plan, verifies items, updates tasks |
| 7. Prompt Archival | Orchestrator | Moves prompt file |
| 8. Completion Report | Orchestrator | Synthesizes results |

**Characteristics:**
- Sequential execution (one phase at a time)
- All coordination through one orchestrator session
- Subagents are stateless (spawn, execute, report, terminate)
