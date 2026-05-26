# Tasktracker Lifecycle Cheatsheet

Maps the four canonical lifecycle stages to the tools you actually call.

## The four stages

| Stage | Satisfied when | Primary tools |
|---|---|---|
| **brainstorm** | A brainstorm is frozen or promoted (or `brainstormPolicy: 'skipped-deliberately'`) | `tasktracker_startBrainstorm`, `addBrainstormDocument`, `recordBrainstormDecision`, `freezeBrainstorm`, `promoteBrainstorm` |
| **requirements** | At least one requirement has criteria AND is past `draft` | `tasktracker_createRequirement`, `addAcceptanceCriterion`, `updateRequirement` |
| **architecture** | At least one component exists | `tasktracker_createArchitectureComponent`, `createArchitectureRelationship`, `createArchitectureDiagram` |
| **plan** | Concrete phases exist beyond the four lifecycle ones (OR all lifecycle phases completed) | `tasktracker_createPhaseFromTemplate`, `batchCreateTasks`, `createTask({type: "phase"})` |

## First-contact recipe

```
1. tasktracker_listProjects({search: "..."})       # Don't create a duplicate.
2. If no match → /init-project                      # Or createProjectFromTemplate.
3. tasktracker_getProjectReadiness({projectId})     # Where are we?
4. tasktracker_getPrinciples({projectId})           # What rules apply?
5. setActiveTask(<first non-satisfied lifecycle phase>)
```

## Active-task discipline

- `setActiveTask` — opens auto-heartbeat. Required before any artifact-producing call.
- `pauseActiveTask` — call BEFORE any message that waits for the user.
- `clearActiveTask` — hard stop. Use when leaving a lifecycle stage.
- Without an active task: no time tracking, principles don't surface in the digest, friction insights pile up.

## Requirement linking (Phase 73 contract)

- Link at the **phase** level: `requirementIds: [...]` on the phase task.
- Sub-tasks **inherit** — don't repeat on every leaf.
- Roles: `implements` (default), `partially_implements`, `verifies`.
- Unlinked task with no inherited link → advisory friction insight (never blocks).

## Locked phase body (Phase 83 contract)

- Phase task description is **immutable** once any unarchived child exists. HTTP 422 on update.
- Editable: title, priority, due date, metadata.
- Need to add design rationale during implementation? Use the "Design + decision note" sub-task.
- This is a feature, not a bug — protects the planning-time scope contract.

## Phase templates and what they seed

| Template | Sub-tasks |
|---|---|
| `backend-feature` | Design + decision, Implement, Tests, Deploy verify |
| `ui-fix` | Reproduce, Fix, Verify |
| `refactor` | Map current shape, Refactor, Regression verify |
| `schema-migration` | Migration, Wire-up, Tests, Deploy verify |
| `bug-investigation` | Reproduce, Root-cause, Fix, Verify + document |
| `docs-only` | Edit, Verify-renders-and-commit |
| `data-housekeeping` | Survey + snapshot, Operate via MCP (no raw SQL), Verify + log learning |

Prefer templates over hand-rolled sub-task lists — they embed the standard rituals (live-verify, evidence dir, etc.).

## Duplicate-project guardrail

`createProjectFromTemplate` returns HTTP 409 + candidate list if a similar (name+description) project exists. The right answer is almost always "consolidate", not "override with `acknowledgeDuplicates: true`". Use `tasktracker_mergeProjects` for genuine duplicates that already exist.
