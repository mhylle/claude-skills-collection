---
name: team-create-plan
description: Team-based implementation planning with adversarial design review. Spawns an Architect, Risk Analyst, and Researcher who explore competing designs and challenge each other before producing a plan. Use when planning complex features, high-stakes changes, or when multiple valid approaches exist. Triggers on "team create plan", "team plan", "deep plan", or when the user explicitly wants team-based planning.
context: fork
argument-hint: "[topic or brainstorm-path]"
---

# Team Create Plan

## Overview

This skill creates implementation plans through an agent team where independent teammates explore competing designs and challenge each other. Unlike the single-agent `create-plan` which researches and proposes serially, this skill spawns three specialists who work in parallel and debate trade-offs before the lead synthesizes a plan.

**When to use this vs `create-plan`:**
- Use `create-plan` for straightforward plans with clear requirements (~15-20K tokens)
- Use `team-create-plan` for complex designs with multiple valid approaches, high-stakes decisions, or when adversarial review of the plan itself matters (~40-60K tokens)

**Reference**: See `references/team-lifecycle.md` for the standard team lifecycle pattern.

## Initial Response

When this skill is invoked, respond:

> "I'll set up a planning team to explore design options for your feature. An Architect will propose approaches, a Risk Analyst will stress-test them, and a Researcher will validate feasibility against the codebase. Share what you need built, and I'll ask clarifying questions before launching the team."

## Workflow (7 Phases)

### Phase 1: Requirements Capture

Parse the user's request to identify:

| Element | Description |
|---------|-------------|
| **Task description** | What needs to be implemented |
| **Context files** | Relevant existing code or documentation |
| **Constraints** | Timeline, technology, or scope limitations |
| **Brainstorm reference** | If a brainstorm output exists, read it for context |

If a brainstorm path is provided as argument (`$0`), read it fully for pre-existing analysis.

### Phase 2: Socratic Clarification (Lead-Driven)

Before spawning the team, the lead conducts focused clarification with the user. Teammates need a well-defined problem to be effective.

Present initial understanding from any referenced files, then ask:
- What is the most important quality of this implementation? (performance, correctness, maintainability, speed-to-ship)
- Are there constraints the codebase won't reveal? (timeline, team skills, deployment environment)
- Any approaches you've already considered or rejected?

After each round, offer: "I can ask more or launch the planning team. Your call."

Continue until user signals readiness.

### Phase 3: Team Creation & Research

**Step 3a: Create the team**

```
TeamCreate(team_name="plan-{topic-slug}")
```

**Step 3b: Create tasks**

```
TaskCreate(subject="Architect: Design phase structure and technical approach",
           description="Explore codebase, propose 2-3 design options with trade-offs, design phase structure",
           activeForm="Designing technical approach")

TaskCreate(subject="Risk Analyst: Stress-test proposed designs",
           description="Challenge Architect's proposals, identify risks per phase, propose exit conditions",
           activeForm="Analyzing risks and exit conditions")

TaskCreate(subject="Researcher: Validate feasibility against codebase",
           description="Verify Architect's claims against code reality, find existing patterns and precedents",
           activeForm="Researching codebase and precedents")
```

**Step 3c: Spawn teammates**

All teammates are `general-purpose` subagents.

#### Architect

```
Task(subagent_type="general-purpose",
     team_name="plan-{topic-slug}",
     name="architect",
     prompt="You are the Architect on a planning team.

TASK: {refined task description from Phase 2}
CONTEXT: {codebase/project context, constraints, brainstorm reference}

YOUR ROLE: Design the implementation approach and phase structure.

STEP 1 - RESEARCH:
- Use Glob and Grep to find all files related to the feature area
- Read relevant files completely (no partial reads)
- Map existing patterns, conventions, and integration points
- Identify dependencies and constraints from the codebase

STEP 2 - DESIGN OPTIONS:
Propose 2-3 design approaches. For each:
- Description: How it works technically
- Pros and cons
- Which existing codebase patterns it follows
- Estimated complexity (phases needed)
- File:line references for integration points

STEP 3 - PHASE STRUCTURE:
For your recommended approach, propose phases:
- Phase name and objective
- Key tasks per phase (tests first, then implementation)
- Dependencies between phases
- Which files each phase touches

DELIVERABLE: Send your complete design document to the team lead.
Also message 'risk-analyst' with your top recommendation so they can begin challenging it.
Also message 'researcher' with claims that need codebase verification.")
```

#### Risk Analyst

```
Task(subagent_type="general-purpose",
     team_name="plan-{topic-slug}",
     name="risk-analyst",
     prompt="You are the Risk Analyst on a planning team.

TASK: {refined task description from Phase 2}
CONTEXT: {codebase/project context, constraints}

YOUR ROLE: Stress-test the Architect's proposals and ensure the plan is robust.

STEP 1 - WAIT FOR ARCHITECT:
The Architect will message you with their top design recommendation. Review it critically.

STEP 2 - RISK ANALYSIS:
For each design option the Architect proposes:
- What could go wrong in each phase?
- What assumptions might be wrong?
- What dependencies could break?
- What's the hardest part that's being underestimated?
- Apply premortem: 'This plan failed in 3 months — what went wrong?'

STEP 3 - EXIT CONDITIONS:
For each proposed phase, draft exit conditions:
- Build verification (what commands must pass)
- Runtime verification (what must start/respond)
- Functional verification (what behavior must work)
- Be specific — not 'tests pass' but which tests and what they verify

STEP 4 - RISK REGISTER:
Create a risk table:
| Risk | Likelihood | Impact | Mitigation | Phase Affected |

DELIVERABLE: Send your complete risk analysis + exit conditions to the team lead.
Message 'architect' with your top concerns — challenge their assumptions directly.
If Architect's claims seem unverified, message 'researcher' asking for validation.")
```

#### Researcher

```
Task(subagent_type="general-purpose",
     team_name="plan-{topic-slug}",
     name="researcher",
     prompt="You are the Researcher on a planning team.

TASK: {refined task description from Phase 2}
CONTEXT: {codebase/project context, constraints}

YOUR ROLE: Validate the team's claims against codebase reality and gather evidence.

STEP 1 - CODEBASE INVESTIGATION:
- Use Glob/Grep/Read to find all relevant files
- Map the actual architecture (not what's assumed)
- Find similar implementations in the codebase
- Identify existing patterns that must be followed
- Document file:line references for everything

STEP 2 - WEB RESEARCH:
- Search for best practices relevant to this implementation
- Find similar implementations and their lessons learned
- Look for common pitfalls and anti-patterns
- Check for library/framework recommendations

STEP 3 - VALIDATE CLAIMS:
When Architect or Risk Analyst message you with claims to verify:
- Check claims against actual code
- Report back whether claims are accurate or incorrect
- Provide corrected information with file:line references

STEP 4 - FEASIBILITY REPORT:
Document:
- Existing patterns the implementation must follow (with examples)
- Integration points (exact files and functions)
- Similar implementations in the codebase (reference code)
- External best practices that apply
- Anti-patterns to avoid

DELIVERABLE: Send your complete research report to the team lead.
Share relevant findings with 'architect' and 'risk-analyst' as you discover them — don't wait until the end.")
```

### Phase 4: Team Coordination

While teammates work:

1. **Monitor progress** via TaskList
2. **Facilitate debate** — if teammates aren't engaging:
   - Message architect: "The Risk Analyst identified concerns about [X]. How do you address this?"
   - Message risk-analyst: "The Architect's revised approach addresses [Y]. Does this satisfy your concern?"
   - Message researcher: "Can you verify [specific claim] from the Architect?"
3. **Relay findings** between teammates that haven't communicated
4. **Wait for all teammates** to send consolidated findings before proceeding

### Phase 5: Synthesis & User Checkpoint

After receiving all findings, the lead:

**5a. Present design options to user**

Synthesize the team's work into a clear presentation:

```
## Design Options

### Option A: [Architect's recommendation]
- How it works: [from Architect]
- Risks: [from Risk Analyst]
- Feasibility: [from Researcher]
- Risk Analyst's concerns: [specific challenges]

### Option B: [Alternative]
- How it works: [from Architect]
- Risks: [from Risk Analyst]
- Feasibility: [from Researcher]

### Recommendation: [Option X]
Rationale: [synthesized from all three perspectives]
```

**Wait for user to approve approach before writing plan.**

**5b. Present phase structure**

```
Proposed phases (from Architect, stress-tested by Risk Analyst):

Phase 1: [Name] - [Description]
  Key risk: [from Risk Analyst]
Phase 2: [Name] - [Description]
  Key risk: [from Risk Analyst]
...

Does this structure make sense?
```

**Wait for user approval.**

**5c. Document decision as ADR**

If a significant design decision was made:
```
Skill(skill="adr"): Document the design decision.
Context: [from team analysis]
Options: [from Architect]
Decision: [user's choice]
Rationale: [from team debate]
```

### Phase 6: Write Plan & Bootstrap Tasks

After user approves, write the plan file using the same format as `create-plan`:

**Path**: `docs/plans/YYYY-MM-DD-{topic-slug}.md`

The plan must include:
- Overview and Context (from Researcher's findings)
- Design Decision with ADR reference
- Implementation Phases (from Architect, with Risk Analyst's exit conditions)
- Risk register (from Risk Analyst)
- Dependencies (from Researcher's codebase analysis)
- All exit conditions with three verification categories

**Bootstrap tasks** via TaskCreate with sequential dependencies (same pattern as create-plan Phase 7).

**Completion message:**
```
Plan created: [path]
Tasks created: [count] phases with dependencies
Method: Team-based planning (Architect + Risk Analyst + Researcher)

To implement:
  Solo:       /implement-plan [path]
  Small team: /team-implement-plan [path]
  Full team:  /team-implement-plan-full [path]
```

### Phase 7: Shutdown & Cleanup

1. Send shutdown requests to all teammates
2. Wait for confirmations
3. TeamDelete
4. Present plan summary to user

## Quality Checklist

Before finalizing, verify:

- [ ] All three teammates completed their analysis
- [ ] Architect's design was challenged by Risk Analyst
- [ ] Researcher verified claims against actual codebase
- [ ] User approved design approach and phase structure
- [ ] Plan format matches create-plan output format
- [ ] Exit conditions cover all three verification categories per phase
- [ ] Risk register included with mitigations
- [ ] Tasks bootstrapped with dependencies
- [ ] ADR created for significant decisions
- [ ] All teammates shut down and team cleaned up
- [ ] Plan file written successfully

## Team Interaction Protocol

### Expected Communication Flow

```
Architect ──────► Risk Analyst (shares design for challenge)
Architect ──────► Researcher (requests claim verification)
Risk Analyst ───► Architect (challenges assumptions)
Risk Analyst ───► Researcher (requests validation)
Researcher ─────► Architect (provides evidence)
Researcher ─────► Risk Analyst (provides evidence)
All ────────────► Lead (consolidated findings)
```

### Handling Stalls

| Scenario | Action |
|----------|--------|
| Architect hasn't messaged in 2+ minutes | Message asking for status |
| Risk Analyst waiting for Architect | Relay Architect's initial findings |
| Researcher has evidence nobody asked for | Prompt them to share with relevant teammate |
| Disagreement between Architect and Risk Analyst | Present both positions to user for input |
