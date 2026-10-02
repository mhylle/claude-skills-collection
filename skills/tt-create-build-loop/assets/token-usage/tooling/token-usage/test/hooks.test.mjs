import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./helpers.mjs";

const HOOK_COMMAND = 'node "$CLAUDE_PROJECT_DIR/scripts/token-usage.mjs" --ingest --push-tasktracker --quiet';
// Pushing spawns TaskTracker's MCP server, so the hook gets the official reporter's budget.
const MIN_TIMEOUT_SECONDS = 120;

// Installed, the hooks live in the project's .claude/settings.json. In the skill's asset directory,
// which has no .claude/, the snippet the installer merges into that file is checked instead.
const SETTINGS_CANDIDATES = [path.join(REPO_ROOT, ".claude", "settings.json"), path.join(REPO_ROOT, "settings-hooks.json")];

test(".claude/settings.json ingests and pushes to TaskTracker on Stop, SubagentStop and SessionEnd", () => {
  const settingsPath = SETTINGS_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  assert.ok(settingsPath, `no hook settings at ${SETTINGS_CANDIDATES.join(" or ")}`);
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  for (const event of ["Stop", "SubagentStop", "SessionEnd"]) {
    const hooks = (settings.hooks?.[event] ?? []).flatMap((group) => group.hooks ?? []).filter((h) => h.type === "command");
    const hook = hooks.find((h) => h.command === HOOK_COMMAND);
    assert.ok(hook, `${event} hook missing: ${JSON.stringify(hooks.map((h) => h.command))}`);
    assert.ok(hook.timeout >= MIN_TIMEOUT_SECONDS, `${event} hook timeout ${hook.timeout}s`);
  }
});
