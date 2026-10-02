# Placeholders and optional blocks

Every `{{PLACEHOLDER}}` in `loop-template.md` and `assets/run-orch-gate.sh`, and every flag that keeps or drops an optional block. `tests/test-build-loop-skill.sh` fails when a template uses a placeholder or flag that is not in these tables, or when a row here names one no template uses.

**Source** says where a value comes from:
- **detect**: read it from the repo, `gh`, Claude Code's config or TaskTracker. Show it to the user, but don't ask for it.
- **ask**: only the user knows it. Ask with a proposed default (SKILL.md step 2).
- **derive**: compute it from detected values; the user can override it.
- **bootstrap**: create it in TaskTracker when it's missing (SKILL.md step 3).

A list value is markdown lines (`- item;`). When its placeholder sits alone on a line, the renderer indents every line to match. An empty string is allowed for the "extra" lists, and their line then disappears.

## Values

### Identity and start

| Placeholder | Meaning | Source | How, or the default |
|---|---|---|---|
| `{{PROJECT_NAME}}` | The project's name, as TaskTracker has it | detect | `tasktracker_listProjects`: the project whose description or name matches the repo; the skill argument wins |
| `{{TT_PROJECT_ID}}` | TaskTracker project id | detect | as above |
| `{{OWNER}}` | The product owner's name (the person who is offline). The template uses no pronouns for them | ask | default: the first name in `git config user.name` |
| `{{GENERATED_ON}}` | Date the file was generated | derive | today, `YYYY-MM-DD` |
| `{{LOOP_FILE}}` | Where the loop file lives, relative to the repo | derive | `prompts/autonomous-build-loop.md` |
| `{{SKILL_PREFIX}}` | What precedes a devflow skill's name when invoking it | detect | `devflow:` when the skills come from the installed devflow plugin; empty when they are user skills in `~/.claude/skills/` (`/tt-create-plan`) |
| `{{PREFLIGHT}}` | What the owner runs or checks before starting the loop | derive + ask | e.g. a `gh auth refresh` for a scope `gh auth status` lacks; "nothing beyond auto mode." when there is nothing |

### Repository

| Placeholder | Meaning | Source | How, or the default |
|---|---|---|---|
| `{{REPO_ROOT}}` | Absolute repo root | detect | `git rev-parse --show-toplevel` |
| `{{REPO_SLUG}}` | `owner/name` of the remote | detect | `gh repo view --json nameWithOwner` |
| `{{DEFAULT_BRANCH}}` | Branch the loop commits to (and pushes, with a remote) | detect | `gh repo view --json defaultBranchRef`, else `git symbolic-ref refs/remotes/origin/HEAD`, else the current branch |

### Documents, decisions and memory

| Placeholder | Meaning | Source | How, or the default |
|---|---|---|---|
| `{{PRODUCT_DOCS}}` | The product documents, the source of truth first | detect | `docs/**/*.md`, `PRD.md`, `README.md`, a `reference/` folder; one line, backticked paths with a few words each |
| `{{DECISIONS}}` | Where decisions live and which ones override the docs | detect + ask | the ADR folder (`docs/decisions`, `docs/adr`, `adr`), a frozen TaskTracker brainstorm (`tasktracker_listBrainstorms`), the memory directory; plus the overrides the owner names ("BR-7 is waived") |
| `{{DECISION_PRECEDENCE}}` | Which source wins when two disagree | ask | "decisions (ADRs, frozen brainstorm, memory) > product docs > technical context > reference material" |
| `{{PATTERN_SOURCES}}` | Sibling repos whose patterns to reuse, each with what it is the reference for; ends with a full stop | ask | "No sibling repos." |
| `{{LESSONS_FILE}}` | The lessons file the loop reads and appends to | detect | `tasks/lessons.md` in the repo or a parent; else `tasks/lessons.md`, created on first use |
| `{{MEMORY_DIR}}` | Claude Code's memory directory for the project | derive | `~/.claude/projects/<slug>/memory/`, slug = the repo path with every non-alphanumeric character replaced by `-` |
| `{{TRANSCRIPTS_DIR}}` | Where this project's transcripts are | derive | `~/.claude/projects/<slug>` |

### TaskTracker phases

| Placeholder | Meaning | Source | How, or the default |
|---|---|---|---|
| `{{HUMAN_QUEUE_ID}}` | The human-queue phase's id | detect / bootstrap | a phase whose title matches `/awaiting\|human[- ]only\|human queue/i`; else created |
| `{{HUMAN_QUEUE_TITLE}}` | Its title | detect / bootstrap | `Phase 00 — Awaiting <owner> (human-only verification queue)` |
| `{{COST_LEDGER_ID}}` | The cost-ledger phase's id | detect / bootstrap | a phase whose title matches `/cost ledger/i`; else created |
| `{{LEDGER_TABLE_ID}}` | Its sub-task "Ledger table (latest)" | detect / bootstrap | a child of the ledger titled `/ledger table/i`; else created |
| `{{ALREADY_QUEUED}}` | What already waits in the human queue, as a count and up to five examples | detect | the queue's open children: "N open items when this file was written, among them …; re-read the queue rather than trusting this line." or "nothing yet." |

### Stack, gate and agents

| Placeholder | Meaning | Source | How, or the default |
|---|---|---|---|
| `{{GATE_COMMAND}}` | One shell command that runs the whole automatable gate from the repo root | detect / derive | an existing `scripts/gate.sh`, `make gate`, `npm run gate`; else the `{{GATE_CHECKS}}` commands joined with `&&`. Secrets only by command substitution (`NODE_AUTH_TOKEN="$(gh auth token)" ./scripts/gate.sh`) |
| `{{GATE_CHECKS}}` | What the gate runs, one line per app or check, so the loop knows what a green gate covers | detect | a gate script's own step labels when there is one (it is the truth; a `CLAUDE.md` commands list often leaves out the heavy suites); else `package.json` scripts, `pyproject.toml`, `Makefile`, CI workflows |
| `{{HYGIENE_PATTERNS}}` | Stack- and project-specific things the phase diff must not add, separated by semicolons so that a scope ("in engine code") binds to one item only | derive + ask | TypeScript: `` `@ts-ignore`/`@ts-expect-error`; `eslint-disable`; `any`; `console.log` ``; Python: `` `# type: ignore`; `# noqa`; `breakpoint()`; a stray `print(` ``; plus project rules (`` `Math.random` in engine code ``) |
| `{{AUDIT_COMMAND}}` | The dependency-audit item of the gate, as a sentence | derive | npm: "`npm audit --omit=dev` shows no high or critical vulnerabilities in either app."; Python: "`pip-audit` reports nothing high or critical."; no third-party dependencies: "the project has no third-party runtime dependencies; if one is added, add its audit here." |
| `{{REAL_SYSTEM}}` | Where "verify in the real system" happens | derive | web app: "the browser via Playwright, and the deployed site"; CLI: "the CLI run on real input" |
| `{{IMPLEMENTER_AGENT}}` | Agent type for implementation work | derive | `general-purpose` (inherits the orchestrator's model) |
| `{{REVIEW_AGENT}}` | Agent type(s) for the independent review, backticked | derive | `` `feature-dev:code-reviewer` ``; name others the user has installed (`` `merge-gate-reviewer` or `feature-dev:code-reviewer` ``) |

### Gate runner (`assets/run-orch-gate.sh`)

| Placeholder | Meaning | Source | How, or the default |
|---|---|---|---|
| `{{GATE_WORKTREE}}` | Where the runner keeps its clean worktree (shell expansion allowed) | derive | `${TMPDIR:-/tmp}/<repo name>-orch-gate` |
| `{{GATE_PROCESS_PATTERN}}` | `pgrep -f` regex matching a running gate's command line, and not the runner's own (`scripts/run-orch-gate.sh <sha> <log>`). The runner refuses one that matches itself | derive | the gate script's path with dots escaped (`scripts/gate\.sh`); for a composite command, its most specific part (`-m unittest discover`) |
| `{{GATE_LOCKFILES}}` | Space-separated lockfiles, relative to the repo; a change reinstalls in that file's folder | detect | `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `uv.lock`, `poetry.lock`, `requirements*.txt`; empty when there are none |
| `{{GATE_TOOLCHAIN_SETUP}}` | Shell that selects the toolchain before installing and gating | derive | `.nvmrc`: `source ~/.nvm/nvm.sh >/dev/null && nvm use >/dev/null`; a `.venv`: `. .venv/bin/activate`; otherwise `:` |
| `{{GATE_INSTALL_COMMAND}}` | Shell that installs dependencies in a lockfile's folder | derive | npm: `npm ci --no-audit --no-fund`; uv: `uv sync --frozen`; pip: `pip install -r requirements.txt`; none: `:` |

### CI

| Placeholder | Meaning | Source | How, or the default |
|---|---|---|---|
| `{{CI_RUNNER}}` | What CI runs on, in words | detect | `runs-on:` in the workflows; `ubuntu-latest` is "a 2-vCPU GitHub-hosted runner" |
| `{{CI_MINUTES_PER_PUSH}}` | Billed minutes one push costs, as a range | detect | `gh run list --branch <default> --json` durations of recent runs, summed per push |
| `{{SHARD_DURATIONS_FILE}}` | The file that balances the CI shards | detect | the durations file the shard workflow reads |
| `{{SHARD_REFRESH_RECIPE}}` | The exact log text a missing time prints (what to grep for), and how to refresh the file | detect + ask | from the shard-planning script and the repo's e2e README |

### Browser tests

| Placeholder | Meaning | Source | How, or the default |
|---|---|---|---|
| `{{BROWSER_MATRIX}}` | Viewports, devices and input modes the browser suite must pass at | detect | the projects in `playwright.config.*` |
| `{{HEAVY_COMMANDS}}` | Commands that must not run twice at once in one tree | derive | the gate, the browser suite, any docker-compose smoke |
| `{{SHARED_RESOURCES}}` | What those commands share | derive | fixed ports, output folders (`test-results/`, `dist/`), a compose stack |

### Production

| Placeholder | Meaning | Source | How, or the default |
|---|---|---|---|
| `{{PRODUCTION_URLS}}` | The live URLs the smoke checks hit | ask | proposed from deploy workflows and smoke scripts |
| `{{PRODUCTION_HOST}}` | The host production runs on, in words (no IP addresses) | ask | e.g. "the shared app server" |
| `{{PRODUCTION_LOG_CHECK}}` | How to confirm production is healthy after a deploy (read-only) | ask | "the service's containers are healthy, with no errors in their logs since the deploy (read-only check)" |

### Human queue and standing authority

| Placeholder | Meaning | Source | How, or the default |
|---|---|---|---|
| `{{HUMAN_ONLY_ITEMS}}` | Project-specific kinds of work only the owner can do, as list lines; the template adds credentials, reserved confirmations and irreversible decisions | ask | e.g. "- on-device checks on the target hardware (frame rate, touch feel);" |
| `{{PREAUTHORISED}}` | Actions the loop may take without asking, as list lines | ask | none beyond the template's default |
| `{{SECRETS_POLICY}}` | Where each secret comes from and where it may go, as list lines; names only, never values | ask | empty |
| `{{TEST_ACCOUNTS}}` | Accounts the loop may use for live checks, and where their credentials live; one sentence ending in a full stop | ask | "None." |
| `{{FORBIDDEN_EXTRA}}` | Project-specific forbidden actions, as list lines | ask | empty |
| `{{MACHINE_QUIRKS}}` | Known quirks of the machine the loop runs on, as list lines, each with what to do about it | ask | used only with the `machine-quirks` flag |
| `{{PREFLIGHT_GAPS}}` | Known gaps the owner should close before starting, as list lines, each with the workaround meanwhile | detect + ask | scopes `gh auth status` lacks for what the project needs (GitHub Packages, say), missing CLIs; used only with the `preflight-gaps` flag |

## Flags

Every flag must be set to `true` or `false` in the values file; the renderer refuses an undecided one. "Requires" lists flags that must also be on.

| Flag | Keep the block when | Detected from | Requires |
|---|---|---|---|
| `remote` | the repo has a remote the loop pushes to | `git remote` | |
| `ci` | CI runs on every push | `.github/workflows/*` (or another CI config) with a push trigger | `remote` |
| `billed-ci` | CI minutes are billed, so pushes are batched | `ci` and `gh repo view --json visibility` is `PRIVATE` or `INTERNAL` | `ci` |
| `ci-sharding` | the browser suite runs in CI shards balanced by a durations file | a workflow matrix that passes `--shard` | `ci`, `browser-e2e` |
| `deployed` | a push to the default branch deploys to production | a deploy workflow; confirmed by asking | `ci` |
| `shared-host` | other apps run on the production host | ask | `deployed` |
| `browser-e2e` | there are browser end-to-end tests | `playwright.config.*`, `cypress.config.*` | |
| `offline-client` | a client can keep running an old build (service worker, PWA, mobile app) | `ngsw-config.json`, a `serviceWorker` build option, workbox, `manifest.webmanifest`, a mobile project | |
| `database` | a SQL database backs the app | migrations, an ORM dependency, a database service in compose | |
| `parallel-agents` | independent phases may run in parallel | ask; default on when the repo has two or more apps | |
| `token-tooling` | the bundled token-usage tooling is installed | `scripts/token-usage.mjs` and its hooks, or installed in SKILL.md step 4 | |
| `machine-quirks` | `{{MACHINE_QUIRKS}}` is not empty | ask | |
| `preflight-gaps` | `{{PREFLIGHT_GAPS}}` is not empty | detect + ask | |

Negated blocks (`<!-- if:!remote -->`) carry the text for when a flag is off. They use the same flag, so they need no row of their own.
