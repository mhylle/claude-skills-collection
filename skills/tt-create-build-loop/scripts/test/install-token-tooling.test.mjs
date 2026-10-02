import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const INSTALL = path.join(import.meta.dirname, "..", "install-token-tooling.mjs");
const ASSETS = path.join(import.meta.dirname, "..", "..", "assets", "token-usage");
const PROJECT_ID = "11111111-2222-4333-8444-555555555555";
const HOOK = 'node "$CLAUDE_PROJECT_DIR/scripts/token-usage.mjs" --ingest --push-tasktracker --quiet';

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** An empty git work tree to install into. */
function repo() {
  const dir = tmp("target-");
  fs.mkdirSync(path.join(dir, ".git"));
  return dir;
}

/** A directory shaped like TaskTracker's mcp-server. */
function mcpDir() {
  const dir = tmp("mcp-server-");
  fs.mkdirSync(path.join(dir, "lib"));
  fs.writeFileSync(path.join(dir, "lib", "mcp-client.js"), "export {};\n");
  return dir;
}

function install(target, extra = []) {
  const args = [INSTALL, "--target", target, "--project-id", PROJECT_ID, "--mcp-dir", MCP_DIR, ...extra];
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const MCP_DIR = mcpDir();
const read = (target, file) => fs.readFileSync(path.join(target, file), "utf8");
const json = (target, file) => JSON.parse(read(target, file));
const hookCommands = (settings, event) => (settings.hooks?.[event] ?? []).flatMap((group) => group.hooks ?? []).map((hook) => hook.command);

test("a fresh repo gets the tooling, the hooks, the gitignore rules and tasktracker.json, and the installed tests pass there", () => {
  const target = repo();
  const result = install(target);
  assert.equal(result.status, 0, result.stderr);

  for (const file of ["scripts/token-usage.mjs", "scripts/pricing.json", "tooling/token-usage/src/cli.mjs", "tooling/token-usage/test/fixtures/transcripts/session-a.jsonl"]) {
    assert.equal(read(target, file), fs.readFileSync(path.join(ASSETS, file), "utf8"), file);
  }
  assert.equal(fs.existsSync(path.join(target, "settings-hooks.json")), false, "the snippet is merged, not copied");
  assert.equal(fs.existsSync(path.join(target, "gitignore.snippet")), false);

  const settings = json(target, ".claude/settings.json");
  for (const event of ["Stop", "SubagentStop", "SessionEnd"]) assert.deepEqual(hookCommands(settings, event), [HOOK], event);
  assert.match(read(target, ".gitignore"), /^\.claude\/usage\/state\.json$/m);
  assert.deepEqual(json(target, ".claude/usage/tasktracker.json"), { projectId: PROJECT_ID }, "the committed config holds nothing machine-specific");
  assert.deepEqual(json(target, ".claude/usage/tasktracker.local.json"), { mcpServerDir: MCP_DIR });
  assert.match(read(target, ".gitignore"), /^\.claude\/usage\/tasktracker\.local\.json$/m);

  // A child of the test runner inherits NODE_TEST_CONTEXT and would only report to it, so it is dropped.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const testFiles = fs.readdirSync(path.join(target, "tooling/token-usage/test")).filter((f) => f.endsWith(".test.mjs"));
  const tests = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...testFiles.map((f) => `tooling/token-usage/test/${f}`)], {
    cwd: target,
    encoding: "utf8",
    env: { ...env, TASKTRACKER_MCP_DIR: "" },
  });
  assert.equal(tests.status, 0, tests.stdout.slice(-2000));
  assert.match(tests.stdout, /^# fail 0$/m);
  assert.ok(Number(tests.stdout.match(/^# pass (\d+)$/m)?.[1]) >= 100, `the installed suite ran: ${tests.stdout.slice(-400)}`);
});

test("existing settings keep every key and hook of their own; ours are added once, however often the installer runs", () => {
  const target = repo();
  const own = {
    permissions: { allow: ["Bash(npm test:*)"] },
    hooks: { Stop: [{ hooks: [{ type: "command", command: "echo own-stop" }] }], PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo pre" }] }] },
  };
  fs.mkdirSync(path.join(target, ".claude"));
  fs.writeFileSync(path.join(target, ".claude", "settings.json"), JSON.stringify(own, null, 2));

  assert.equal(install(target).status, 0);
  const second = install(target);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /unchanged/);

  const settings = json(target, ".claude/settings.json");
  assert.deepEqual(settings.permissions, own.permissions);
  assert.deepEqual(settings.hooks.PreToolUse, own.hooks.PreToolUse);
  assert.deepEqual(hookCommands(settings, "Stop"), ["echo own-stop", HOOK]);
  assert.deepEqual(hookCommands(settings, "SubagentStop"), [HOOK]);
});

test("the gitignore gains only the rules it lacks, once", () => {
  const target = repo();
  fs.writeFileSync(path.join(target, ".gitignore"), "node_modules/\n.claude/usage/state.json\n");
  install(target);
  install(target);
  const lines = read(target, ".gitignore").split("\n");
  assert.equal(lines.filter((line) => line === ".claude/usage/state.json").length, 1);
  assert.equal(lines.filter((line) => line === ".claude/usage/push.lock").length, 1);
  assert.equal(lines[0], "node_modules/");
});

test("a differing file already in the repo is a conflict: nothing at all is written, and the conflict is named", () => {
  const target = repo();
  fs.mkdirSync(path.join(target, "scripts"));
  fs.writeFileSync(path.join(target, "scripts", "token-usage.mjs"), "// the project's own\n");
  const result = install(target);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /scripts\/token-usage\.mjs/);
  assert.equal(read(target, "scripts/token-usage.mjs"), "// the project's own\n");
  assert.equal(fs.existsSync(path.join(target, ".claude")), false);
  assert.equal(fs.existsSync(path.join(target, ".gitignore")), false);
});

test("an unreadable settings.json or a tasktracker.json for another project is a conflict, left untouched", () => {
  const broken = repo();
  fs.mkdirSync(path.join(broken, ".claude"));
  fs.writeFileSync(path.join(broken, ".claude", "settings.json"), "{ not json");
  const brokenResult = install(broken);
  assert.equal(brokenResult.status, 1);
  assert.match(brokenResult.stderr, /settings\.json/);
  assert.equal(read(broken, ".claude/settings.json"), "{ not json");

  const other = repo();
  fs.mkdirSync(path.join(other, ".claude", "usage"), { recursive: true });
  const otherConfig = JSON.stringify({ projectId: "99999999-8888-4777-8666-555555555555" });
  fs.writeFileSync(path.join(other, ".claude", "usage", "tasktracker.json"), otherConfig);
  const otherResult = install(other);
  assert.equal(otherResult.status, 1);
  assert.match(otherResult.stderr, /tasktracker\.json/);
  assert.equal(read(other, ".claude/usage/tasktracker.json"), otherConfig);
});

test("an existing tasktracker.json for the same project, in any letter case, is kept as it is", () => {
  const target = repo();
  fs.mkdirSync(path.join(target, ".claude", "usage"), { recursive: true });
  const existing = JSON.stringify({ projectId: PROJECT_ID.toUpperCase(), note: "kept" });
  fs.writeFileSync(path.join(target, ".claude", "usage", "tasktracker.json"), existing);
  const result = install(target);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(read(target, ".claude/usage/tasktracker.json"), existing);
  assert.deepEqual(json(target, ".claude/usage/tasktracker.local.json"), { mcpServerDir: MCP_DIR });
});

test("a tasktracker.local.json pointing elsewhere is a conflict, left untouched", () => {
  const target = repo();
  fs.mkdirSync(path.join(target, ".claude", "usage"), { recursive: true });
  const local = JSON.stringify({ mcpServerDir: "/somewhere/else" });
  fs.writeFileSync(path.join(target, ".claude", "usage", "tasktracker.local.json"), local);
  const result = install(target);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /tasktracker\.local\.json/);
  assert.equal(read(target, ".claude/usage/tasktracker.local.json"), local);
});

test("a hook group holding ours beside another command gains nothing; CRLF gitignore lines still count as present", () => {
  const target = repo();
  fs.mkdirSync(path.join(target, ".claude"));
  const own = { hooks: { Stop: [{ hooks: [{ type: "command", command: "echo own" }, { type: "command", command: HOOK, timeout: 120 }] }] } };
  fs.writeFileSync(path.join(target, ".claude", "settings.json"), JSON.stringify(own));
  fs.writeFileSync(path.join(target, ".gitignore"), "node_modules/\r\n.claude/usage/state.json\r\n");
  assert.equal(install(target).status, 0);
  const settings = json(target, ".claude/settings.json");
  assert.deepEqual(hookCommands(settings, "Stop"), ["echo own", HOOK]);
  assert.equal(read(target, ".gitignore").split(/\r?\n/).filter((line) => line === ".claude/usage/state.json").length, 1);
});

test("refuses a target that is not an existing git work tree, and runs the same through a symlink", () => {
  const missing = path.join(tmp("parent-"), "no-such-repo");
  const result = spawnSync(process.execPath, [INSTALL, "--target", missing, "--project-id", PROJECT_ID, "--mcp-dir", MCP_DIR], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /git work tree/);
  assert.equal(fs.existsSync(missing), false);

  const link = path.join(tmp("link-"), "install.mjs");
  fs.symlinkSync(INSTALL, link);
  const linked = spawnSync(process.execPath, [link, "--help"], { encoding: "utf8" });
  assert.equal(linked.status, 0);
  assert.match(linked.stdout, /Usage/);
});

test("--dry-run reports the plan and writes nothing", () => {
  const target = repo();
  const result = install(target, ["--dry-run"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /create scripts\/token-usage\.mjs/);
  assert.deepEqual(fs.readdirSync(target), [".git"]);
});

test("refuses a project id that is not a uuid and an mcp-server directory without lib/mcp-client.js", () => {
  const target = repo();
  const badId = spawnSync(process.execPath, [INSTALL, "--target", target, "--project-id", "acme", "--mcp-dir", MCP_DIR], { encoding: "utf8" });
  assert.equal(badId.status, 1);
  assert.match(badId.stderr, /project-id/);
  const badDir = spawnSync(process.execPath, [INSTALL, "--target", target, "--project-id", PROJECT_ID, "--mcp-dir", tmp("empty-")], { encoding: "utf8" });
  assert.equal(badDir.status, 1);
  assert.match(badDir.stderr, /mcp-client\.js/);
  assert.deepEqual(fs.readdirSync(target), [".git"]);
});
