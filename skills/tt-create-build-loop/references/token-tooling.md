# The bundled token-usage tooling

`assets/token-usage/` is a self-contained Node tool (no dependencies, Node 22 or later) that logs every Claude Code API response of a project — main session and subagents — attributes it to the TaskTracker task active at that moment, prices it, and pushes it into TaskTracker's cost system. The loop's cost ledger (template §6) is built on it.

## What gets installed

`scripts/install-token-tooling.mjs --target <repo> --project-id <uuid> --mcp-dir <dir>` (add `--dry-run` to see the plan):

| In the project | From | How |
|---|---|---|
| `scripts/token-usage.mjs` | `assets/token-usage/scripts/` | copied; the CLI (`--help`) and the hook entry point, which never fails a hook (`--quiet` logs to `.claude/usage/hook-errors.log` and exits 0) |
| `scripts/pricing.json` | same | copied; USD per million tokens, per model, with fast-mode rates and aliases |
| `tooling/token-usage/README.md`, `src/*.mjs`, `test/**` | `assets/token-usage/tooling/` | copied, fixtures included; the README documents how it counts |
| `.claude/settings.json` | `settings-hooks.json` | merged: the Stop, SubagentStop and SessionEnd hooks are added once; every existing key and hook is kept |
| `.gitignore` | `gitignore.snippet` | only the missing lines are appended (local state: offsets, watermark, locks, the hook error log) |
| `.claude/usage/tasktracker.json` | `--project-id` | `{"projectId"}`, committed; an existing file must name the same project |
| `.claude/usage/tasktracker.local.json` | `--mcp-dir` | `{"mcpServerDir"}`, machine-specific and gitignored; an existing file must name the same directory |

The installer plans first and writes nothing when anything conflicts — a differing file at a destination, an unreadable `settings.json`, a `tasktracker.json` for another project, a `tasktracker.local.json` naming another directory. It installs only into an existing git work tree, writes each file through a rename, adds only missing hooks and gitignore lines, and runs the same through a symlink. Running it again changes nothing.

The usage log (`.claude/usage/token-usage.jsonl`), the task map and `tasktracker.json` are committed: they are project history. They hold session ids, task ids, model names and token counts, never prompt or tool content. In a public repo, ask before committing them.

## Configuration

- **`mcpServerDir`**: TaskTracker's `mcp-server` directory, the one with `lib/mcp-client.js`. Find it in Claude Code's MCP config: `claude mcp get tasktracker`, or `mcpServers.tasktracker.args` in `~/.claude.json` (the directory of its `index.js`). It lives in the gitignored `tasktracker.local.json`, because it differs per machine and names a home directory; `TASKTRACKER_MCP_DIR` overrides it, and an `mcpServerDir` in `tasktracker.json` is still read when there is no local file.
- **Reporter identity**: the push spawns TaskTracker's MCP client under the session id `<project directory name>-token-push`, never under the session's own id, so it can't take over the session's work lease (lessons catalogue: "A hook's MCP child must not take the session's lease").
- **Task map** (`.claude/usage/task-map.json`, written by the loop): `{taskId: {phaseId, phaseTitle, release}}` for roll-ups by phase and release, plus `agents: {agentKey: taskId}`, which credits every message of a named subagent to a task (first match wins: its name, its nearest ancestor's resolution, its agent type, its description).

## How it counts

`assets/token-usage/tooling/token-usage/README.md` — installed with the tooling, so the project keeps it — documents where usage sits in a transcript, the deduplication that keeps a 7.5× overcount out, subagent identity, attribution through the transcripts' `setActiveTask` timeline, pricing and the push. The tests hold the code to it.

The loop this was generalised from first read TaskTracker's per-session `active-task` file to find the active task. The transcript timeline replaced it, because it also covers subagents and backfills.

## Tests

From the project (or from `assets/token-usage/` in the skill):

```bash
node --test tooling/token-usage/test/*.test.mjs
# also check our events against TaskTracker's live extractor:
TASKTRACKER_MCP_DIR=<mcp-server> node --test tooling/token-usage/test/tasktracker-events.test.mjs
```

Without `TASKTRACKER_MCP_DIR` the live-extractor test is skipped; the vendored golden file still checks the contract.

## Changes from the source project's copy

- The reporter's session id was a hard-coded `<source project>-token-push`; it is now derived from the project directory's name.
- TaskTracker's `mcp-server` was found at a fixed path beside the source repo; it now comes from `TASKTRACKER_MCP_DIR` or the gitignored `tasktracker.local.json`, and a push without either says how to set one.
- The hook test checks `.claude/settings.json` when installed and `settings-hooks.json` in the asset directory.
- Test paths and fixtures no longer name the source project.
