---
name: tt-implement-phase
description: Tasktracker-native per-phase executor. Runs a SINGLE phase whose scope and sub-tasks live as tasktracker phase + sub-task rows (NOT in a docs/plans/*.md file). Honours active-task discipline (setActiveTask on phase AND on each sub-task as worked), respects the locked phase body (HTTP 422 on description edit — design notes go to sub-tasks), updates sub-task status via tasktracker_updateTaskStatus as work progresses, logs defects/learnings/frictions through tasktracker insights, and delegates ALL actual code work to subagents (never writes code itself). Used by /tt-implement-plan as the per-phase unit of work; can also be invoked directly with a phase task id. Triggers when /tt-implement-plan delegates a phase, or manually with "/tt-implement-phase <phase-task-id>", "tt implement phase", "execute phase (tasktracker)", "/tt-implement-phase". Prefer this over the plain /implement-phase skill whenever a tasktracker MCP is available — /implement-phase will happily edit a phase task description (HTTP 422), miss sub-task status updates, and bury defects in chat narrative instead of insights.
context: fork
user-invocable: true
argument-hint: "[phase-task-id]"
---

# tt-implement-phase

Execute a **single phase** whose spec lives as a tasktracker phase task with sub-tasks. Designed to be called by `/tt-implement-plan`, but invokable directly when you want to drive one phase end-to-end.

## How this differs from /implement-phase

| | `/implement-phase` | `/tt-implement-phase` (this skill) |
|---|---|---|
| Phase spec source | Markdown plan file + phase number | Tasktracker phase task + sub-tasks |
| Sub-task tracking | Plan checkbox edits | `tasktracker_updateTaskStatus` per sub-task |
| Plan sync (Step 6) | Edit plan markdown | Verify sub-task statuses, no plan file to sync |
| Prompt archival (Step 7) | Move `docs/prompts/*.md` | N/A — no prompt files |
| Phase notes during work | Edit plan section | New sub-task ("Decision: X") — phase body is locked |
| Active task | None | `setActiveTask` on phase + per-sub-task |
| Defects / learnings | Plan deviations section | `logDefect`, `logLearning`, `logFriction` |
| ADR linkage | Plan section + INDEX.md | Sub-task `ADR-NNNN reference` + INDEX.md |
| Code review (Step 4) | `/code-review` | `/code-review` (unchanged) |

If the phase lives in a markdown plan file, use `/implement-phase`. If the phase is a tasktracker phase task, use this skill.

---

## Execution mode — orchestrated vs in-context (decide at Step 0)

This skill has **two execution modes**. Pick the one your environment supports — the work and the tasktracker discipline are identical either way; only *who holds the context* differs.

1. **Orchestrated (preferred when available).** A subagent-dispatch tool exists (e.g. `Task` / `Agent`). Offload code-writing, file-creation, test-running, and fixing to subagents so the parent context stays lean. This is the default, and the rest of this doc is written in its voice.

2. **In-context (graceful degradation).** No subagent-dispatch tool is available. **Do the work yourself, directly, with `Edit` / `Write` / `Bash` + the tasktracker MCP.** Writing code in this session is then EXPECTED, not a violation. You still honour every gate (active-task, locked body, per-sub-task status, verification, insight capture) — you just run them inline instead of inside subagents.

**How to decide:** if you can dispatch a subagent, orchestrate. If you cannot (no `Task`/`Agent` tool in this environment), switch to in-context mode and proceed. **Never stall, never no-op, and never "spawn" a subagent that silently degrades into a read-only researcher returning prose instead of doing the work** — that failure (the original Phase 113 friction cluster) is worse than just doing it yourself. Getting the phase DONE and tracked is the contract; the mode is only *how*.

> Throughout this document, read every "spawn a subagent" as **"spawn a subagent (orchestrated) — or do it yourself in-context (degraded)."** The "never write code in this session" rules apply to orchestrated mode ONLY.

## Orchestrator pattern (orchestrated mode)

**In orchestrated mode this session is an orchestrator and does not implement code directly.** In in-context mode the right-hand column is exactly what you DO instead.

| DO (orchestrated mode) | In-context mode does this instead |
|---|---|
| Spawn subagents to write code | Write code yourself (`Edit`/`Write`) |
| Spawn subagents to create files | Create files yourself |
| Spawn subagents to run tests | Run tests yourself (`Bash`) |
| Spawn subagents to fix issues | Fix code yourself |
| Read files to understand context | Read files to understand context (same) |
| Drive sub-task status via tasktracker MCP | Drive sub-task status via tasktracker MCP (same) |
| Coordinate and delegate | Do the work, still tracking every gate |

**In orchestrated mode, these are violations:** using Write/Edit/NotebookEdit directly, creating files without spawning a subagent, fixing code without spawning a subagent, running implementation commands directly. **In in-context mode they are the expected path** — what stays non-negotiable in BOTH modes is the tasktracker discipline (active-task per sub-task, locked body, status updates, verification gates, insight capture).

**Subagent communication protocol** → `references/subagent-protocol.md`. Every subagent prompt must include a response-format block demanding terse STATUS/FILES/ERRORS output and disk-based logs for large output. Verbose subagent responses are the single biggest context waster this skill faces. (In-context mode skips this — there's no subagent to constrain.)

---

## Execution contract (read before starting)

Steps 1–8 execute as **one continuous operation**. The orchestrator does not pause between them.

```
current_step = 1
while current_step <= 8:
    result = execute_step(current_step)
    if result == PASS:
        current_step += 1            # AUTO-CONTINUE
    elif result == FAIL:
        fix_and_retry(current_step)  # spawn fix subagent, re-run
    elif result == BLOCKED:
        return BLOCKED               # only valid early exit
return COMPLETE                      # only stop here
```

**The only valid pause points are:**
1. **BLOCKED** — something you cannot fix without user intervention.
2. **After Step 8** — completion report presented; await user (or `/tt-implement-plan`).

Everything else is a fix loop, not a pause. Verification failed → spawn fix subagent (or fix in-context) → re-run → PASS → continue. Code review NEEDS_CHANGES → spawn fix subagent (or fix in-context) → re-run → PASS → continue.

After each step, output a progress tracker. NEXT ACTION must describe executing the next step, not "waiting for user confirmation" (before Step 8).

---

## Input context

```
Project ID:     [tasktracker project UUID]
Phase Task ID:  [tasktracker phase task UUID — REQUIRED]
Plan context:   [optional — surfaced from /tt-implement-plan]
Skip Steps:     [optional]
TDD Mode:       [enabled/disabled — see /implement-phase references/tdd-mode.md]
```

The phase body and sub-tasks come from `tasktracker_getTask(<phase-id>)` — **read this carefully at start**, then do not re-derive scope from elsewhere. The phase description is the locked contract; the sub-tasks are the work plan.

---

## Architecture

```
tt-implement-plan (orchestrates full plan)
    │
    └── tt-implement-phase (this skill — one phase at a time)
            │
            ├── 0. Active task setup (setActiveTask, read digest)
            │     └── EMIT: pre-flight report to main chat
            ├── 1. Implementation (per sub-task: activate → subagents → status)
            ├── 2. Exit Condition Verification (verification-loop skill)
            ├── 3. Automated Integration Testing
            ├── 4. Code Review (code-review skill)
            ├── 5. ADR Compliance Check (+ sub-task ADR reference)
            ├── 6. Task Tree Synchronization (verify all sub-tasks completed)
            ├── 7. Insight Capture (defects/learnings/frictions logged)
            └── 8. Phase Completion Report
                  └── EMIT: completion report to main chat
                      RETURN: PHASE_RESULT to caller
```

**Two main-chat reports are mandatory:** a pre-flight report right after Step 0 (what's about to happen) and a completion report at Step 8 (what happened). Both are short (≤ 15–20 lines), scannable, and exist to ground the orchestrator's own context — most of the phase's work lives inside subagents the parent chat can't see, so without these reports the orchestrator loses track of what it just did.

---

## Step 0 — Active task setup (always first)

Before any other work:

```
1. tasktracker_setActiveTask(<phase-task-id>)
   - Read the returned digest carefully. It contains:
     • Principles in play (project-level + global)
     • The phase body (LOCKED — do not edit)
     • Linked requirements + acceptance criteria
     • Optional directional-work block (operation, source, target)
2. tasktracker_getTask(<phase-task-id>) for full sub-task list.
3. tasktracker_updateTaskStatus(<phase-task-id>, "in_progress").
```

Surface principles that materially constrain this phase. If the directional block is present, treat it as authoritative for source/target/operation.

### Pre-flight report (emit to main chat — REQUIRED)

Immediately after Step 0 succeeds, emit a **short, scannable** START REPORT to the parent chat. Purpose: ground the orchestrator's own context in what's about to happen, since most of the next several minutes will live inside subagents the parent can't see. Keep it ≤ 15 lines — this is a reminder, not a lecture. Long pre-flight reports are a regression.

```
═══════════════ STARTING PHASE: <short title> ═══════════════
Phase id:     <short uuid prefix or full id>
Objective:    <one-line from the phase body>
Sub-tasks:    <count> total
  • <sub-task 1 title>
  • <sub-task 2 title>
  • ...
Requirements: <REQ-slug list, or "none linked">
Principles:   <only those that materially constrain THIS phase, or "—">
Verification: <one-line approach from phase body>
═══════════════════════════════════════════════════════════════
```

What goes in vs. what doesn't:
- ✅ Sub-task titles (so you remember the work plan) — but only titles, not bodies.
- ✅ Principles that **constrain this phase**. If a project-level principle isn't relevant to this phase, leave it out.
- ❌ Full phase body. The digest already has it; re-printing it inflates context for nothing.
- ❌ Acceptance criteria text. Just count or REQ-slug references.
- ❌ Step-by-step plan for what you're about to do. Steps 1–8 are documented; don't restate them.

**Output:** `STEP_0_STATUS: PASS`, sub-task count, principles summary. **Gate:** PASS. **Next:** Step 1.

---

## Step 1 — Implementation (per sub-task)

Sub-tasks are the unit of work. Walk them in order:

```
For each sub-task in order:
  1. tasktracker_setActiveTask(<sub-task-id>)     # focus shifts; heartbeats fire
  2. tasktracker_updateTaskStatus(<sub-task-id>, "in_progress")
  3. Spawn implementation subagent(s) for this sub-task — OR, in in-context
     mode, implement the sub-task yourself with Edit/Write/Bash
     (test sub-tasks BEFORE implementation sub-tasks — verification-first)
  4. On subagent COMPLETE → tasktracker_updateTaskStatus(<sub-task-id>, "completed")
     On subagent ERROR  → spawn fix subagent, retry (up to retry_limit)
     On genuine BLOCKED → return BLOCKED from the phase
```

**Sub-task ordering principle:** the standard phase templates already seed sub-tasks in the right order (tests come early). Do not re-order without good reason.

**TDD mode:** if enabled, the test sub-task drives RED → GREEN → REFACTOR. See `references/tdd-mode.md` (inherited semantics from `/implement-phase`).

**Coding-standards pointer:** every implementation-subagent prompt must include `references/subagent-protocol.md`'s coding-standards block.

**Subagent collection:** capture `FILES_CREATED` / `FILES_MODIFIED` from every subagent into a running list — used in Step 6 and Step 8.

**Output:** `STEP_1_STATUS: PASS`, sub-tasks completed count, files-changed list. **Gate:** all required sub-tasks completed. **Next:** Step 2.

---

## Step 2 — Exit Condition Verification

Invoke `verification-loop` (unchanged from `/implement-phase`):

```
Skill(skill="verification-loop"): Run all 6 checks against the changes from
Step 1.

Context:
- Files changed: [list]
- Project type: [auto-detect or from project metadata]
```

The 6 checks: Build, Type, Lint, Test, Security, Diff.

**Output:** `VERIFICATION_LOOP_STATUS`. **Gate:** all 6 PASS. **Failures:** spawn fix subagent, re-run verification-loop, repeat. **Next:** Step 3.

---

## Step 3 — Automated Integration Testing

**You are the tester. Not the user.**

| Phase produces | How to test |
|---|---|
| HTTP API | curl / httpie / fetch subagent against running server |
| Web UI | `browser-verification-agent` (one scenario per spawn) |
| CLI | execute the binary, verify exit code + output |
| Database migration | query post-state, verify shape |
| Background job | trigger, poll for completion, verify side effect |

Use the acceptance criteria from the phase's linked requirements as your test scenarios. Each acceptance criterion is one (or more) integration test.

**Output:** `INTEGRATION_TEST_STATUS`, scenarios pass/fail with evidence paths. **Gate:** all PASS. **Next:** Step 4.

---

## Step 4 — Code Review

Invoke `code-review` with phase context:

```
Skill(skill="code-review"): Review the changes from Phase <N>.

Context:
- Files changed: [list]
- Phase task id: <id>
- Requirements: <linked requirements + acceptance criteria>
- Principles: <surfaced from setActiveTask digest>
```

A clean **PASS** is required. `PASS_WITH_NOTES` and `NEEDS_CHANGES` both require fix subagents and re-review (max 3 retries).

**Why recommendations are blocking, not advisory:** unfixed recommendations indicate pattern violations, missing tests, or technical debt. They accumulate across phases. The Clean Baseline Principle requires each phase to end clean.

**Output:** `CODE_REVIEW_STATUS`. **Gate:** clean PASS. **Next:** Step 5.

---

## Step 5 — ADR Compliance Check

Two parts:

**5a — Compliance with existing ADRs.** Read `docs/decisions/INDEX.md`, identify ADRs that apply to this phase, verify the implementation honours them. Tiered reading: INDEX.md → Quick Reference (first 10 lines per ADR) → full ADR only if needed.

**5b — Document new decisions.** If the phase introduced a non-trivial design decision that isn't already in an ADR, invoke `/adr` to record it. Then **also create a sub-task on the phase** capturing the ADR reference:

```
tasktracker_createTask({
  projectId, type: "subtask", parentId: <phase-id>,
  title: "ADR-NNNN reference",
  description: "Mid-phase decision: [topic]. See docs/decisions/ADR-NNNN-*.md."
})
tasktracker_updateTaskStatus(<sub-task-id>, "completed")
```

Why the sub-task too: the phase body is locked, but ADR references discovered mid-implementation need a home in the task tree. Sub-task is the right home.

**Output:** `ADR_COMPLIANCE_STATUS`, applicable ADR list, any new ADR numbers. **Gate:** PASS. **Next:** Step 6.

---

## Step 6 — Task Tree Synchronization

There is no markdown plan to update. Instead, verify the task tree is internally consistent:

```
tasktracker_getTask(<phase-id>)
# Inspect every sub-task. All should be:
#   - status: "completed" (worked), OR
#   - status: "deleted"   (deliberately dropped — must have a logFriction
#                          or logLearning entry explaining why)
```

If a sub-task is still `pending` or `in_progress` at this point, something is wrong — either Step 1 didn't actually complete it (regress to Step 1) or it was forgotten (complete it now or delete with explanation).

**Do NOT** edit the phase task description. If something discovered during implementation needs to be recorded for posterity, create a sub-task:

```
tasktracker_createTask({
  type: "subtask", parentId: <phase-id>,
  title: "Note: <topic>",
  description: "<what was discovered + impact>"
})
tasktracker_updateTaskStatus(<sub-task-id>, "completed")
```

**Output:** `TASK_TREE_SYNC_STATUS`, sub-task counts (completed / deleted / open). **Gate:** zero open sub-tasks. **Next:** Step 7.

---

## Step 7 — Insight Capture

Log structured insights for anything non-obvious this phase surfaced. This is the tasktracker equivalent of `/implement-phase`'s prompt-archival step — except instead of moving files, we're capturing knowledge.

| Surfaced this phase | Tool | Notes |
|---|---|---|
| Bug discovered (own code, deps, spec) | `tasktracker_logDefect` | Severity + repro steps. Counts toward `getDefectStats`. |
| Pattern / gotcha / convention worth knowing | `tasktracker_logLearning` | E.g., "Boolean query params need the BooleanQueryParam decorator." |
| Slow build, flaky test, confusing error, repeated friction | `tasktracker_logFriction` | Advisory; never blocks. |
| Defect / missing capability in **TaskTracker itself** (MCP tool, workflow, this skill) | `tasktracker_reportToTaskTracker` | Files UPSTREAM into the central TaskTracker project — the continual-correction loop. NOT a local insight. |

If the phase surfaced a candidate **principle** (durable rule applicable beyond this project), don't auto-add it — surface it in the Step 8 report and let the user decide whether to add it via `tasktracker_logLearning({category: "principle"})`.

See `references/insight-cookbook.md` for full guidance.

**Output:** `INSIGHT_CAPTURE_STATUS`, counts of each insight kind logged this phase. **Gate:** non-blocking (a failed log surfaces but doesn't stop completion). **Next:** Step 8.

---

## Step 8 — Phase Completion Report

Final. Mark the phase task complete, clear the active task, emit the END REPORT to the parent chat, then return `PHASE_RESULT` to the caller.

```
tasktracker_updateTaskStatus(<phase-task-id>, "completed")
# If the phase finished with known issues that the user agreed to defer:
# tasktracker_completeWithCaveat(<phase-task-id>, "<one-line caveat>")
tasktracker_clearActiveTask()
```

Call `/continuous-learning` to extract phase patterns before any `/compact` (inherited from `/implement-phase`).

### Completion report (emit to main chat — REQUIRED)

The mirror of the pre-flight report. Same purpose: ground the orchestrator in what just happened, since the parent's context didn't follow subagents into their work. Keep it ≤ 20 lines.

```
═══════════════ PHASE COMPLETE: <short title> ═══════════════
Phase id:       <short uuid prefix or full id>
Result:         COMPLETE | COMPLETE_WITH_CAVEAT | BLOCKED
Caveat:         <one line if applicable, else omit>

Sub-tasks:      <X>/<X> completed   (<Y> deleted with reason, if any)
Files changed:  <N> created, <M> modified
Tests:          <X>/<X> integration scenarios PASS
Verification:   verification-loop — all 6 checks PASS
Code review:    clean PASS
ADRs:           <new ADR numbers, or "—">

Insights logged:
  Defects:    <count>   (open: <count>)
  Learnings:  <count>
  Frictions:  <count>

Candidate principle (surfaced, not auto-added):
  • <if any, else omit this block>

Manual verification (only when Step 3 couldn't cover):
  - [ ] <user-observable check>
═══════════════════════════════════════════════════════════════
```

What goes in vs. what doesn't:
- ✅ Counts, statuses, IDs. Scannable.
- ✅ Caveats — surface them, don't bury them.
- ✅ Candidate principle — distinct from auto-logged learnings; needs user decision.
- ❌ Per-file diffs. The orchestrator can see the task tree if it wants detail.
- ❌ Re-listing every sub-task title — Step 0's pre-flight already showed those.
- ❌ Step-by-step recap of how each step ran. The structured `PHASE_RESULT` carries that.

Return `PHASE_RESULT` to caller (see `references/return-value.md` for schema). The structured return value is for `/tt-implement-plan` to consume programmatically; the END REPORT above is for the human / orchestrator reading the main chat.

---

## Locked phase body — what to do instead

Five common mid-phase situations where you'd want to edit the phase description, and the right answer:

| Want to… | Do this instead |
|---|---|
| Record why you took a different approach than planned | Sub-task `Decision: <topic>` with rationale in body |
| Note a discovered scope gap | New sub-task under the phase (or new phase via /tt-implement-plan if major) |
| Update the verification approach mid-stream | Sub-task `Verification — updated approach` — planning-time intent stands |
| Note an ADR was created mid-phase | Sub-task `ADR-NNNN reference` (Step 5 does this) |
| Cross-reference another phase | Set `metadata.relatedPhaseIds` on the phase task (metadata IS editable) |

This is audit-trail discipline, not bureaucracy. The phase body shows "what we planned"; sub-tasks show "what actually happened". The diff is debuggable.

---

## Blocker protocol

A blocker is something you **cannot fix autonomously**. Do not stop for fixable issues.

**Valid blockers:** permission denied, infrastructure unavailable, missing credentials, external service down, ambiguous requirement that needs human resolution, destructive operation (e.g., drop prod DB).

**NOT blockers — fix yourself:** test fails, lint errors, build errors, type errors, code-review feedback, transient API errors, UI element not found on first attempt.

When you hit a genuine blocker:

```
⛔ BLOCKED: <brief description>

Phase task: <id> (<title>)
Step:       <current step>
Blocker:    <Permission | Infrastructure | Credentials | External | Ambiguous | Destructive>

Details:    <what failed and why>
What I need: <specific action from user>

Options:
A) <resolve and continue>
B) <skip this verification and proceed with risk>
C) <abort phase>
```

`pauseActiveTask` immediately before this message — user thinking time isn't work time. After the user resolves, resume from the blocked step (not Step 0).

---

## Mandatory exit conditions

Non-negotiable — phase cannot complete until all are satisfied.

| Condition | Requirement |
|---|---|
| **verification-loop PASS** | All 6 checks pass (Step 2) |
| **Integration tests PASS** | All scenarios pass (Step 3) |
| **Code review clean PASS** | Step 4 returns PASS, not PASS_WITH_NOTES |
| **All recommendations fixed** | Recommendations are blocking, not optional |
| **ADR compliance PASS** | Applicable ADRs honoured; new decisions documented (Step 5) |
| **Task tree consistent** | Zero open sub-tasks (Step 6) |
| **Phase task description never edited** | Locked-body contract honoured |

---

## Anti-patterns to avoid

- ❌ Writing code in this session **when a subagent tool is available** (orchestrated mode — spawn subagents). With no subagent tool, in-context coding is the correct path, not an anti-pattern.
- ❌ Stalling or no-opping because "I'm only an orchestrator" when no subagent tool exists. Degrade to in-context mode and do the work.
- ❌ Editing the phase task description. HTTP 422 — and even if it didn't reject, it violates the locked-body contract.
- ❌ Skipping `setActiveTask` on a sub-task before working it (no heartbeats, no time tracking).
- ❌ Marking a sub-task `completed` while the actual work is incomplete.
- ❌ Marking the phase `completed` with open sub-tasks.
- ❌ Burying defects/learnings/frictions in chat narrative instead of `logDefect`/`logLearning`/`logFriction`.
- ❌ Auto-adding principles. Surface as candidates; user decides.
- ❌ Pausing between steps 1–8 for user confirmation. Only blocker or Step-8-done stops the loop.
- ❌ Using `TaskUpdate` (the Claude-Code built-in) for sub-task status. Use `tasktracker_updateTaskStatus`.

---

## Quality checklist

- [ ] Step 0: `setActiveTask` on phase; digest read; principles surfaced.
- [ ] **Pre-flight report emitted to main chat after Step 0** (≤ 15 lines, sub-task titles + objective + verification approach).
- [ ] Step 1: each sub-task got its own `setActiveTask` and a status update on completion.
- [ ] Step 2: verification-loop returned clean PASS for all 6 checks.
- [ ] Step 3: integration tests cover every acceptance criterion of linked requirements.
- [ ] Step 4: code-review returned clean PASS (not PASS_WITH_NOTES).
- [ ] Step 5: applicable ADRs honoured; new decisions recorded as ADR + sub-task.
- [ ] Step 6: zero open sub-tasks; phase description never edited.
- [ ] Step 7: insights logged via tasktracker tools, not chat.
- [ ] Step 8: phase marked `completed` (or `completeWithCaveat` if appropriate); active task cleared.
- [ ] **Completion report emitted to main chat at Step 8** (≤ 20 lines, counts/statuses/caveats — not per-file diffs).
- [ ] **Orchestrated mode only:** no code written in this session; no `Write`/`Edit`/`NotebookEdit` calls (subagents did the work). In in-context mode this item is N/A — you did the work directly, and the gate that matters is that every sub-task was still tracked + verified.

---

## Invocation

**From `/tt-implement-plan` (primary use):**
```
Skill(skill="tt-implement-phase"): Execute Phase <N>.

Context:
- Project: <name + id>
- Phase task id: <uuid>
- Phase title: <title>
- Sub-tasks: <list from getTask>
- Requirements: <list of (id, title, criteria)>
- Principles: <surfaced from setActiveTask digest>

Execute all quality gates and return structured PHASE_RESULT.
```

**Manual (direct invocation):**
```
/tt-implement-phase <phase-task-uuid>
```

The skill loads the phase via `tasktracker_getTask` and proceeds from Step 0.

---

## References

Inherits most references from `/implement-phase`:

- `references/subagent-protocol.md` — mandatory response-format block, coding-standards pointer template. **Same content** as `/implement-phase`'s version.
- `references/insight-cookbook.md` — when/how to use `logDefect`, `logLearning`, `logFriction`. Tasktracker-specific (this is the one you actually need to read).
- `references/return-value.md` — `PHASE_RESULT` schema. Identical to `/implement-phase`'s — `/tt-implement-plan` consumes the same shape.
- `references/tdd-mode.md` — optional RED → GREEN → REFACTOR cycle. Borrowed from `/implement-phase`.

For TDD mode and verification-loop details, read the originals in `~/.claude/skills/implement-phase/references/` — semantics unchanged.

## Integration with other skills

- **`verification-loop`** — Step 2. Unchanged.
- **`code-review`** — Step 4. Unchanged.
- **`adr`** — Step 5b when new decisions need documentation.
- **`continuous-learning`** — Step 8 before any `/compact`.
- **`/tt-implement-plan`** — primary caller. Receives `PHASE_RESULT`.

## Key principles

1. **Orchestrate when you can; do it in-context when you can't.** Subagents do the code work in orchestrated mode; with no subagent tool, you do it yourself — but the work always gets done and tracked. Never stall on the absence of a subagent tool.
2. **Active task on every artifact-producing call.** Phase and each sub-task in turn.
3. **Locked phase body is sacred.** Sub-tasks are the right place for mid-implementation notes.
4. **Insights belong in tasktracker.** `logDefect` / `logLearning` / `logFriction`, not chat.
5. **One continuous run from Step 0 to Step 8.** Only blocker or Step-8-done stops it.
6. **Trust the digest.** Scope comes from the locked phase body, not from earlier conversation.
7. **Pre-flight and completion reports in main chat are not optional.** The parent chat can't see what subagents do — without these two short bookend reports, the orchestrator loses the thread between "I started a phase" and "the phase is done".
