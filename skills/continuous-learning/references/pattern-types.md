# Pattern types — criteria and body sections

Four pattern types. Every learned skill uses the common layout in `storage-format.md` (Trigger, Pattern, Fix, Evidence, Retire when); this file lists what each type must capture and any extra section it adds.

User corrections and single-rule conventions are not a pattern type. If the learning fits in one line ("use named exports in this repo", "don't mock the database in integration tests"), it belongs in Claude Code's auto-memory.

---

## 1. Error resolution

**Definition:** a non-obvious fix for a specific error, exception or unexpected behaviour.

**Promote when:**
- The error message didn't point to the cause.
- Finding the fix took investigation, not the first docs result.
- The root cause is understood, not just the symptom silenced.

**Must capture:**
- **Trigger:** the exact error text (or the stable part of it) in a code span, plus where it shows up (CI only, after a schema change, on Windows).
- **Pattern:** the root cause.
- **Fix:** the steps, with a short before/after snippet if the fix is in code.
- Framework/tool and version range, when the cause is version-specific.

---

## 2. Workaround

**Definition:** a reliable way around a limitation in a tool, framework or environment.

**Promote when:**
- The standard approach was blocked by the limitation.
- The workaround is reliable and maintainable, not a hack that hides a bug.
- The limitation is likely to be hit again.

**Must capture:**
- **Trigger:** what you tried and what blocked it (tool, version, error or missing feature).
- **Pattern:** the limitation and why the workaround gets past it.
- **Fix:** the workaround steps and snippet.
- Extra section **Caveats:** risks or costs of the workaround.
- **Retire when:** the release or change that removes the limitation, and what to switch back to.

---

## 3. Debugging technique

**Definition:** a repeatable investigation sequence that finds the cause for a recognisable class of problem.

**Promote when:**
- The technique found a non-obvious cause.
- It is systematic and repeatable, beyond "add a log line".
- The problem class is specific (not "debugging in general").

**Must capture:**
- Extra section **Indicators:** the observable signs that this technique applies — these drive the description.
- **Fix:** the investigation steps in order, then the resolutions each outcome points to.
- Tools used, if any (profiler, DevTools panel, a specific CLI flag).

---

## 4. Project procedure

**Definition:** a multi-step task specific to one codebase — a release, a migration, regenerating a client, setting up a fixture.

**Promote when:**
- It takes several steps that aren't written down in the repo (README, CLAUDE.md, scripts).
- Getting the order or a step wrong caused a failure this session.
- The task will be repeated.

**Must capture:**
- **Trigger:** project name and task ("adding a database migration in acme-api"). The description names the project so the skill doesn't load in other repos.
- **Fix:** the steps with the exact commands and file paths.
- **Pattern:** why the order matters or what the non-obvious step guards against.

A project rule that fits in one line ("acme-api errors use the `{error: {code, message}}` envelope") is a convention, not a procedure — leave it to auto-memory, or suggest adding it to the repo's CLAUDE.md.
