# Team Lifecycle Reference

Reusable reference for all team-based skills. Defines the standard lifecycle pattern for agent teams.

## Lifecycle Phases

```
TeamCreate → Spawn Teammates → Coordinate → Synthesize → Shutdown → TeamDelete
```

### Phase 1: Team Creation

```
TeamCreate(team_name="{skill}-{topic-slug}")
```

- Team name follows pattern: `{skill-name}-{topic-slug}` (e.g., `brainstorm-auth-redesign`, `plan-data-pipeline`)
- Creates team config at `~/.claude/teams/{team-name}/config.json`
- Creates task list at `~/.claude/tasks/{team-name}/`

### Phase 2: Task Setup

Before spawning teammates, create tasks via `TaskCreate`:

- One task per teammate's primary deliverable
- Set dependencies between tasks using `addBlockedBy` / `addBlocks`
- Tasks serve as the coordination backbone — teammates claim and update them

### Phase 3: Spawn Teammates

```
Task(subagent_type="general-purpose",
     team_name="{team-name}",
     name="{role-name}",
     prompt="...")
```

**Spawn prompt requirements:**
- Clear role definition and perspective
- Full context (concept, constraints, goals)
- Explicit deliverable format
- Communication instructions (who to message, when)
- Task ID to claim via `TaskUpdate`

**Naming convention:** lowercase, hyphenated role names (e.g., `devils-advocate`, `risk-analyst`, `phase-3-impl`)

### Phase 4: Coordination

While teammates work, the lead:

| Action | When |
|--------|------|
| Monitor via `TaskList` | Periodically check progress |
| Facilitate debate | Teammates not engaging each other |
| Relay cross-team insights | Important findings not shared |
| Resolve deadlocks | Conflicting positions, no resolution |
| Feed context | New information from user or other sources |

**Key rules:**
- Messages from teammates arrive automatically (no polling needed)
- Idle notifications are normal — teammate sent message and is waiting
- Send messages by **name**, not by agent ID
- Use `SendMessage` with `type: "message"` for direct communication
- Use `type: "broadcast"` sparingly (expensive — sends to all)

### Phase 5: Synthesis

After all teammates report findings:

1. Consolidate inputs from all teammates
2. Identify agreements and disagreements
3. Resolve conflicts (ask user if needed)
4. Produce unified output artifact

**Wait condition:** All teammate tasks marked `completed` via `TaskUpdate`, OR all teammates have sent consolidated findings to lead.

### Phase 6: Shutdown and Cleanup

```
# 1. Send shutdown requests to each teammate
SendMessage(type="shutdown_request", recipient="{name}", content="Work complete, shutting down.")

# 2. Wait for confirmations (teammates call shutdown_response with approve=true)

# 3. Delete the team
TeamDelete()
```

**Order matters:** All teammates must be shut down before `TeamDelete` or the call will fail.

## Common Patterns

### Teammate Communication

| Pattern | Use |
|---------|-----|
| Teammate → Lead | Report findings, ask for guidance |
| Teammate → Teammate | Debate, share evidence, challenge |
| Lead → Teammate | Prompt debate, relay info, assign work |
| Lead → All (broadcast) | Critical announcements only |

### Error Recovery

| Scenario | Recovery |
|----------|----------|
| Teammate unresponsive (2+ messages ignored) | Shut down, spawn replacement |
| Teammate quality degradation | Shut down, spawn fresh replacement |
| Session crash mid-team | Read `TaskList` on resume, re-create team, re-spawn for incomplete tasks |
| Teammate rejects shutdown | Send message explaining why, re-request |

### Team Size Guidelines

| Complexity | Team Size | Rationale |
|------------|-----------|-----------|
| Focused task | 2-3 teammates | Minimal coordination overhead |
| Broad analysis | 3-4 teammates | Multiple perspectives needed |
| Complex system | 4-5 teammates | Specialized roles required |
| Maximum recommended | 5 teammates | Beyond this, coordination cost dominates |

### Task Status Flow

```
pending → in_progress → completed
```

- Lead creates tasks as `pending`
- Teammate claims by setting `owner` and `status: in_progress`
- Teammate marks `completed` when deliverable is done
- Lead checks `TaskList` to track overall progress

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Pattern |
|-------------|-------------|-----------------|
| Spawning all teammates before creating tasks | No work structure for teammates | Create tasks first, reference task IDs in spawn prompts |
| Lead doing teammate work | Defeats purpose of parallelization | Delegate everything, even small fixes |
| Broadcasting every message | Expensive, noisy | Use direct messages, broadcast only for critical updates |
| Not facilitating debate | Teammates work in isolation | Actively prompt cross-team interaction |
| Keeping stale teammates alive | Wastes tokens on idle context | Shut down teammates when their work is done |
