# Token-usage tooling

Logs every Claude Code API response of this project — the main session and every subagent — attributes it to the TaskTracker task that was active at that moment, prices it at API-equivalent list prices, and pushes it into TaskTracker's cost system. No dependencies; Node 22 or later.

```bash
node scripts/token-usage.mjs --help                           # every option
node scripts/token-usage.mjs --json --task-map .claude/usage/task-map.json   # the report
node scripts/token-usage.mjs --push-tasktracker               # ingest, then push to TaskTracker
node --test tooling/token-usage/test/*.test.mjs                # the contract
```

## Files

| Path | What |
|---|---|
| `scripts/token-usage.mjs` | CLI and hook entry point. With `--quiet` it never writes to stdout or stderr and always exits 0; failures go to `.claude/usage/hook-errors.log`, so a hook can never block a session |
| `scripts/pricing.json` | USD per million tokens per model: input, output, 5-minute and 1-hour cache writes, cache reads, fast-mode rates, aliases |
| `.claude/settings.json` | Stop, SubagentStop and SessionEnd hooks: `--ingest --push-tasktracker --quiet`, 120 s each |
| `.claude/usage/token-usage.jsonl` | The append-only usage log (committed) |
| `.claude/usage/tasktracker.json` | `{"projectId": "<uuid>"}` (committed) |
| `.claude/usage/tasktracker.local.json` | `{"mcpServerDir": "<TaskTracker's mcp-server>"}`: machine-specific, so gitignored; `TASKTRACKER_MCP_DIR` overrides it |
| `.claude/usage/task-map.json` | Written by the build loop: `{taskId: {phaseId, phaseTitle, release}}` plus `agents: {agentKey: taskId}` (committed) |
| `.claude/usage/state.json`, `tasktracker-push.json`, `*.lock` | Local state: transcript byte offsets, the push watermark, locks (gitignored) |

## How it counts

- **Where usage is.** On transcript lines with `type: "assistant"`, in `message.usage`, with the model in `message.model`. Fields: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation.ephemeral_5m_input_tokens`, `cache_creation.ephemeral_1h_input_tokens` (falling back to `cache_creation_input_tokens` as 5-minute writes), and `speed` (`"fast"` or `"standard"`).
- **Each response is logged several times**, once per content block. Records are deduplicated by `(transcript file, message.id)`, falling back to `requestId`, keeping the one with the largest `output_tokens` (the final one). Summing raw lines overcounts about 7.5×; a distractor test fails a raw sum.
- **Subagents.** Their transcripts are `<session>/subagents/agent-<id>.jsonl`; type, name, description and parent come from the sibling `agent-<id>.meta.json`.
- **Attribution.** Each session's `setActiveTask` / `clearActiveTask` calls in the transcripts form a timeline. A call takes effect after its own message, and a call whose tool result was an error is ignored. A record whose task depends on a call without a result yet is deferred, because a logged task id is never rewritten. The task map's `agents` then credits every message of a named subagent to a task: first by its own name, then by its nearest ancestor's resolution, its agent type, and finally its description.
- **Incremental.** Byte offsets per transcript live in `state.json`, and only new bytes are read. The log is append-only, written under a lock, so concurrent hooks never double-count.
- **Pricing.** A model or speed missing from `pricing.json` gets `costUsd: null` and is listed in `unknownModels`; nothing is guessed. Add it from TaskTracker's rate card, so that both tools price alike.
- **Push.** Batches of 100 go through TaskTracker's own MCP client (`tasktracker_recordTokenUsage`), and a watermark makes resends idempotent. No batch starts after 90 s, a failure means 60 s of skipped pushes, and an event TaskTracker rejects is isolated and skipped rather than blocking the rest. The MCP client runs under the session id `<project directory name>-token-push`, never the session's own, so it can't take over the session's TaskTracker work lease.

## Checking against TaskTracker

`test/fixtures/tasktracker-golden.json` holds TaskTracker's own extraction of the wire fixtures, so the event contract is checked without a TaskTracker checkout. With one:

```bash
TASKTRACKER_MCP_DIR=<path to TaskTracker's mcp-server> node --test tooling/token-usage/test/tasktracker-events.test.mjs
```
