# Research Briefs

Ready-to-use prompts for Phase 3. Fill in the brackets, send every brief you need in one message so the agents run in parallel, and carry on with the user while they work.

## Agent or fallback

Use the named agent when it is in your agent list (as `<name>` or `devflow:<name>`); otherwise use the fallback with the same brief. The fallback briefs work because the brief itself says what to return.

| Brief | Agent | Fallback |
|---|---|---|
| External practice | `web-search-researcher` | `general-purpose` |
| Locate the code | `codebase-locator` | `Explore` |
| How it works today | `codebase-analyzer` | `general-purpose` (add "Read-only: don't edit files.") |
| Conventions to follow | `codebase-pattern-finder` | `Explore` |

For a small codebase question, Grep and Read yourself instead of starting an agent.

## External practice

```
Research how others approach [idea in one sentence], for a brainstorm that is deciding
[the open question]. Find:
1. Comparable implementations or products, and what made them succeed or fail
2. Current practice and the common technical approaches, with their trade-offs
3. Known pitfalls and anti-patterns
Prefer official docs and first-hand reports from the last two years. Cite every source
with a link and date, and list what you could not find. Keep the report under 600 words.
```

## Locate the code

```
Find all files related to [feature area] in this repository: implementation, tests,
configuration, types or schemas, docs, and where it is wired into the app. Return paths
from the repo root grouped by purpose, one phrase each. Don't explain how the code works.
```

## How it works today

```
Explain how [related functionality] works today, from its entry points to its side
effects, with file:line references. Cover data flow, configuration and flags, error
handling and integration points. Finish with a short list of constraints a change here
would have to respect, and anything that looks broken. Describe; don't propose changes.
```

## Conventions to follow

```
Find two or three existing examples of [kind of thing the idea would add, e.g. a new
background job / API endpoint / settings screen] in this codebase, with code snippets and
file:line references, plus how they are tested. Note where the codebase does it in more
than one way.
```

## Folding findings in

- Bring findings back as prompts for the user ("Others hit X when doing this; does that apply to you?"), not as a verdict.
- Facts that change the scope or an assumption feed back into Phase 2 questions.
- In the output: external findings go under Research Findings → External Practice, codebase findings under Codebase Context with file references, and any constraint that creates a risk also goes into the Risks table.
- If an agent fails or returns nothing useful, say so in one line and continue; the brainstorm doesn't depend on research.
