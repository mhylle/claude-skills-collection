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
9. [Migrating from the old install script](#migrating-from-the-old-install-script)
10. [Troubleshooting](#troubleshooting)

---

## Why a plugin

This collection used to ship an install script that copied skills, agents, and hooks into
`~/.claude/`. Copying has no version tracking, no update path other than re-running the
script, and no clean uninstall — and it silently overwrote the user's `hooks.json`. The
plugin fixes all four: Claude Code fetches it from a marketplace, tracks its version,
updates it in place, and removes it without leaving orphans behind.

The script is gone; the plugin is the only distribution path. See
[ADR-0011](../docs/decisions/ADR-0011-plugin-only-distribution.md) for the full rationale.

The tradeoff is namespacing. Plugin skills are always invoked as `/<plugin>:<skill>`, so
`/brainstorm` becomes `/devflow:brainstorm`. This is deliberate on Claude Code's part — it
prevents two plugins from fighting over the same skill name.

| | Old copy-install | Plugin |
|---|---|---|
| Invocation | `/brainstorm` | `/devflow:brainstorm` |
| Update | re-run the script | `/plugin marketplace update mhylle` |
| Version tracking | none | `version` in `plugin.json` |
| Uninstall | delete directories by hand | `/plugin uninstall devflow` |
| Files in `~/.claude/skills/` | yes, copies | no, lives in the plugin cache |
| User's `hooks.json` | overwritten | untouched |

## Repository layout

The repository root **is** the plugin root, and it is also the marketplace root. Claude
Code auto-discovers every component from its default location, so the manifest needs no
path wiring at all:

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
├── hooks/
│   └── hooks.json                 ← auto-discovered
├── documentation/
├── tests/
└── LICENSE
```

Two rules are easy to get wrong:

- **Only `plugin.json` and `marketplace.json` go inside `.claude-plugin/`.** `skills/`,
  `agents/`, and `hooks/` must sit at the plugin root. Putting them under
  `.claude-plugin/` is the single most common plugin mistake and produces a plugin that
  loads with zero components.
- **Everything sits in a default location, so `plugin.json` declares no component paths.**
  `skills/`, `agents/`, and `hooks/hooks.json` are all scanned automatically. The manifest
  carries metadata only. Adding a path override would be one more thing that can drift out
  of sync with where the files actually are — if you need to move a component, prefer
  moving it back to the default location.

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
  "license": "MIT",
  "keywords": ["workflow", "planning", "..."]
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
      "license": "MIT",
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
cp -r skills agents hooks /tmp/pv/devflow/
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

Also run the two repo guards:

```bash
./tests/test-interactive-skills.sh   # interactive skills are never forked into the background
./tests/test-plugin-packaging.sh     # LICENSE, plugin-only distribution, default component locations
```

## Migrating from the old install script

Before the plugin, `install.sh` copied everything into `~/.claude/`. Those copies survive
the switch, and plugin skills **do not override** same-named personal skills — so anyone who
ran the old script has both `/brainstorm` and `/devflow:brainstorm`, backed by two copies
that drift apart as soon as one updates. Claude auto-invokes by description, and both
descriptions match, so which copy runs is not under the user's control.

After installing the plugin, remove the copies once, from a checkout of this repo:

```bash
for s in $(ls skills); do rm -rf "$HOME/.claude/skills/$s"; done
for a in agents/*.md; do rm -f "$HOME/.claude/agents/$(basename "$a")"; done
```

`~/.claude/hooks.json` is the user's own configuration. The old script overwrote it and
left a `hooks.json.backup`; the plugin contributes its hooks from `hooks/hooks.json`
without touching the user file. Review `~/.claude/hooks.json` by hand and delete only the
entries recognisable as this collection's — deleting the file wholesale would take the
user's own hooks with it.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Plugin installs but has no skills | `skills/` was placed inside `.claude-plugin/`. It belongs at the plugin root. |
| Skills do not appear after an edit | `/reload-plugins` was not run, or you read the `0 skills` count instead of invoking the skill. |
| Users are not getting an update | `version` in `plugin.json` was not bumped. |
| `Marketplace is registered from an untrusted source` | The marketplace name collides with a reserved Anthropic name. `mhylle` is not reserved; a rename could collide. |
| Relative `source` fails to resolve | The marketplace was added by direct URL to `marketplace.json`. Relative sources need a git or local-directory source, since only the single file is downloaded otherwise. |
| Hooks do not fire | The file must be at `hooks/hooks.json`. A `hooks.json` at the repo root is not scanned unless `plugin.json` names it. |
| A skill runs twice, or the wrong version runs | Leftover copies from the old install script. See [Migrating from the old install script](#migrating-from-the-old-install-script). |

## Reference

- [Create plugins](https://code.claude.com/docs/en/plugins)
- [Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Plugins reference](https://code.claude.com/docs/en/plugins-reference) — full manifest schema
