# devflow HUD

Part of the devflow plugin since 2.1.0. A function-hooks module (`hooks/register.tsx`, named under `modules` in
`hooks/hooks.json`) that shows how a TaskTracker phase is going and enforces the habits the phase skills
(`/devflow:tt-implement-plan`, `/devflow:tt-implement-phase`, `/devflow:tt-workflow-run` and their role agents) depend
on. The skills hold without it; the HUD is a runtime backstop and a view.

## The band

One line above the prompt:

```
◆ It1 · K2 — Simulation contracts › K2.3 Implement to GREEN  ▮▮▮▯▯ 2/4  AC 0/16  ⚙ devflow:implementer "K2 GREEN-3" 6m  ✗ tests 28✗/186✓ 2m  ◈ orchestrator
```

What it shows:
- the phase of the active TaskTracker task, and the active sub-task;
- the sub-task progress;
- satisfied acceptance criteria of the phase's linked requirements;
- the running agents;
- the last build, test or verify result read from any thread's shell output;
- the orchestrator guard, while it is active.

It shows nothing until there is something to show.

## /hud

| Command | Does |
|---|---|
| `/hud` | Opens the pane: the phase's sub-tasks, every requirement with each AC, the agents, the last 10 checks and the guard. Buttons: Refresh (r), Guard (g), Band (b). |
| `/hud refresh` | Reads TaskTracker again, including the requirement links (otherwise cached for an hour). |
| `/hud guard on\|off` | Switches the orchestrator guard. Kept across sessions. |
| `/hud band on\|off` | Shows or hides the band. |
| `/hud project <uuid>` | Sets the TaskTracker project, used to find the phase's requirements. |

## What it does for the skills

- **Orchestrator guard.** While a main-thread Skill call matching `orchestratorSkills` leads the session (default
  `implement-plan|implement-phase|tt-workflow-run`, which covers the TaskTracker and file-based phase leads), the main
  thread's `Write`, `Edit` and `NotebookEdit` are refused with a message to dispatch the implementer role agent.
  - Subagents are not affected, and neither are Claude's own folders (`.claude/`, the scratchpad).
  - A later `tt-*` skill, or `adr` / `continuous-learning` called by the phase lead, keeps the mode; any other skill
    ends it.
  - Only the user can turn it off, with `/hud guard off`.
- **In-flight watch.** Every prompt you send while agents run carries a reminder that their reports arrive later as
  messages, and a toast says when each agent finishes. When a skill returns while agents it dispatched still run (a
  forked skill can do this), the model is told so beside the Skill result.
- **Time tracking.** TaskTracker books time only while calls arrive for the active task.
  - While agents run, the HUD calls `getCurrentTimer` every 4 minutes, so time is booked even when an agent forgets its
    heartbeats.
  - When the main thread ends a turn, or asks you a question, with no agent running, it calls `pauseActiveTask` for
    you.
  - It makes no TaskTracker call of its own during that wait.
- **Check alarms.** It reads `dotnet test`, `dotnet build` and `verify.ps1` output in any thread.
  - A failure, a warning or a missing test project raises a toast.
  - When a `dotnet test` of a solution reports no result for one of the solution's test projects, the model gets a note
    to run that project separately. `dotnet test` skips a test project whose referenced test project failed.
- **Notifications.** A native notification fires when a task is set to `blocked` or the shown phase is completed.

## Options

Set them in `/config`, among devflow's options.

| Option | Default | Meaning |
|---|---|---|
| `projectId` | `""` | The TaskTracker project. Left empty, it is learned from any TaskTracker call that carries a `projectId`. |
| `orchestratorSkills` | `implement-plan\|implement-phase\|tt-workflow-run` | A regex. A main-thread Skill call that matches it turns the guard on. |

## Limits

- The guard covers the file tools only. A shell command that writes files is not caught; the refusal message asks the
  model not to work around it.
- Checks are read from what a command printed. Output redirected to a file is not seen. A filtered or piped run is not
  checked for missing projects unless it still shows dotnet's `Test run for` lines.
- TaskTracker answers are parsed from their text. A change to the MCP server's wording shows up as "last refresh
  failed" in the pane.

## Development

From the repository root:

```
claude plugin validate .
claude plugin test .     # 19 tests: parsers, guard, checks, band and pane on terminal and desktop
```

The module's state contract is `types/index.d.ts`, declared under the plugin name `devflow`. Every function that takes
`$`, and every `$.state` atom, lives in `hooks/register.tsx`; the engine follows `$` only into functions of the file
that declares them. `hooks/parse.ts` and `hooks/view.tsx` are pure. `.claude-plugin/types/` is written by Claude Code
while the plugin hot-reloads and is git-ignored.
