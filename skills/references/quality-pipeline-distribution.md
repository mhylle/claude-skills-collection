# Quality Pipeline Distribution Reference

Documents how the 8-step `implement-phase` quality pipeline maps to team roles across workflow modes.

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

## Distribution by Mode

### Solo Mode (`implement-plan` + `implement-phase`)

Single orchestrator delegates all work to subagents.

| Step | Owner | Method |
|------|-------|--------|
| 1. Implementation | Subagents | Orchestrator spawns subagents to write code |
| 2. Verification-loop | Subagents | Orchestrator spawns subagent to run checks |
| 3. Integration Testing | Subagents | Orchestrator spawns test subagents |
| 4. Code Review | `code-review` skill | Orchestrator invokes skill |
| 5. ADR Compliance | `adr` skill | Orchestrator invokes skill |
| 6. Plan Sync | Orchestrator | Reads plan, verifies items, updates tasks |
| 7. Prompt Archival | Orchestrator | Moves prompt file |
| 8. Completion Report | Orchestrator | Synthesizes results |

**Characteristics:**
- Sequential execution (one phase at a time)
- All coordination through one orchestrator session
- Subagents are stateless (spawn, execute, report, terminate)

### Small Team Mode (`team-implement-plan`)

2-3 teammates with specialized roles. Teammates implement directly.

| Step | Owner | Method |
|------|-------|--------|
| 1. Implementation | **Implementer** | Direct Write/Edit/Bash |
| 2. Verification-loop | **Implementer** | Bash: build, lint, test commands |
| 3. Integration Testing | **Reviewer** | Bash: curl, test commands |
| 4. Code Review | **Reviewer** | Read files, apply review checklist |
| 5. ADR Compliance | **Reviewer** | Read ADRs, check compliance |
| 6. Plan Sync | **Integrator** or Lead | TaskUpdate |
| 7. Prompt Archival | Lead | Move prompt files |
| 8. Completion Report | Lead | Synthesize teammate reports |

**Characteristics:**
- Implementer and Reviewer work in sequence per phase (implement then review)
- Optional Integrator for plans with 4+ phases
- File ownership: Implementer owns source files during a phase, Reviewer is read-only
- Fix loop: Reviewer sends NEEDS_CHANGES to Implementer, Implementer fixes, re-requests review

**Flow per phase:**
```
Lead assigns phase → Implementer implements (Steps 1-2)
    → Implementer messages Reviewer "ready for review"
    → Reviewer reviews (Steps 3-5)
    → [Fix loop if needed]
    → Reviewer sends PASS to Lead
    → Lead completes Steps 6-8
```

### Full Team Mode (`team-implement-plan-full`)

One implementer per phase in current wave, shared reviewer. Parallel execution within waves.

| Step | Owner | Method |
|------|-------|--------|
| 1. Implementation | **phase-N-impl** | Direct code writing within file scope |
| 2. Verification-loop | **phase-N-impl** | Build/lint/test scoped to their phase |
| 3. Integration Testing | **phase-N-impl** | Tests within phase scope |
| 4. Code Review | **reviewer** | Cross-phase consistency + per-phase quality |
| 5. ADR Compliance | **reviewer** | Centralized ADR knowledge |
| 6. Plan Sync | Lead | Single writer to task status |
| 7. Prompt Archival | Lead | Single writer to prompt files |
| 8. Completion Report | Lead | Aggregates all phase reports per wave |

**Characteristics:**
- Multiple implementers run in parallel (one per phase in wave)
- Single shared reviewer processes reviews FIFO
- File ownership enforced: each implementer has defined file scope
- Shared files (index files, module registrations) handled by Lead after wave completes
- Wave transitions require user confirmation

**Flow per wave:**
```
Lead identifies wave phases → Spawns implementers for each
    → Implementers work in parallel (Steps 1-3)
    → Each messages reviewer when ready
    → Reviewer processes FIFO (Steps 4-5)
    → [Fix loops per implementer as needed]
    → All wave phases pass → Lead completes Steps 6-8
    → User confirms → Next wave
```

## Comparison Matrix

| Aspect | Solo | Small Team | Full Team |
|--------|------|------------|-----------|
| Parallelism | None (sequential phases) | None (sequential phases) | Yes (parallel within waves) |
| Token cost | Low (~30-40K/phase) | Medium (~60-80K/phase) | High (~100-150K/wave) |
| Review quality | Skill-based (automated) | Teammate-based (adversarial) | Teammate-based (cross-phase) |
| Coordination overhead | Minimal | Low | Medium |
| Best for | Simple plans, 1-3 phases | Moderate plans, quality-sensitive | Large plans, 4+ independent phases |
| Fix loop speed | Subagent respawn | Direct teammate message | Direct teammate message |
| Cross-phase consistency | Manual (orchestrator) | Optional integrator | Reviewer + Lead |

## Key Design Decisions

### Why teammates implement directly (not via subagents)

Teammates use Write/Edit/Bash tools directly rather than spawning nested subagents because:
1. Teammates cannot spawn nested teams
2. Subagent-within-teammate pattern is unproven at scale
3. Direct implementation reduces latency and token overhead
4. The orchestration shifts: Lead orchestrates teammates, teammates implement

### Why one reviewer (not one per implementer)

A single shared reviewer provides:
1. Consistent quality standards across all phases
2. Cross-phase architectural awareness
3. Lower token cost than multiple reviewers
4. FIFO processing prevents bottlenecks on any single phase

### Why wave-based execution (not all-at-once)

Waves provide:
1. Bounded concurrency (max 4 implementers + 1 reviewer)
2. Respect for phase dependencies
3. User confirmation points between waves
4. Manageable context for the reviewer
