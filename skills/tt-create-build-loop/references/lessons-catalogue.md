# Lessons catalogue

Every rule in `loop-template.md` that was learnt the hard way, with the incident behind it. The generated loop keeps a one-line "Why"; this file keeps the story, so the reasoning survives without bloating the loop.

The incidents come from one unattended build of a tablet game (Angular + NestJS + Postgres, a private GitHub repo with billed CI, deployed to a shared server) between 2026-09-28 and 2026-10-02. Phase numbers and ids are left out; amounts and durations are real.

Each entry gives the rule, the incident, and where the rule lives in the template (section, and the flag that keeps it, if any).

---

## Orchestration and agents

### Self-matching process waits
- **Rule:** never `pgrep -f <pattern>` inside a shell command whose own command line contains the pattern. Put the wait in a script file called by path, or use a pattern the command line can't match. After starting a long background job, check within a minute that its log has its first line.
- **Incident:** `while pgrep -f scripts/gate.sh; do sleep 15; done; ./scripts/gate.sh` ran as a background `bash -c`. The shell's command line contained the pattern, so it waited on itself. The gate never started, every other waiter blocked behind it, and nobody noticed for 40 minutes.
- **Template:** §4.1 "Waiting for a process"; `assets/run-orch-gate.sh` refuses a pattern that matches its own command line.

### Agents miss notifications; reports go to a file
- **Rule:** agents run long commands in the foreground, or poll a background job with a foreground loop under the tool's 10-minute limit; never end a turn waiting on a notification. Each agent writes its final report to a file named in its brief, and the orchestrator reads the file. A silent agent gets one nudge after 20 minutes, then a fresh agent with the context in its prompt.
- **Incident:** an implementation agent started its test run in the background and idled "until the watcher fires". Teammates don't receive background-task notifications, so it never woke; it was silent for 90 minutes. Idle messages between agents can also be dropped, so a report sent only as a message can be lost.
- **Template:** §4.1 "Agents miss background-task notifications".

### Briefs carry the rules that bite after the push
- **Rule:** every agent brief includes the rules that only fail later — the CPU-throttled browser check, the 50 % time budget, the hygiene list — and asks for measured durations. Before pushing, the orchestrator confirms the numbers are in the report.
- **Incident:** a phase passed the local gate and failed CI. A browser scenario had sat at 1.9 of its 2.0 minutes since the previous phase, and a bigger set-up tipped it over. The throttled-run rule was in the loop file but not in the agent's brief, and the orchestrator didn't run it either: one deploy cycle, about 40 billed minutes, lost.
- **Template:** §4.1 "Every brief carries the rules that only bite later"; §4.4 time budget.

### Check the model an agent type pins
- **Rule:** implementation always runs on the orchestrator's model (`general-purpose`, no `model` override), never on an agent type that pins its own. For every other role, read the agent type's `model:` and its price before dispatching it.
- **Incident:** implementation went to an agent type pinned to an older model priced at $5/$25 per million input/output tokens and $0.50 per million cache reads, against the orchestrator's $4/$20 and $0.20: 25 % more per token and 2.5× more per cache read, and cache reads are most of an agent's tokens. One phase cost $194 on it. The same model was also missing from the pricing table, so 650 of its messages ($209) dropped out of the cost report (see "Unpriced models" below).
- **Template:** §4.1 "Implementation agents run on the orchestrator's model".

### Independent review after every phase
- **Rule:** an independent reviewer (no knowledge of how the code was produced) reviews every phase diff against the acceptance criteria and the conventions; security review for auth, input, DB, secrets and deploy changes. Every finding is fixed, or disproved with evidence on the verify sub-task.
- **Incident:** the reviews kept finding what the implementer's own checks had passed: three HIGH in one phase (a blocklist beaten by look-alike letters and inflected forms, and a public name field pre-filled with the child's real first name), two HIGH, three MEDIUM and two LOW in another; a HIGH "CI does not run the browser tests at all"; and a contract step that would have silently lost users' data (see "Expand/contract" below), caught before the deploy.
- **Template:** §5.1 item 9.

### Answer the obvious reading
- **Rule (conversational, not in the template):** read an ambiguous question in the light of the sentence around it and answer that reading fully, without "if you meant X instead" alternatives.
- **Why it is not in the loop:** the loop runs without the owner, so it never answers questions. Kept here because it came from the same build.

---

## Gate and tests

### Gate the commit in a clean worktree; reinstall when a lockfile changes
- **Rule:** the orchestrator gates the commit it will push, checked out detached in a worktree of its own. The runner reinstalls dependencies when a lockfile changed since its last install there.
- **Why:** the shared tree holds other agents' in-flight files, so a gate there proves nothing about the commit. A reused worktree keeps the dependencies of whichever commit it last installed for, and the gate script itself doesn't install, so without the lockfile check a dependency change would be gated against the old dependencies.
- **Template:** §5.1 preamble; `assets/run-orch-gate.sh`.

### One heavy runner per tree; CPU is shared across trees
- **Rule:** at most one agent runs the gate, the browser suite or a compose smoke in a tree at a time; the others run unit tests and linters only. Cap local browser workers so that two gates fit on the machine at once.
- **Incident:** the heavy commands share fixed ports, output folders (`test-results/`, `dist/`) and a compose stack, so two at once corrupt each other's results. A software-rendered WebGL page kept 4–5 cores busy per browser worker, so a second gate or a stress run starved the first into timeouts.
- **Template:** §4.4 (`parallel-agents`, `browser-e2e`).

### Time budget: 50 % of the timeout under CI-like CPU
- **Rule:** every new or changed test finishes within 50 % of its timeout under CI-like CPU: backend tests pinned to as many CPUs as the runner has (`taskset -c 0,1`), browser tests under a CDP CPU throttle of 4–6 with 2 workers. After every CI run, scan the logs for tests above 50 % of their limit, not only for failures. Drive tests through test hooks rather than rendering every step.
- **Incident:** a browser drive sat at 95 % of its limit for a release, then timed out on CI. A backend plan test seeding 20 000 rows timed out at 30 s on the 2-vCPU runner (see the next entry).
- **Template:** §4.4 (core; the CI-like CPU part with `ci`, the throttle with `browser-e2e`).

### Set-based seeds; FK checks can make a seed quadratic
- **Rule:** seed test data set-based, with per-row foreign-key triggers off inside the seed's own transaction (Postgres: `SET LOCAL session_replication_role = replica`), and as little of it as the assertion needs.
- **Incident:** one statement seeded 20 000 players, runs and records — 60 000 per-row FK checks against tables the statement was growing. On a pooled connection the cached check plan scanned the whole table, so the seed grew quadratically: 9.2 s pinned to two CPUs, against 0.8 s with the checks off. With 2 000 rows the plans were identical (checked at 500, 1 000 and 2 000), and the test dropped from a 30 s timeout to 57–119 ms.
- **Template:** §4.4 "Database tests" (`database`).

### Pin plans with settings, not volume; leave one sensible plan
- **Rule:** a test that asserts a query plan pins it with `SET LOCAL enable_*` (and `max_parallel_workers_per_gather = 0`) in a transaction that rolls back, not with a large seed. Design indexes so only one serves the order under test.
- **Incident:** an order that two indexes could both begin was walked one way locally and another way on a different Postgres patch version. The fix was one index per ordering, so the planner has one sensible plan everywhere.
- **Template:** §4.4 "Database tests" (`database`).

### Flaky is a defect
- **Rule:** a test that fails and then passes on retry is logged as a defect and fixed; nothing is skipped, quarantined or retried into green.
- **Template:** §5.1 item 3.

### Run every gate item, including the ones that aren't tests
- **Rule:** at every close, walk the gate list item by item. For architecture: rescan drift, refresh the touched components' descriptions and `codeReferences`, and put the scan line in the evidence.
- **Incident:** several phases closed without the drift check. Drift reached 38 entries, and eight component descriptions still described code that was never written, one naming a file that didn't exist.
- **Template:** §5.1 preamble and item 11.

### Refresh architecture from committed code only
- **Rule:** descriptions and `codeReferences` are refreshed from committed code (`git show <sha>:<path>`, or the gate's worktree), never from a working tree that holds other agents' uncommitted files.
- **Why:** a reference to a file that only exists in someone's working tree reads as drift on the next scan, and a description of in-flight code describes something that may never land — the same failure as the entry above, from the other side.
- **Template:** §5.1 item 11.

### Infrastructure that writes into the tree needs its side effects checked
- **Rule:** when adding a compose stack, a generator or a hook, verify its side effects on the host — file ownership, a host build afterwards, a crashed container detected fast — and give every wait in a check a timeout.
- **Incident:** a new compose stack was "verified" by curling its health endpoints once. Its containers ran as root and left a root-owned `dist/` that broke host builds; the first fix crashed the dev server with EBUSY; and the smoke script hung on a curl with no timeout.
- **Template:** §4.1 "Infrastructure that writes into the working tree".

---

## Git, CI and deploy

### Batch pushes when CI minutes are billed
- **Rule:** in a private repo, every push to the default branch bills a full CI run. Push once per phase plus fix rounds; never push a commit that only touches the ledger, the task map or the loop file — let it ride with the next phase push.
- **Incident:** a full run cost 35–45 billed minutes. Ledger-only commits pushed on their own would each have cost a full run for no code change.
- **Template:** §4.2 (`billed-ci`).

### Keep CI shards balanced
- **Rule:** after each CI run, check the shard logs; refresh the durations file when a test has no recorded time or a shard runs more than 20 % over its plan.
- **Template:** §4.2 (`ci-sharding`).

### Expand/contract with an offline client: contract on evidence
- **Rule:** with a client that can keep running an old build (service worker, PWA, mobile app), a contract step that refuses an old request shape is gated on evidence — the server has seen no old-shape request for N days, by a read-only query or log count — never on release count alone.
- **Incident:** a contract step ("400 for a start without `generatorVersion`") was scheduled for the release after the expand. A PWA keeps running the build it started with until the device reloads or the user taps update, so a tablet not opened between the two deploys would still send the old shape, and the step would silently have lost those children's whole runs. The independent review caught it before the deploy.
- **Template:** §4.2 (`offline-client`).

### Never inline secrets
- **Rule:** read each secret from its source at the moment of use — command substitution (`NODE_AUTH_TOKEN="$(gh auth token)"`), stdin, a secret store — trim it, and never paste, echo or log it. Secrets never reach commits, TaskTracker or chat.
- **Why:** a secret pasted into a command line lives on in shell history, `ps` listings and session transcripts. The source build passed deploy secrets on stdin rather than on any command line, read a server-side secret over SSH without echoing it, and generated database passwords with `openssl rand`.
- **Template:** §8 "Secrets"; `assets/run-orch-gate.sh` (`run_gate` takes secrets by command substitution).

---

## TaskTracker and cost

### Attribution needs live heartbeats, not timers
- **Rule:** TaskTracker credits a token message to a task only when it falls inside a time-log segment of the session's lease; a segment closes after 5 minutes without a heartbeat, and heartbeats come only from TaskTracker MCP calls. So: set the phase active before spawning its agent, have the agent call `getCurrentTimer` on the phase at least every 4 minutes (cutting long waits into 4-minute chunks), and never switch the active task while it runs. Never call `startTimer`; call `stopTimer` only to stop a timer found running at a phase close.
- **Incident:** before heartbeats, the segments of one long phase covered 85 of its 366 minutes, so TaskTracker showed 27 % of the real cost. `startTimer`/`stopTimer` create lease-less rows that match any session's messages, so other projects' cost landed on the phase, and `stopTimer` stamped an orphaned row with the current time: one phase's log read 12 h 18 m against 3 h 16 m of real time.
- **Template:** §4.1 "Heartbeats".

### A hook's MCP child must not take the session's lease
- **Rule:** a hook that spawns a TaskTracker MCP client gives it its own session id; otherwise it inherits `CLAUDE_CODE_SESSION_ID`, becomes the session's agent, heartbeats the session's task and takes over its lease, splitting the time log.
- **Template:** §4.1 (`token-tooling`); the bundled tooling runs its push as `<project>-token-push`.

### Stale timers, straggler sub-tasks, stale ledgers: the phase-close checklist
- **Rule:** at every close: open defects = 0 for the whole project; the ledger table is rewritten; no timer runs on this or any earlier closed phase; every sub-task is done or moved to the human queue, older phases included; the active task is set to the current work. A defect logged during a phase is fixed before the next close, never parked.
- **Incident:** over ten phases each completion caveat carried the phase's cost but the ledger table was never rewritten, and went two days stale ($1 248 shown against $2 129 real). One finished phase stayed open with a timer running; one of its sub-tasks was done in code and never marked done; three phases closed while an open defect existed; and an agent's heartbeat kept a stale segment alive on a closed phase. The user found it by asking whether TaskTracker was being kept up to date.
- **Template:** §5.1 item 13 and the phase-close checklist.

### Unpriced models drop out of the totals
- **Rule:** before trusting a cost report, check `unpricedMessages` = 0 and `unknownModels` empty. Add a missing model from TaskTracker's own rate card so that both tools price it alike; never guess a price.
- **Incident:** an agent type pinned to a model missing from the pricing table: 650 messages, $209, silently absent from the total.
- **Template:** §2 B (`token-tooling`); §6.1.

### Each API response is logged several times
- **Rule:** transcripts log one line per content block of a response. Deduplicate by `(transcript file, message.id)` (falling back to `requestId`) and keep the record with the largest `output_tokens`, which is the final one.
- **Incident:** summing raw usage lines overcounted about 7.5×.
- **Template:** §6.1 (`token-tooling`); enforced by the bundled tooling's tests, whose distractor fails a raw sum.

### Task metadata is write-only through MCP
- **Rule:** as of 2026-09 no MCP read returns task metadata, and `updateTask {metadata}` may replace rather than merge. Write `metadata.tokenUsage` only where the full existing metadata is known; never on lifecycle or template-created phases.
- **Template:** §6.2 "Metadata caveat".

---

## Planning and the owner

### Plan the whole product
- **Rule:** asked to plan from a product document, plan every prioritised release (Must, then Should and Could as later releases), not only the first release the document defines.
- **Incident:** a hand-off document said "Release 1 = the Must-have stories", and the first plan covered Release 1 only; the owner wanted the whole game planned.
- **Template:** §3 "Whole product".

### Reserved decisions go to the human queue
- **Rule:** when the owner reserved a decision ("I will validate first"), the loop does the discovery, records its proposal, and queues the decision; it never takes the reserved action itself.
- **Incident:** asked to find existing projects and list the missing ones for validation, an earlier session created the missing ones instead.
- **Template:** §4.3 and §7 (confirmations the owner reserved).

---

## Machine quirks (examples for `{{MACHINE_QUIRKS}}`)

### A stepping wall clock
- **Example:** on a WSL2 machine the wall clock stepped 0.2–0.75 s about every 30 s. Touch tests that stamped events on the wall clock failed at random. The fix stamped on the monotonic clock; a step during the few milliseconds a touch is in flight is annotated by the test helper as "wall-clock step", and such a failure is environmental — rerun it, and log a defect only if it fails without the annotation.
- **How to phrase it in a loop:** a quirk, its symptom, and what to do about it, in one bullet.
