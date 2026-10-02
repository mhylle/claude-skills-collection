import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { ingest } from "../src/ingest.mjs";
import { loadPricing } from "../src/pricing.mjs";
import { MAX_REJECTED_PER_PUSH, PUSH_BACKOFF_MS, PUSH_DEADLINE_MS, loadTaskTrackerMcp, pushToTaskTracker, reporterSessionId, resolveMcpDir } from "../src/tasktracker-push.mjs";
import { CLI_PATH, FIXTURE_TRANSCRIPTS, PRICING_PATH, assertUsd, assistantLine, makeTmpDir, readJsonl, runCli, tmpTranscripts } from "./helpers.mjs";
import { TOTALS } from "./expected.mjs";

const pricing = loadPricing(PRICING_PATH);
const RECORD = "tasktracker_recordTokenUsage";
const REATTRIBUTE = "tasktracker_reattributeTokenUsage";
// The CLI tests run as a project named acme.shop, so the server a push spawns becomes the TaskTracker
// agent mcp:acme-shop-token-push, which has no active task.
const PROJECT_DIR = path.join(makeTmpDir("project-"), "acme.shop");
const REPORTER_SESSION_ID = "acme-shop-token-push";
// Deliberately no real project's id: the hint must come from tasktracker.json.
const PROJECT_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_PROJECT_ID = "99999999-8888-4777-8666-555555555555";

/**
 * A stand-in for TaskTracker's mcp-client.js. It records every call, dedupes on messageId like the
 * real ingest, and lets a test inject failures.
 */
function fakeMcp({ fail = () => undefined, onCall = () => undefined, attribution = "project" } = {}) {
  const known = new Set();
  const fake = {
    sessions: 0,
    calls: [],
    async withMcpClient(fn) {
      fake.sessions += 1;
      return fn({ session: fake.sessions });
    },
    async callToolOn(client, name, args) {
      const call = { session: client.session, name, args, ok: false };
      fake.calls.push(call);
      onCall({ name, args });
      const error = fail({ name, args, calls: fake.calls.filter((c) => c.name === name) });
      if (error) throw error;
      call.ok = true;
      if (name === REATTRIBUTE) return { examined: 7, upgraded: 2, corrected: 0, claimedBySession: 5 };
      const fresh = args.events.filter((event) => !known.has(event.messageId));
      for (const event of fresh) known.add(event.messageId);
      return {
        received: args.events.length,
        inserted: fresh.length,
        duplicates: args.events.length - fresh.length,
        attributedToTask: attribution === "task" ? fresh.length : 0,
        attributedToProject: attribution === "project" ? fresh.length : 0,
        unattributed: 0,
        unpriced: 0,
        costUsdInserted: fresh.length / 1000,
      };
    },
  };
  return fake;
}

const delivered = (fake) => fake.calls.filter((call) => call.name === RECORD && call.ok);
const sentIds = (calls) => calls.flatMap((call) => call.args.events.map((event) => event.messageId));

/** A private copy of a fixture, ingested, with tasktracker.json next to the log. */
function setup(fixtureDir = FIXTURE_TRANSCRIPTS, { config = { projectId: PROJECT_ID } } = {}) {
  const { transcriptsDir, logPath } = tmpTranscripts(fixtureDir);
  const usageDir = path.dirname(logPath);
  fs.mkdirSync(usageDir, { recursive: true });
  if (config !== null) fs.writeFileSync(path.join(usageDir, "tasktracker.json"), JSON.stringify(config));
  ingest({ transcriptsDir, logPath, pricing });
  const hookErrorsPath = path.join(usageDir, "hook-errors.log");
  const watermarkPath = path.join(usageDir, "tasktracker-push.json");
  return {
    transcriptsDir,
    logPath,
    usageDir,
    push: (fake, options = {}) => pushToTaskTracker({ logPath, pricing, loadMcp: async () => fake, ...options }),
    watermarkPath,
    hookErrors: () => (fs.existsSync(hookErrorsPath) ? fs.readFileSync(hookErrorsPath, "utf8") : ""),
    // A failed push writes the state file too (to record the failure for the backoff), so "moved no
    // watermark" is offset 0 rather than "no file".
    watermark: () => (fs.existsSync(watermarkPath) ? JSON.parse(fs.readFileSync(watermarkPath, "utf8")).offset : 0),
  };
}

/** A controllable clock for deadline and backoff tests. */
function fakeClock(start = Date.parse("2026-09-29T10:00:00.000Z")) {
  const clock = () => clock.now;
  clock.now = start;
  clock.advance = (ms) => {
    clock.now += ms;
  };
  return clock;
}

/** Byte offset just past each line of a file. */
function lineEnds(filePath) {
  let offset = 0;
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .slice(0, -1)
    .map((line) => (offset += Buffer.byteLength(line, "utf8") + 1));
}

/** A transcripts dir with one main session of `count` distinct messages. */
function manyMessages(count) {
  const dir = makeTmpDir();
  const lines = Array.from({ length: count }, (_, i) =>
    assistantLine({ id: `msg_M${String(i).padStart(4, "0")}`, sessionId: "session-m", ts: new Date(Date.UTC(2026, 8, 28, 10, 0, i)).toISOString(), input: 1, output: 1 }),
  );
  fs.writeFileSync(path.join(dir, "session-m.jsonl"), lines.join("\n") + "\n");
  return dir;
}

test("pushes every logged message once, in one MCP session, with the project hint from tasktracker.json", async () => {
  const env = setup();
  const fake = fakeMcp();
  const result = await env.push(fake);
  assert.equal(result.failure, undefined);
  assert.equal(fake.sessions, 1);
  const calls = delivered(fake);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.projectHintId, PROJECT_ID);
  assert.equal(calls[0].args.events.length, TOTALS.messages);
  assert.equal(result.sent, TOTALS.messages);
  assert.deepEqual({ ...result.ingest, costUsdInserted: 0 }, { received: 16, inserted: 16, duplicates: 0, attributedToTask: 0, attributedToProject: 16, unattributed: 0, unpriced: 0, costUsdInserted: 0 });
  assertUsd(result.ingest.costUsdInserted, 0.016);
});

test("subagent records are pushed as sidechain events with their agentId", async () => {
  const env = setup();
  const fake = fakeMcp();
  await env.push(fake);
  const events = delivered(fake)[0].args.events;
  const x1 = events.find((event) => event.messageId === "msg_X1");
  assert.equal(x1.isSidechain, true);
  assert.equal(x1.agentId, "x");
  const a3 = events.find((event) => event.messageId === "msg_A3");
  assert.equal(a3.isSidechain, false);
  assert.equal("agentId" in a3, false);
});

test("the project hint is read from tasktracker.json; a missing or invalid config sends nothing and is logged", async () => {
  const other = setup(FIXTURE_TRANSCRIPTS, { config: { projectId: OTHER_PROJECT_ID } });
  const otherFake = fakeMcp();
  await other.push(otherFake);
  assert.equal(delivered(otherFake)[0].args.projectHintId, OTHER_PROJECT_ID);

  for (const config of [null, { projectId: "acme-shop" }, { projectId: PROJECT_ID, mcpServerDir: 42 }]) {
    const env = setup(FIXTURE_TRANSCRIPTS, { config });
    const fake = fakeMcp();
    const result = await env.push(fake);
    assert.match(result.failure, /tasktracker\.json/);
    assert.equal(fake.sessions, 0);
    assert.match(env.hookErrors(), /push-tasktracker: .*tasktracker\.json/);
  }
});

test("batches of 100 share one MCP session and their IngestResults are summed", async () => {
  const env = setup(manyMessages(250));
  const fake = fakeMcp();
  const result = await env.push(fake);
  assert.deepEqual(delivered(fake).map((call) => call.args.events.length), [100, 100, 50]);
  assert.deepEqual([...new Set(fake.calls.map((call) => call.session))], [1]);
  assert.equal(result.batches, 3);
  assert.equal(result.ingest.received, 250);
  assert.equal(result.ingest.inserted, 250);
});

test("a 413 halves the batch and retries until it fits, delivering every message exactly once", async () => {
  const env = setup(manyMessages(250));
  const fake = fakeMcp({ fail: ({ name, args }) => (name === RECORD && args.events.length > 30 ? new Error("Request failed with status code 413 (request entity too large)") : undefined) });
  const result = await env.push(fake);
  assert.equal(result.failure, undefined);
  const ids = sentIds(delivered(fake));
  assert.equal(ids.length, 250);
  assert.equal(new Set(ids).size, 250);
  assert.ok(delivered(fake).every((call) => call.args.events.length <= 30));
});

test("a 413 that persists down to the minimum batch size fails the push and moves no watermark", async () => {
  const env = setup(manyMessages(20));
  const fake = fakeMcp({ fail: ({ name }) => (name === RECORD ? new Error("413 Payload Too Large") : undefined) });
  const result = await env.push(fake);
  assert.match(result.failure, /413/);
  assert.ok(Math.min(...fake.calls.map((call) => call.args.events.length)) <= 5);
  assert.equal(env.watermark(), 0);
  assert.match(env.hookErrors(), /413/);
});

test("nothing acknowledged is sent twice: a push without new usage opens no MCP session, new usage is sent alone", async () => {
  const env = setup();
  await env.push(fakeMcp());
  assert.equal(env.watermark(), fs.statSync(env.logPath).size);

  const idle = fakeMcp();
  const again = await env.push(idle);
  assert.equal(idle.sessions, 0);
  assert.equal(again.sent, 0);

  fs.appendFileSync(path.join(env.transcriptsDir, "session-a.jsonl"), assistantLine({ id: "msg_A12", ts: "2026-09-28T10:00:00.000Z", input: 1, output: 9 }) + "\n");
  ingest({ transcriptsDir: env.transcriptsDir, logPath: env.logPath, pricing });
  const next = fakeMcp();
  await env.push(next);
  assert.deepEqual(sentIds(delivered(next)), ["msg_A12"]);
});

test("after a partial failure the next push resends exactly the unacknowledged messages", async () => {
  const env = setup(manyMessages(250));
  const clock = fakeClock();
  const flaky = fakeMcp({ fail: ({ name, calls }) => (name === RECORD && calls.length === 2 ? new Error("socket hang up") : undefined) });
  const first = await env.push(flaky, { clock });
  assert.match(first.failure, /socket hang up/);
  assert.match(env.hookErrors(), /socket hang up/);
  const acknowledged = sentIds(delivered(flaky));
  assert.equal(acknowledged.length, 100);
  assert.ok(env.watermark() > 0 && env.watermark() < fs.statSync(env.logPath).size);

  clock.advance(PUSH_BACKOFF_MS);
  const healthy = fakeMcp();
  await env.push(healthy, { clock });
  const resent = sentIds(delivered(healthy));
  assert.equal(resent.length, 150);
  assert.deepEqual(new Set([...acknowledged, ...resent]).size, 250);
  assert.equal(env.watermark(), fs.statSync(env.logPath).size);
});

test("--dry-run sends nothing and moves no watermark, but reports messages, tokens and our cost", async () => {
  const env = setup();
  const result = await pushToTaskTracker({
    logPath: env.logPath,
    pricing,
    dryRun: true,
    loadMcp: async () => {
      throw new Error("a dry run must not connect");
    },
  });
  assert.equal(result.failure, undefined);
  assert.equal(result.dryRun, true);
  assert.equal(result.messages, TOTALS.messages);
  assert.equal(result.totalTokens, TOTALS.totalTokens);
  assertUsd(result.costUsd, TOTALS.costUsd);
  assert.equal(result.projectHintId, PROJECT_ID);
  assert.equal(env.watermark(), 0);

  const fake = fakeMcp();
  await env.push(fake);
  assert.equal(sentIds(delivered(fake)).length, TOTALS.messages, "the dry run held nothing back");
});

test("connection failures are logged to hook-errors.log and returned, never thrown", async () => {
  const env = setup();
  const noClient = await pushToTaskTracker({ logPath: env.logPath, pricing, loadMcp: async () => Promise.reject(new Error("Cannot find module mcp-client.js")) });
  assert.match(noClient.failure, /Cannot find module/);
  assert.match(env.hookErrors(), /push-tasktracker: .*Cannot find module/);
  assert.equal(env.watermark(), 0);

  const other = setup();
  const broken = fakeMcp();
  broken.withMcpClient = async () => {
    throw new Error("spawn ENOENT");
  };
  const noSession = await other.push(broken);
  assert.match(noSession.failure, /spawn ENOENT/);
  assert.match(other.hookErrors(), /push-tasktracker: .*spawn ENOENT/);
  assert.equal(other.watermark(), 0);
});

test("reattribute runs once, last, in the same session, only when rows landed un-tasked; its failure is not fatal", async () => {
  const untasked = setup(manyMessages(150));
  const fake = fakeMcp({ attribution: "project" });
  const result = await untasked.push(fake);
  assert.deepEqual(fake.calls.map((call) => call.name), [RECORD, RECORD, REATTRIBUTE]);
  assert.equal(fake.calls.at(-1).session, 1);
  assert.deepEqual(result.reattribute, { examined: 7, upgraded: 2, corrected: 0, claimedBySession: 5 });

  const tasked = setup();
  const taskFake = fakeMcp({ attribution: "task" });
  assert.equal((await tasked.push(taskFake)).reattribute, null);
  assert.equal(taskFake.calls.some((call) => call.name === REATTRIBUTE), false);

  const sweepFails = setup();
  const sweepFake = fakeMcp({ fail: ({ name }) => (name === REATTRIBUTE ? new Error("sweep timeout") : undefined) });
  const swept = await sweepFails.push(sweepFake);
  assert.equal(swept.failure, undefined);
  assert.equal(sweepFails.watermark(), fs.statSync(sweepFails.logPath).size);
  assert.match(sweepFails.hookErrors(), /reattribute.*sweep timeout/);
});

/**
 * A directory shaped like TaskTracker's mcp-server whose client records its calls to a file. Like the
 * real stdio client, withMcpClient copies the server's env from process.env after an await; with
 * FAKE_TT_SPAWN set it records the CLAUDE_CODE_SESSION_ID that copy carries, and FAKE_TT_SPAWN_FAIL
 * makes the spawn fail.
 */
function fakeMcpServerDir() {
  const dir = makeTmpDir("fake-tasktracker-mcp-");
  fs.mkdirSync(path.join(dir, "lib"));
  fs.writeFileSync(path.join(dir, "lib", "load-env.js"), 'export function loadHookEnv() { process.env.FAKE_TT_ENV_LOADED = "yes"; return {}; }\n');
  fs.writeFileSync(
    path.join(dir, "lib", "mcp-client.js"),
    `import fs from "node:fs";
export async function withMcpClient(fn) {
  await new Promise((resolve) => setImmediate(resolve));
  const serverEnv = { ...process.env };
  if (process.env.FAKE_TT_SPAWN) fs.appendFileSync(process.env.FAKE_TT_SPAWN, JSON.stringify({ sessionId: serverEnv.CLAUDE_CODE_SESSION_ID ?? null }) + "\\n");
  if (process.env.FAKE_TT_SPAWN_FAIL) throw new Error("spawn ENOENT");
  return fn({});
}
export async function callToolOn(client, name, args) {
  fs.appendFileSync(process.env.FAKE_TT_CALLS, JSON.stringify({ name, args, envLoaded: process.env.FAKE_TT_ENV_LOADED ?? null, parentSessionId: process.env.CLAUDE_CODE_SESSION_ID ?? null }) + "\\n");
  const calls = fs.readFileSync(process.env.FAKE_TT_CALLS, "utf8").trim().split("\\n").length;
  if (process.env.FAKE_TT_HANG_ON_CALL === String(calls)) await new Promise((resolve) => setTimeout(resolve, 60_000));
  if (name === "${REATTRIBUTE}") return { examined: 0, upgraded: 0, corrected: 0, claimedBySession: 0 };
  const n = args.events.length;
  return { received: n, inserted: n, duplicates: 0, attributedToTask: n, attributedToProject: 0, unattributed: 0, unpriced: 0, costUsdInserted: 0 };
}
`,
  );
  return dir;
}

function cliSetup(fixtureDir = FIXTURE_TRANSCRIPTS) {
  const { transcriptsDir, logPath } = tmpTranscripts(fixtureDir);
  const usageDir = path.dirname(logPath);
  fs.mkdirSync(usageDir, { recursive: true });
  fs.writeFileSync(path.join(usageDir, "tasktracker.json"), JSON.stringify({ projectId: PROJECT_ID }));
  return { transcriptsDir, logPath, usageDir, args: ["--transcripts-dir", transcriptsDir, "--log", logPath] };
}

/** Runs the CLI as the acme.shop project; an empty TASKTRACKER_MCP_DIR counts as unset. */
function runProjectCli(args, env = {}) {
  return runCli(args, { env: { CLAUDE_PROJECT_DIR: PROJECT_DIR, TASKTRACKER_MCP_DIR: "", ...env } });
}

test("CLI --push-tasktracker ingests, then pushes through TASKTRACKER_MCP_DIR's own client with its hook env loaded", () => {
  const env = cliSetup();
  const callsPath = path.join(env.usageDir, "calls.jsonl");
  const { status, stdout, stderr } = runProjectCli(["--push-tasktracker", "--json", ...env.args], { TASKTRACKER_MCP_DIR: fakeMcpServerDir(), FAKE_TT_CALLS: callsPath });
  assert.equal(status, 0, stderr);
  const output = JSON.parse(stdout);
  assert.equal(output.ingest.appended, TOTALS.messages);
  assert.equal(output.pushTaskTracker.ingest.received, TOTALS.messages);
  const calls = readJsonl(callsPath);
  assert.deepEqual(calls.map((call) => call.name), [RECORD]);
  assert.equal(calls[0].args.projectHintId, PROJECT_ID);
  assert.equal(calls[0].envLoaded, "yes", "credentials are resolved the way TaskTracker's own hooks resolve them");
});

test("CLI: the TaskTracker server a push spawns runs as the reporter, never as the session, and every event keeps its own sessionId", () => {
  const env = cliSetup();
  const callsPath = path.join(env.usageDir, "calls.jsonl");
  const spawnPath = path.join(env.usageDir, "spawn.jsonl");
  const session = "0f1e2d3c-4b5a-4968-8776-655443322110";
  const { status, stderr } = runProjectCli(["--push-tasktracker", ...env.args], {
    CLAUDE_CODE_SESSION_ID: session,
    TASKTRACKER_MCP_DIR: fakeMcpServerDir(),
    FAKE_TT_CALLS: callsPath,
    FAKE_TT_SPAWN: spawnPath,
  });
  assert.equal(status, 0, stderr);
  // An inherited session id makes the server the session's own agent: it heartbeats the session's
  // active task and takes over its work lease.
  assert.deepEqual(readJsonl(spawnPath), [{ sessionId: REPORTER_SESSION_ID }]);
  const calls = readJsonl(callsPath);
  const events = calls.flatMap((call) => call.args.events);
  assert.equal(events.length, TOTALS.messages);
  assert.deepEqual([...new Set(events.map((event) => event.sessionId))].sort(), ["session-a", "session-b"]);
  assert.ok(
    calls.every((call) => call.parentSessionId === session),
    "the push process itself keeps the session's id",
  );
});

test("the reporter identity covers only the spawn: the parent's session id is back before the first call, after a failed spawn, and stays absent when it was", async () => {
  const keys = ["CLAUDE_CODE_SESSION_ID", "FAKE_TT_SPAWN", "FAKE_TT_SPAWN_FAIL", "FAKE_TT_ENV_LOADED"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const spawnPath = path.join(makeTmpDir(), "spawn.jsonl");
  try {
    process.env.FAKE_TT_SPAWN = spawnPath;
    const mcp = await loadTaskTrackerMcp(fakeMcpServerDir(), REPORTER_SESSION_ID);

    process.env.CLAUDE_CODE_SESSION_ID = "session-parent";
    let duringSession;
    await mcp.withMcpClient(async () => {
      duringSession = process.env.CLAUDE_CODE_SESSION_ID;
    });
    assert.equal(duringSession, "session-parent");
    assert.equal(process.env.CLAUDE_CODE_SESSION_ID, "session-parent");

    process.env.FAKE_TT_SPAWN_FAIL = "1";
    await assert.rejects(mcp.withMcpClient(async () => {}), /spawn ENOENT/);
    assert.equal(process.env.CLAUDE_CODE_SESSION_ID, "session-parent");
    delete process.env.FAKE_TT_SPAWN_FAIL;

    delete process.env.CLAUDE_CODE_SESSION_ID;
    await mcp.withMcpClient(async () => {});
    assert.equal("CLAUDE_CODE_SESSION_ID" in process.env, false, "an absent id is not restored as the string 'undefined'");

    assert.deepEqual(
      readJsonl(spawnPath).map((spawned) => spawned.sessionId),
      [REPORTER_SESSION_ID, REPORTER_SESSION_ID, REPORTER_SESSION_ID],
    );
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("CLI hook mode: an unreachable TaskTracker exits 0 silently, keeps the ingest and logs the failure", () => {
  const env = cliSetup();
  const missing = path.join(makeTmpDir(), "no-such-mcp-server");
  const { status, stdout } = runCli(["--ingest", "--push-tasktracker", "--quiet", ...env.args], { env: { TASKTRACKER_MCP_DIR: missing } });
  assert.equal(status, 0);
  assert.equal(stdout, "");
  assert.equal(readJsonl(env.logPath).length, TOTALS.messages);
  assert.match(fs.readFileSync(path.join(env.usageDir, "hook-errors.log"), "utf8"), /push-tasktracker: /);
});

test("the reporter's session id is derived from the project directory's name, so each project's reporter is its own", () => {
  assert.equal(reporterSessionId("/work/acme.shop"), "acme-shop-token-push");
  assert.equal(reporterSessionId("/home/someone/projects/Billing_API/"), "billing-api-token-push");
  assert.notEqual(reporterSessionId("/work/one"), reporterSessionId("/work/two"));
});

test("TaskTracker's mcp-server is TASKTRACKER_MCP_DIR, else tasktracker.json's mcpServerDir; with neither the push says how to set one", () => {
  assert.equal(resolveMcpDir({ TASKTRACKER_MCP_DIR: "/from/env" }, { mcpServerDir: "/from/config" }), "/from/env");
  assert.equal(resolveMcpDir({ TASKTRACKER_MCP_DIR: "" }, { mcpServerDir: "/from/config" }), "/from/config");
  assert.throws(() => resolveMcpDir({}, { projectId: PROJECT_ID }), /TASKTRACKER_MCP_DIR.*mcpServerDir/);
});

test("CLI: with no TASKTRACKER_MCP_DIR the push uses tasktracker.json's mcpServerDir, a relative one resolved beside the config", () => {
  const serverDir = fakeMcpServerDir();
  for (const relative of [false, true]) {
    const env = cliSetup();
    const mcpServerDir = relative ? path.relative(env.usageDir, serverDir) : serverDir;
    const callsPath = path.join(makeTmpDir(), "calls.jsonl");
    fs.writeFileSync(path.join(env.usageDir, "tasktracker.json"), JSON.stringify({ projectId: PROJECT_ID, mcpServerDir }));
    const { status, stderr } = runProjectCli(["--push-tasktracker", ...env.args], { FAKE_TT_CALLS: callsPath });
    assert.equal(status, 0, stderr);
    assert.equal(readJsonl(callsPath)[0].args.projectHintId, PROJECT_ID);
  }
});

test("CLI: the machine-local tasktracker.local.json supplies mcpServerDir, and wins over the committed tasktracker.json", () => {
  const env = cliSetup();
  const callsPath = path.join(makeTmpDir(), "calls.jsonl");
  fs.writeFileSync(path.join(env.usageDir, "tasktracker.json"), JSON.stringify({ projectId: PROJECT_ID, mcpServerDir: path.join(makeTmpDir(), "stale") }));
  fs.writeFileSync(path.join(env.usageDir, "tasktracker.local.json"), JSON.stringify({ mcpServerDir: fakeMcpServerDir() }));
  const { status, stderr } = runProjectCli(["--push-tasktracker", ...env.args], { FAKE_TT_CALLS: callsPath });
  assert.equal(status, 0, stderr);
  assert.equal(readJsonl(callsPath)[0].args.projectHintId, PROJECT_ID);
});

test("a tasktracker.local.json that is not {\"mcpServerDir\": \"<path>\"} sends nothing and is logged", async () => {
  for (const local of ["{ not json", JSON.stringify({ mcpServerDir: 7 }), JSON.stringify({ projectId: OTHER_PROJECT_ID })]) {
    const env = setup();
    fs.writeFileSync(path.join(env.usageDir, "tasktracker.local.json"), local);
    const fake = fakeMcp();
    const result = await env.push(fake);
    assert.match(result.failure, /tasktracker\.local\.json/);
    assert.equal(fake.sessions, 0);
  }
});

test("CLI: with no mcp-server configured, hook mode exits 0 and logs how to configure it; interactive mode fails", () => {
  const env = cliSetup();
  const hook = runProjectCli(["--ingest", "--push-tasktracker", "--quiet", ...env.args]);
  assert.equal(hook.status, 0);
  assert.equal(hook.stdout, "");
  assert.match(fs.readFileSync(path.join(env.usageDir, "hook-errors.log"), "utf8"), /TASKTRACKER_MCP_DIR.*mcpServerDir/);

  const interactive = runProjectCli(["--push-tasktracker", ...cliSetup().args]);
  assert.equal(interactive.status, 1);
  assert.match(interactive.stderr, /mcpServerDir/);
});

test("CLI interactive: a failed push is reported on stderr with a non-zero exit code", () => {
  const env = cliSetup();
  const { status, stderr } = runCli(["--push-tasktracker", ...env.args], { env: { TASKTRACKER_MCP_DIR: path.join(makeTmpDir(), "absent") } });
  assert.equal(status, 1);
  assert.match(stderr, /TaskTracker/);
});

test("CLI: --dry-run is only accepted together with --push-tasktracker", () => {
  const { status, stderr } = runCli(["--dry-run", "--transcripts-dir", FIXTURE_TRANSCRIPTS, "--log", path.join(makeTmpDir(), "log.jsonl")]);
  assert.equal(status, 1);
  assert.match(stderr, /--dry-run/);
});

test("two concurrent pushes open one MCP session: the other is skipped, and the stored offset never goes back", async () => {
  const env = setup(manyMessages(250));
  const seen = [];
  const fake = fakeMcp({ onCall: () => seen.push(env.watermark()) });
  const results = await Promise.all([env.push(fake), env.push(fake)]);
  assert.equal(fake.sessions, 1);
  const skipped = results.filter((result) => result.skipped);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].skipped, /another push/);
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b), "offsets only move forward");
  assert.equal(env.watermark(), fs.statSync(env.logPath).size);
});

test("the watermark is persisted after every acknowledged batch, before the next batch is sent", async () => {
  const env = setup(manyMessages(250));
  const seen = [];
  const fake = fakeMcp({ onCall: ({ name }) => name === RECORD && seen.push(env.watermark()) });
  await env.push(fake);
  const ends = lineEnds(env.logPath);
  assert.deepEqual(seen, [0, ends[99], ends[199]]);
  assert.equal(env.watermark(), ends[249]);
});

test("no batch starts after the deadline; the next push resumes with the next batch", async () => {
  const env = setup(manyMessages(500));
  const clock = fakeClock();
  const slow = fakeMcp({ onCall: () => clock.advance(40_000) });
  const first = await env.push(slow, { clock });
  const batchesInTime = Math.ceil(PUSH_DEADLINE_MS / 40_000);
  assert.equal(first.failure, undefined, "running out of time is not a failure");
  assert.equal(first.deadlineReached, true);
  assert.equal(sentIds(delivered(slow)).length, batchesInTime * 100);
  assert.equal(slow.calls.some((call) => call.name === REATTRIBUTE), false, "no sweep after the deadline");

  const next = fakeMcp();
  await env.push(next, { clock });
  const resumed = sentIds(delivered(next));
  assert.equal(resumed[0], `msg_M${String(batchesInTime * 100).padStart(4, "0")}`);
  assert.equal(new Set([...sentIds(delivered(slow)), ...resumed]).size, 500);
});

async function waitFor(condition, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test("CLI: a push killed mid-way resumes after its last acknowledged batch, and its abandoned lock does not block the next run", async () => {
  const env = cliSetup(manyMessages(250));
  const fakeDir = fakeMcpServerDir();
  const killedCalls = path.join(env.usageDir, "killed-calls.jsonl");
  const child = spawn(process.execPath, [CLI_PATH, "--push-tasktracker", "--quiet", ...env.args], {
    env: { ...process.env, TASKTRACKER_MCP_DIR: fakeDir, FAKE_TT_CALLS: killedCalls, FAKE_TT_HANG_ON_CALL: "3" },
    stdio: "ignore",
  });
  await waitFor(() => fs.existsSync(killedCalls) && readJsonl(killedCalls).length === 3);
  child.kill("SIGKILL");
  await once(child, "exit");
  assert.equal(fs.existsSync(path.join(env.usageDir, "push.lock")), true, "the killed run left its lock behind");
  const ends = lineEnds(env.logPath);
  assert.equal(JSON.parse(fs.readFileSync(path.join(env.usageDir, "tasktracker-push.json"), "utf8")).offset, ends[199]);

  const resumedCalls = path.join(env.usageDir, "resumed-calls.jsonl");
  const { status, stderr } = runCli(["--push-tasktracker", ...env.args], { env: { TASKTRACKER_MCP_DIR: fakeDir, FAKE_TT_CALLS: resumedCalls } });
  assert.equal(status, 0, stderr);
  const resent = readJsonl(resumedCalls).flatMap((call) => call.args.events.map((event) => event.messageId));
  assert.equal(resent.length, 50);
  assert.equal(resent[0], "msg_M0200");
});

test("after a failed push, pushes inside the backoff window are skipped, the skip is logged once, and pushing resumes after it", async () => {
  const env = setup();
  const clock = fakeClock();
  const throttled = fakeMcp({ fail: ({ name }) => (name === RECORD ? new Error("Error: Failed to obtain MCP JWT: ThrottlerException: Too Many Requests") : undefined) });
  assert.match((await env.push(throttled, { clock })).failure, /Throttler/);

  const probe = fakeMcp();
  clock.advance(10_000);
  const first = await env.push(probe, { clock });
  clock.advance(10_000);
  const second = await env.push(probe, { clock });
  assert.match(first.skipped, /backing off/);
  assert.match(second.skipped, /backing off/);
  assert.equal(probe.sessions, 0, "no MCP session while backing off");
  assert.equal(env.hookErrors().match(/backing off/g).length, 1, "the skip is logged once");

  clock.advance(PUSH_BACKOFF_MS);
  const recovered = await env.push(probe, { clock });
  assert.equal(recovered.failure, undefined);
  assert.equal(recovered.sent, TOTALS.messages);
});

test("an event TaskTracker rejects (HTTP 400) is isolated, skipped and logged with its messageId; everything else is delivered", async () => {
  const env = setup(manyMessages(250));
  const bad = "msg_M0137";
  const fake = fakeMcp({
    fail: ({ name, args }) =>
      name === RECORD && args.events.some((event) => event.messageId === bad) ? new Error("Error: TaskTracker API: events.37.usage.input_tokens must not be less than 0 (HTTP 400)") : undefined,
  });
  const result = await env.push(fake);
  assert.equal(result.failure, undefined);
  assert.deepEqual(result.rejected, [bad]);
  const ids = sentIds(delivered(fake));
  assert.equal(ids.length, 249);
  assert.equal(ids.includes(bad), false);
  assert.match(env.hookErrors(), new RegExp(`${bad}.*HTTP 400`));
  assert.equal(env.watermark(), fs.statSync(env.logPath).size);
  const again = fakeMcp();
  await env.push(again);
  assert.equal(again.sessions, 0, "a skipped event is not retried");
});

test("auth, throttling and timeouts are never blamed on an event; widespread rejections stop the push instead of skipping everything", async () => {
  for (const message of ["Error: TaskTracker API: Invalid API key (HTTP 401)", "Error: Failed to obtain MCP JWT: ThrottlerException: Too Many Requests", "Error: TaskTracker API: timeout of 60000ms exceeded"]) {
    const env = setup(manyMessages(20));
    const fake = fakeMcp({ fail: ({ name }) => (name === RECORD ? new Error(message) : undefined) });
    const result = await env.push(fake);
    assert.ok(result.failure, message);
    assert.deepEqual(result.rejected, [], message);
    assert.equal(fake.calls.length, 1, `${message}: no bisecting`);
    assert.equal(env.watermark(), 0, message);
  }

  const env = setup(manyMessages(20));
  const rejectAll = fakeMcp({ fail: ({ name }) => (name === RECORD ? new Error("Error: TaskTracker API: events must be an array (HTTP 400)") : undefined) });
  const result = await env.push(rejectAll);
  assert.match(result.failure, /rejected/);
  assert.equal(result.rejected.length, MAX_REJECTED_PER_PUSH);
  assert.equal(env.watermark(), lineEnds(env.logPath)[MAX_REJECTED_PER_PUSH - 1]);
});

test("a replaced log (different first line) is pushed again from the start; resends are idempotent", async () => {
  const env = setup();
  await env.push(fakeMcp());
  const oldSize = fs.statSync(env.logPath).size;
  fs.copyFileSync(setup(manyMessages(250)).logPath, env.logPath);
  assert.ok(fs.statSync(env.logPath).size > oldSize, "the new log is past the old offset");
  const fake = fakeMcp();
  await env.push(fake);
  assert.equal(new Set(sentIds(delivered(fake))).size, 250);
});

test("a watermark written by the previous version (offset only) is honoured", async () => {
  const env = setup();
  fs.writeFileSync(env.watermarkPath, JSON.stringify({ version: 1, offset: fs.statSync(env.logPath).size }));
  const fake = fakeMcp();
  const result = await env.push(fake);
  assert.equal(fake.sessions, 0);
  assert.equal(result.sent, 0);
});
