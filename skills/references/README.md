# skills/references/ — Shared reference material, NOT a skill

This directory is **not a skill**. It holds documentation that multiple skills share — typically patterns, pipeline specs, or common workflows referenced from multiple SKILL.md files.

Despite sitting alongside the skill directories, there is no `SKILL.md` here and nothing in this folder triggers on its own. If you're looking for a skill, ignore this directory.

## Contents

| File | Used by | Purpose |
|------|---------|---------|
| `team-lifecycle.md` | `team-brainstorm`, `team-create-plan`, `team-implement-plan`, `team-implement-plan-full` | Common TeamCreate → spawn → coordinate → synthesize → TeamDelete pattern |
| `quality-pipeline-distribution.md` | `implement-phase`, `team-implement-plan`, `team-implement-plan-full` | Maps the 8-step implement-phase pipeline to team roles per workflow mode |

## When to add a file here

Only when the same reference content is used by **2+ skills**. A reference used by one skill belongs inside that skill's own `references/` subdirectory (per the skill-creator Progressive Disclosure pattern), not here.

## When NOT to add a file here

- Single-skill references (put them in `skills/<skill-name>/references/`)
- General project docs (put in `docs/`)
- Agent definitions (put in `agents/`)
