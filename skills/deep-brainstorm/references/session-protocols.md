# Session Protocols Reference

Structured protocols for managing multi-session deep brainstorming continuity.

---

## Warm-Up Recap Protocol

Perform at the start of every session except the first (SEED).

### Steps

1. **Read `_mindmap.yaml`** to reconstruct state
2. **Display status dashboard**:
   ```
   Deep Brainstorm: {topic}
   Phase: {phase} | Sessions: {count} | Last: {date}

   Areas:
   - {area 1}: {status} ({methodology})
   - {area 2}: {status} ({methodology})
   ...

   Parking Lot: {count} items | Decisions: {count} | Connections: {count}
   ```
3. **Summarize last session**: Read `sessions/session-{latest}.md`, present key outcomes in 2-3 sentences
4. **Check parking lot**: Read `_parking-lot.md`, flag any items that have become relevant
5. **Present suggested focus**: From `next_suggested` in `_mindmap.yaml`
6. **Ask user and WAIT**: "This is where we left off. Want to continue with {suggested focus}, or take a different direction?"

**IMPORTANT**: Do NOT proceed until the user responds to step 6. The warm-up recap ends with a question, not an action. The user chooses the direction for this session.

### Resume Detection

When the skill is invoked, before anything else:

1. Check `docs/brainstorms/deep/` for existing directories
2. If one or more exist, list them with last session dates
3. Ask: "Resume an existing deep brainstorm, or start a new one?"
4. If resuming, read that session's `_mindmap.yaml` and run Warm-Up Recap

---

## Harvest Ritual Protocol

Perform at the end of every session, before closing.

### Steps (in order)

1. **Summarize session**: "Here's what we explored today: {brief summary}"
2. **Extract insights**: List the top 3-5 insights, decisions, or ideas generated
3. **Update area files**: Write/update `analysis.md`, `ideas.md`, or `_overview.md` for areas touched
4. **Update parking lot**: Add any parked ideas to `_parking-lot.md`
5. **Log decisions**: Add any decisions to `_decisions.md`
6. **Update connections**: Add any cross-area links to `_connections.md`
7. **Write session log**: Create `sessions/session-{NNN}.md` with full session record
8. **Update `_index.md`**: Refresh executive summary and area status
9. **Update `_mindmap.yaml` LAST**: This is the single source of truth - update it after all other files are written, so it accurately reflects the current state

### Why `_mindmap.yaml` Last

The YAML file is what gets read on resume. If the session crashes mid-harvest, having outdated YAML is safer than having YAML that references files that weren't written yet. Write content first, update the index last.

---

## Parking Lot Management

### When to Park an Idea

- The idea is interesting but tangential to the current focus
- The idea relates to an area not yet being explored
- The idea needs more context that isn't available yet
- Exploring it now would derail the current session's momentum
- The user mentions something in passing that shouldn't be lost

### Parking Format

Add to `_parking-lot.md` table:

```
| {next #} | {idea description} | {current session #} | {area slug or "unassigned"} | parked |
```

### Review at Session Start

During Warm-Up Recap, scan parking lot for:
- Items that relate to today's planned focus area
- Items that have been parked for 3+ sessions (flag for attention)
- Items that can now be assigned to a specific area

### Graduation

When a parked idea becomes the focus of exploration:
1. Update its status from `parked` to `graduated`
2. Note which area/session picked it up
3. Reference it in the relevant area's `ideas.md`

### Discarding

If a parked idea becomes irrelevant:
1. Update status to `discarded`
2. Add brief reason (e.g., "superseded by decision D3")
3. Keep in the table for historical record

---

## Decision Logging

### When to Log a Decision

- User explicitly chooses between alternatives
- Analysis clearly favors one approach
- A constraint is accepted or rejected
- Scope is narrowed or expanded
- An assumption is confirmed or invalidated through investigation

### Decision Format

```markdown
## Decision {N}: {Title}
- **Date**: YYYY-MM-DD (Session {N})
- **Context**: {Why this decision arose}
- **Options Considered**:
  1. {Option A} - {brief pros/cons}
  2. {Option B} - {brief pros/cons}
- **Decision**: {What was decided}
- **Rationale**: {Why this option was chosen}
- **Impact**: {What areas/ideas this affects}
```

### Integration

- Reference decisions in relevant area `_overview.md` files
- Cross-reference in `_connections.md` when decisions affect multiple areas
- Note in `_mindmap.yaml` by incrementing `decision_count`

---

## Phase Transition Criteria

Phases are suggestions, not enforced. Use these criteria to suggest (not mandate) transitions.

### SEED -> EXPLORE

**Suggest when**:
- 5-8 areas have been identified and scaffolded
- Central idea is well-articulated in `_index.md`
- User has confirmed the area landscape feels complete (for now)

### EXPLORE -> CONNECT

**Suggest when**:
- At least 2-3 areas have been explored with methodologies
- Patterns or tensions between areas are becoming visible
- User mentions connections between areas spontaneously

### CONNECT -> DEEPEN

**Suggest when**:
- Cross-area connections are mapped
- Some areas need sub-area expansion (complexity warrants it)
- Contradictions identified that need TRIZ resolution
- Key assumptions identified that need investigation

### DEEPEN -> CONVERGE

**Suggest when**:
- Sub-areas have been explored to satisfaction
- Assumption mapping is complete for critical assumptions
- User signals readiness to synthesize
- Most areas are at `explored` or `deep-dived` status

### Any Phase -> Any Phase

The user can always:
- Go back to add new areas (return to SEED activities)
- Deep-dive an area regardless of current phase
- Jump to convergence if they've seen enough
- Pause and resume later at the same point

---

## Diverge/Converge Mode Rules

### Diverge Mode (Generating)

Active during: SEED area identification, EXPLORE idea generation, DEEPEN sub-area expansion

**Rules**:
- **No criticism** of ideas during generation
- **Quantity over quality** - capture everything
- **Build on ideas** - "Yes, and..." not "Yes, but..."
- **Welcome wild ideas** - they may contain useful seeds
- **Defer judgment** - evaluation comes later
- Announce mode: "We're in diverge mode - let's generate freely without filtering."

### Converge Mode (Evaluating)

Active during: EXPLORE analysis, CONNECT evaluation, CONVERGE synthesis

**Rules**:
- **Apply criteria** - use frameworks to evaluate
- **Be constructive** - critique ideas, not the person who suggested them
- **Look for combinations** - can weaker ideas merge into something strong?
- **Acknowledge the "Groan Zone"** - the uncomfortable middle between diverging and converging where things feel messy
- Announce mode: "We're switching to converge mode - let's evaluate what we've generated."

### The Groan Zone

The transition between diverge and converge is often uncomfortable. Ideas feel messy, contradictory, and overwhelming. This is normal and productive.

**Signs you're in the Groan Zone**:
- "There are too many ideas and they don't fit together"
- "We keep going in circles"
- "Nothing is clear anymore"

**What to do**:
- Acknowledge it: "This is the Groan Zone - it means we're doing the hard work of synthesis"
- Don't rush through it - premature convergence kills novel ideas
- Use clustering: group related ideas before evaluating
- Take a break (end session, come back fresh)
