# Mindmap-on-Disk Schema

Machine-readable state and directory structure specification for deep brainstorming sessions.

## Directory Structure

```
docs/brainstorms/deep/{topic-slug}/
├── _index.md              # Root node: central idea, executive summary, navigation
├── _mindmap.yaml          # Machine-readable state (THE resume file)
├── _parking-lot.md        # Ideas parked for later exploration
├── _decisions.md          # Running decision log
├── _connections.md        # Cross-area links, synergies, contradictions
├── areas/
│   ├── {area-slug}/
│   │   ├── _overview.md   # Area summary, HMW questions, status
│   │   ├── analysis.md    # Deep analysis (methodology results)
│   │   ├── ideas.md       # Generated and refined ideas
│   │   └── sub-areas/     # Deeper expansion (Lotus Blossom, etc.)
│   │       └── {sub-slug}/
│   │           └── _overview.md
│   └── ...
└── sessions/
    ├── session-001.md     # Session log: explored, outcomes, next steps
    └── ...
```

## `_mindmap.yaml` Schema

```yaml
# Deep Brainstorm State File
# This is the single source of truth for resume detection and session continuity.

topic: "string"                    # Central topic / idea name
slug: "string"                     # URL-safe identifier (directory name)
created: "YYYY-MM-DD"             # Date of first session
last_session: "YYYY-MM-DD"        # Date of most recent session
session_count: 0                   # Total sessions completed

phase: seed | explore | connect | deepen | converge
# seed     - Initial capture, area identification, scaffold
# explore  - Deep-diving individual areas
# connect  - Cross-area concept mapping
# deepen   - Lotus Blossom expansion, TRIZ, Assumption Mapping
# converge - Six Thinking Hats + Premortem synthesis

status: active | paused | complete

areas:
  - slug: "string"                 # Directory name under areas/
    name: "string"                 # Human-readable area name
    status: unexplored | in-progress | explored | deep-dived
    methodology: "string | null"   # Methodology used or planned (SCAMPER, Morphological, etc.)
    session_explored: 0            # Session number when first explored (0 = not yet)
    sub_areas: []                  # List of sub-area slugs (from Lotus Blossom etc.)
    notes: "string | null"         # Brief status note

parking_lot_count: 0               # Number of parked ideas
decision_count: 0                  # Number of logged decisions
connection_count: 0                # Number of cross-area connections

sessions:
  - number: 1
    date: "YYYY-MM-DD"
    phase: "string"                # Phase during this session
    focus: "string"                # What was explored
    areas_touched: []              # Area slugs modified
    outcome: "string"              # Brief outcome summary

next_suggested:
  phase: "string"                  # Suggested next phase
  focus: "string"                  # Suggested focus area or activity
  rationale: "string"             # Why this is suggested
```

## Status Enums

### Phase

| Value | Description | Entry Criteria |
|-------|-------------|----------------|
| `seed` | Initial session | New brainstorm |
| `explore` | Area deep-dives | Areas identified, scaffold created |
| `connect` | Cross-area mapping | 2+ areas explored |
| `deepen` | Sub-area expansion | Connections identified, areas need more depth |
| `converge` | Final synthesis | Sufficient exploration done |

### Area Status

| Value | Description |
|-------|-------------|
| `unexplored` | Identified but not yet analyzed |
| `in-progress` | Currently being explored |
| `explored` | One methodology pass completed |
| `deep-dived` | Multiple methodologies or sub-area expansion done |

## Document Templates

### `_index.md`

```markdown
# Deep Brainstorm: {Topic}

**Created**: YYYY-MM-DD
**Phase**: {current phase}
**Sessions**: {count}

## Central Idea
{Core concept description}

## Areas
{List of areas with status indicators and links}

## Executive Summary
{Updated after each session - current understanding of the landscape}

## Navigation
- [Parking Lot](_parking-lot.md)
- [Decisions](_decisions.md)
- [Connections](_connections.md)
- Sessions: {links to session logs}
```

### `areas/{slug}/_overview.md`

```markdown
# Area: {Name}

**Status**: {unexplored|in-progress|explored|deep-dived}
**Methodology**: {methodology used}

## Summary
{What this area covers}

## How Might We...
- HMW {question 1}?
- HMW {question 2}?

## Key Insights
{Bullet list of insights from analysis}

## Open Questions
{What remains to explore}
```

### `sessions/session-NNN.md`

```markdown
# Session {NNN} - YYYY-MM-DD

**Phase**: {phase}
**Focus**: {what was explored}
**Duration context**: {brief note on scope}

## Warm-Up Recap
{State at session start}

## What We Explored
{Detailed account of the session}

## Key Outcomes
- {outcome 1}
- {outcome 2}

## New Ideas Generated
- {idea 1}
- {idea 2}

## Parked for Later
- {parked item, if any}

## Decisions Made
- {decision, if any}

## Next Steps
{Suggested focus for next session}
```

### `_parking-lot.md`

```markdown
# Parking Lot

Ideas captured but not yet explored. Review at the start of each session.

| # | Idea | Source Session | Area (if known) | Status |
|---|------|---------------|-----------------|--------|
| 1 | {idea} | {session #} | {area or "unassigned"} | parked / graduated / discarded |
```

### `_decisions.md`

```markdown
# Decision Log

Running record of decisions made during deep brainstorming.

## Decision {N}: {Title}
- **Date**: YYYY-MM-DD (Session {N})
- **Context**: {Why this decision was needed}
- **Options Considered**: {What alternatives existed}
- **Decision**: {What was decided}
- **Rationale**: {Why}
- **Impact**: {What areas/ideas this affects}
```

### `_connections.md`

```markdown
# Cross-Area Connections

Synergies, contradictions, and dependencies between areas.

## Synergies
| Area A | Area B | Connection | Implication |
|--------|--------|------------|-------------|

## Contradictions
| Area A | Area B | Tension | Resolution Approach |
|--------|--------|---------|---------------------|

## Dependencies
| Upstream | Downstream | Nature |
|----------|------------|--------|
```
