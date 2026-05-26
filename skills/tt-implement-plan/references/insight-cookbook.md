# Insight Cookbook — `logDefect` / `logLearning` / `logFriction`

When something non-obvious surfaces during implementation, log it through tasktracker rather than burying it in chat. Insights are queryable later via `tasktracker_listInsights`, they show up in `getDefectStats` / `getImprovementMetrics`, and they survive session boundaries — chat narrative doesn't.

## logDefect

**Use when**: a bug is discovered (in your own code, in dependencies, in the spec).

```
tasktracker_logDefect({
  projectId,
  taskId: <current active task>,
  title: "<short summary>",
  description: "<repro steps, observed vs. expected>",
  severity: "low" | "medium" | "high" | "critical"
})
```

- Severity guidance:
  - **critical** — data loss, security exposure, blocks all users.
  - **high** — blocks a user-visible feature; no safe workaround.
  - **medium** — degraded behaviour with a workaround.
  - **low** — cosmetic, edge case, log-only.
- Always include repro steps. "Sometimes fails" is not a defect, it's a friction.
- Counts toward `getDefectStats` — visible to anyone running `/project-ready` or the dashboard.

## logLearning

**Use when**: a pattern, gotcha, or constraint surfaces that future implementers should know about.

```
tasktracker_logLearning({
  projectId,
  taskId,
  title: "<short pattern name>",
  description: "<what was learned + why it matters + how to apply>",
  category: "principle" | "pattern" | "gotcha" | "convention"
})
```

- **principle** — a durable rule that should constrain future work. Surface to user before logging — principles are a charter.
- **pattern** — a recurring shape worth naming (e.g., "BooleanQueryParam decorator for boolean query fields").
- **gotcha** — a footgun (e.g., "uuid v14 is ESM-only, trips ts-jest").
- **convention** — a project-specific norm (e.g., "phase task bodies are locked once children exist").

Good learnings are short, specific, and actionable. "Be careful with async" is not a learning. "Promise.all rejects on first error — use Promise.allSettled when partial success is OK" is.

## logFriction

**Use when**: something slowed you down but wasn't a bug — slow builds, flaky tests, confusing errors, unclear docs, repeated context switching.

```
tasktracker_logFriction({
  projectId,
  taskId,
  title: "<short summary>",
  description: "<what made it slow / annoying / error-prone>",
  category: "workflow" | "code" | "tooling" | "docs"
})
```

- The point is to accumulate evidence for future cleanup, not to fix immediately.
- `getImprovementMetrics` aggregates frictions over time — surfaces hotspots.
- Friction insights are advisory; they never block work.

## When to surface vs. just log

| Scenario | Action |
|---|---|
| Defect blocks current phase | Log it AND surface to user (it's a blocker). |
| Defect found incidentally, doesn't block current phase | Log it; mention briefly in phase-complete summary. |
| Learning applicable to current project only | Log with `category: "convention"`. |
| Learning applicable to all future projects | Log AND propose adding as a principle (don't auto-add). |
| Friction, low impact | Just log. |
| Friction, high impact (repeated 3+ times) | Log AND surface as a follow-up task suggestion. |

## Resolving vs. wontfix

When a defect is fixed: `tasktracker_resolveInsight({insightId, resolution: "<one-line>"})`.

When a friction or learning is no longer relevant (e.g., the convention was retired): `tasktracker_wontfixInsight({insightId, reason: "<one-line>"})`.

If a defect was logged in error: `tasktracker_deleteInsight({insightId})`.

## Anti-patterns

- ❌ Logging every minor annoyance as a friction — high-signal only.
- ❌ Using `logDefect` for things that aren't defects (e.g., "spec is unclear" — that's a friction).
- ❌ Logging a learning without "why it matters" — future you won't understand the entry.
- ❌ Auto-adding principles. Principles are a charter — propose, don't impose.
