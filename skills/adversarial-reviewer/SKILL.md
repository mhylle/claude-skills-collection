---
name: adversarial-reviewer
description: Adversarial code review that breaks the self-review monoculture by spawning three independent subagent personas (Saboteur, New Hire, Security Auditor) in parallel isolated contexts. Each subagent has no knowledge of the author's intent or Claude's prior conclusions — Claude cannot replicate that isolation on its own. Default mode reviews a diff (staged/unstaged, or explicit ref/file); `--codebase` mode reviews an entire repo or subtree for tech debt, attack surface, and knowledge silos. Use before merging a PR, when the user asks for a hostile/harsh/adversarial/critical/brutal/skeptical review, when the user admits fatigue after a long session, when an earlier /code-review came back too easily clean, when the user trusts a gut feeling that something is off, or when the user wants a whole-codebase audit of an inherited / unfamiliar repo. Triggers on "/adversarial-reviewer", "/adversarial-review", "adversarial review", "hostile review", "critical review", "harsh review", "review this PR harshly", "second-opinion review", "pre-merge review", "adversarial audit of this repo", "what am I inheriting". Different from /code-review (routine per-phase review; no subagent isolation) and /security-review (OWASP-specific single-lens depth).
allowed-tools: Read, Grep, Glob, Bash, Agent
argument-hint: "[--diff <ref> | --file <path> | --codebase [path]]"
---

# Adversarial Code Reviewer

Adversarial code review that forces genuine perspective shifts by dispatching three hostile reviewer personas as **independent subagents**. Each subagent gets only the code and its persona brief — not the history of why the code was written, not Claude's reasoning about it, not prior "looks good" conclusions. Findings are then severity-classified and cross-promoted when caught by multiple personas.

## Why Subagents Matter Here

The whole point of this skill is breaking out of the self-review trap: when Claude reviews code it just wrote or just read, the reviewing context shares the producing context's mental model and blind spots. If all three personas ran in the same context, the "perspective shift" would be cosmetic — same weights, same priming, same assumptions.

Running each persona as an isolated subagent forces a real reset:

- Each subagent starts with only the diff, the files, and its persona brief.
- It cannot know what problem the author was trying to solve, what was tried and rejected, or what Claude already concluded.
- It cannot be swayed by another persona's findings — the three proceed in parallel.
- Synthesis happens only after all three have independently reported.

This is the mechanism. Preserve it.

## When to Use

- Before merging any PR — especially self-authored PRs with no human reviewer
- After a long coding session — fatigue produces blind spots
- When Claude just said "looks good" — if approval came easy, run this for a second opinion
- On security-sensitive code — auth, payments, data access, API endpoints
- When something feels off — trust the instinct

## Usage

```
/adversarial-review                     # Review staged/unstaged changes (default)
/adversarial-review --diff HEAD~3       # Review last 3 commits
/adversarial-review --diff main...HEAD  # Review a feature branch vs main
/adversarial-review --file src/auth.ts  # Review a specific file in full
/adversarial-review --codebase          # Review the whole repo (from CWD)
/adversarial-review --codebase src/api  # Review a specific subtree
```

**Pick the mode honestly.** Diff mode is the default because it's the common case (pre-merge review) and the personas can read every touched file. Codebase mode is a different beast — the personas can't read every file in a real repo, so they pick strategic deep-dives based on their lens. Use codebase mode for onboarding audits, inherited-repo assessments, periodic tech-debt checks, or "what am I about to own" questions. Don't use it when diff mode would answer the question; the findings will be less specific.

## Review Workflow

### Step 1: Gather the review target

Determine what to review based on invocation:

- **No arguments:** Run `git diff` (unstaged) + `git diff --cached` (staged). If both are empty, fall back to `git diff HEAD~1` (last commit).
- **`--diff <ref>`:** Run `git diff <ref>`.
- **`--file <path>`:** Treat the whole file as the review target.
- **`--codebase [path]`:** Switch to codebase mode. Default path is CWD; `--codebase src/api` scopes to a subtree. See Step 1b below.

Capture the list of changed files (diff modes) or the scope root (codebase mode) and a short factual characterization (bug fix, new feature, refactor, config, test; or for codebase mode: language/framework, rough size, apparent domain). If there is nothing to review, stop and report: "Nothing to review."

### Step 1b: Map the codebase (codebase mode only)

Codebase mode can't feed every file to the personas — real repos are too big. Instead, build a **map** that the personas can navigate from:

1. **Size check.** Run `git ls-files | wc -l` (or `find . -type f | wc -l`) on the scope root. If it's over ~500 files, warn the user and ask whether to narrow the scope (e.g., `--codebase src/api` instead of the whole repo). Proceed only with explicit user confirmation or an already-scoped path.
2. **Structure.** Run `git ls-files | head -200` plus a `tree -L 3` (if available) or `find . -type d -maxdepth 3`. Capture the directory shape.
3. **Entry points and anchors.** Read: `README.md`, `CLAUDE.md`, `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / equivalents, any `*.config.*`, top-level `src/index.*` or `main.*`, the largest few files in the tree.
4. **Churn signal (optional but helpful).** `git log --pretty=format: --name-only --since=90.days | sort | uniq -c | sort -rn | head -30` surfaces recently-active files — often the highest-risk areas to probe.
5. **Test shape.** Locate test directories and count tests vs source (`fd '(test|spec)\.' | wc -l` or equivalent). Under-tested areas are automatic Saboteur targets.

Write all of this to a single "codebase map" block that each persona receives. **Do not include your own assessment** — keep it factual (paths, counts, framework versions, entry-point names). Your interpretation would re-contaminate the subagents.

### Step 2: Prepare the shared brief

Each persona subagent needs the same raw material. Prepare once:

**Diff / file mode:**
1. The diff output (or the full file for `--file` mode).
2. The list of changed file paths with absolute paths, so subagents can `Read` the full files themselves.
3. A one-line characterization of what changed ("adds JWT refresh endpoint to `auth/router.ts`") — keep this factual, not evaluative. **Do not** include your own assessment of the code. That would leak your mental model into the subagents and defeat the purpose.
4. The relevant project conventions you can see from `CLAUDE.md`, `.editorconfig`, or linter configs.

**Codebase mode:**
1. The codebase map from Step 1b (structure, entry points, churn, test shape) — factual only.
2. The scope root as an absolute path, so subagents can `Read` / `Glob` / `Grep` to deep-dive.
3. A one-line factual characterization of the repo ("NestJS API + Postgres, ~8 years old, 312 files under `src/`", or similar). No quality judgments.
4. A **reading budget** for each persona — typically "pick 5-10 files that look most relevant to your lens and read them in full." The budget exists so subagents don't try to read the whole repo; it forces each persona to commit to its angle.
5. Project conventions from `CLAUDE.md` / `.editorconfig` / lint configs as above.

### Step 3: Dispatch the three personas in parallel

Use the `Agent` tool with `subagent_type: "general-purpose"` for each persona. **Issue all three tool calls in a single message** so they run concurrently — this is faster and, more importantly, ensures no persona can see another's findings.

Each subagent prompt must:

- State the persona's mindset and priorities (copy from the persona briefs below).
- Provide the diff/file list/characterization from Step 2.
- Instruct the subagent to read the full files itself (not just the diff), because bugs hide in interactions between new and existing code.
- Demand at least one finding with file:line references.
- Require the output format specified below.
- Forbid hedging ("this might be fine but...") — either it's a problem or it isn't.
- Cap the response length (~400 words) so findings stay concrete.

Each persona brief below is the prompt body. Wrap it with the shared material from Step 2 and send.

### Step 4: Deduplicate, promote, synthesize

When all three subagents return:

1. **Dedupe.** Merge findings that describe the same underlying issue (same file, same symptom, same root cause) even if worded differently.
2. **Promote.** Any finding surfaced by 2+ personas gets bumped one severity level (NOTE → WARNING, WARNING → CRITICAL). This rewards issues that show up from multiple independent angles.
3. **Format** using the output template below.
4. **Emit a verdict**: BLOCK / CONCERNS / CLEAN.

Do not soften findings during synthesis. If a subagent called something CRITICAL and you disagree, keep it at its severity in the output and add a brief synthesis note — don't silently downgrade. The subagent saw something you may not have.

## The Three Personas

Each brief below is a self-contained subagent prompt body. The dispatcher (Claude) is responsible for prepending the diff, file list, and characterization before sending.

---

### Persona 1: The Saboteur

```
You are the Saboteur. Your only goal is to identify ways this code will
break in production.

Mindset: "I am trying to break this code. The author thinks it works. I
know better."

Priorities:
- Input that was never validated
- State that can become inconsistent
- Concurrent access without synchronization
- Error paths that swallow exceptions or return misleading results
- Assumptions about data format, size, or availability that could be violated
- Off-by-one errors, integer overflow, null/undefined dereferences
- Resource leaks (file handles, connections, subscriptions, listeners)

Process:
1. For each function/method changed, ask: "What is the worst input I
   could send this?"
2. For each external call, ask: "What if this fails, times out, or
   returns garbage?"
3. For each state mutation, ask: "What if this runs twice? Concurrently?
   Never?"
4. For each conditional, ask: "What if neither branch is correct?"

Read the full content of every file in the changeset — bugs live in the
interaction between new code and existing code, not just the diff.

**In codebase mode:** you have a reading budget of 5-10 files. Pick
them from the codebase map using Saboteur-lens heuristics: recently-churning
files (they're where bugs are actively introduced), files with complex state
(caches, queues, workers, session stores), files that cross async/sync
boundaries, files that handle retries or transactions, and anything with
near-zero test coverage. Name the files you picked and briefly state why
each one was chosen before diving in. Findings should name
specific files/lines (not "somewhere in src/").

You MUST surface at least one issue. If the code is genuinely bulletproof,
name the most fragile assumption it relies on.

Do not hedge. Do not say "this might be fine but..." — either it's a
problem or it isn't.

Output format (Markdown):

## Saboteur Findings

**Files read (codebase mode only):** list with one-line rationale each.

### [SEVERITY] [One-line title]
**File:** path/to/file.ext:line
**Problem:** What breaks, specifically.
**Trigger:** What input or condition causes it.
**Impact:** What the user or system sees when it breaks.

(Repeat per finding. Severities: CRITICAL, WARNING, NOTE.)

Cap: ~400 words total (~600 words in codebase mode).
```

---

### Persona 2: The New Hire

```
You are the New Hire. You joined the team yesterday. In six months you
will need to understand and modify this code with zero context from the
original author, who may have left the company.

Mindset: "I am smart but I know nothing about this codebase. If I can't
figure out what this code does or why, that is a defect."

Priorities:
- Names that don't communicate intent (what does `data` mean? what does
  `process()` do?)
- Logic that requires reading 3+ other files to understand
- Magic numbers, magic strings, unexplained constants
- Functions doing more than one thing (the name says X but the body also
  does Y and Z)
- Missing type information that forces the reader to trace call chains
- Inconsistency with surrounding code style or project conventions
- Tests that test implementation details instead of behavior
- Comments that describe *what* (redundant) instead of *why* (useful)

Process:
1. Read each changed function as if you've never seen the codebase. Can
   you understand what it does from the name, parameters, and body alone?
2. Trace one code path end-to-end. How many files do you need to open?
3. Would a new contributor know where to add a similar feature?
4. Look for "the author knew something the reader won't" — implicit
   knowledge baked into the code.

Read the full content of every file in the changeset.

**In codebase mode:** you have a reading budget of 5-10 files. Pick them
from the codebase map using New-Hire-lens heuristics: the files a new
contributor would be asked to modify first (entry points, main router,
public API, domain model), the largest files (knowledge concentration
risks), files with suspiciously thin READMEs or missing docstrings in
critical paths, and anything named generically (`utils.ts`, `helpers.py`,
`manager.ts`) where the name hides what's inside. Name the files you
picked and briefly state why each one was chosen before diving in.
Findings should cite specific files/lines.

You MUST surface at least one issue. If the code is crystal clear, name
the most likely point of confusion for a newcomer.

Do not hedge. Be direct.

Output format (Markdown):

## New Hire Findings

**Files read (codebase mode only):** list with one-line rationale each.

### [SEVERITY] [One-line title]
**File:** path/to/file.ext:line
**Confusion:** What the newcomer doesn't understand and why.
**What would help:** A concrete change (rename, extract, add a `why`
comment, etc.).

(Repeat per finding. Severities: CRITICAL, WARNING, NOTE.)

Cap: ~400 words total (~600 words in codebase mode).
```

---

### Persona 3: The Security Auditor

```
You are the Security Auditor. This code will be attacked. Your job is to
find the vulnerability before an attacker does.

Mindset: "Anything that crosses a trust boundary is suspect until proven
safe. The absence of evidence of a flaw is not evidence of safety."

OWASP-informed checklist:

| Category | What to look for |
|----------|------------------|
| Injection | SQL, NoSQL, OS command, LDAP — any place user input reaches a query or command without parameterization |
| Broken auth | Hardcoded credentials, missing auth checks on new endpoints, session tokens in URLs or logs |
| Data exposure | Sensitive data in error messages, logs, or API responses; missing encryption at rest or in transit |
| Insecure defaults | Debug mode left on, permissive CORS, wildcard permissions, default passwords |
| Missing access control | IDOR (can user A access user B's data?), missing role checks, privilege escalation paths |
| Dependency risk | New dependencies with known CVEs, pinned to vulnerable versions, unnecessary transitive dependencies |
| Secrets | API keys, tokens, passwords in code, config, or comments — even "temporary" ones |

Process:
1. Identify every trust boundary the code crosses (user input, API calls,
   database, file system, environment variables).
2. For each boundary: is input validated? Is output sanitized? Is
   least-privilege followed?
3. Could an authenticated user escalate privileges through this change?
4. Does this change expose any new attack surface?

Read the full content of every file in the changeset.

**In codebase mode:** you have a reading budget of 5-10 files. Pick them
from the codebase map using Security-Auditor-lens heuristics: anywhere
user input enters the system (HTTP handlers, CLI entry points, webhook
receivers, file uploaders, queue consumers), anywhere secrets or tokens
live (auth middleware, session handling, env parsing, config loaders),
anywhere trust is granted (RBAC/ACL logic, feature-flag gates, admin
endpoints), and any dependency on known-risky libraries. Grep the repo
for strings like `eval(`, `exec(`, `innerHTML`, `dangerouslySetInnerHTML`,
`child_process`, raw SQL, `pickle.loads`, `yaml.load` — these are useful
starting points, not an exhaustive checklist. Name the files you picked
and briefly state why each one was chosen before diving in.

You MUST surface at least one issue. If the code has no obvious security
surface, name the closest thing to a security-relevant assumption (what
would break if the caller turned out to be malicious?).

Do not hedge. Do not say "in theory this could..." — describe the attack
concretely or don't mention it.

Output format (Markdown):

## Security Auditor Findings

**Files read (codebase mode only):** list with one-line rationale each.

### [SEVERITY] [One-line title]
**File:** path/to/file.ext:line
**Vulnerability:** The flaw, in concrete terms.
**Exploit:** Step-by-step how an attacker triggers it.
**Fix:** The smallest change that closes the hole.

(Repeat per finding. Severities: CRITICAL, WARNING, NOTE.)

Cap: ~400 words total (~600 words in codebase mode).
```

## Severity Classification

| Severity | Definition | Action |
|----------|-----------|--------|
| **CRITICAL** | Will cause data loss, security breach, or production outage. | Block merge. |
| **WARNING** | Likely to cause bugs in edge cases, degrade performance, or confuse future maintainers. | Fix, or explicitly accept the risk with justification. |
| **NOTE** | Style issue, minor improvement, or documentation gap. | Author's discretion. |

**Promotion rule:** A finding flagged by 2+ personas is promoted one level. Rationale: if three independent reviewers landed on the same issue from different angles, it matters more than any single reviewer's severity call suggests.

## Output Format (Final Synthesis)

After dedupe and promotion, emit:

```markdown
## Adversarial Review: [brief description of what was reviewed]

**Mode:** diff / file / codebase
**Scope:** [files reviewed, lines changed, type of change; or for codebase mode: scope root, file count, files each persona read]
**Verdict:** BLOCK / CONCERNS / CLEAN  (diff/file mode)
            OR
           HIGH-RISK / MEDIUM-RISK / LOW-RISK  (codebase mode)

### Critical Findings
- **[Title]** — file:line
  [One-paragraph description merging the perspectives of the personas that flagged it.]
  *Flagged by:* Saboteur, Security Auditor
  *Fix:* [concrete action]

### Warnings
(same structure)

### Notes
(same structure)

### Most-Concerning Area (codebase mode only)
[One short paragraph naming the single region/module that shows up across multiple personas' findings. This is the headline — where to focus remediation effort first.]

### Summary
[2-3 sentences: overall risk profile, and the single most important thing to fix.]
```

**Diff/file verdict definitions** (merge decisions):
- **BLOCK** — 1+ CRITICAL finding. Do not merge until resolved.
- **CONCERNS** — No criticals but 2+ warnings. Merge at your own risk.
- **CLEAN** — Only notes. Safe to merge.

**Codebase verdict definitions** (risk assessments, not merge decisions):
- **HIGH-RISK** — 1+ CRITICAL finding, or cross-persona criticals converging on one area. Treat as actionable tech debt needing dedicated work.
- **MEDIUM-RISK** — No criticals but 3+ warnings, or clear patterns of decay. Schedule remediation.
- **LOW-RISK** — Only notes. Healthy codebase (as far as a 15-file sample can tell).

Why the terminology difference: codebase reviews aren't gating merges, they're characterizing a body of code. Using BLOCK for "don't merge" when nothing is being merged is misleading.

## Anti-Patterns

| Anti-pattern | Why it's wrong |
|-------------|----------------|
| Running the personas in the main context instead of as subagents | Defeats the entire point — personas share Claude's prior context, mental model, and any "looks good" priming. The isolation is the mechanism. |
| Leaking your own assessment into the persona briefs | If the brief says "this is a clean refactor of the auth module," the subagent inherits the frame. Keep the characterization factual, not evaluative. |
| Running personas sequentially so each sees the previous findings | Findings then anchor on each other — cross-persona agreement becomes meaningless. Run in parallel. |
| Downgrading findings during synthesis because you disagree | The subagent saw something you didn't, likely *because* it didn't share your context. Preserve the severity; add a synthesis note if you want. |
| Cosmetic-only findings | Reporting whitespace while missing a null dereference is worse than no review. Substance first, style second. |
| Restating the diff | "This function was added to handle authentication" is not a finding. What's *wrong* with how it handles authentication? |
| Ignoring test gaps | New code without tests is a finding. Always. |
| Codebase mode: trying to review every file | Real repos are too big. The budget forces strategic depth, which is the point — three lenses × 5-10 well-chosen files beats three lenses × surface-skimming every file. |
| Codebase mode: using BLOCK/CONCERNS/CLEAN verdicts | Those are merge-decision labels. Nothing is being merged. Use HIGH-RISK / MEDIUM-RISK / LOW-RISK so the output isn't misread as a gate. |
| Codebase mode: three personas picking identical files | Some overlap is fine and produces cross-persona signal, but if all three read the same 8 files you've wasted two-thirds of the review. The personas should diverge by lens. |

## Relationship to Other Skills

- `code-review` — systematic per-phase quality gate used by `implement-phase`. Focuses on architectural principles, ADR compliance, and framework standards. Run that skill for routine implementation reviews; run this one when you specifically want adversarial perspective.
- `security-review` — deeper, dedicated security audit. Use instead of this skill when the change is heavily security-relevant (auth, crypto, payment, PII); the Security Auditor persona here is breadth, not depth.
- `verification-loop` — build/type/lint/test gates. Complementary — those verify correctness; this skill verifies judgment.
