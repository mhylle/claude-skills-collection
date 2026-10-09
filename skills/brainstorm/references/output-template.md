# Brainstorm Output Template

The Phase 5 document, written to `docs/brainstorms/YYYY-MM-DD-<topic-slug>.md`. Planning skills read it, so keep the headings and the status line as shown.

## Rules

- Include a section only when it has real content. An empty or filler section is worse than none.
- Keep the user's own words in Original Concept.
- `<topic-slug>`: lowercase, hyphen-separated, at most five words.
- When continuing an earlier brainstorm, update that file in place: revise the sections, set **Updated** to today's date, and add a line to Session History saying what this session changed.
- Status is **Ready for Planning** only when the scope is clear, the key choices are made and no gap blocks a plan; otherwise **Needs More Exploration**, and the Ready for Planning section says what is missing.

## Template

```markdown
# Brainstorm: <Idea Name>

**Date**: YYYY-MM-DD
**Updated**: YYYY-MM-DD            <!-- only when continued in a later session -->
**Status**: Ready for Planning | Needs More Exploration
**Type**: Product/Feature | Architecture/Technical | Strategy/Business | Process/Workflow | Creative/Open | Risk/Problem

## Executive Summary
2–3 sentences: the idea as it stands after the session.

## Idea Evolution
### Original Concept
What the user first described, in their words.
### Refined Understanding
What became clearer, and what changed.
### Key Clarifications
- <decision or clarification, with the reason when there was one>

## Analysis
### Strengths
### Risks & Concerns
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| <risk> | H/M/L | H/M/L | <strategy> |
### Gaps
- **<gap>**: <suggested way to close it>
### Enhancement Opportunities
<SCAMPER findings worth keeping>
### Premortem Findings
- **<failure mode>**: warning signs <…>; prevention <…>; fallback <…>

## Research Findings
### External Practice
- <finding> ([source](URL), date)
### Codebase Context
- Relevant files: `<path:line>` — <role>
- Patterns to follow: <…>
- Constraints: <…>

## Parking Lot
- <tangent worth revisiting>

## Recommended Next Steps
1. <next step>

## Ready for Planning
**Yes | No**: <if No, what has to be settled first>

### Suggested Plan Scope
What a plan should cover, and what it should leave out.

## Session History
- YYYY-MM-DD: <what this session covered or changed>   <!-- only when continued -->
```
