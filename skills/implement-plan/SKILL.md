---
name: implement-plan
description: Execute approved technical implementation plans with verification checkpoints. This skill should be used when implementing pre-approved development plans, feature implementations, or technical specifications that have defined phases, success criteria, and verification steps. Triggers on requests like "implement the plan", "execute the implementation plan", or when given a path to a plan file.
---

# Implement Plan

Execute approved technical implementation plans with built-in verification checkpoints, progress tracking, and human-in-the-loop validation.

## When to Use This Skill

- Implementing pre-approved technical plans or specifications
- Executing phased development work with defined success criteria
- Following structured implementation guides with verification steps
- Resuming partially-completed implementation work

## Getting Started

When given a plan path or asked to implement a plan:

1. **Locate the Plan**: Find the plan file (typically in `docs/plans/`, `thoughts/plans/`, or specified path)
2. **Read Completely**: Read the entire plan without pagination - full context is essential
3. **Check Progress**: Look for existing checkmarks (`- [x]`) indicating completed work
4. **Read Referenced Files**: Load all files mentioned in the plan fully
5. **Understand Interconnections**: Analyze how components fit together
6. **Create Progress Tracker**: Use TodoWrite to track implementation progress
7. **Begin Implementation**: Start only when requirements are clearly understood

If no plan path is provided, ask: "Which plan should I implement? Please provide the path or name."

## Implementation Workflow

### Phase Execution Protocol

For each phase in the plan:

```
1. READ phase requirements and success criteria
2. IMPLEMENT changes following plan specifications
3. VERIFY against success criteria (typically tests, linting, type checks)
4. FIX any issues before proceeding
5. UPDATE checkboxes in plan file using Edit tool
6. PAUSE for human verification (unless executing consecutive phases)
```

### Progress Tracking

Maintain dual tracking:
- **Plan File**: Update checkboxes (`- [ ]` → `- [x]`) as sections complete
- **TodoWrite**: Track granular progress within current session

### Verification Pause Format

After completing automated verification for a phase:

```
Phase [N] Complete - Ready for Manual Verification

Automated verification passed:
- [List automated checks: tests, lint, type checks, build]

Please perform manual verification steps from the plan:
- [List manual verification items]

Confirm when manual testing is complete to proceed to Phase [N+1].
```

**Note**: Skip pauses between consecutive phases if instructed to execute multiple phases. Pause only after the final phase.

## Handling Mismatches

When reality diverges from the plan:

1. **STOP** - Do not force-fit the plan
2. **ANALYZE** - Think deeply about why the mismatch exists
3. **PRESENT** - Communicate clearly using this format:

```
Issue in Phase [N]:
Expected: [what the plan specifies]
Found: [actual situation in codebase]
Why this matters: [impact on implementation]

Options:
A) [First approach to resolve]
B) [Alternative approach]

Recommendation: [Suggested path forward]

How should I proceed?
```

Common mismatch causes:
- Codebase evolved since plan creation
- Plan assumptions were incorrect
- Dependencies changed
- Better approaches discovered during implementation

## Resuming Interrupted Work

When a plan has existing checkmarks:

1. **Trust Completion**: Assume checked items are done correctly
2. **Find Resume Point**: Locate first unchecked item
3. **Verify Context**: Read surrounding completed work for context
4. **Continue Forward**: Pick up implementation from unchecked items

Only verify previous work if something seems inconsistent or broken.

## Implementation Philosophy

Plans are carefully designed guides, but judgment matters:

- **Follow Intent**: Adapt to what you find while honoring the plan's goals
- **Complete Phases**: Finish each phase fully before advancing
- **Maintain Context**: Verify changes fit the broader codebase
- **Communicate Issues**: Surface problems early rather than working around them
- **Forward Momentum**: Focus on implementing solutions, not just checking boxes

## Quality Gates

Before marking any phase complete:

| Check | Command/Action | Required |
|-------|----------------|----------|
| Tests Pass | `npm test` / `pytest` / project test command | Yes |
| Lint Clean | `npm run lint` / project lint command | Yes |
| Types Valid | `npm run typecheck` / type checking | Yes |
| Build Succeeds | `npm run build` / project build command | Yes |
| Manual Steps | As specified in plan | If listed |

## Reference Materials

See `references/plan-format.md` for:
- Standard plan structure and formatting
- Phase organization guidelines
- Success criteria patterns
- Verification step templates
