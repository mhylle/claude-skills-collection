---
name: brainstorm
description: Interactive idea refinement using Socratic questioning methodology. This skill should be used when users want to explore an idea, find gaps in concepts, enhance proposals, or structure thoughts before implementation planning. Triggers on "brainstorm", "explore this idea", "find holes in", "help me think through", "what am I missing", or when presenting rough concepts that need refinement. Output integrates with create-plan skill.
---

# Brainstorm

## Overview

This skill provides structured single-session brainstorming through Socratic questioning and targeted analytical frameworks. It helps users refine raw ideas into well-structured concepts ready for implementation planning.

The key philosophy: **adapt the analysis to the idea, not the idea to the analysis.** Different types of ideas benefit from different frameworks. A risk-heavy initiative needs premortem analysis, not SCAMPER. A product feature needs SCAMPER, not just risk tables. Select the right tools for the job rather than running everything mechanically.

This skill runs in the main conversation, not a subagent. Phase 2 waits on the user's answers before continuing, and Phase 5 writes a file and offers follow-up skills — none of which a forked context can do, since it has no conversation history, gets backgrounded by default, and (under `agent: Explore`) has no write tools. Don't add `context: fork` or `agent:` to the frontmatter.

## Initial Response

When this skill is invoked, don't use a canned response. Instead, acknowledge the user's idea naturally and start engaging immediately. If the user has already described their idea, summarize your understanding and begin asking clarifying questions. If they haven't, ask them to share what they're thinking about.

Avoid scripted openings like "I'm ready to help you explore and refine your idea." Just start the conversation.

## Workflow (5 Phases)

### Phase 1: Idea Capture & Classification

Parse the user's initial idea/concept and identify:

| Element | Description |
|---------|-------------|
| **Core Concept** | The fundamental idea being proposed |
| **Stated Goals** | What the user explicitly wants to achieve |
| **Implied Constraints** | Limitations mentioned or implied |
| **Project Context** | Whether this relates to an existing codebase |
| **Idea Type** | Classification (see below) |

**Idea Type Classification** — Classify the idea to guide framework selection later:

| Type | Signals | Example |
|------|---------|---------|
| **Product/Feature** | New feature, UX change, user-facing capability | "Add a dashboard for metrics" |
| **Architecture/Technical** | System design, refactoring, infrastructure | "Migrate to microservices" |
| **Strategy/Business** | Market approach, pricing, partnerships | "Enter the enterprise segment" |
| **Process/Workflow** | How work gets done, tooling, automation | "Automate our deploy pipeline" |
| **Creative/Open** | Vague idea, exploration, "what if" | "What if we made it social?" |
| **Risk/Problem** | Something's broken, risky, or concerning | "Our auth system worries me" |

**Complexity Check** — Flag ideas that may be too complex for a single-session brainstorm:
- Multiple distinct problem domains
- More than 5-6 major components or stakeholders
- Spans organizational boundaries
- Multi-month timeline with phases

If complexity is high, mention it: "This has a lot of dimensions — we can cover the key angles in this session, but if you want to go really deep, the `deep-brainstorm` skill spreads exploration across multiple sessions and builds a persistent knowledge structure."

**Project Context Detection** — Flag for codebase research when:
- User mentions specific files, modules, or features
- User references "the current system" or "our codebase"
- User mentions extending/modifying existing functionality

After parsing, summarize understanding and begin Phase 2.

### Phase 2: Socratic Clarification

Engage in iterative questioning until the user signals readiness to proceed.

**Question Categories** (reference: `references/questioning-frameworks.md`):

1. **Scope Questions** — What boundaries should this have? What's out of scope?
2. **Assumption Questions** — What are we taking for granted? What must be true?
3. **Alternative Questions** — What other approaches exist? What's the opposite?
4. **Consequence Questions** — What happens if this succeeds? Fails? Second-order effects?
5. **Evidence Questions** — What supports this? How could we test it?

**How to question well**:
- Ask 2-4 questions per round, mixing categories
- Build on previous answers — don't just cycle through a list
- Use "what" and "how" more than "why" (less confrontational)
- Acknowledge insights before probing deeper
- Don't criticize during clarification — that's for analysis

**Parking Lot** — When the user mentions tangential ideas, interesting threads, or "oh and we could also..." thoughts that aren't central to the core concept, note them. Keep a mental running list and include them in the output. Good ideas shouldn't get lost just because they're not the main topic.

**Continuation Protocol**:
- After each round, give a signal about depth: "There are some interesting threads around [X] and [Y] I'd like to probe — want to keep going, or is the picture clear enough to move to analysis?"
- Continue until user explicitly signals readiness
- Don't rush this phase — thorough questioning produces better outcomes

### Phase 3: Targeted Research

Spawn research agents only when they'll add genuine value. Don't research for the sake of researching.

**Web Research** — Spawn when the idea would benefit from external context (most ideas do, but very internal/project-specific ones may not):
```
Task(subagent_type="web-search-researcher",
     prompt="Research best practices, common patterns, and pitfalls for [idea topic].
             Find:
             1. Similar implementations and how they succeeded/failed
             2. Industry best practices and anti-patterns to avoid
             3. Common technical approaches and their trade-offs
             4. Lessons learned from comparable projects
             Focus on actionable insights, not just general information.")
```

**Codebase Research** — Spawn only when project context was detected in Phase 1:
```
Task(subagent_type="codebase-locator",
     prompt="Find all files related to [relevant feature area]. Include:
             - Core implementation files
             - Configuration and setup files
             - Test files
             - Documentation")

Task(subagent_type="codebase-analyzer",
     prompt="Analyze how [related functionality] is currently implemented.
             Trace the data flow and identify integration points.
             Include file:line references.")

Task(subagent_type="codebase-pattern-finder",
     prompt="Find implementation patterns for [type of implementation] in this codebase.
             Look for:
             - Similar features and how they're structured
             - Conventions for [relevant patterns]
             - Testing approaches used")
```

Don't wait idly for agents — move to Phase 4 and incorporate findings when they arrive.

### Phase 4: Focused Analysis

**Select 1-2 frameworks** based on idea type. Applying all frameworks to every idea produces noise. Pick the ones that will generate the most useful insights.

| Idea Type | Primary Framework | When to Add Secondary |
|-----------|-------------------|----------------------|
| **Product/Feature** | SCAMPER | Add Six Hats if stakeholder complexity is high |
| **Architecture/Technical** | Six Thinking Hats | Add Premortem if high-risk |
| **Strategy/Business** | Six Thinking Hats | Add Premortem if reversibility is low |
| **Process/Workflow** | SCAMPER | Add Six Hats if cross-team impact |
| **Creative/Open** | SCAMPER | Add Six Hats (Green + Blue) for direction |
| **Risk/Problem** | Premortem | Add Six Hats (Black + White + Yellow) |

#### Six Thinking Hats (when selected)

| Hat | Focus | Key Questions |
|-----|-------|---------------|
| **White** | Facts | What do we know? What data is missing? |
| **Red** | Intuition | What's the gut reaction? What feels risky or exciting? |
| **Black** | Risks | What could go wrong? What obstacles exist? |
| **Yellow** | Benefits | What benefits does this bring? What's the best case? |
| **Green** | Creativity | What creative alternatives exist? What's unconventional? |
| **Blue** | Process | Is this the right problem? Are we approaching it right? |

Don't force all six hats if only 3-4 are producing meaningful insights.

#### SCAMPER (when selected)

| Letter | Question |
|--------|----------|
| **S**ubstitute | What could be replaced with something better? |
| **C**ombine | What could be merged with existing capabilities? |
| **A**dapt | What patterns from other domains could apply? |
| **M**odify | What could be amplified, reduced, or changed? |
| **P**ut to other use | What alternative applications exist? |
| **E**liminate | What unnecessary complexity could be removed? |
| **R**everse | What could be reorganized or inverted? |

Skip letters that don't produce meaningful insights for this particular idea.

#### Premortem (when selected)

1. "Imagine this has completely failed 6 months from now."
2. "What went wrong?" — technical, people, process, external
3. "What warning signs did we ignore?"
4. "What did we underestimate?"
5. "How do we prevent each failure mode?"

Focus on the 3-5 most realistic failure modes, not an exhaustive list.

### Phase 5: Synthesis & Output

Consolidate findings into actionable insights and write the output document.

**Determine Output Location**:
- Default: `docs/brainstorms/YYYY-MM-DD-{topic-slug}.md`
- Create directory if it doesn't exist

**Write the output** — include only sections with meaningful content. The template below shows all possible sections; omit any that would just contain filler.

```markdown
# Brainstorm: [Idea Name]

**Date**: YYYY-MM-DD
**Status**: Ready for Planning | Needs More Exploration
**Type**: [Product/Feature | Architecture | Strategy | Process | Creative | Risk]

## Executive Summary
[2-3 sentence refined description of the idea after exploration]

## Idea Evolution

### Original Concept
[What the user initially described — preserve their words]

### Refined Understanding
[How the idea evolved through questioning — what became clearer]

### Key Clarifications
- [Clarification 1]
- [Clarification 2]

## Analysis

### Strengths
[Validated strengths with supporting evidence. Source these from
Yellow Hat findings or SCAMPER opportunities, depending on which
framework was used.]

### Risks & Concerns
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk 1] | H/M/L | H/M/L | [Strategy] |

[Source from Black Hat, Premortem, or both.]

### Gaps
- [ ] **[Gap 1]** — Suggested approach: [...]

### Enhancement Opportunities
[Only if SCAMPER was used. List the meaningful findings, not all 7 letters.]

### Premortem Findings
[Only if Premortem was used.]
- **Failure mode**: [Description] → **Prevention**: [Strategy]

## Research Findings

### External Best Practices
[Only if web research was conducted]

### Codebase Context
[Only if codebase research was conducted]
- Relevant files: [file:line references]
- Existing patterns: [patterns]
- Integration points: [components]

## Parking Lot
[Tangential ideas captured during the session that are worth revisiting]
- [Idea 1]
- [Idea 2]

## Recommended Next Steps
1. [Immediate next step]
2. [Follow-up step]

## Ready for Create-Plan
**[Yes/No]**

**If Yes**: Well-defined and ready for implementation planning.
**If No**: [What needs more exploration]

### Suggested Plan Scope
[What create-plan should focus on]
```

**After writing**:
1. Confirm file was saved
2. Present a concise summary to the user
3. If status is "Ready for Planning", offer to invoke create-plan
4. If the idea proved complex, suggest deep-brainstorm for areas that need more exploration

**ADR Integration** — Only invoke the ADR skill when a significant architectural or strategic decision clearly crystallized during the session (e.g., the user chose between competing approaches, a technology decision was made). Don't force ADR creation when no real decision was made.

## Quality Checklist

Before finalizing output, verify:

- [ ] Socratic clarifications were thorough (not rushed)
- [ ] Framework selection matched the idea type
- [ ] Only relevant frameworks were applied
- [ ] Research was conducted where valuable (not mechanically)
- [ ] Risks have mitigation strategies
- [ ] Gaps have suggested approaches
- [ ] Parking lot captured tangential ideas
- [ ] Output includes only meaningful sections (no filler)
- [ ] Output file was written successfully
- [ ] Ready-for-plan status is accurate
- [ ] Complexity escalation to deep-brainstorm was suggested if warranted

## Resources

### references/
- `questioning-frameworks.md` - Detailed question templates for Socratic, Six Hats, SCAMPER, and Premortem frameworks
