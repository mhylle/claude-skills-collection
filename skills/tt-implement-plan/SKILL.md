---
name: tt-implement-plan
description: Tasktracker-native plan orchestrator. Drives execution of a plan whose phases are stored as tasktracker phase tasks (NOT a docs/plans/*.md file). Honours active-task discipline (setActiveTask before every artifact-producing call, pauseActiveTask before user waits, clearActiveTask on phase done), respects the locked phase body (design notes go to sub-tasks, never to the phase description), logs defects/learnings/frictions through tasktracker insights as they surface, and delegates the actual implementation to /implement-phase. Use whenever the user wants to "implement the plan", "run the plan", or "work through the phases" AND the plan was created with /tt-create-plan (or otherwise lives in tasktracker). Triggers on "tt implement plan", "tt implement", "implement plan (tasktracker)", "/tt-implement-plan", "execute the tasktracker plan", or any plan-execution request inside a session that already has a tasktracker active task or project. Prefer this over the plain /implement-plan skill whenever a tasktracker MCP is available — it correctly handles the locked phase body, requirement linking, insight logging, and lifecycle gating that the file-based variant ignores.
context: fork
argument-hint: "[project-slug-or-id]"
---

# tt-implement-plan

Tasktracker-native orchestrator that executes a plan stored as phase tasks. It runs phases one at a time, honours active-task / locked-body / insight-logging conventions, and delegates the actual code work to `/tt-implement-phase` (which in turn delegates to subagents).

## How this differs from /implement-plan

| | `/implement-plan` | `/tt-implement-plan` (this skill) |
|---|---|---|
| Plan source | `docs/plans/*.md` + `task_list_id` | Phase tasks in tasktracker (no file) |
| Progress tracking | `TaskCreate`/`TaskUpdate` (built-in) | `tasktracker_updateTaskStatus` + active-task heartbeats |
| Active task discipline | None | `setActiveTask` / `pauseActiveTask` / `clearActiveTask` — required |
| Phase body updates | Free edit | **Forbidden** once children exist — write to sub-tasks |
| Insight capture | Ad-hoc / lessons.md | `logDefect`, `logLearning`, `logFriction` |
| Multi-session resume | `CLAUDE_CODE_TASK_LIST_ID=...` | Built-in: active task persists across MCP restarts |
| Completion criterion | All checkboxes ticked | All phase tasks `completed` AND no in-progress sub-tasks |

If the plan came from `/create-plan` (file-based), use `/implement-plan`. If the plan lives in tasktracker, use this skill.

## CRITICAL: Orchestrator pattern (kept from /implement-plan)

> **THIS SESSION IS AN ORCHESTRATOR. NEVER IMPLEMENT CODE DIRECTLY.**

```
tt-implement-plan (this session — ORCHESTRATOR)
    │
    │   ⛔ NEVER writes code
    │   ⛔ NEVER uses Write/Edit tools
    │   ⛔ NEVER creates files (except writing tasktracker calls)
    │
    └── tt-implement-phase (orchestrator for one phase)
            │
            │   ⛔ NEVER writes code
            │
            └── Subagents (do the actual work)
                    ✅ Write code, create files, run tests, fix issues
```

| DO | DO NOT |
|---|---|
| Read task tree, principles, requirements | Write code |
| Set/pause/clear active task | Create files (other than via MCP) |
| Invoke `/tt-implement-phase` per phase | Use Write/Edit/NotebookEdit |
| Track plan-level progress via task status | Run implementation commands |
| Log defects / learnings / frictions | Edit a locked phase body |
| Pause for user confirmation between phases | Skip readiness gates |

If you find yourself about to use Write/Edit/NotebookEdit:

```
⛔ STOP — you are violating the orchestrator pattern.
✅ Delegate to /tt-implement-phase which will spawn subagents.
```

## Workflow

### Step 0: Locate the project + the plan

```
1. tasktracker_listProjects({search: "..."})   # or use argument hint.
   - If user passed a slug or id, use it directly with getProject.
2. tasktracker_getProject({projectId})
3. tasktracker_getProjectReadiness({projectId})
   - The `plan` row should read satisfied — meaning concrete phases
     exist beyond the four lifecycle phases. If not, STOP. The user
     probably needs /tt-create-plan first.
```

If the user gives a phase task id directly ("implement phase X"), skip the readiness gate and treat that single phase as the scope.

### Step 1: Read the principles and requirements (ground the session)

```
tasktracker_getPrinciples({projectId, includeGlobal: true})
tasktracker_listRequirements({projectId, status: "approved"})
```

Spend a moment reading. Principles are the durable rules; requirements are the contract this work fulfils. The next ~hour of decisions hangs off these.

### Step 2: Read the phase plan

```
tasktracker_listTasks({projectId, type: "phase"})
# Filter out the four lifecycle phases (metadata.lifecycleSlug ∈
# {brainstorm, requirements, architecture, plan}) — those are done.
# What remains is the implementation plan.

# For each implementation phase, in dependency order:
tasktracker_getTask({taskId})                  # full body + sub-tasks
tasktracker_listAcceptanceCriteria({...})      # if linked
```

Note the order: phase tasks are intended to be executed in the order they were created (or per `blockedBy` if explicit). Identify the first non-completed phase — that's the resume point.

### Step 3: Resume detection

```
For each implementation phase, in order:
  - status == "completed" → skip
  - status == "in_progress" → resume from here
  - status == "pending" → first incomplete; resume from here
  - Stop at the first pending/in_progress one.
```

Display the resume point to the user:

```
● Plan Status: <project name>

  ✓ Phase 1 — Database schema (completed)
  ✓ Phase 2 — Auth service (completed)
  ◻ Phase 3 — API endpoints (in_progress)   ← resume here
  ◻ Phase 4 — Tests (pending, blocked by 3)
  ◻ Phase 5 — Docs (pending, blocked by 4)

Resuming Phase 3.
```

Multi-session note: the MCP persists `activeTask` to `~/.config/tasktracker-mcp/active-task` across restarts. You usually do not need `CLAUDE_CODE_TASK_LIST_ID=...` — opening a new session sees the same active task.

### Step 4: Execute one phase

For each phase, in order:

#### 4a. Activate

```
tasktracker_setActiveTask(<phase-task-id>)
tasktracker_updateTaskStatus(<phase-task-id>, "in_progress")
```

`setActiveTask` returns a digest containing principles, the phase body, acceptance criteria, and (if present) the directional-work block. Read this carefully — it's the ground truth for the phase scope. **Do not** re-derive scope from the original brainstorm; the phase body is the locked contract.

#### 4b. Announce

```
═══════════════════════════════════════════════════════════════
● STARTING PHASE N: <Phase Name>
═══════════════════════════════════════════════════════════════

Objective: <from phase body>
Verification approach: <from phase body>
Requirements: <list of REQ-... this phase implements>
Sub-tasks: <count> seeded
Principles in play: <any directly relevant>

Delegating to /tt-implement-phase...
```

#### 4c. Delegate to /tt-implement-phase

```
Skill(skill="tt-implement-phase"): Execute Phase N.

Context:
- Project: <project name + id>
- Phase task id: <id>
- Phase title: <title>
- Sub-tasks: <list from getTask>
- Requirements: <list of (id, title, criteria) from listAcceptanceCriteria>
- Principles: <surfaced from setActiveTask digest>

Execute all quality gates. Update each sub-task's status as it
completes. Return structured PHASE_RESULT.

CRITICAL: do NOT update the phase description — it is locked
once sub-tasks exist (HTTP 422). Any design rationale or new
finding goes to the "Design + decision note" sub-task (or a
new sub-task if that one is already closed).
```

`/tt-implement-phase` handles: subagent delegation for code, sub-task `setActiveTask`/`updateTaskStatus` discipline, exit-condition verification via `/verification-loop`, integration testing, code review via `/code-review`, ADR compliance, task-tree synchronization, and insight logging. This skill does **not** do any of that work directly.

**Expect two short reports in the main chat per phase:** a pre-flight report (right after `tt-implement-phase`'s Step 0 — objective, sub-task titles, verification approach) and a completion report (at Step 8 — counts, statuses, caveats). Don't restate them; they're already terse on purpose. If `tt-implement-phase` does NOT emit a pre-flight report before subagent work starts, treat that as a skill-bug worth surfacing — the contract requires it.

#### 4d. Insight logging (during, not after)

`/tt-implement-phase` Step 7 captures phase-level insights. At the plan-orchestrator level, ALSO log anything that surfaces as a cross-phase concern (e.g., a defect that affects future phases, a friction with the plan itself). Don't bury it in chat.

| Situation | Tool | Notes |
|---|---|---|
| Bug discovered during this phase | `tasktracker_logDefect` | Severity + repro steps. Counts toward `getDefectStats`. |
| Pattern learned, applicable to future work | `tasktracker_logLearning` | E.g., "uuid v14 is ESM-only — trips ts-jest". Becomes searchable via `listInsights`. |
| Friction encountered (slow build, flaky test, confusing error) | `tasktracker_logFriction` | Use category=workflow when it's process pain, category=code when it's code pain. |
| Defect / missing capability in **TaskTracker itself** (MCP tool, workflow, a tt-* skill) | `tasktracker_reportToTaskTracker` | Files UPSTREAM into the central TaskTracker project (continual-correction loop), NOT a local insight. |

If a principle should be added based on this phase's experience, propose it to the user — don't silently add. Principles are a charter, not a backlog.

#### 4e. Pause before any user wait

Before any message that ends with a question, `tasktracker_pauseActiveTask`. The user's thinking time is not work time.

#### 4f. Phase done

When `/tt-implement-phase` returns `PHASE_RESULT.status: COMPLETE`:

1. Verify all sub-tasks are `completed` (or `deleted` if dropped, with a one-line reason logged).
2. `tasktracker_updateTaskStatus(<phase-task-id>, "completed")`.
3. Show the user the result block.
4. Pause for user confirmation before moving to the next phase.

If `/tt-implement-phase` returns `BLOCKED`, **stop**. Surface the blocker and options to the user (see "Handling blockers" below). Do not auto-proceed.

If `/tt-implement-phase` returns `COMPLETE` with caveats (e.g., one sub-task had to be skipped), it will have called `completeWithCaveat` itself — just propagate the caveat in the user-facing summary.

### Step 5: Between phases — user confirmation

```
═══════════════════════════════════════════════════════════════
● PHASE N COMPLETE: <Phase Name>
═══════════════════════════════════════════════════════════════

Results from /tt-implement-phase:
  ✅ Implementation: <N> files created, <M> modified
  ✅ Exit Conditions: all passed
  ✅ Code Review: passed with <K> recommendations
  ✅ ADR Compliance: passed
  ✅ Sub-tasks: <X>/<X> completed

Insights logged this phase:
  • Defect: <id> — <summary>
  • Learning: <id> — <summary>
  • Friction: <id> — <summary>

Manual verification required:
  - [ ] <user-observable check from PHASE_RESULT>

───────────────────────────────────────────────────────────────
Please confirm the manual verification, then say "go" to start
Phase N+1: <Next Phase Name>.
═══════════════════════════════════════════════════════════════
```

`pauseActiveTask` before sending this message.

### Step 6: Final completion

When all implementation phases are `completed`:

```
tasktracker_getProjectReadiness({projectId})
# Verify all four lifecycle rows still satisfied; verify plan row.
tasktracker_getDefectStats({projectId})
tasktracker_getImprovementMetrics({projectId})

tasktracker_clearActiveTask()
```

Closing summary:

```
═══════════════════════════════════════════════════════════════
● PLAN COMPLETE: <Project Name>
═══════════════════════════════════════════════════════════════

Implementation phases completed: <N>/<N>

Insights this run:
  Defects logged: <count>   (open: <count>)
  Learnings:      <count>
  Frictions:      <count>

Final verification:
  - [ ] E2E run: <command>
  - [ ] Documentation updated (if applicable)
  - [ ] Security checklist (if security-sensitive)

Active task cleared. Ready for review.
═══════════════════════════════════════════════════════════════
```

## Handling blockers

When `/tt-implement-phase` returns `BLOCKED`:

1. **STOP** further phase execution.
2. **PRESENT** the blocker with options.
3. **AWAIT** user decision.
4. **RESUME or ABORT** based on response.

Don't auto-fix. Don't auto-revise the plan. Don't auto-edit the phase body (it's locked anyway). The user owns the call.

```
⛔ PHASE N BLOCKED

Issue: <from /tt-implement-phase>

Options:
A) <option from /tt-implement-phase>
B) <option>
C) Abort and create a follow-up phase

Recommendation: <which option, with rationale>

How should I proceed?
```

If the resolution is "create a follow-up phase", do that *outside* the blocked phase — `tasktracker_createTask({type: "phase", ...})` with a clear title, linked to the same requirements. Do **not** stuff new scope into the blocked phase's body (which is locked anyway).

## Locked phase body — what to do instead

Five common situations where you'd want to edit the phase body, and the right answer:

| You want to… | Do this instead |
|---|---|
| Record why you took a different approach than planned | `createTask({type: "subtask", parentId: <phase>, title: "Decision: <topic>"})` with the rationale in the body |
| Note a discovered scope gap | New sub-task under the phase if minor; new phase if major |
| Update the verification approach | New sub-task `Verification — updated approach` documenting the change; the original verification approach in the phase body stands as the planning-time intent |
| Note an ADR was created mid-phase | New sub-task `ADR-NNNN reference` with the link |
| Cross-reference to another phase | Set `metadata.relatedPhaseIds: [...]` on the phase task (metadata is editable) |

This is not bureaucracy — it's the audit trail. The phase body shows "what we planned", the sub-tasks show "what actually happened", and the diff is debuggable.

## Anti-patterns to avoid

- ❌ Writing code in this session. Delegate to `/tt-implement-phase`.
- ❌ Skipping `setActiveTask` before phase work — heartbeats won't fire, principles won't surface.
- ❌ Forgetting `pauseActiveTask` before user-wait messages.
- ❌ Editing a phase description after sub-tasks exist (HTTP 422).
- ❌ Auto-fixing a blocker without user confirmation.
- ❌ Marking a phase `completed` with sub-tasks still `in_progress`.
- ❌ Logging defects/learnings in chat-only narrative instead of via `logDefect`/`logLearning`.
- ❌ Re-deriving scope from the brainstorm or earlier conversation — the phase body is the locked contract.
- ❌ Using `TaskCreate`/`TaskUpdate` (the Claude-Code built-ins) for phase progress — use `tasktracker_updateTaskStatus`.

## Quality checklist (per phase)

- [ ] `setActiveTask` set before the first artifact-producing call.
- [ ] Phase body read from the `setActiveTask` digest (not re-derived).
- [ ] Principles surfaced and acknowledged where they constrain the phase.
- [ ] `/tt-implement-phase` did the actual work; this session orchestrated.
- [ ] Sub-tasks marked `completed` as each finished.
- [ ] No edits to the phase description.
- [ ] Defects/learnings/frictions logged via tasktracker insights, not chat.
- [ ] `pauseActiveTask` before every user-wait message.
- [ ] Phase marked `completed` only when all sub-tasks are completed (or explicitly dropped).
- [ ] User confirmed before moving to the next phase.

## Quality checklist (final)

- [ ] All implementation phases `completed`.
- [ ] `getProjectReadiness` shows all four lifecycle rows still satisfied.
- [ ] `getDefectStats` reviewed; open defects either resolved or have a follow-up task.
- [ ] `clearActiveTask` called.
- [ ] Closing summary delivered (in chat, not as a file).

## Resources

### references/
- `plan-format.md` — Expected shape of a tasktracker-stored plan (phase task body conventions, sub-task patterns).
- `insight-cookbook.md` — When and how to use `logDefect`, `logLearning`, `logFriction`. Common patterns.

### Related tasktracker skills
- `/tt-implement-phase` — Per-phase orchestrator. This skill delegates to it for every phase.
- `/code-review` — Per-phase quality gate inside `/tt-implement-phase`.
- `/adr` — Recording mid-implementation design decisions (the ADR file lives in `docs/decisions/`; the reference goes to a sub-task).
- `/verification-loop` — 6-check verification framework used inside `/tt-implement-phase`.
- `/project-ready` — Useful at start and end as a sanity check.
- `/tt-create-plan` — Upstream: the skill that produces the plan this orchestrator runs.

## Key principles

1. **Delegate phase execution** — `/tt-implement-phase` for all phase work.
2. **Orchestrate, don't implement** — this skill coordinates, never codes.
3. **Active-task discipline** — `setActiveTask` / `pauseActiveTask` / `clearActiveTask` are not optional.
4. **Locked phase body is sacred** — sub-tasks are the right place for mid-implementation notes.
5. **Insights belong in tasktracker** — `logDefect` / `logLearning` / `logFriction`, not just chat.
6. **User confirmation between phases** — current safe mode.
7. **Surface blockers immediately** — the user owns the resolution call.
8. **Trust `/tt-implement-phase` results** — act on the structured `PHASE_RESULT`.
