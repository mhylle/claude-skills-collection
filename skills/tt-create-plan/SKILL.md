---
name: tt-create-plan
description: Tasktracker-native implementation planning. Turns a frozen brainstorm (or a clear requirement) into a phased plan persisted as tasktracker phase tasks — NOT as a docs/plans/*.md file. Creates requirements with formal acceptance criteria, registers architecture components, generates phases via createPhaseFromTemplate (backend-feature / ui-fix / refactor / schema-migration / bug-investigation / docs-only / data-housekeeping), links every task back to its requirement, and uses getProjectReadiness as the completion gate. Use whenever the user wants to plan, design, or scope an implementation AND the work is (or will be) tracked in tasktracker. Triggers on "tt create plan", "tt plan", "plan this in tasktracker", "create a plan (tasktracker)", "/tt-create-plan", or any plan-creation request inside a session that already has a tasktracker active task or project. Prefer this over the plain /create-plan skill whenever a tasktracker MCP is available — the resulting phase tasks integrate with /tt-implement-plan and /implement-phase, so picking the file-based variant in a tasktracker project just creates orphan markdown.
context: fork
agent: Plan
---

# tt-create-plan

Tasktracker-native implementation planning. Walks the four lifecycle stages (brainstorm → requirements → architecture → plan) and lands the plan as **phase tasks in tasktracker**, with each task linked to the requirement it implements and architecture components registered for the structural pieces. No `docs/plans/*.md` file is written — the plan is the task tree.

## How this differs from /create-plan

| | `/create-plan` | `/tt-create-plan` (this skill) |
|---|---|---|
| Output | `docs/plans/YYYY-MM-DD-*.md` file + Tasks | Phase tasks in tasktracker (no file) |
| Requirements | Free text under "Context" | First-class `Requirement` rows with `AcceptanceCriterion` |
| Architecture | Implicit, narrative | `ArchitectureComponent` + `ArchitectureRelationship` rows |
| Phase scaffolding | Hand-written checklists | `createPhaseFromTemplate` with rituals embedded |
| Phase body | Editable markdown | **Locked** once children exist (immutable scope contract) |
| Progress gate | TaskList | `getProjectReadiness` per lifecycle stage |
| Plan/spec separation | "checkboxes in markdown" | Spec on phase task, progress on sub-tasks |

If the user is **not** using tasktracker, use `/create-plan` instead.

## Workflow

### Step 0: Establish project + lifecycle context (MANDATORY)

```
1. tasktracker_listProjects({search: "<topic-keywords>"})
   - Use the user's words. The most common failure mode is creating a
     duplicate project because you couldn't find the existing one.
   - If the user already had a /tt-brainstorm session, the project from
     that session is the one to use.

2. tasktracker_getProjectReadiness({projectId})
   - This 4-row table is the ground truth for "what stage are we in".
   - If `brainstorm` is in-progress or not started, STOP and tell the
     user — they probably want /tt-brainstorm first. Don't paper over
     a missing brainstorm; the requirements end up shaky.

3. tasktracker_getPrinciples({projectId, includeGlobal: true})
   - Surface conflicts before design, not after.

4. Find the first non-satisfied lifecycle phase task and
   tasktracker_setActiveTask(<that-task-id>).
   For a typical create-plan flow, this is the requirements-lifecycle
   phase. setActiveTask folds principles + acceptance criteria + the
   hierarchical requirement link into the digest you'll work from.
```

If `getProjectReadiness` shows `brainstorm: satisfied`, you can proceed. If it shows `brainstorm: skipped-deliberately`, also fine — skip to Step 2.

### Step 1: Ingest the brainstorm (when one exists)

```
tasktracker_listBrainstorms({projectId})
# Pick the frozen brainstorm for this work.
tasktracker_getBrainstorm({brainstormId})
```

Read the whole tree — master doc, capability/iteration/mvp sub-docs, and every `BrainstormDecision`. Each **chosen** decision is a candidate requirement; each **deferred** decision is a candidate later-iteration requirement; each **rejected** decision is context (why we *didn't* go that way) but not a requirement.

If the user prefers, a faster path is `tasktracker_promoteBrainstorm` from inside the brainstorm session — but for `/tt-create-plan` you usually want to be more selective than 1:1 promotion. Read and curate.

### Step 2: Requirements (with formal acceptance criteria)

For each capability the user wants in scope:

```
tasktracker_createRequirement({
  projectId,
  title: "<short verb-phrase title>",
  description: "<who needs this and why; reference the brainstorm
                document/decision by id where applicable>",
  priority: "low" | "medium" | "high" | "urgent"
})
# Capture the returned requirementId.

# Add acceptance criteria — at least one per requirement. Use
# Given/When/Then form. Each criterion is independently verifiable.
tasktracker_addAcceptanceCriterion({
  requirementId,
  statement: "Given <context>, when <action>, then <observable outcome>"
})
```

**Lifecycle gate:** the `requirements` row in readiness flips to satisfied only when at least one requirement has criteria AND is past `draft`. Status defaults to `draft`; usually leave it there and let the lifecycle trigger promote it on approval.

**Prefer `/user-story`** for non-trivial requirement decomposition. It generates an epic → feature → task hierarchy with Given/When/Then criteria already in formal shape, and writes through these same MCP calls.

Update the requirements-lifecycle phase task to completed when satisfied, then activate the architecture-lifecycle phase task.

### Step 3: Architecture (register the structural pieces)

Implementation will touch *things*. Register them.

```
# One call per component (service, module, table, page, agent, etc.)
tasktracker_createArchitectureComponent({
  projectId,
  name: "<canonical name>",
  kind: "service" | "module" | "table" | "page" | "agent" | ...,
  description: "<what this component does>"
})

# One call per directed relationship (depends-on, calls, writes-to, etc.)
tasktracker_createArchitectureRelationship({
  projectId,
  sourceComponentId,
  targetComponentId,
  kind: "<edge type>",
  description: "<one-line>"
})

# Optional but recommended for non-trivial systems:
tasktracker_createArchitectureDiagram({
  projectId,
  name: "<title>",
  body: "<mermaid or plain text>"
})
```

**Lifecycle gate:** the `architecture` row flips to satisfied when at least one component exists. Don't over-register — pick the structural pieces the plan will actually create or modify.

When done, complete the architecture-lifecycle phase and activate the plan-lifecycle phase task.

### Step 4: Present design options (Phase 4 from /create-plan, kept)

Don't skip this just because tasktracker is in the loop. The MCP doesn't substitute for design thinking.

```
Option A: [Approach Name]
- Description: [How it works]
- Pros: [Benefits]
- Cons: [Drawbacks]
- Fits pattern: [Reference to existing codebase patterns / components]

Option B: [Alternative Approach]
- ...

Recommendation: [Preferred option with rationale]
```

Wait for user approval before writing phases.

### Step 5: Document the decision (ADR)

For any non-trivial design choice, invoke the `/adr` skill. ADRs live in `docs/decisions/` (this is one of the few cases where file output is correct — ADRs are repository artifacts, not project lifecycle state). Cross-reference: add the ADR number into the chosen design option's record on the relevant architecture component or in the phase task description below.

### Step 6: Propose phase structure (get approval before creating)

Present the proposed phases as plain text first. The user may want to add/remove/reorder.

```
Proposed Implementation Phases:

Phase 1: [Name] — [one-line objective] — template: backend-feature
Phase 2: [Name] — ... — template: schema-migration
Phase 3: [Name] — ... — template: ui-fix
...
```

**Phase granularity:**
- One concern per phase. Touches two unrelated subsystems → split.
- Think in layers: foundation → data → core → API → integration → polish.
- Each phase must be demonstrably working when complete.
- Prefer more small phases over fewer large ones.

**Template selection** — `createPhaseFromTemplate` saves the canonical sub-task triplet for common shapes. Pick the closest fit:

| Template | Sub-tasks seeded | Use when |
|---|---|---|
| `backend-feature` | Design + decision, Implement, Tests, Deploy verify | Adding/modifying a backend capability |
| `ui-fix` | Reproduce, Fix, Verify | UI bug or UI tweak with a clear repro |
| `refactor` | Map current shape, Refactor, Regression verify | Code shape change with no behaviour change |
| `schema-migration` | Migration, Wire-up, Tests, Deploy verify | DB schema change |
| `bug-investigation` | Reproduce, Root-cause, Fix, Verify + document | Unknown-cause bug |
| `docs-only` | Edit, Verify-renders-and-commit | Pure documentation phase |
| `data-housekeeping` | Survey + snapshot, Operate via MCP (no raw SQL), Verify + log learning | Data migration, archive, merge |

If none of the templates fit, use `createTask({type: "phase"})` and add sub-tasks manually — but first ask whether the phase really doesn't fit a template, or whether it's actually two phases bundled together.

Get explicit approval before creating tasks.

### Step 7: Create the phases (and link to requirements)

For each approved phase:

```
# Either: template-based (preferred when it fits)
tasktracker_createPhaseFromTemplate({
  projectId,
  templateKey: "backend-feature",
  phaseTitle: "Phase N — <short title>",
  contextNote: "<optional: paste the design rationale and ADR link>"
})
# Returns the new phase task. Sub-tasks are pre-created.

# Or: ad-hoc (when no template fits)
tasktracker_createTask({
  projectId, type: "phase",
  title: "Phase N — <short title>",
  description: "<objective + verification approach + ADR ref>",
  requirementIds: [<reqId1>, <reqId2>]   # ← link at the phase level
})
# Then sub-tasks via createTask({type: "task", parentId: <phase-id>})
# or batchCreateTasks for atomicity.
```

**Linking requirements (Phase 73 contract).** Pass `requirementIds` on the **phase task**. Sub-tasks under that phase inherit the link automatically — you don't need to repeat it on every leaf. If you create a task without a link and no ancestor has one, an advisory friction insight fires; resolve it by adding the link or by `wontfix`-ing if the task is genuinely link-less (infra plumbing, etc.).

**`linkRole`** — defaults to `implements`. Use `verifies` for the testing/verification sub-task explicitly when the template doesn't already encode this.

### Step 8: Embed verification approach in each phase

Every phase's description (set at creation, never edited later — see "Locked phase body" below) MUST include:

1. **Verification approach** — what will prove this phase works (test command, browser check, API call, etc.). Concrete, not "we'll test it".
2. **Exit conditions** — all three categories:
   - Build (compile, lint, typecheck)
   - Runtime (starts, no errors, endpoint reachable)
   - Functional (tests pass, manual check passes)
3. **ADR reference** if a design decision was recorded.
4. **Requirement IDs** the phase implements.

See `references/exit-conditions.md` for per-language templates.

**Tests before implementation.** When seeding sub-tasks, put the test sub-task BEFORE the implementation sub-task. The default templates already do this in spirit (e.g., backend-feature has "Tests" as a distinct sub-task) but order the sequence so tests are written first.

### Step 9: Locked phase body (a hard rule)

Once a phase task has any unarchived child, its `description` is **immutable** — the backend returns HTTP 422 on update. This is the immutable scope contract set at planning time, and it's deliberate.

| Need | Right place |
|---|---|
| Original scope and verification approach | Phase task description (write it correctly at creation; you cannot edit later) |
| Design rationale, decision logs, follow-up notes during implementation | The "Design + decision note" sub-task (templates seed this) |
| Title, priority, due date, metadata changes | Phase task — these fields stay editable |
| Discovered scope gap | New sub-task under the phase, OR a follow-up phase |

If you ever find yourself wanting to update a phase body during implementation, that's the mistake the lock catches — pivot to a sub-task.

### Step 10: Verify readiness and hand off

```
tasktracker_getProjectReadiness({projectId})
```

All four rows should now read `satisfied` (or `skipped-deliberately` for brainstorm if it was deliberately skipped). The `plan` row is satisfied when concrete phases exist beyond the four lifecycle phases.

Complete the plan-lifecycle phase task. **Do not auto-activate Phase 1 of the implementation** — that's `/tt-implement-plan`'s job. `clearActiveTask`.

Closing summary (in chat, not as a file):

- Requirements created (count + titles).
- Architecture components registered (count + names).
- Phases created (count + titles + template used).
- ADRs created.
- Next step: `/tt-implement-plan` (with no path — it works from the task tree).

## Verification-first planning (kept from /create-plan)

Every phase MUST have:

1. **Verification approach** — clear statement of how success is measured.
2. **Tests before implementation** — sub-task order shows tests first.
3. **Specific scenarios** — not "write tests" but *what* scenarios.

Example phase description (paste at creation; cannot edit later):

```
Objective
- Implement password hashing + login endpoint.

Verification approach
- Unit tests: hash generation, hash comparison, invalid inputs.
- Integration test: POST /auth/login accepts valid creds, rejects invalid.
- Manual: hit endpoint with curl, confirm 200/401 contract.

Exit conditions
Build:
- npm run build succeeds
- npm run lint passes
- npm run typecheck passes
Runtime:
- npm run start starts cleanly
- POST /auth/login reachable
Functional:
- npm test -- auth passes
- Manual curl check passes

Requirements: REQ-0007 (user login), REQ-0008 (password storage)
ADR: ADR-0015 (chose bcrypt over argon2 for v1)
```

## Be thorough, interactive, skeptical (kept from /create-plan)

- **Thorough**: read entire files, follow import chains. The MCP doesn't replace reading code.
- **Interactive**: get buy-in at each lifecycle boundary. The user can redirect.
- **Skeptical**: when the user corrects you, verify through code investigation rather than accepting at face value.

## No unresolved questions

Do not seed phases with "TBD" or open questions in their description. The phase body is locked once children exist — TBDs in there become permanent. Resolve ambiguity before phase creation:

1. Stop. Investigate.
2. Present options.
3. Get resolution.
4. Then create the phase.

## Anti-patterns to avoid

- ❌ Writing `docs/plans/*.md`. The plan lives in tasktracker phase tasks.
- ❌ Creating phases before requirements exist (requirements lifecycle is upstream of plan lifecycle).
- ❌ Linking requirements on every leaf instead of on the phase. Inheritance handles it.
- ❌ Editing a phase description after sub-tasks exist (HTTP 422). Use a sub-task instead.
- ❌ Skipping `getProjectReadiness` — it's the truth source for lifecycle state.
- ❌ Bundling unrelated subsystems into one phase. Split.
- ❌ Creating a new project when an existing one already covers the work. `listProjects` first.

## Quality checklist

- [ ] Existing project found (or `/init-project` was used).
- [ ] Active task set before any tasktracker writes.
- [ ] Principles read; conflicts flagged.
- [ ] Brainstorm read in full (or deliberately skipped).
- [ ] Each in-scope requirement has at least one Given/When/Then criterion.
- [ ] Architecture components registered for what the plan will touch.
- [ ] Design options presented; user picked one.
- [ ] ADR recorded for non-trivial decisions.
- [ ] Phase structure approved by user before creation.
- [ ] Each phase uses the closest matching template (or is justified ad-hoc).
- [ ] Each phase task is linked to ≥1 requirement (inheritance for sub-tasks).
- [ ] Each phase description includes verification approach + 3 exit-condition categories + ADR ref.
- [ ] Tests sub-tasks precede implementation sub-tasks.
- [ ] `getProjectReadiness` shows all four rows satisfied.
- [ ] No "TBD" anywhere in phase bodies.
- [ ] `clearActiveTask` after the plan-lifecycle phase is marked complete.

## Resources

### references/
- `exit-conditions.md` — Per-language exit-condition templates (Node, Python, Go, Rust, Java).
- `lifecycle-cheatsheet.md` — Quick reference for which tasktracker tool maps to which lifecycle stage.

### Related tasktracker skills
- `/init-project` — Scaffold a tasktracker project if none exists.
- `/project-ready` — Pretty-print readiness (4-row table). Use as a sanity check.
- `/tt-brainstorm` — Upstream: refine the idea before planning.
- `/user-story` — Generate the hierarchical requirement tree (recommended for non-trivial scope).
- `/adr` — Record significant design decisions in `docs/decisions/`.
- `/tt-implement-plan` — Downstream: execute the plan you just seeded.
