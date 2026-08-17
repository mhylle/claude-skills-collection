# ADR-0011: Plugin-Only Distribution

> **Quick Reference** | Status: Accepted | Date: 2026-08-16
> **Decision**: Distribute this collection exclusively as the `devflow` Claude Code plugin via the `mhylle` marketplace; delete `install.sh` and the copy-into-`~/.claude/` path entirely.
> **Context**: Copy-installation had no versioning, no clean uninstall, overwrote user configuration, and produced duplicate skills the moment a plugin install was added alongside it.
> **Alternatives**: Keep both paths, keep the script as a fallback, publish to the community marketplace
> **Impact**: install.sh (deleted), README, documentation/03, hooks location, tests/ship-issue

---

## Context

The collection shipped `install.sh`, which copied `skills/*` into `~/.claude/skills/`,
`agents/*.md` into `~/.claude/agents/`, and `hooks.json` over `~/.claude/hooks.json`.

Four problems accumulated:

1. **No version tracking.** A user could not tell which revision they had, and the only
   update path was re-cloning and re-running the script.
2. **No clean uninstall.** Removing the collection meant deleting ~38 directories and 12
   files by hand, guided by nothing but memory of what the script had copied.
3. **It overwrote user configuration.** `~/.claude/hooks.json` is the user's own file. The
   script clobbered it, leaving a `hooks.json.backup` and hoping for the best.
4. **Duplicate skills.** Plugin skills are namespaced (`/devflow:brainstorm`) and, per the
   Claude Code docs, do **not** override same-named personal skills. Anyone who had run the
   script and then installed the plugin ended up with two copies of every skill —
   `/brainstorm` and `/devflow:brainstorm` — drifting apart, both matching the same
   auto-invocation descriptions, with no way to control which one Claude picked.

Problem 4 is the decisive one. Keeping both paths does not offer users a choice; it hands
them a trap that only manifests as silently stale behavior.

## Decision

**The plugin is the only distribution path. `install.sh` is deleted rather than deprecated.**

The repository root doubles as the plugin root and the marketplace root:
`.claude-plugin/plugin.json` defines the plugin `devflow`, `.claude-plugin/marketplace.json`
defines the marketplace `mhylle` with `"source": "./"`.

Two consequences follow from committing fully rather than half-way:

- **`hooks.json` moved to `hooks/hooks.json`**, the location Claude Code scans by default.
  It sat at the repository root only because the script read it from there. With the script
  gone, `plugin.json` declares **no component paths at all** — `skills/`, `agents/`, and
  `hooks/hooks.json` are all auto-discovered. Every path override removed is one fewer thing
  that can drift out of sync with where files actually are.
- **The two `tests/ship-issue` tests that shelled out to `install.sh --dry-run`** were
  asserting "the distribution mechanism ships these components." That intent survives; the
  mechanism changed. They now assert the components sit in the plugin's default discovery
  locations and that the manifest does not redirect the scan elsewhere.

A migration note in the README and `documentation/03-plugin-distribution.md` tells existing
users how to delete the old copies — including the instruction to prune `~/.claude/hooks.json`
by hand rather than delete it, since it holds their own hooks too.

## Hook Repair

Moving `hooks.json` to the default location made `claude plugin validate` start checking it,
which exposed three entries that had never worked:

```json
{ "type": "skill", "skill": "continuous-learning" }
```

There is no `skill` hook type. The valid set is `command`, `http`, `mcp_tool`, `prompt`, and
`agent`, so Claude Code rejected all three and the hooks silently did nothing — the
collection's headline "extract patterns at session end" behavior was dead config. The
manifest override had been hiding it, because validation never looked inside a file it
reached through a custom path.

Two were repaired, one was removed:

| Hook | Event | Outcome |
|---|---|---|
| `continuous-learning` | Stop | `type: prompt` — fires once per session, so a model round-trip is proportionate |
| `continuous-learning-before-compact` | PreCompact | `type: prompt` — same, fires once per compaction |
| `strategic-compact-monitor` | PreToolUse on Edit \|\| Write \|\| Read | **removed** |

`prompt` is the only hook type that can reach a skill, and it costs a model round-trip per
matched event. On `Stop` and `PreCompact` that is once. On a PreToolUse matcher covering
every Edit, Write, and Read it is a round-trip per file operation, which is not a reasonable
default to switch on for users. Rather than invent a cheaper replacement design as a side
effect of a packaging change, the dead entry was deleted. `/devflow:strategic-compact`
remains available on demand, and a hook-driven version can be designed deliberately later.

## Alternatives Considered

| Option | Pros | Cons | Why Not |
|--------|------|------|---------|
| Keep both paths | No migration needed; users choose | Duplicate skills with no override, drifting silently; two code paths to keep in sync; the hooks file has to live in a non-default location to serve both | The duplicate-skill trap is invisible until behavior is already wrong |
| Keep the script as a fallback | Covers users who cannot use plugins | There is no such user — plugins are core Claude Code, and `--plugin-dir` covers offline and local-checkout cases | A fallback for nobody, with the same duplication hazard |
| Publish to `claude-plugins-community` | Wider discovery | Review pipeline, pinned commit SHAs, nightly catalog sync; the collection is personal tooling with a single author | Premature; the self-hosted marketplace is already installable and can be submitted later without changing this decision |
| Deprecate the script, delete later | Softer transition | A deprecated script that still works still creates duplicates; the warning is read after the damage | Deleting is the only thing that actually removes the hazard |

## Consequences

**Positive**

- Versioned, in-place updates (`/plugin marketplace update mhylle`) and a real uninstall.
- Nothing is written into `~/.claude/`; the user's `hooks.json` is untouched.
- One distribution mechanism to test and document instead of two.
- The manifest carries metadata only, so component locations cannot drift from it.

**Negative**

- Every skill is renamed: `/brainstorm` becomes `/devflow:brainstorm`. Any CLAUDE.md,
  script, or muscle memory referring to the unprefixed name must be updated. This is why
  the plugin version is `1.0.0` and further renames are treated as major bumps.
- Existing users must delete the old copies by hand. Nothing can do it for them safely,
  because the script's writes are indistinguishable from files a user placed there.

**Verification**

`tests/test-plugin-packaging.sh` enforces this ADR: LICENSE present and matching both
manifests, `install.sh` absent, no live documentation instructing anyone to run it, hooks at
the default location, and no component path overrides in `plugin.json`.

## Related

- [ADR-0002](./ADR-0002-modular-verification-skills.md) — names `install.sh` in its impact
  line; that reference is historical and left as written.
- [documentation/03-plugin-distribution.md](../../documentation/03-plugin-distribution.md) —
  the operational guide this decision governs.
