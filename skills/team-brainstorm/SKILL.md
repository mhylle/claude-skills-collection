---
name: team-brainstorm
description: Adversarial brainstorming using agent teams for multi-perspective analysis. Use when users want thorough idea exploration with real debate between independent perspectives. Triggers on "team brainstorm", "adversarial brainstorm", "brainstorm with team", "debate this idea", or when the user explicitly requests team-based analysis. Higher token cost but significantly deeper analysis than single-agent brainstorm.
---

# Team Brainstorm

## Overview

This skill provides deep brainstorming through **agent teams** where independent teammates embody distinct perspectives and debate each other. Unlike the single-agent `brainstorm` skill which simulates multiple perspectives serially, this skill spawns real teammates that challenge, counter-argue, and build on each other's findings.

**When to use this vs `brainstorm`**:
- Use `brainstorm` for quick idea exploration (~8-12K tokens)
- Use `team-brainstorm` for critical decisions, high-stakes ideas, or when adversarial depth matters (~25-40K tokens)

## Initial Response

When this skill is invoked, respond:

> "I'll set up a brainstorm team to explore your idea from multiple adversarial perspectives. Each teammate will independently analyze and debate with the others. Share your idea, and I'll ask clarifying questions before launching the team."

## Workflow (6 Phases)

### Phase 1: Idea Capture

Parse the user's initial idea/concept and identify:

| Element | Description |
|---------|-------------|
| **Core Concept** | The fundamental idea being proposed |
| **Stated Goals** | What the user explicitly wants to achieve |
| **Implied Constraints** | Limitations mentioned or implied |
| **Project Context** | Whether this relates to an existing codebase |

### Phase 2: Socratic Clarification (Lead-Driven)

Before spawning the team, the lead conducts focused clarification with the user. This is critical — teammates need a well-defined problem.

Ask 2-4 rounds of clarifying questions covering:
- **Scope**: What boundaries should this have? What's out of scope?
- **Assumptions**: What are we taking for granted?
- **Success criteria**: What does "good" look like?
- **Constraints**: Technical, time, resource limits?

After each round, offer: "I have more questions if you'd like to continue, or I can launch the analysis team. Your call."

Continue until user signals readiness.

### Phase 3: Team Creation & Research

Create the brainstorm team and spawn teammates for parallel research and analysis.

**Step 3a: Create the team**

```
TeamCreate(team_name="brainstorm-{topic-slug}")
```

**Step 3b: Create tasks**

Create tasks for each teammate's work using TaskCreate. Structure tasks so each has clear deliverables and independence.

**Step 3c: Spawn teammates**

Spawn the following teammates. Each is a `general-purpose` subagent with a specific perspective prompt.

#### Core Analysis Team (Always Spawn)

**1. Devil's Advocate** — Attacks the idea
```
Task(subagent_type="general-purpose",
     team_name="brainstorm-{topic-slug}",
     name="devils-advocate",
     prompt="You are the Devil's Advocate for this brainstorm team.

CONCEPT: {refined concept from Phase 2}
CONTEXT: {any codebase/project context}

YOUR ROLE: Attack this idea ruthlessly but constructively.
- Find every weakness, risk, and failure mode
- Challenge assumptions the others might accept
- Identify what could go wrong at every level (technical, business, user, timeline)
- Apply premortem analysis: imagine this failed in 6 months — what went wrong?
- When other teammates share findings, push back on overly optimistic assessments

DELIVERABLE: Write a structured critique covering:
1. Top 5 risks with likelihood/impact ratings
2. Assumptions that could prove false
3. Failure modes from premortem analysis
4. Warning signs to watch for
5. Challenges to other teammates' findings

Message your teammates to debate their findings. Challenge the Optimist especially.
After analysis, message the team lead with your consolidated findings.")
```

**2. Optimist** — Champions the idea
```
Task(subagent_type="general-purpose",
     team_name="brainstorm-{topic-slug}",
     name="optimist",
     prompt="You are the Optimist for this brainstorm team.

CONCEPT: {refined concept from Phase 2}
CONTEXT: {any codebase/project context}

YOUR ROLE: Champion this idea and find its strongest arguments.
- Identify all benefits, opportunities, and value creation
- Find evidence and precedents that support the approach
- Explore best-case outcomes and what makes them achievable
- Counter risks raised by the Devil's Advocate with mitigations
- Identify who benefits and how

DELIVERABLE: Write a structured case covering:
1. Top 5 benefits with supporting evidence
2. Opportunities this creates
3. Best-case scenario and how to get there
4. Rebuttals to likely criticisms
5. Success precedents from similar efforts

Message the devils-advocate to debate risks vs opportunities.
After analysis, message the team lead with your consolidated findings.")
```

**3. Creative Explorer** — Generates alternatives
```
Task(subagent_type="general-purpose",
     team_name="brainstorm-{topic-slug}",
     name="creative-explorer",
     prompt="You are the Creative Explorer for this brainstorm team.

CONCEPT: {refined concept from Phase 2}
CONTEXT: {any codebase/project context}

YOUR ROLE: Generate creative alternatives and enhancements.
- Apply SCAMPER: Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse
- Explore unconventional approaches from other domains
- Ask 'what if we did the opposite?'
- Combine the idea with unexpected elements
- Simplify — what's the minimal version that captures the core value?

DELIVERABLE: Write a structured exploration covering:
1. SCAMPER analysis (each letter applied to the concept)
2. Top 3 alternative approaches with trade-offs
3. Minimal viable version of the concept
4. Cross-domain inspiration (what analogies from other fields apply?)
5. Enhancement opportunities

Message other teammates to get their reactions to your alternatives.
After analysis, message the team lead with your consolidated findings.")
```

**4. Researcher** — Gathers evidence
```
Task(subagent_type="general-purpose",
     team_name="brainstorm-{topic-slug}",
     name="researcher",
     prompt="You are the Researcher for this brainstorm team.

CONCEPT: {refined concept from Phase 2}
CONTEXT: {any codebase/project context}

YOUR ROLE: Gather factual evidence to ground the team's debate.
- Search the web for similar implementations, best practices, and lessons learned
- If project context exists, research the codebase for related patterns and integration points
- Find data points that support or challenge the concept
- Identify industry standards and anti-patterns
- Look for case studies of similar approaches

DELIVERABLE: Write a structured research report covering:
1. Similar implementations found (successes and failures)
2. Industry best practices relevant to this concept
3. Anti-patterns to avoid
4. Codebase context (if applicable): related files, patterns, integration points
5. Data points and evidence that inform the decision

Share relevant findings with other teammates as you discover them.
After research, message the team lead with your consolidated findings.")
```

#### Optional Specialist (Spawn When Project Context Detected)

**5. Technical Architect** — Evaluates feasibility
```
Task(subagent_type="general-purpose",
     team_name="brainstorm-{topic-slug}",
     name="architect",
     prompt="You are the Technical Architect for this brainstorm team.

CONCEPT: {refined concept from Phase 2}
CONTEXT: {codebase/project context}

YOUR ROLE: Evaluate technical feasibility and design implications.
- Analyze how this fits into the existing architecture
- Identify technical dependencies and constraints
- Propose high-level implementation approach
- Estimate complexity and highlight the hardest parts
- Flag where this conflicts with existing patterns

DELIVERABLE: Write a structured technical assessment covering:
1. Feasibility rating (straightforward / moderate / complex / risky)
2. Key technical dependencies
3. Proposed high-level approach
4. Hardest unsolved problems
5. Architectural trade-offs

Message other teammates with technical constraints that affect their analysis.
After analysis, message the team lead with your consolidated findings.")
```

### Phase 4: Team Coordination

While teammates work:

1. **Monitor progress** via TaskList
2. **Facilitate debate** — if teammates aren't messaging each other, prompt them:
   - Message devils-advocate: "The optimist found strong precedents. How do you counter?"
   - Message optimist: "The devil's advocate identified critical risks. Can you propose mitigations?"
   - Message creative-explorer: "Given the risks and benefits identified, which alternatives address the top concerns?"
3. **Feed cross-team insights** — relay important findings between teammates that haven't communicated
4. **Wait for all teammates** to send their consolidated findings before proceeding

### Phase 5: Synthesis & Debate Resolution

After receiving all teammate findings, the lead synthesizes:

**5a. Consolidate the debate**

Create a structured synthesis that captures where teammates **agreed** and **disagreed**:

| Topic | Devil's Advocate | Optimist | Resolution |
|-------|-----------------|----------|------------|
| [Key point 1] | [Their position] | [Their position] | [What emerged from debate] |
| [Key point 2] | [Their position] | [Their position] | [What emerged from debate] |

**5b. Extract actionable insights**

- **Validated Strengths**: Benefits that survived the Devil's Advocate's scrutiny
- **Real Risks**: Risks the Optimist couldn't fully mitigate
- **Best Alternatives**: Creative options that address identified weaknesses
- **Evidence Base**: Research findings that ground the analysis
- **Technical Feasibility**: Architect's assessment (if applicable)
- **Key Decisions Required**: Open questions needing user input

**5c. Document architectural decisions**

If significant decisions emerged, invoke the ADR skill:
```
Skill(skill="adr"): Document key decision from team brainstorm.
```

### Phase 6: Output & Cleanup

**6a. Write structured output**

Write to `docs/brainstorms/YYYY-MM-DD-{topic-slug}-team.md`:

```markdown
# Team Brainstorm: [Idea Name]

**Date**: YYYY-MM-DD
**Method**: Agent Team (adversarial multi-perspective)
**Status**: Ready for Planning | Needs More Exploration
**Team Size**: [N teammates]

## Executive Summary
[2-3 sentence refined description incorporating team debate outcomes]

## Idea Evolution

### Original Concept
[User's original description]

### Refined Understanding
[How the idea evolved through Socratic questioning]

### Key Clarifications
- [Clarification 1]
- [Clarification 2]

## Team Debate Summary

### Points of Agreement
- [Point where all perspectives aligned]

### Points of Contention
| Topic | Position A | Position B | Resolution |
|-------|-----------|-----------|------------|
| [Topic] | [View] | [Counter-view] | [Outcome] |

### Debate Highlights
[Notable exchanges between teammates that produced insights]

## Analysis Results

### Validated Strengths (survived adversarial scrutiny)
- [Strength 1 — challenged by Devil's Advocate, defended because...]
- [Strength 2 — supported by research evidence...]

### Real Risks (not fully mitigated)
| Risk | Likelihood | Impact | Best Mitigation | Residual Concern |
|------|------------|--------|-----------------|------------------|
| [Risk 1] | H/M/L | H/M/L | [Strategy] | [What remains] |

### Creative Alternatives
| Alternative | Pros | Cons | Addresses Risk |
|-------------|------|------|---------------|
| [Alt 1] | [...] | [...] | [Which risk it solves] |

### Gaps Identified
- [ ] **[Gap 1]** — Suggested approach: [...]
- [ ] **[Gap 2]** — Suggested approach: [...]

### Premortem Findings
- **Failure mode**: [Description] → **Prevention**: [Strategy]

## Research Findings

### External Evidence
- [Finding 1 with source/precedent]
- [Finding 2 with source/precedent]

### Anti-Patterns to Avoid
- [Anti-pattern 1]

### Codebase Context (if applicable)
- Related files: [file:line references]
- Existing patterns: [patterns]
- Integration points: [components]

## Technical Assessment (if applicable)
- **Feasibility**: [Rating]
- **Key Dependencies**: [...]
- **Proposed Approach**: [High-level]
- **Hardest Problems**: [...]

## Architectural Decisions

### Documented ADRs
| ADR | Title | Status |
|-----|-------|--------|
| [ADR-NNNN](../decisions/ADR-NNNN-title.md) | [Title] | Proposed/Accepted |

## Recommended Next Steps
1. [Immediate next step]
2. [Follow-up step]
3. [Future consideration]

## Ready for Create-Plan
**[Yes/No]**

**If Yes**: Well-defined and adversarially tested — ready for implementation planning.
**If No**: [What needs more exploration]

### Suggested Plan Scope
[What create-plan should focus on]
```

**6b. Shutdown teammates**

After writing the output:
1. Send shutdown requests to all teammates
2. Wait for confirmations
3. Clean up the team with TeamDelete

**6c. Present to user**

Summarize the key outcomes and offer:
- "Want me to invoke create-plan to start implementation planning?"
- "Want to explore any of the contested points further?"

## Team Interaction Protocols

### Lead Responsibilities
- Provide clear, detailed spawn prompts with full context
- Facilitate debate when teammates aren't engaging each other
- Resolve deadlocks by asking the user for input
- Synthesize findings into coherent output
- Manage team lifecycle (create → coordinate → shutdown → cleanup)

### Teammate Communication Guidelines
- Teammates should message each other to challenge findings
- Devils-advocate and optimist should directly debate key points
- Researcher shares evidence with all teammates as discovered
- Creative-explorer proposes alternatives informed by the debate
- Architect provides feasibility checks on proposals

### Handling Stalls
If a teammate goes idle without sending findings:
1. Message them asking for a status update
2. If still stuck, provide additional guidance
3. If unresponsive, spawn a replacement

## Quality Checklist

Before finalizing output, verify:

- [ ] All teammates completed their analysis
- [ ] Cross-teammate debate occurred (not just isolated reports)
- [ ] Devil's Advocate genuinely challenged the idea
- [ ] Optimist's case survived scrutiny (or gaps were noted)
- [ ] Creative alternatives were evaluated against identified risks
- [ ] Research grounded the debate in evidence
- [ ] Technical feasibility assessed (if project context exists)
- [ ] Synthesis captures both agreement and disagreement
- [ ] Output file written successfully
- [ ] All teammates shut down and team cleaned up
- [ ] Ready-for-plan status is accurate
