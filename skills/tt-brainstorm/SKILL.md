---
name: tt-brainstorm
description: Tasktracker-native Socratic brainstorming. Refines a raw idea into a frozen brainstorm document tree stored in tasktracker (NOT in docs/brainstorms/*.md), with every chosen/deferred/rejected option recorded as a decision and an optional one-way promotion into a task tree. Use whenever a user wants to brainstorm, explore, refine, or "think through" an idea AND the work is (or will be) tracked in tasktracker. Triggers on "tt brainstorm", "brainstorm with tasktracker", "brainstorm in tasktracker", "explore this idea (tasktracker)", "/tt-brainstorm", or any brainstorm-style request inside a session that already has a tasktracker active task or project. Prefer this over the plain /brainstorm skill whenever a tasktracker MCP is available — the artifacts integrate with /tt-create-plan and /tt-implement-plan, so picking the file-based variant in a tasktracker project just creates orphan markdown.
---

# tt-brainstorm

Tasktracker-native single-session brainstorming. Refines a raw idea through Socratic questioning and targeted analytical frameworks, then persists the refined idea as a **brainstorm document tree in tasktracker** (not as a file in `docs/brainstorms/`). Every meaningful decision is recorded as a `BrainstormDecision` with chosen / deferred / rejected options, so downstream tooling can convert the brainstorm into a real task tree.

The key philosophy: **adapt the analysis to the idea, not the idea to the analysis.** Different ideas need different frameworks — a risk-heavy initiative wants Premortem, a product feature wants SCAMPER. Pick what generates insight; skip what generates filler.

## How this differs from /brainstorm

| | `/brainstorm` | `/tt-brainstorm` (this skill) |
|---|---|---|
| Output | `docs/brainstorms/YYYY-MM-DD-*.md` file | Brainstorm tree in tasktracker (no file) |
| Decisions | Free text in markdown | Structured `BrainstormDecision` rows |
| Handoff to plan | Manual re-reading | `promoteBrainstorm` → task tree, one call |
| Project context | None | Bound to a tasktracker project |
| Time tracking | None | Auto-heartbeats while active |

If the user is **not** using tasktracker for this work, use `/brainstorm` instead. This skill assumes the tasktracker MCP is wired up.

## Workflow

### Step 0: Establish project context (MANDATORY first step)

Brainstorms in tasktracker live under a project. Before any other work, figure out which project. This is the single most common failure mode of a tasktracker session, so do not skip it.

```
1. tasktracker_listProjects({search: "<topic-keywords>"})
   - Search liberally with the user's own words. Don't trust your memory.
   - Inspect candidates with getProject if the name is close-but-not-identical.

2. If no project matches:
   - Offer to scaffold one via /init-project (recommended).
   - Or, if the user insists on inline scaffolding, call
     tasktracker_createProjectFromTemplate with the four template keys
     (lifecycle, techStack, deployment, projectType). See workflow guide.

3. If a project exists:
   - Find its brainstorm-lifecycle phase task
     (metadata.lifecycleSlug = "brainstorm").
   - tasktracker_setActiveTask(<phase-1-task-id>).
     This starts auto-heartbeating — every subsequent tool call now
     contributes to that task's TaskTimeLog.
```

Why this matters: tasks are the root of work. Without an active task, no time is tracked, principles are not surfaced in the digest, and unlinked artifacts accumulate friction insights. The `setActiveTask` digest also surfaces project-level principles you should respect during this session — read them before asking the user a single question.

### Step 1: Read the principles

```
tasktracker_getPrinciples({projectId, includeGlobal: true})
```

Skim the list. These are durable rules the user has agreed to honour. If a principle directly constrains the brainstorm (e.g., "No new external services this quarter"), acknowledge it explicitly when summarising the user's idea. Don't propose options that violate principles without flagging the conflict.

### Step 2: Seed the brainstorm

When you understand the user's rough idea well enough to name it:

```
tasktracker_startBrainstorm({
  projectId,
  name: "<short topic title>",
  description: "<one-line scope>",
  masterBody: "<initial markdown — the user's idea in their own words,
                plus your initial summary of what you understood>"
})
```

This atomically creates the brainstorm row and seeds the master `BrainstormDocument`. Capture the `brainstormId` and the master `documentId` — you'll thread them through every later call.

### Step 3: Socratic clarification (iterative)

Engage in rounds of 2–4 questions until the user signals readiness to move to analysis. Question categories:

1. **Scope** — What's in/out? What's the smallest version of this that still helps?
2. **Assumption** — What must be true for this to work?
3. **Alternative** — What's the opposite approach? What else have you considered?
4. **Consequence** — What changes downstream if this ships? If it fails?
5. **Evidence** — What supports this? How would we test it?

How to question well:

- Build on previous answers. Don't cycle through a checklist.
- Prefer "what" / "how" over "why" (less confrontational).
- Acknowledge insight before probing deeper.
- After each round: "Want to keep digging on [X], or move to analysis?"

**Persist as you go.** Don't wait until the end. When a thread surfaces a distinct sub-idea, capture it as a child document:

```
tasktracker_addBrainstormDocument({
  brainstormId,
  parentId: <master documentId, or another doc's id>,
  kind: "capability" | "iteration" | "mvp" | "mode" | "adhoc",
  title: "<short title>",
  body: "<markdown — what we discussed, in enough detail to be readable
          a month from now>"
})
```

Kind guide:
- **capability** — a discrete feature/capability of the idea.
- **iteration** — a delivery slice (v1, v2). Use when scoping by release.
- **mvp** — the must-haves for first launch. At most one per brainstorm.
- **mode** — a distinct mode of operation (e.g., "online mode", "offline mode").
- **adhoc** — anything that doesn't fit the above. Use sparingly.

For tangential threads ("parking lot"), add an `adhoc` doc titled `Parking lot — <subject>`. Don't lose them.

**Reference (cross-link) deliberately.** When two sub-docs are related, pass `references: [{targetDocId, label, context}]` on the later one so the relationship survives the session.

**Pause before user waits.** Before any message that ends with a question and waits for the user, call `tasktracker_pauseActiveTask` — the user's thinking time is not work time.

### Step 4: Record decisions as they crystallise

Any time the user picks between options — even casually — record it. Decisions are the single most valuable artifact this skill produces, because `promoteBrainstorm` later turns them into concrete subtasks.

```
tasktracker_recordBrainstormDecision({
  documentId: <the doc this decision lives under>,
  topic: "<the question being decided, e.g., 'Storage backend'>",
  options: [
    { label: "Postgres",     status: "chosen",
      summary: "Existing infra, good enough for v1",
      prosCons: "+ ops already understand it, - JSONB indexing limits" },
    { label: "DynamoDB",     status: "deferred", deferTo: "v2",
      summary: "Revisit if scale demands it",
      prosCons: "+ scales horizontally, - new ops burden" },
    { label: "Redis-as-DB",  status: "rejected",
      summary: "Durability concerns for this workload" }
  ],
  resolution: "<optional markdown rationale>"
})
```

Status guide:
- **chosen** — promote to a subtask on handoff.
- **deferred** with `deferTo: "<iteration title>"` — route into that iteration's task on promotion.
- **rejected** — stays on the brainstorm for posterity, does not become a task.

If you find yourself writing "we decided X" in a document body and not recording a decision, stop and record the decision. The structured form is what makes the brainstorm machine-readable.

### Step 5: Targeted research (only when valuable)

Research only when the idea would meaningfully benefit. Don't research for the sake of researching.

> **The brainstorm itself is NEVER delegated.** This skill's actual work — recording documents and decisions via the tasktracker MCP (`addBrainstormDocument`, `recordBrainstormDecision`, …) — always runs in THIS context. Research subagents are an optional *input-gathering* step: they go fetch, they RETURN findings, and **you** fold those findings into the brainstorm by persisting them. A research subagent must never be allowed to stand in for the brainstorm and hand back a prose summary instead of persisted rows (the original Phase 113 friction).

**Fan research out via the `Agent` tool** — it's a top-level main-loop BUILT-IN (like `Bash`/`Edit`), so in this `context: fork` skill it is ALWAYS available; never "check" for it and never use `ToolSearch` to detect it (ToolSearch indexes only deferred MCP tools — `Agent` never appears there, and a miss is NOT absence). Just dispatch:

```
# Web research (most ideas benefit; very internal ones may not)
Agent(subagent_type="web-search-researcher",
      prompt="Research best practices, common patterns, and pitfalls for
              [idea topic]. Focus on actionable insights, not general info.")

# Codebase research (only when the user mentioned files/modules/the codebase)
Agent(subagent_type="codebase-locator", prompt="...")
Agent(subagent_type="codebase-analyzer", prompt="...")
Agent(subagent_type="codebase-pattern-finder", prompt="...")
```

**Only if a direct `Agent` dispatch actually errors** (an observed failure — not an inferred or ToolSearch-derived "absence"), do the research inline yourself — `WebSearch`/`WebFetch` for external, `Grep`/`Glob`/`Read` for the codebase — then persist the findings exactly the same way. Either way: never skip the research, never stall.

When findings arrive (from a subagent or your own inline research), add them as `adhoc` documents titled `Research — <topic>` referencing the docs they inform — that persistence step is the point.

### Step 6: Focused analysis (1–2 frameworks max)

Pick frameworks based on idea type. Forcing all four onto every idea produces noise.

| Idea type | Primary | Add secondary when… |
|---|---|---|
| Product / feature | SCAMPER | Stakeholder complexity → add Six Hats |
| Architecture / technical | Six Thinking Hats | High risk → add Premortem |
| Strategy / business | Six Thinking Hats | Low reversibility → add Premortem |
| Process / workflow | SCAMPER | Cross-team impact → add Six Hats |
| Creative / open | SCAMPER | Need direction → add Six Hats (Green+Blue) |
| Risk / problem | Premortem | Always include Six Hats (Black+White+Yellow) |

For framework prompts and detail, see `references/questioning-frameworks.md`. Skip letters/hats that don't generate insight for *this particular* idea.

Capture each meaningful framework output as a document — typically `kind: "adhoc"`, titled `Analysis — <framework>`.

### Step 7: Freeze (and offer to promote)

When the user signals the brainstorm is done:

1. **Make sure no document is still in progress.** `tasktracker_freezeBrainstorm` rejects with HTTP 400 if any document is `in_progress`. Walk the tree, finish or close anything dangling.

2. **Freeze.**
   ```
   tasktracker_freezeBrainstorm({brainstormId})
   ```

3. **Offer to promote.** Show the user a dry-run first so they can see what task tree will be created:
   ```
   tasktracker_promoteBrainstorm({brainstormId, dryRun: true})
   ```
   Then, on confirmation:
   ```
   tasktracker_promoteBrainstorm({brainstormId, dryRun: false})
   ```
   This is **one-way**. Master becomes a top-level phase, sub-docs become tasks under it, chosen decisions become subtasks under their doc's task, deferred options with `deferTo` route into their iteration task. Rejected options stay on the brainstorm for the record.

4. **Mark the brainstorm-lifecycle phase task complete** and `clearActiveTask`. Then offer the next step:
   - If readiness ≥ "brainstorm satisfied", suggest `/tt-create-plan` or `/user-story`.
   - If the idea is large or has many open threads, suggest `/deep-brainstorm` for multi-session continuation.

### Step 8: Closing summary

Give the user a concise text summary (in the chat, not as a file):

- What the refined idea is, in 2–3 sentences.
- The most important decisions recorded.
- Open parking-lot items, if any.
- Suggested next skill (`/tt-create-plan`, `/user-story`, `/deep-brainstorm`).

Do **not** write a `docs/brainstorms/*.md` file. The brainstorm lives in tasktracker. The chat summary is a hand-off, not the artifact.

## Initial response style

When invoked, don't open with a canned line. Acknowledge the user's idea naturally and start engaging immediately. If they've already described the idea, summarise what you heard and begin clarifying questions. If they haven't, ask them to share what they're thinking about. Avoid scripted openings like "I'm ready to help you explore your idea."

## Project-context detection signals

Flag for codebase research (Step 5) when:
- User names specific files, modules, or features.
- User references "the current system" or "our codebase".
- User mentions extending/modifying existing functionality.

Flag complexity escalation (suggest `/deep-brainstorm`) when:
- Multiple distinct problem domains in one idea.
- More than 5–6 major components or stakeholders.
- Spans organisational boundaries.
- Multi-month timeline with phases.

## Anti-patterns to avoid

- ❌ Writing `docs/brainstorms/*.md`. The output lives in tasktracker.
- ❌ Skipping `setActiveTask` because "it's just a brainstorm". Without it, no heartbeats, no time tracking, principles don't surface.
- ❌ Recording decisions only in document bodies. Use `recordBrainstormDecision` so promotion works.
- ❌ Freezing a brainstorm with in-progress documents. The API rejects this — finish or close them first.
- ❌ Running all four frameworks "for completeness". Pick 1–2 that fit.
- ❌ Skipping `pauseActiveTask` before user waits. The user's thinking time isn't work time.

## Quality checklist (before closing the session)

- [ ] Project context established (or `/init-project` was offered).
- [ ] Active task set to the brainstorm-lifecycle phase before any tasktracker writes.
- [ ] Principles read; conflicts flagged when relevant.
- [ ] Master document captures the user's idea in their own words plus a refined summary.
- [ ] Sub-documents capture distinct capabilities / iterations / parking-lot items.
- [ ] Every decision the user made is in a `BrainstormDecision` (not just narrative).
- [ ] Frameworks were selective, not mechanical.
- [ ] All documents finalised (no `in_progress`) before freeze.
- [ ] Brainstorm frozen.
- [ ] Promotion dry-run shown to user; actual promotion done on confirmation.
- [ ] `clearActiveTask` after the brainstorm-lifecycle phase is marked complete.
- [ ] Next-step suggestion given (`/tt-create-plan`, `/user-story`, or `/deep-brainstorm`).

## Resources

### references/
- `questioning-frameworks.md` — Detailed question templates for Socratic, Six Hats, SCAMPER, and Premortem. Identical to the file used by `/brainstorm`.

### Related tasktracker skills
- `/init-project` — Scaffold a new tasktracker project end-to-end. Use when no project exists.
- `/project-ready` — 4-row readiness table. Useful as a sanity check before freeze.
- `/user-story` — Convert a frozen brainstorm into structured requirements with acceptance criteria.
- `/tt-create-plan` — Next stage after brainstorm: design and seed the implementation plan.
- `/deep-brainstorm` — Multi-session continuation when one session isn't enough.
