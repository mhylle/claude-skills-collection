# Context File Template

Use this template when creating context files. Copy and fill in the sections.

---

```markdown
# Context: {Descriptive Title}

> Saved: {YYYY-MM-DDTHH:MM:SS}
> Session: {brief-identifier}
> Status: in-progress | blocked | ready-for-review | completed

## Trajectory

**Goal**: {One sentence describing the ultimate outcome}

**Success Criteria**:
- {Measurable outcome 1}
- {Measurable outcome 2}

**Current Phase**: planning | implementing | debugging | testing | refining

## Problem Statement

{2-4 sentences: What triggered this work, key constraints, why existing solutions don't suffice}

## Active Code Focus

### Primary Files

| File | Lines | Reason |
|------|-------|--------|
| `src/example/file.ts` | 45-78 | Core logic being modified |

### Key Code Context

```typescript
// src/example/file.ts:45-60
// Brief explanation of why this code matters
export class ExampleService {
  // Key method being modified
  async process(): Promise<void> {
    // Current implementation state
  }
}
```

### Dependencies & Relationships

- `file1.ts` imports `ServiceA` from `file2.ts`
- `ComponentX` depends on `ServiceY` for data fetching

## Decisions Made

| Decision | Rationale | Alternatives Rejected |
|----------|-----------|----------------------|
| Use Strategy A | Better performance for our use case | Strategy B (too complex), Strategy C (doesn't scale) |

## Approaches Taken

### Succeeded
- {Approach}: {Result}

### Failed/Abandoned
- {Approach}: {Why it failed - important to prevent re-trying}

### In Progress
- {Current approach}: {State and what remains}

## User Requirements

> Verbatim captures of user requests:
> - "Must support X format"
> - "Performance should be under Y ms"

## Blockers & Open Questions

- [ ] {Blocker}: {What's needed to unblock}
- [ ] {Question}: {Why it matters}

## Next Steps

1. {Specific action with file:function reference}
2. {Following action}
3. {Subsequent action}

## Session Notes

{Debugging findings, environment quirks, temporary workarounds, anything that doesn't fit above}

---
*Resume command*: `Continue working on {brief description}. Read CONTEXT-{topic}.md first.`
```

---

## Section Guidelines

### Trajectory
- Keep Goal to ONE sentence
- Success criteria should be testable/measurable
- Phase helps orient the next session

### Active Code Focus
- Max 3-5 primary files
- Code excerpts max 30 lines each
- Always include line numbers
- Explain WHY this code matters, not just WHAT it does

### Decisions Made
- Always include rejected alternatives
- Rationale prevents re-debating decisions

### Approaches Taken
- Failed approaches are CRITICAL - prevents wasted effort
- Include lessons learned from failures

### User Requirements
- Quote verbatim when possible
- Even seemingly minor asks can be important

### Next Steps
- Each step should be actionable without more context
- Reference specific files/functions
- Order by dependency

## Size Targets

| Section | Target Lines |
|---------|--------------|
| Trajectory | 5-10 |
| Problem Statement | 3-5 |
| Active Code Focus | 30-60 |
| Decisions | 5-15 |
| Approaches | 10-20 |
| User Requirements | 5-10 |
| Blockers | 3-10 |
| Next Steps | 5-10 |
| Session Notes | 0-20 |
| **Total** | **100-200** |

Aim for under 300 lines total. If longer, consolidate or split into multiple context files.
