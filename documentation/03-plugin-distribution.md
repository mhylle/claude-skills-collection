# Plugin Distribution

How this collection is packaged as a Claude Code plugin, how users install it, and how to
publish changes.

> **Just want to install it?** See [Installation](../README.md#installation) in the README.

## Table of Contents

1. [Why a plugin](#why-a-plugin)
2. [Repository layout](#repository-layout)
3. [The two manifests](#the-two-manifests)
4. [Installing](#installing)
5. [Publishing a change](#publishing-a-change)
6. [Versioning](#versioning)
7. [Local development](#local-development)
8. [Validation and verification](#validation-and-verification)
9. [Coexisting with `install.sh`](#coexisting-with-installsh)
10. [Troubleshooting](#troubleshooting)

---

## Why a plugin

`./install.sh` copies files into `~/.claude/`. That works, but it has no version tracking,
no update path other than re-running the script, and no way to cleanly uninstall. A plugin
fixes all three: Claude Code fetches it from a marketplace, tracks its version, updates it
in place, and can disable or remove it without leaving orphaned files behind.

The tradeoff is namespacing. Plugin skills are always invoked as `/<plugin>:<skill>`, so
`/brainstorm` becomes `/devflow:brainstorm`. This is deliberate on Claude Code's part — it
prevents two plugins from fighting over the same skill name.

| | `install.sh` | Plugin |
|---|---|---|
| Invocation | `/brainstorm` | `/devflow:brainstorm` |
| Update | re-run the script | `/plugin marketplace update mhylle` |
| Version tracking | none | `version` in `plugin.json` |
| Uninstall | delete directories by hand | `/plugin uninstall devflow` |
| Files in `~/.claude/skills/` | yes, copies | no, lives in the plugin cache |

## Repository layout

The repository root **is** the plugin root, and it is also the marketplace root. Claude
Code auto-discovers components in their default locations, so no path wiring is needed
beyond the hooks file:

```
claude-skills-collection/          ← plugin root AND marketplace root
├── .claude-plugin/
│   ├── plugin.json                ← plugin manifest
│   └── marketplace.json           ← marketplace catalog
├── skills/                        ← auto-discovered: <name>/SKILL.md
│   ├── brainstorm/SKILL.md
│   └── ...
├── agents/                        ← auto-discovered: *.md
│   ├── codebase-locator.md
│   └── ...
├── hooks.json                     ← referenced explicitly by plugin.json
├── documentation/
└── install.sh                     ← the non-plugin install path, still supported
```

Two rules are easy to get wrong:

- **Only `plugin.json` and `marketplace.json` go inside `.claude-plugin/`.** `skills/`,
  `agents/`, and `hooks/` must sit at the plugin root. Putting them under
  `.claude-plugin/` is the single most common plugin mistake and produces a plugin that
  loads with zero components.
- **`hooks.json` lives at the repo root, not in `hooks/`.** The default location Claude
  Code scans is `hooks/hooks.json`. This repo keeps the file at the root because
  `install.sh` has always read it from there, so `plugin.json` points at it explicitly with
  `"hooks": "./hooks.json"`. Both install paths therefore share one file — do not create a
  second copy under `hooks/`, or the two will drift.

`skills/references/` holds shared reference material and has no `SKILL.md`. Claude Code
skips directories without one, so it is harmless.

## The two manifests

These are different things that are easy to confuse. The **plugin manifest** describes what
the plugin contains. The **marketplace manifest** is a catalog that tells Claude Code where
to fetch plugins from.

### `.claude-plugin/plugin.json`

```json
{
  "name": "devflow",
  "displayName": "DevFlow Skills Collection",
  "version": "1.0.0",
  "description": "...",
  "author": { "name": "Martin Hylleberg", "url": "https://github.com/mhylle" },
  "homepage": "https://github.com/mhylle/claude-skills-collection#readme",
  "repository": "https://github.com/mhylle/claude-skills-collection",
  "keywords": ["workflow", "planning", "..."],
  "hooks": "./hooks.json"
}
```

`name` is the only required field, and it sets the namespace — every skill becomes
`/devflow:<skill>` and every agent becomes `devflow:<agent>`. Changing it renames every
command users have learned, so treat it as stable.

### `.claude-plugin/marketplace.json`

```json
{
  "name": "mhylle",
  "description": "Claude Code plugins published by Martin Hylleberg.",
  "owner": { "name": "Martin Hylleberg", "url": "https://github.com/mhylle" },
  "plugins": [
    {
      "name": "devflow",
      "source": "./",
      "displayName": "DevFlow Skills Collection",
      "description": "...",
      "category": "workflow",
      "tags": ["workflow", "planning", "..."]
    }
  ]
}
```

`source: "./"` means "the plugin is this same repository." Relative sources resolve against
the marketplace root — the directory containing `.claude-plugin/`, not `.claude-plugin/`
itself.

The catalog can hold more than one plugin. To add a second, split it into a subdirectory and
add an entry with `"source": "./plugins/other-thing"`.

## Installing

```
/plugin marketplace add mhylle/claude-skills-collection
/plugin install devflow@mhylle
```

The first line registers the catalog by its GitHub `owner/repo`. The second installs the
plugin from it. If the install summary says `Run /reload-plugins to activate.`, run that.

Users can also add the marketplace from a local checkout, which is useful for testing a
branch before it is pushed:

```
/plugin marketplace add /path/to/claude-skills-collection
```

## Publishing a change

Because `source` is `"./"`, the plugin and the catalog ship in the same push:

1. Make the change (edit a skill, add an agent, adjust hooks).
2. Bump `version` in `.claude-plugin/plugin.json` — see [Versioning](#versioning).
3. Run the checks in [Validation and verification](#validation-and-verification).
4. Commit and push to `master`.

Users pick it up with `/plugin marketplace update mhylle`. Nothing else is needed; there is
no separate publish step and no registry to notify.

## Versioning

`version` in `plugin.json` is what gates updates. **If you do not bump it, users who already
installed the plugin do not get your change** — Claude Code sees the same version string and
skips the update.

Semantic versioning maps onto this collection roughly like this:

| Change | Bump |
|---|---|
| Skill wording, docs, a fixed typo | patch (`1.0.1`) |
| New skill, new agent, new hook | minor (`1.1.0`) |
| Renamed or removed skill, changed invocation, breaking hook | major (`2.0.0`) |

Removing or renaming a skill is a breaking change for anyone with it in a script or a
CLAUDE.md, which is why it earns a major bump.

## Local development

Load the plugin without installing it:

```bash
claude --plugin-dir /home/mhylle/projects/claude-skills-collection
```

Skills appear under the `devflow:` namespace for that session only. A local `--plugin-dir`
copy takes precedence over an installed plugin of the same name, so you can test edits
against an install you already have.

After editing a skill mid-session, run `/reload-plugins` to pick it up without restarting.
The summary line counts only `commands/` entries, so it can report `0 skills` even when your
`skills/` edit reloaded fine — check by invoking the skill, not by reading that number.

## Validation and verification

Both manifests live in the same directory, so `claude plugin validate .` finds the
marketplace one. Validate the plugin manifest by pointing at a copy that has no
`marketplace.json` beside it:

```bash
# marketplace manifest
claude plugin validate . --strict

# plugin manifest, isolated
mkdir -p /tmp/pv/devflow/.claude-plugin
cp .claude-plugin/plugin.json /tmp/pv/devflow/.claude-plugin/
cp hooks.json /tmp/pv/devflow/
cp -r skills agents /tmp/pv/devflow/
claude plugin validate /tmp/pv/devflow --strict
```

`--strict` turns warnings into errors, which catches a misspelled manifest field before it
reaches users.

Validation only checks the manifests. To confirm the components actually load, do a headless
run and count them:

```bash
claude --plugin-dir . --model claude-haiku-4-5-20251001 -p \
  "Do not use any tools. Report the exact count of skills whose name begins with 'devflow:'."
```

The expected count is the number of `skills/*/SKILL.md` files minus those that set
`disable-model-invocation: true` (`user-invocable: false` skills still appear to the model).

Also run the frontmatter guard, which enforces that interactive skills never get forked into
a background subagent:

```bash
./tests/test-interactive-skills.sh
```

## Coexisting with `install.sh`

Plugin skills are namespaced and **do not override** same-named personal skills in
`~/.claude/skills/`. If you have run both install paths you will have `/brainstorm` and
`/devflow:brainstorm`, pointing at two separate copies that drift apart as soon as one is
updated. Worse, Claude auto-invokes by description, and both descriptions match — so which
copy runs is not something you control.

Pick one. To move from the script to the plugin, remove the directories the script created:

```bash
# skills this repo installs
for s in $(ls skills); do rm -rf "$HOME/.claude/skills/$s"; done
# agents this repo installs
for a in agents/*.md; do rm -f "$HOME/.claude/agents/$(basename "$a")"; done
```

`~/.claude/hooks.json` is shared user configuration rather than a copy of this repo's file,
so review it by hand before deleting anything from it.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Plugin installs but has no skills | `skills/` was placed inside `.claude-plugin/`. It belongs at the plugin root. |
| Skills do not appear after an edit | `/reload-plugins` was not run, or you read the `0 skills` count instead of invoking the skill. |
| Users are not getting an update | `version` in `plugin.json` was not bumped. |
| `Marketplace is registered from an untrusted source` | The marketplace name collides with a reserved Anthropic name. `mhylle` is not reserved; a rename could collide. |
| Relative `source` fails to resolve | The marketplace was added by direct URL to `marketplace.json`. Relative sources need a git or local-directory source, since only the single file is downloaded otherwise. |

## Reference

- [Create plugins](https://code.claude.com/docs/en/plugins)
- [Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Plugins reference](https://code.claude.com/docs/en/plugins-reference) — full manifest schema
