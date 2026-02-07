# Team Brainstorm: Evolving the Workflow for Agent Teams

**Date**: 2026-02-07
**Method**: Agent Team (adversarial multi-perspective)
**Status**: Ready for Planning
**Team Size**: 4 teammates (Devil's Advocate, Optimist, Creative Explorer, Researcher)

## Executive Summary

The team analyzed how to evolve the skills workflow (brainstorm -> create-plan -> implement-plan -> implement-phase -> iterate-plan -> test) to support both the current subagent/orchestrator model and the new agent teams model. The team reached strong consensus on a focused, incremental approach: add team variants only where adversarial debate adds genuine value (create-plan, possibly iterate-plan), keep execution stages as subagents, and use a simple config-flag routing mechanism.

## Idea Evolution

### Original Concept
Add agent-team variants to all workflow stages, with a routing mechanism that helps users choose between subagent and team modes based on task complexity vs token cost. Support hybrid workflows mixing both modes.

### Refined Understanding
Through team debate, the concept was significantly narrowed. The key insight: **agent teams add value for deliberation stages (brainstorming, planning) but are structurally incompatible with execution stages** due to the constraint that teammates cannot spawn subagents. The orchestrator pattern (implement-plan -> implement-phase -> subagents) is hierarchical; teams are flat peers. These architectures are fundamentally different and should not be forced together.

### Key Clarifications
- Teams work for debate/analysis; subagents work for execution
- One-team-per-session constraint means teams must be per-stage, not cross-stage
- Teammates cannot spawn subagents — fatal for implementation orchestrators
- The current /clear-between-phases pattern kills team persistence
- Hybrid workflows (team brainstorm -> subagent implement) are the natural model

## Team Debate Summary

### Points of Agreement
- team-brainstorm is proven and should remain as-is
- implement-plan and implement-phase should NOT get team variants
- verification-loop should NOT get a team variant
- Option C (config flag routing) is the right approach
- MVP should be small: one new team skill + routing config

### Points of Contention

| Topic | Devil's Advocate | Optimist | Creative Explorer | Researcher | Resolution |
|-------|-----------------|----------|-------------------|------------|------------|
| team-create-plan | "Prove it first" — no evidence teams improve plans | "Top priority" — parallel researchers + competing designs | "Yes, 3 members: Architect, Risk Analyst, Researcher" | "MAYBE — design exploration benefits, but interactive user loop doesn't fit teams well" | **Build it as MVP** — strongest candidate after brainstorm |
| team-iterate-plan | "No — surgical edits, low complexity" | "No — low priority" | "Yes, 2 members: Change Analyst, Validator" | "No — interactive editing with user" | **Defer** — weak case, revisit if create-plan succeeds |
| team-implement-phase | "No — teammates can't spawn subagents, breaks orchestrator pattern" | Initially "Yes" → revised to No after constraint surfaced | "No — execution, not deliberation" | "MAYBE for Step 1 only, but file conflict risk" | **No** — structural incompatibility |
| Routing intelligence | "Heuristics will be wrong 40% of time" | "Config flag is simple enough" | "Complexity scoring with 5 signals" | N/A | **Simple config flag first** — add heuristics only if users want auto mode |
| Overall scope | "Don't build this beyond team-brainstorm" | "Extend proven patterns to all deliberation stages" | "MVP: one new skill + env var" | "Strongest candidate is team-create-plan" | **Focused MVP** — team-create-plan + routing config |

### Debate Highlights
- Devil's Advocate's strongest point: "Teammates cannot spawn subagents" — this single constraint eliminates team variants for all execution stages
- Optimist's strongest point: "Fix loop elimination offsets team overhead" — teams catch issues earlier, reducing total work
- Creative Explorer's "Reverse" insight: What if teams were the default for deliberation stages and solo was the optimization? This reframes quality as the default
- Researcher's evidence: Current skills already parallelize well with subagents; team overhead only justified where debate adds qualitative value

## Analysis Results

### Validated Strengths (survived adversarial scrutiny)
- **Team-brainstorm is proven** — adversarial debate genuinely produces deeper analysis than serial single-agent frameworks
- **create-plan benefits from competing perspectives** — multiple architects exploring different designs simultaneously, then debating trade-offs, produces better plans than serial option presentation
- **Option C routing is minimally invasive** — env var + config flag matches existing patterns (CLAUDE_CODE_TASK_LIST_ID, tdd_mode, security_review flags)
- **Task tools provide cross-session resilience** — teams die on session end but progress persists via TaskList

### Real Risks (not fully mitigated)

| Risk | Likelihood | Impact | Best Mitigation | Residual Concern |
|------|------------|--------|-----------------|------------------|
| Token cost 3-4x for team stages | HIGH | MEDIUM | Routing defaults to subagent; team is opt-in | Users may not know when teams are worth the cost |
| Team debate quality depends on prompt quality | MEDIUM | HIGH | Reuse team-brainstorm's proven prompt patterns | Each new team skill needs careful prompt engineering |
| Agent teams API changes (experimental) | MEDIUM | HIGH | Minimal coupling — team skills are separate files, not modifications to existing skills | Could break team-create-plan if API changes fundamentally |
| One-team-per-session blocks multi-stage teams | HIGH | LOW (mitigated by design) | Don't try multi-stage teams; each stage creates/destroys its own team | Loses potential for persistent team context across stages |
| Maintenance burden of dual-mode skills | MEDIUM | MEDIUM | Separate skill files (not dual-mode logic inside existing skills) | Still doubles the number of deliberation-stage skills |

### Creative Alternatives

| Alternative | Pros | Cons | Addresses Risk |
|-------------|------|------|---------------|
| **Combine brainstorm + create-plan** into single `team-design` | Eliminates handoff gap, one team session from idea to plan | Longer session, harder to resume | Token cost, maintenance burden |
| **Micro-teams of 2-3** instead of 4-5 | Lower token cost, faster convergence | Less breadth of perspectives | Token cost explosion |
| **Teams-first default** for deliberation stages | Quality becomes default, users opt down | Higher baseline cost | Wrong-mode selection |
| **Shared heuristic module** (`references/mode-selection.md`) | Consistent auto-selection across skills | Still needs good heuristics | Routing accuracy |

### Gaps Identified
- [ ] **No metrics for team vs subagent quality** — Can't prove teams produce better plans without evaluation
- [ ] **No user research on mode selection UX** — Do users want to choose, or just have it work?
- [ ] **team-create-plan prompt engineering** — Team compositions proposed but prompts not written
- [ ] **Auto mode heuristics unvalidated** — Complexity scoring proposed but untested

### Premortem Findings
- **Failure mode**: Built team variants for all stages, nobody uses them beyond team-brainstorm → **Prevention**: MVP approach — build only team-create-plan, validate before expanding
- **Failure mode**: Routing heuristic recommends wrong mode 40% of time → **Prevention**: Default to subagent, make team opt-in, skip auto mode until validated
- **Failure mode**: Agent teams API changes break team skills → **Prevention**: Separate skill files, minimal coupling, no modifications to existing skills
- **Failure mode**: Maintenance burden makes skill collection a full-time project → **Prevention**: Keep team skills small (< 400 lines), reuse patterns from team-brainstorm

## Technical Assessment

### Feasibility: Straightforward (for MVP)

The MVP requires:
1. One new skill file: `skills/team-create-plan/SKILL.md`
2. One shared reference: `skills/references/mode-selection.md`
3. Minor updates to existing skill preambles to check `WORKFLOW_MODE`

No modifications to implement-plan, implement-phase, or any execution-stage skills.

### Key Dependencies
- Agent teams experimental flag (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`)
- TeamCreate, SendMessage, TaskCreate/Update tools
- Existing team-brainstorm as reference implementation

### Proposed team-create-plan Composition

| Role | Responsibility | Spawned As |
|------|---------------|------------|
| **Architect** | Designs phase structure, identifies dependencies, proposes technical approach | general-purpose teammate |
| **Risk Analyst** | Stress-tests plan, identifies risks per phase, proposes exit conditions | general-purpose teammate |
| **Researcher** | Validates feasibility via codebase + web research, finds existing patterns | general-purpose teammate |

Lead handles: user interaction, checkpoint confirmations, final plan writing, team lifecycle.

### Proposed Routing Mechanism (Option C)

```
WORKFLOW_MODE env var (or plan metadata):
  "subagent" (default) — all stages use current subagent approach
  "team"               — deliberation stages use team variants
  "auto"               — complexity scoring selects per stage (future)

Per-stage override:
  /brainstorm --mode=team
  /create-plan --mode=subagent

Plan metadata (per-phase config):
  phase_config:
    team_mode: true    # matches existing tdd_mode, security_review patterns
```

### Complexity Scoring (for future "auto" mode)

| Signal | 0 (Simple) | 1 (Moderate) | 2 (Complex) | 3 (Critical) |
|--------|-----------|-------------|-------------|--------------|
| Scope | Single file | Single module | Multi-module | Cross-system |
| Stakes | Cosmetic | Internal tool | User-facing | Auth/payments |
| Novelty | Existing pattern | Extends pattern | New pattern | Greenfield |
| Integration | No deps | 1-2 points | 3-5 points | 6+ or external |
| Ambiguity | Clear reqs | Minor unknowns | Multiple approaches | Exploratory |

Total 0-4: subagent. Total 5-9: micro-team (2-3). Total 10+: full team (4-5).

## Recommended Next Steps

1. **Build team-create-plan** — Follow team-brainstorm pattern. 3 teammates (Architect, Risk Analyst, Researcher). Keep under 400 lines.
2. **Add WORKFLOW_MODE support** — Env var checked in brainstorm and create-plan preambles. Default: subagent.
3. **Create references/mode-selection.md** — Shared heuristic reference for future auto mode.
4. **Validate** — Use team-create-plan on 3-5 real planning tasks. Compare quality and token cost vs subagent create-plan.
5. **Decide on iterate-plan** — If create-plan validation succeeds, consider team-iterate-plan (2 members).
6. **Document** — Update README, workflow docs with dual-mode support.

## Ready for Create-Plan
**Yes**

The concept is well-defined and adversarially tested. The MVP is focused: one new skill + routing config.

### Suggested Plan Scope
- Primary deliverable: `team-create-plan` skill + `WORKFLOW_MODE` routing
- Key phases: (1) Design team-create-plan prompts, (2) Implement skill, (3) Add routing config, (4) Update docs, (5) Validate with real tasks
- Critical success factors: Team debate produces measurably better plans than solo create-plan; token cost stays under 4x
