import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { render } from "../render-template.mjs";

const TEMPLATE = fs.readFileSync(path.join(import.meta.dirname, "..", "..", "assets", "run-orch-gate.sh"), "utf8");
/** The gate needs pass.txt, and records when it starts and ends in $EVENTS. */
const GATE = 'echo "start $(git rev-parse --short HEAD)" >> "$EVENTS"; sleep "${GATE_SLEEP:-0}"; test -f pass.txt; rc=$?; echo "end $(git rev-parse --short HEAD)" >> "$EVENTS"; exit $rc';
const BASH = gitBash();

/** On Windows the runner is meant for Git Bash, and the first bash on PATH may be another (WSL's). */
function gitBash() {
  if (process.platform !== "win32") return "bash";
  const execPath = spawnSync("git", ["--exec-path"], { encoding: "utf8" }).stdout?.trim() ?? "";
  const bash = path.join(execPath, "..", "..", "..", "bin", "bash.exe");
  return execPath && fs.existsSync(bash) ? bash : "bash";
}

/**
 * Another gate, named on its command line (`exec -a` renames a process for pgrep, but not the Windows
 * command line PowerShell reads). It records "other-end" in `events` as it ends.
 */
function fakeGate(name, ms, events) {
  const code = `setTimeout(() => require("node:fs").appendFileSync(process.env.EVENTS, "other-end\\n"), ${ms})`;
  return spawn(process.execPath, ["-e", code, name], { stdio: "ignore", env: { ...process.env, EVENTS: events } });
}

function sh(cwd, command) {
  const result = spawnSync(BASH, ["-c", command], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${command}: ${result.stderr}`);
  return result.stdout.trim();
}

/** A repo with one commit, and the runner rendered into it, as installed but never committed: it finds the repo from its own path. */
function setup({ pattern = "fake-gate-[0-9]+", toolchain = ":" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orch-gate-"));
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  sh(repo, "git init -q && git config user.email t@example.test && git config user.name t");
  fs.writeFileSync(path.join(repo, "deps.lock"), "v1\n");
  fs.writeFileSync(path.join(repo, "pass.txt"), "ok\n");
  sh(repo, "git add -A && git commit -qm one");
  const installs = path.join(root, "installs.log");
  const script = path.join(repo, "scripts", "run-orch-gate.sh");
  fs.mkdirSync(path.dirname(script));
  const values = {
    PROJECT_NAME: "Acme",
    GATE_WORKTREE: "${TMPDIR:-/tmp}/never-used",
    GATE_PROCESS_PATTERN: pattern,
    GATE_LOCKFILES: "deps.lock",
    GATE_TOOLCHAIN_SETUP: toolchain,
    GATE_INSTALL_COMMAND: 'echo "installed $(cat deps.lock)" | tee -a "$INSTALLS"',
    GATE_COMMAND: GATE,
  };
  fs.writeFileSync(script, render(TEMPLATE, { flags: {}, values }, { markdown: false }), { mode: 0o755 });
  const env = { ...process.env, GATE_POLL: "0.2", ORCH_GATE_WORKTREE: path.join(root, "wt"), EVENTS: path.join(root, "events.log"), INSTALLS: installs };
  const run = (sha, log, { extraEnv = {} } = {}) => spawnSync(BASH, [script, sha, log], { cwd: root, encoding: "utf8", timeout: 30_000, env: { ...env, ...extraEnv } });
  const start = (sha, log, extraEnv = {}) => spawn(BASH, [script, sha, log], { cwd: root, stdio: "ignore", env: { ...env, ...extraEnv } });
  const events = () => (fs.existsSync(env.EVENTS) ? fs.readFileSync(env.EVENTS, "utf8").trim().split("\n") : []);
  return { root, repo, installs, run, start, events, eventsLog: env.EVENTS, done: path.join(root, "wt.done"), lock: path.join(root, "wt.lock"), head: () => sh(repo, "git rev-parse HEAD") };
}

test("gates the commit in its own worktree, logs the run and the install, and installs once per lockfile version", () => {
  const env = setup();
  const log = path.join(env.root, "gate.log");
  const first = env.run(env.head(), log);
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.match(fs.readFileSync(log, "utf8"), /queued[\s\S]*installed v1[\s\S]*started[\s\S]*gate exit=0/);
  assert.match(fs.readFileSync(env.done, "utf8"), /exit 0/);
  assert.equal(fs.existsSync(path.join(env.root, "wt", "pass.txt")), true);
  assert.equal(fs.existsSync(env.lock), false, "the lock is released");

  assert.equal(env.run(env.head(), log).status, 0);
  assert.deepEqual(fs.readFileSync(env.installs, "utf8").trim().split("\n"), ["installed v1"], "an unchanged lockfile is not reinstalled");

  fs.writeFileSync(path.join(env.repo, "deps.lock"), "v2\n");
  sh(env.repo, "git commit -qam two");
  assert.equal(env.run(env.head(), log).status, 0);
  assert.deepEqual(fs.readFileSync(env.installs, "utf8").trim().split("\n"), ["installed v1", "installed v2"]);
});

test("a relative log path is the caller's, not the worktree's", () => {
  const env = setup();
  const result = env.run(env.head(), "relative.log");
  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(path.join(env.root, "relative.log"), "utf8"), /queued[\s\S]*gate exit=0/);
  assert.equal(fs.existsSync(path.join(env.root, "wt", "relative.log")), false);
});

test("a failing gate passes its exit code on, and the done marker is still written", () => {
  const env = setup();
  sh(env.repo, "git rm -q pass.txt && git commit -qm drop");
  const result = env.run(env.head(), path.join(env.root, "gate.log"));
  assert.notEqual(result.status, 0);
  assert.match(fs.readFileSync(env.done, "utf8"), /exit [1-9]/);
});

test("two runners started together gate one after the other, never interleaved", async () => {
  const env = setup();
  const one = env.head();
  fs.writeFileSync(path.join(env.repo, "two.txt"), "2\n");
  sh(env.repo, "git add two.txt && git commit -qm two");
  const two = env.head();
  const a = env.start(one, path.join(env.root, "a.log"), { GATE_SLEEP: "1" });
  const b = env.start(two, path.join(env.root, "b.log"), { GATE_SLEEP: "1" });
  await Promise.all([once(a, "exit"), once(b, "exit")]);
  assert.deepEqual(
    env.events().map((line) => line.split(" ")[0]),
    ["start", "end", "start", "end"],
  );
});

test("waits for another running gate, and a lock left by a dead runner does not block", async () => {
  const env = setup();
  const other = fakeGate("fake-gate-42", 2000, env.eventsLog);
  await new Promise((resolve) => setTimeout(resolve, 200));
  fs.mkdirSync(env.lock);
  fs.writeFileSync(path.join(env.lock, "pid"), "999999\n");
  const started = Date.now();
  const result = env.run(env.head(), path.join(env.root, "gate.log"));
  assert.equal(result.status, 0, result.stderr);
  const waited = Date.now() - started;
  assert.deepEqual(env.events().map((line) => line.split(" ")[0]), ["other-end", "start", "end"], "the gate starts once the other has ended");
  // On Windows each look at the process list starts PowerShell, which takes about a second.
  const limit = process.platform === "win32" ? 10_000 : 6000;
  assert.ok(waited >= 1500 && waited < limit, `waited ${waited} ms for a gate that ran about 1.8 s more`);
  other.kill();
});

test("gives up on another gate that never ends, after GATE_WAIT_MAX seconds", async () => {
  const env = setup();
  const other = fakeGate("fake-gate-7", 20_000, env.eventsLog);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const result = env.run(env.head(), path.join(env.root, "gate.log"), { extraEnv: { GATE_WAIT_MAX: "1" } });
  other.kill();
  assert.equal(result.status, 3);
  assert.match(fs.readFileSync(path.join(env.root, "gate.log"), "utf8"), /still running after 1 s/);
});

test("recreates a worktree whose directory was deleted behind git's back", () => {
  const env = setup();
  assert.equal(env.run(env.head(), path.join(env.root, "gate.log")).status, 0);
  fs.rmSync(path.join(env.root, "wt"), { recursive: true, force: true });
  const again = env.run(env.head(), path.join(env.root, "gate.log"));
  assert.equal(again.status, 0, fs.readFileSync(path.join(env.root, "gate.log"), "utf8"));
});

test("a failing toolchain set-up or a missing lockfile stops the run before the gate", () => {
  const broken = setup({ toolchain: "false" });
  const brokenLog = path.join(broken.root, "gate.log");
  assert.notEqual(broken.run(broken.head(), brokenLog).status, 0);
  assert.match(fs.readFileSync(brokenLog, "utf8"), /toolchain/);
  assert.deepEqual(broken.events(), [], "the gate never ran");

  const env = setup();
  sh(env.repo, "git rm -q deps.lock && git commit -qm nolock");
  const log = path.join(env.root, "gate.log");
  assert.notEqual(env.run(env.head(), log).status, 0);
  assert.match(fs.readFileSync(log, "utf8"), /deps\.lock.*missing/);
  assert.deepEqual(env.events(), []);
});

test("refuses a pattern that matches its own command line, or is not a valid regex, and leaves the done marker alone", () => {
  for (const pattern of ["run-orch-gate", "fake-gate-[0-9"]) {
    const env = setup({ pattern });
    fs.writeFileSync(env.done, "an earlier run's result\n");
    const log = path.join(env.root, "gate.log");
    const result = env.run(env.head(), log);
    assert.equal(result.status, 2, pattern);
    assert.match(fs.readFileSync(log, "utf8"), /refused/);
    assert.equal(fs.readFileSync(env.done, "utf8"), "an earlier run's result\n");
  }
});
