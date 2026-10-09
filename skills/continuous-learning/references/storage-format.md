# Storage format

Each learned pattern is a standalone Claude Code skill. Claude Code discovers personal skills at `~/.claude/skills/<name>/SKILL.md` and lists each one's `description` in every session; the model reads the body when the description matches the situation. Nothing else is read — no index file, no per-type subdirectories.

---

## Location and naming

```
~/.claude/skills/
  learned-prisma-client-not-generated/
    SKILL.md
  learned-jest-esm-json-imports/
    SKILL.md
  learned-react-stale-closure-debugging/
    SKILL.md
  learned-acme-api-add-migration/
    SKILL.md
```

- Directory name = frontmatter `name` = `learned-<slug>`.
- `<slug>`: lowercase letters, digits and hyphens, derived from the trigger (`prisma-client-not-generated`, not `fix-1`). Keep the whole name at most 64 characters.
- One directory per pattern, containing only `SKILL.md`. If the pattern needs more than one screen of text, it is too broad — split or trim it.

The `learned-` prefix keeps these apart from hand-written skills and lets the workflow count them with one glob: `~/.claude/skills/learned-*/SKILL.md`.

---

## File layout

```markdown
---
name: learned-<slug>
description: >-
  Use when <trigger: exact error text, tool + version, symptom, or project + task>.
  <The fix in a few words.>
---

# <Title>

Type: <error resolution | workaround | debugging technique | project procedure>
Saved: <YYYY-MM-DD> · Last confirmed: <YYYY-MM-DD>

## Trigger
<What a future session will see that means this applies. Exact error text in a code span.>

## Pattern
<Why it happens: the root cause or the limitation, in one to three sentences.>

## Fix
1. <Step>
2. <Step>

<Optional short code block.>

## Evidence
- <YYYY-MM-DD> — <repo>: <what was observed and what confirmed the fix>

## Retire when
<The condition that makes this skill obsolete.>
```

Type-specific extra sections (for example `Indicators` for a debugging technique) → `pattern-types.md`.

### Frontmatter rules

- Only `name` and `description`, and the block must parse as YAML.
- Always write `description` as a folded block scalar (`description: >-` followed by indented lines). Error messages usually contain `: `, which breaks a plain YAML value.
- At most 300 characters. Name the trigger concretely and say exactly when the skill applies; the description decides whether the skill loads, and it costs space in every session's skill listing.
- A project procedure names the project or repo in its description so it doesn't load elsewhere.

After writing, re-read the frontmatter and confirm it parses (for example with Python's `yaml.safe_load`, if available) and that `name` matches the directory.

---

## Updating, merging, retiring

The cap and the per-run limit are in `SKILL.md`. To stay under them:

- **Update** when a candidate shares the trigger or root cause with an existing learned skill: extend the Fix, add an Evidence line, set `Last confirmed`, tighten the description.
- **Merge** two skills that would load in the same situations: keep the clearer name, combine the triggers in one description (still at most 300 characters), combine Fix and Evidence, then delete the other directory.
- **Retire** by deleting the `learned-<slug>/` directory when its "Retire when" condition is met, the tool or version is gone, or a merge superseded it.

Evidence lines are the only record of use. When a later session confirms the fix again, add a dated line and update `Last confirmed`; there are no counters or confidence scores.
