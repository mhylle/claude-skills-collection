# Config Schema

Each target repository configures the ship-issue pipeline through a single file:

```
.claude/ship-issue.config.json
```

The preflight stage validates this file in full; any invalid or missing required field makes preflight exit **BLOCKED** (see [stage-contracts.md](stage-contracts.md), Stage 1) — the pipeline never proceeds on a partially valid config and never substitutes defaults for required fields.

## Fields

### `staging_url` (string, required)

The base URL of the staging environment. The deploy stage confirms the deployed build is reachable here; the e2e stage runs its live verification against it.

### `deploy_command` (string) OR `ecs` (object) — exactly one required

How the deploy stage puts the branch's build on staging.

- `deploy_command` (string): a shell command the orchestrator executes to deploy. Non-zero exit means deploy BLOCKED.
- `ecs` (object): managed ECS deployment.
  - `cluster` (string, required within `ecs`): the ECS cluster name.
  - `service` (string, required within `ecs`): the ECS service name.

**Precedence/validation rule:** exactly one of `deploy_command` or `ecs` must be present. Both present is a validation error; neither present is a validation error. There is no precedence between them because they are mutually exclusive by validation.

### `log_command` (string) OR `cloudwatch` (object) — exactly one required

How the logs stage (staging-log-verifier) reads staging logs.

- `log_command` (string): a shell command whose stdout is the log stream to inspect.
- `cloudwatch` (object): CloudWatch-based log access.
  - `log_group` (string, required within `cloudwatch`): the CloudWatch log group to query.

Same mutual-exclusivity rule as deploy: exactly one of the two must be present; both or neither is a validation error.

### `cloud_review` (object, required)

Controls the cloud-review stage.

- `trigger_comment` (string, **optional**): the exact comment body the orchestrator posts on the PR to trigger the cloud review. When absent, the orchestrator applies the default `@claude review`. When present it must be a non-empty string (a present-but-empty value is a config error, not a request for the default).
- `timeout_minutes` (number, required): how long the orchestrator waits for the cloud review to respond. This is the config-driven bound for the cloud-review wait — the pipeline imposes no bound of its own. **A timeout is NOT a BLOCKED condition:** the orchestrator consolidates it as a recorded ship-or-fix input (`decision_recorded`), not a hard failure — see [stage-contracts.md](stage-contracts.md), Stage 6.
- `skip` (boolean, **optional**, default `false`): when `true`, the cloud-review stage is skipped cleanly (recorded `passed` with a skip reason). When present it must be a boolean.
- `reviewer_login` (string, **optional**, default `claude`): the GitHub account login whose PR comment or review counts as the cloud review's response. The orchestrator passes it to `cloud_review.py --reviewer-login`; the poll loop ignores the pipeline's own trigger comment and waits specifically for a response from this login. When present it must be a non-empty string.

### `ci` (object, required)

Controls the ci stage.

- `required_checks` (array of string, required, non-empty): the names of the CI checks that must pass on the PR's head commit. The ci stage passes only when every named check has completed successfully. A name that does not correspond to any check on the repository makes the ci stage BLOCKED.

### `tasktracker` (object, optional)

Additive mirroring of the pipeline's native file-based timing (see [run-state-schema.md](run-state-schema.md)) into real tasktracker timers.

- `time_integration` (boolean, required within `tasktracker`): whether tasktracker timer mirroring is on.

**Semantics:** when `time_integration` is `true` and a tasktracker MCP is available at runtime, the orchestrator ALSO drives real tasktracker timers — `startTimer`/`stopTimer` mirroring every `timer_started`/`timer_stopped` event of [run-state-schema.md](run-state-schema.md). When the key is absent, `time_integration` is `false`, or tasktracker is unavailable at runtime, native file-based timing works completely unchanged. Tasktracker integration is **additive, never load-bearing**: tasktracker unavailability at runtime is NOT a BLOCKED condition. Preflight validates this key's shape only (like any other field) and does not check tasktracker reachability.

## Annotated example

```jsonc
{
  // Staging base URL — deploy verifies reachability; e2e runs against it
  "staging_url": "https://staging.widgets.acme.dev",

  // Deploy mechanism — EXACTLY ONE of `deploy_command` or `ecs`.
  // Variant A (shown active): shell command
  "deploy_command": "./scripts/deploy-staging.sh",
  // Variant B (alternative — would REPLACE deploy_command, never coexist):
  // "ecs": { "cluster": "staging-cluster", "service": "widgets-api" },

  // Log access — EXACTLY ONE of `log_command` or `cloudwatch`.
  // Variant A (shown active): shell command whose stdout is the log stream
  "log_command": "kubectl logs -n staging deploy/widgets-api --since=1h",
  // Variant B (alternative — would REPLACE log_command, never coexist):
  // "cloudwatch": { "log_group": "/ecs/staging/widgets-api" },

  // Cloud review trigger and config-driven wait bound
  "cloud_review": {
    "trigger_comment": "@cloud-reviewer please review",
    "timeout_minutes": 30
  },

  // CI checks that must pass on the PR head commit
  "ci": {
    "required_checks": ["build", "unit-tests", "lint"]
  },

  // OPTIONAL: also drive real tasktracker timers per work window (additive —
  // the file-based timing in run-state-schema.md is authoritative and
  // works unchanged without this; tasktracker being unreachable at
  // runtime never blocks a run)
  "tasktracker": {
    "time_integration": true
  }
}
```

(JSONC comments above are annotation only; the real file is plain JSON.)

## Validation summary (enforced by preflight)

| Rule | On violation |
|------|--------------|
| File exists at `.claude/ship-issue.config.json` and parses as JSON | BLOCKED |
| `staging_url` present, non-empty string | BLOCKED |
| Exactly one of `deploy_command` / `ecs` (with `cluster` and `service`) | BLOCKED |
| Exactly one of `log_command` / `cloudwatch` (with `log_group`) | BLOCKED |
| `cloud_review.trigger_comment` — optional; when present, a non-empty string (default `@claude review` applied downstream when absent) | BLOCKED |
| `cloud_review.timeout_minutes` present, positive number | BLOCKED |
| `cloud_review.skip` — optional; when present, a boolean (default `false`) | BLOCKED |
| `cloud_review.reviewer_login` — optional; when present, a non-empty string (default `claude`) | BLOCKED |
| `ci.required_checks` present, non-empty array of strings | BLOCKED |
| `tasktracker`, when present: object with boolean `time_integration` | BLOCKED |
| No unknown top-level fields — known fields are `staging_url`, `deploy_command`, `ecs`, `log_command`, `cloudwatch`, `cloud_review`, `ci`, `tasktracker` (guards against typos silently disabling config) | BLOCKED |

`tasktracker` absent is valid — native file-based timing only. Shape validation is the full extent of preflight's involvement with this key: tasktracker reachability is a runtime concern and never a BLOCKED condition.

## Related

- [stage-contracts.md](stage-contracts.md) — the stages that consume these fields: preflight (validation), ci (`ci.required_checks`), cloud-review (`cloud_review`), deploy (`deploy_command`/`ecs`, `staging_url`), e2e (`staging_url`), logs (`log_command`/`cloudwatch`)
- [run-state-schema.md](run-state-schema.md) — the native file-based timing that `tasktracker.time_integration` optionally mirrors
