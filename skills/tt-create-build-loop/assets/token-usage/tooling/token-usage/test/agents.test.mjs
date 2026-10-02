import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { summarize } from "../src/summary.mjs";
import { ingest } from "../src/ingest.mjs";
import { loadTaskMap } from "../src/cli.mjs";
import { loadPricing } from "../src/pricing.mjs";
import { applyAgentTasks } from "../src/agents.mjs";
import { PRICING_PATH, TEST_DIR, makeTmpDir, outputsByTask, readJsonl, runCli, tmpTranscripts } from "./helpers.mjs";

// Fixture fixtures/agent-transcripts: session-c on 2026-09-28 (UTC). Output tokens are powers of
// two, so a bucket's outputTokens identifies exactly which messages it holds.
//   09:59:00  N0  agent-named (name p05-maths, agentType reviewer)      timeline: unattributed
//   10:00:00  C1  main, calls setActiveTask(task-main)                  timeline: unattributed
//   10:01:00  C2  main                                                  timeline: task-main
//   10:02:00  N1  agent-named (logged twice: output 10, then 16)        timeline: task-main
//   10:03:00  T1  agent-typed (agentType reviewer, "Review the maths")  timeline: task-main
//   10:04:00  D1  agent-described (general-purpose, "Write ADRs")       timeline: task-main
//   10:05:00  U1  agent-unmapped (Explore, "Look around")               timeline: task-main
//   10:10:00  C3  main                                                  timeline: task-main
const AGENT_TRANSCRIPTS = path.join(TEST_DIR, "fixtures", "agent-transcripts");
const OUT = { C1: 1, C2: 2, C3: 4, N0: 8, N1: 16, T1: 32, D1: 64, U1: 128 };
const MESSAGES = 8;
const ALL_MAPPED = { "p05-maths": "task-p05", reviewer: "task-review", "Write ADRs": "task-adr" };

const pricing = loadPricing(PRICING_PATH);
const NOW = new Date("2026-09-29T00:00:00.000Z");

function report({ agents, tasks = {}, transcriptsDir = AGENT_TRANSCRIPTS, logPath = null } = {}) {
  const taskMap = agents === undefined ? null : { ...tasks, agents };
  return summarize({ transcriptsDir, logPath, pricing, taskMap, now: NOW });
}

/** A private copy of the fixture with its usage already ingested into a log. */
function ingestedCopy() {
  const copy = tmpTranscripts(AGENT_TRANSCRIPTS);
  ingest({ transcriptsDir: copy.transcriptsDir, logPath: copy.logPath, pricing });
  return copy;
}

/** Deletes the whole session, as Claude Code's transcript cleanup does, leaving only the log. */
function cleanUpSession(transcriptsDir) {
  fs.rmSync(path.join(transcriptsDir, "session-c.jsonl"));
  fs.rmSync(path.join(transcriptsDir, "session-c"), { recursive: true });
}

/** Rewrites the log without the identity fields on lines `strip` selects, like lines logged before they existed. */
function stripLoggedIdentity(logPath, strip = () => true) {
  const lines = readJsonl(logPath).map((record) => {
    if (!strip(record)) return record;
    const { agentName: _name, agentDescription: _description, parentAgentId: _parent, ...older } = record;
    return older;
  });
  fs.writeFileSync(logPath, lines.map((record) => JSON.stringify(record) + "\n").join(""));
}

test("without an agents map, subagent usage follows the session timeline", () => {
  assert.deepEqual(outputsByTask(report()), {
    "task-main": OUT.C2 + OUT.N1 + OUT.T1 + OUT.D1 + OUT.U1 + OUT.C3,
    unattributed: OUT.C1 + OUT.N0,
  });
});

test("a subagent whose meta name is mapped is credited to the mapped task, overriding the timeline", () => {
  const r = report({ agents: { "p05-maths": "task-p05" } });
  assert.deepEqual(outputsByTask(r), {
    "task-p05": OUT.N0 + OUT.N1,
    "task-main": OUT.C2 + OUT.T1 + OUT.D1 + OUT.U1 + OUT.C3,
    unattributed: OUT.C1,
  });
  assert.equal(r.byTask["task-p05"].messages, 2, "N1's duplicate line is still one message");
});

test("a subagent is matched by agentType when its name is not mapped", () => {
  assert.deepEqual(outputsByTask(report({ agents: { reviewer: "task-review" } })), {
    "task-review": OUT.N0 + OUT.N1 + OUT.T1,
    "task-main": OUT.C2 + OUT.D1 + OUT.U1 + OUT.C3,
    unattributed: OUT.C1,
  });
});

test("a subagent is matched by description when neither its name nor its agentType is mapped", () => {
  assert.deepEqual(outputsByTask(report({ agents: { "Write ADRs": "task-adr" } })), {
    "task-adr": OUT.D1,
    "task-main": OUT.C2 + OUT.N1 + OUT.T1 + OUT.U1 + OUT.C3,
    unattributed: OUT.C1 + OUT.N0,
  });
});

test("name takes precedence over agentType, and agentType over description", () => {
  const agents = { "p05-maths": "task-p05", reviewer: "task-review", "Phase 05 maths core": "task-wrong", "Review the maths": "task-wrong" };
  assert.deepEqual(outputsByTask(report({ agents })), {
    "task-p05": OUT.N0 + OUT.N1,
    "task-review": OUT.T1,
    "task-main": OUT.C2 + OUT.D1 + OUT.U1 + OUT.C3,
    unattributed: OUT.C1,
  });
});

test("an unmapped subagent keeps its timeline attribution", () => {
  const r = report({ agents: ALL_MAPPED });
  assert.equal(r.byTask["task-main"].outputTokens, OUT.C2 + OUT.U1 + OUT.C3);
  assert.deepEqual(Object.keys(r.byTask["task-main"].byAgent).sort(), ["Explore", "main"]);
  assert.equal(r.byTask["task-main"].byAgent.Explore.outputTokens, OUT.U1);
});

test("main-session usage is never overridden, even when the agents map has a 'main' key", () => {
  const r = report({ agents: { main: "task-hijack", "p05-maths": "task-p05" } });
  assert.equal(r.byTask["task-hijack"], undefined);
  assert.equal(r.byTask["task-main"].byAgent.main.outputTokens, OUT.C2 + OUT.C3);
  assert.equal(r.unattributed.outputTokens, OUT.C1);
});

test("the agents key is not a task-map entry: it adds no phase, release or task", () => {
  const tasks = {
    "task-main": { phaseId: "phase-1", phaseTitle: "Phase 1", release: "R1" },
    "task-p05": { phaseId: "phase-5", phaseTitle: "Phase 5", release: "R2" },
  };
  const r = report({ tasks, agents: { "p05-maths": "task-p05" } });
  assert.deepEqual(Object.keys(r.byPhase).sort(), ["phase-1", "phase-5", "unattributed"]);
  assert.deepEqual(Object.keys(r.byRelease).sort(), ["R1", "R2", "unattributed"]);
  assert.equal(r.byTask.agents, undefined);
});

test("byPhase and byRelease roll up the overridden task", () => {
  const tasks = {
    "task-main": { phaseId: "phase-1", phaseTitle: "Phase 1", release: "R1" },
    "task-p05": { phaseId: "phase-5", phaseTitle: "Phase 5", release: "R2" },
  };
  const r = report({ tasks, agents: { "p05-maths": "task-p05" } });
  assert.equal(r.byPhase["phase-5"].outputTokens, OUT.N0 + OUT.N1);
  assert.deepEqual(r.byPhase["phase-5"].taskIds, ["task-p05"]);
  assert.equal(r.byPhase["phase-1"].outputTokens, OUT.C2 + OUT.T1 + OUT.D1 + OUT.U1 + OUT.C3);
  assert.equal(r.byRelease.R2.outputTokens, OUT.N0 + OUT.N1);
  assert.equal(r.byRelease.R1.outputTokens, OUT.C2 + OUT.T1 + OUT.D1 + OUT.U1 + OUT.C3);
  assert.equal(r.byPhase.unattributed.outputTokens, OUT.C1);
});

test("overrides only move attribution: totals are identical and every message is counted once", () => {
  const base = report();
  const mapped = report({ agents: ALL_MAPPED });
  assert.deepEqual(mapped.totals, base.totals);
  assert.equal(mapped.messagesCounted, MESSAGES);
  const buckets = [...Object.values(mapped.byTask), mapped.unattributed];
  assert.equal(buckets.reduce((sum, bucket) => sum + bucket.messages, 0), MESSAGES);
  assert.equal(buckets.reduce((sum, bucket) => sum + bucket.outputTokens, 0), mapped.totals.outputTokens);
});

test("retroactive: records already logged with their timeline task are re-attributed when a mapping is added later", () => {
  const { transcriptsDir, logPath } = ingestedCopy();
  const logged = readJsonl(logPath);
  assert.equal(logged.find((r) => r.messageId === "msg_N1").taskId, "task-main", "ingest stores the timeline task");
  assert.equal(logged.find((r) => r.messageId === "msg_N0").taskId, null);

  const r = report({ transcriptsDir, logPath, agents: { "p05-maths": "task-p05" } });
  assert.equal(r.byTask["task-p05"].outputTokens, OUT.N0 + OUT.N1);
  assert.equal(r.byTask["task-p05"].messages, 2);
  assert.deepEqual(readJsonl(logPath), logged, "a summary never rewrites the log");
});

test("retroactive after cleanup: log-only subagent records still match on their logged agent type, main records never", () => {
  const { transcriptsDir, logPath } = ingestedCopy();
  cleanUpSession(transcriptsDir);

  const r = report({ transcriptsDir, logPath, agents: { reviewer: "task-review", main: "task-hijack" } });
  assert.equal(r.messagesCounted, MESSAGES);
  assert.deepEqual(outputsByTask(r), {
    "task-review": OUT.N0 + OUT.N1 + OUT.T1,
    "task-main": OUT.C2 + OUT.D1 + OUT.U1 + OUT.C3,
    unattributed: OUT.C1,
  });
});

test("no double counting between the log and live transcripts when overrides apply", () => {
  const { transcriptsDir, logPath } = ingestedCopy();
  const withLog = report({ transcriptsDir, logPath, agents: ALL_MAPPED });
  const liveOnly = report({ transcriptsDir, agents: ALL_MAPPED });
  assert.equal(withLog.messagesCounted, MESSAGES);
  assert.deepEqual(withLog.totals, liveOnly.totals);
  assert.deepEqual(outputsByTask(withLog), outputsByTask(liveOnly));
  assert.deepEqual(outputsByTask(withLog), {
    "task-p05": OUT.N0 + OUT.N1,
    "task-review": OUT.T1,
    "task-adr": OUT.D1,
    "task-main": OUT.C2 + OUT.U1 + OUT.C3,
    unattributed: OUT.C1,
  });
});

test("CLI: --task-map with an agents object credits mapped subagents in the JSON report", () => {
  const root = makeTmpDir();
  const mapPath = path.join(root, "task-map.json");
  fs.writeFileSync(
    mapPath,
    JSON.stringify({ "task-p05": { phaseId: "phase-5", phaseTitle: "Phase 5", release: "R2" }, agents: { "p05-maths": "task-p05" } }),
  );
  const { status, stdout, stderr } = runCli(["--json", "--transcripts-dir", AGENT_TRANSCRIPTS, "--log", path.join(root, "absent.jsonl"), "--task-map", mapPath]);
  assert.equal(status, 0, stderr);
  const r = JSON.parse(stdout);
  assert.equal(r.byTask["task-p05"].outputTokens, OUT.N0 + OUT.N1);
  assert.equal(r.byPhase["phase-5"].outputTokens, OUT.N0 + OUT.N1);
});

test("a task map whose agents entry is not an object of task ids is rejected", () => {
  const root = makeTmpDir();
  let written = 0;
  const write = (value) => {
    written += 1;
    const mapPath = path.join(root, `map-${written}.json`);
    fs.writeFileSync(mapPath, JSON.stringify(value));
    return mapPath;
  };
  assert.throws(() => loadTaskMap(write({ agents: ["p05-maths"] })), /agents/);
  assert.throws(() => loadTaskMap(write({ agents: { "p05-maths": 5 } })), /agents/);
  assert.throws(() => loadTaskMap(write({ agents: { "p05-maths": "" } })), /agents/);
  assert.throws(() => loadTaskMap(write({ agents: { "": "task-p05" } })), /agents/, "an empty agent key can never match");
  assert.deepEqual(loadTaskMap(write({ agents: {} })), { agents: {} });
  assert.deepEqual(loadTaskMap(write({ agents: null })), { agents: null }, "null means no overrides");
});

test("ingest logs a subagent's meta name and description; main-session records carry neither", () => {
  const { logPath } = ingestedCopy();
  const log = readJsonl(logPath);
  const n1 = log.find((r) => r.messageId === "msg_N1");
  assert.equal(n1.agent, "reviewer");
  assert.equal(n1.agentName, "p05-maths");
  assert.equal(n1.agentDescription, "Phase 05 maths core");
  const t1 = log.find((r) => r.messageId === "msg_T1");
  assert.equal("agentName" in t1, false, "a subagent without a meta name logs none");
  assert.equal(t1.agentDescription, "Review the maths");
  const c2 = log.find((r) => r.messageId === "msg_C2");
  for (const field of ["agentName", "agentDescription", "parentAgentId"]) assert.equal(field in c2, false, field);
});

test("after cleanup, subagents mapped by name or description still match through their logged identity", () => {
  const { transcriptsDir, logPath } = ingestedCopy();
  cleanUpSession(transcriptsDir);
  const r = report({ transcriptsDir, logPath, agents: { "p05-maths": "task-p05", "Write ADRs": "task-adr" } });
  assert.equal(r.messagesCounted, MESSAGES);
  assert.deepEqual(outputsByTask(r), {
    "task-p05": OUT.N0 + OUT.N1,
    "task-adr": OUT.D1,
    "task-main": OUT.C2 + OUT.T1 + OUT.U1 + OUT.C3,
    unattributed: OUT.C1,
  });
});

test("old log lines without identity fields still work and fall back to their agent type", () => {
  const { transcriptsDir, logPath } = ingestedCopy();
  stripLoggedIdentity(logPath);
  cleanUpSession(transcriptsDir);
  const r = report({ transcriptsDir, logPath, agents: { "p05-maths": "task-p05", "Write ADRs": "task-adr", reviewer: "task-review" } });
  assert.deepEqual(outputsByTask(r), {
    "task-review": OUT.N0 + OUT.N1 + OUT.T1,
    "task-main": OUT.C2 + OUT.D1 + OUT.U1 + OUT.C3,
    unattributed: OUT.C1,
  });
});

test("one logged line carrying the identity identifies every logged line of that transcript", () => {
  const { transcriptsDir, logPath } = ingestedCopy();
  stripLoggedIdentity(logPath, (record) => record.messageId !== "msg_N1");
  cleanUpSession(transcriptsDir);
  const r = report({ transcriptsDir, logPath, agents: { "p05-maths": "task-p05" } });
  assert.equal(r.byTask["task-p05"].outputTokens, OUT.N0 + OUT.N1);
});

test("logged identities only move attribution: log-only totals match the live totals exactly", () => {
  const live = report();
  const { transcriptsDir, logPath } = ingestedCopy();
  cleanUpSession(transcriptsDir);
  const logOnly = report({ transcriptsDir, logPath, agents: ALL_MAPPED });
  assert.deepEqual(logOnly.totals, live.totals);
  assert.equal(logOnly.messagesCounted, MESSAGES);
});

test("a task map with agents: null behaves as one without overrides", () => {
  const r = summarize({ transcriptsDir: AGENT_TRANSCRIPTS, logPath: null, pricing, taskMap: { agents: null }, now: NOW });
  assert.deepEqual(outputsByTask(r), outputsByTask(report()));
  assert.deepEqual(r.byPhase, report({ agents: {} }).byPhase);
});

test("identity sources are only read when some agent is mapped", () => {
  const records = [{ file: "s/subagents/agent-a.jsonl", agent: "reviewer", taskId: "task-main" }];
  const unreadable = {
    [Symbol.iterator]() {
      throw new Error("identity sources were read");
    },
  };
  assert.equal(applyAgentTasks(records, {}, unreadable), records);
  assert.deepEqual(applyAgentTasks(records, { reviewer: "task-review" }, records), [{ ...records[0], taskId: "task-review" }]);
});
