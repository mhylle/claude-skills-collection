# How a tasktracker plan is stored

A plan made by `/tt-create-plan` is not a file. It is rows in one tasktracker project. This is the shape `/tt-implement-plan` reads.

## The tree

```
project
├── lifecycle phases (type "phase", metadata.lifecycleSlug ∈ brainstorm | requirements | architecture | plan)
│     done before implementation starts; /tt-implement-plan skips them
└── implementation phases (type "phase", top-level, no parent)
      body: objective, verification approach, exit conditions (build / runtime / functional),
            ADR reference, requirement ids — LOCKED once the phase has children (HTTP 422 on edit)
      └── sub-tasks (type "task", parent = the phase)
            seeded by createPhaseFromTemplate, tests before implementation,
            e.g. backend-feature: Design + name the ACs, Write failing AC tests (RED),
            Implement to GREEN, Deploy verify; mid-phase notes go here ("Decision: …", "ADR-NNNN reference")
            └── optional children (type "subtask", parent = a task — never a phase)
```

## What hangs off the tree

| Piece | Where it lives | Read with |
|---|---|---|
| Requirements | project-level rows, status draft → approved → satisfied | `listRequirements({projectId, status: "approved"})` |
| Acceptance criteria | per requirement, Given/When/Then, `satisfied` + `satisfiedByTaskId` | `listAcceptanceCriteria({requirementId})`; proven with `updateAcceptanceCriterion({requirementId, criterionId, satisfied: true, satisfiedByTaskId})` |
| Requirement links | on the phase (`requirementIds` at create, or `linkRequirementToTask`); children inherit them | `listRequirementTaskLinks({requirementId})`, the `setActiveTask` digest |
| Order | creation order, plus explicit dependencies (`createTaskDependency({taskId, dependsOnTaskId})`) | `getReadyTasks`, `getNextReadyTask` |
| Progress | task `status` ∈ pending / in_progress / completed / blocked; every status write passes the task's `version` | `listTasks({projectId, type: "phase"})`, `getTask`, `getChildTasks` |
| Dropped work | `archiveTask` (there is no "deleted" status), with a friction or learning saying why | `listTasks({..., includeArchived: true})` |
| Principles | learnings with category `principle` | `getPrinciples({projectId})`, the `setActiveTask` digest |
| Architecture | components with `codeReferences` | `scanArchitectureDrift({projectId})` |

## Gates

- **Plan formed:** `getProjectReadiness({projectId})` — the `plan` row is satisfied once implementation phases exist.
- **Work correct:** `getProjectDoneness({projectId})` — every phase completed, zero unsatisfied ACs on linked approved requirements, zero open defects, zero architecture drift.
