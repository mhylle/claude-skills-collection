import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { summarize } from "../src/summary.mjs";
import { ingest } from "../src/ingest.mjs";
import { loadPricing } from "../src/pricing.mjs";
import { PRICING_PATH, TEST_DIR, outputsByTask, readJsonl, tmpTranscripts } from "./helpers.mjs";

// Fixture fixtures/nested-agent-transcripts: session-d on 2026-09-28 (UTC). Every nested subagent's
// meta.json names its spawner in parentAgentId; output tokens are powers of two.
//   10:00:00  M1  main, calls setActiveTask(task-main)                         timeline: unattributed
//   10:01:00  P1  aparent (name p05-maths, top level)                          timeline: task-main
//   10:02:00  K1  achild (code-reviewer "Review maths", parent aparent)        timeline: task-main
//   10:03:00  G1  agrandchild (Explore, parent achild)                         timeline: task-main
//   10:04:00  E1  aexplicit (name p07-sso, general-purpose, parent aparent)    timeline: task-main
//   10:05:00  O1  aorphan (Plan, parent agone, which has no transcript)        timeline: task-main
//   10:06:00  Y1  acycle1 (Explore "Cycle one", parent acycle2)                timeline: task-main
//   10:07:00  Y2  acycle2 (Explore "Cycle two", parent acycle1)                timeline: task-main
//   10:08:00  R1  areviewer (code-reviewer "Review SSO", top level)            timeline: task-main
//   10:09:00  X1  aexplicitchild (Explore "SSO lookup", parent aexplicit)      timeline: task-main
//   10:10:00  M2  main                                                         timeline: task-main
const NESTED_TRANSCRIPTS = path.join(TEST_DIR, "fixtures", "nested-agent-transcripts");
const OUT = { M1: 1, M2: 2, P1: 4, K1: 8, G1: 16, E1: 32, O1: 64, Y1: 128, Y2: 256, R1: 512, X1: 1024 };
const MESSAGES = 11;
const AGENTS = { "p05-maths": "task-p05", "p07-sso": "task-p07" };
const WITH_AGENTS = {
  "task-p05": OUT.P1 + OUT.K1 + OUT.G1,
  "task-p07": OUT.E1 + OUT.X1,
  "task-main": OUT.M2 + OUT.O1 + OUT.Y1 + OUT.Y2 + OUT.R1,
  unattributed: OUT.M1,
};

const pricing = loadPricing(PRICING_PATH);
const NOW = new Date("2026-09-29T00:00:00.000Z");

function report({ agents, transcriptsDir = NESTED_TRANSCRIPTS, logPath = null } = {}) {
  return summarize({ transcriptsDir, logPath, pricing, taskMap: agents === undefined ? null : { agents }, now: NOW });
}

/** A private copy of the fixture, ingested, then cleaned up so only the usage log remains. */
function logOnlyCopy() {
  const { transcriptsDir, logPath } = tmpTranscripts(NESTED_TRANSCRIPTS);
  ingest({ transcriptsDir, logPath, pricing });
  fs.rmSync(path.join(transcriptsDir, "session-d.jsonl"));
  fs.rmSync(path.join(transcriptsDir, "session-d"), { recursive: true });
  return { transcriptsDir, logPath };
}

test("a nested subagent inherits the task of its mapped ancestor, down to grandchildren", () => {
  const r = report({ agents: AGENTS });
  assert.deepEqual(outputsByTask(r), WITH_AGENTS);
  assert.deepEqual(Object.keys(r.byTask["task-p05"].byAgent).sort(), ["Explore", "feature-dev:code-reviewer", "p05-maths"]);
});

test("a subagent's own name beats its ancestor's mapping, and the nearest named ancestor beats a more distant one", () => {
  const r = report({ agents: AGENTS });
  // E1 is named p07-sso under p05-maths; X1 sits under p07-sso, which sits under p05-maths.
  assert.equal(r.byTask["task-p07"].outputTokens, OUT.E1 + OUT.X1);
  assert.equal(r.byTask["task-p05"].outputTokens, OUT.P1 + OUT.K1 + OUT.G1);
});

test("agentType is a last-resort key: a reviewer under a named, mapped teammate follows the teammate", () => {
  // Both K1 and R1 are feature-dev:code-reviewer, which is mapped to task-review; only K1 has a
  // named, mapped ancestor (p05-maths).
  const r = report({ agents: { ...AGENTS, "feature-dev:code-reviewer": "task-review" } });
  assert.equal(r.byTask["task-review"].outputTokens, OUT.R1, "the top-level reviewer goes to the type mapping");
  assert.equal(r.byTask["task-p05"].outputTokens, OUT.P1 + OUT.K1 + OUT.G1, "the nested reviewer goes to its teammate's task");
});

test("without a named mapping above it, a subagent inherits its ancestor's type or description mapping before its own type", () => {
  const byDescription = report({ agents: { "Review maths": "task-review" } });
  assert.equal(byDescription.byTask["task-review"].outputTokens, OUT.K1 + OUT.G1);

  // G1 is an Explore agent under a reviewer: its parent's resolved mapping comes before its own type.
  const byType = report({ agents: { "feature-dev:code-reviewer": "task-review", Explore: "task-explore" } });
  assert.equal(byType.byTask["task-review"].outputTokens, OUT.K1 + OUT.G1 + OUT.R1);
  assert.equal(byType.byTask["task-explore"].outputTokens, OUT.Y1 + OUT.Y2 + OUT.X1);
});

test("a missing parent ends the walk and the subagent falls back to its own agentType", () => {
  const r = report({ agents: { ...AGENTS, Plan: "task-plan" } });
  assert.equal(r.byTask["task-plan"].outputTokens, OUT.O1);
  assert.equal(report({ agents: AGENTS }).byTask["task-plan"], undefined);
});

test("a parentAgentId cycle terminates; a mapped member of the cycle still lends its task to the other", () => {
  assert.equal(report({ agents: AGENTS }).byTask["task-main"].outputTokens, OUT.M2 + OUT.O1 + OUT.Y1 + OUT.Y2 + OUT.R1);
  const r = report({ agents: { "Cycle two": "task-cycle" } });
  assert.equal(r.byTask["task-cycle"].outputTokens, OUT.Y1 + OUT.Y2);
});

test("main-session records are never overridden, whatever the agents map says", () => {
  const r = report({ agents: { ...AGENTS, main: "task-hijack" } });
  assert.equal(r.byTask["task-hijack"], undefined);
  assert.equal(r.byTask["task-main"].byAgent.main.outputTokens, OUT.M2);
  assert.equal(r.unattributed.outputTokens, OUT.M1);
});

test("ingest logs parentAgentId, so after cleanup nested subagents resolve from the log alone exactly as live", () => {
  const { transcriptsDir, logPath } = logOnlyCopy();
  const k1 = readJsonl(logPath).find((record) => record.messageId === "msg_K1");
  assert.equal(k1.parentAgentId, "aparent");
  for (const agents of [AGENTS, { ...AGENTS, "feature-dev:code-reviewer": "task-review" }, { "Cycle two": "task-cycle", Plan: "task-plan" }]) {
    const logOnly = report({ transcriptsDir, logPath, agents });
    assert.equal(logOnly.messagesCounted, MESSAGES);
    assert.deepEqual(outputsByTask(logOnly), outputsByTask(report({ agents })), JSON.stringify(agents));
  }
  assert.deepEqual(outputsByTask(report({ transcriptsDir, logPath, agents: AGENTS })), WITH_AGENTS);
});

test("old log lines without parentAgentId still work: after cleanup their subagents are resolved as top level", () => {
  const { transcriptsDir, logPath } = logOnlyCopy();
  const older = readJsonl(logPath).map(({ parentAgentId: _parent, ...record }) => record);
  fs.writeFileSync(logPath, older.map((record) => JSON.stringify(record) + "\n").join(""));
  const r = report({ transcriptsDir, logPath, agents: AGENTS });
  assert.equal(r.byTask["task-p05"].outputTokens, OUT.P1);
  assert.equal(r.byTask["task-p07"].outputTokens, OUT.E1);
  assert.equal(r.byTask["task-main"].outputTokens, OUT.M2 + OUT.K1 + OUT.G1 + OUT.O1 + OUT.Y1 + OUT.Y2 + OUT.R1 + OUT.X1);
});

test("inheritance only moves attribution: totals are identical with or without the map, live or log-only", () => {
  const base = report();
  const mapped = report({ agents: AGENTS });
  const logOnly = logOnlyCopy();
  const logOnlyMapped = report({ ...logOnly, agents: AGENTS });
  assert.deepEqual(mapped.totals, base.totals);
  assert.deepEqual(logOnlyMapped.totals, base.totals);
  for (const r of [base, mapped, logOnlyMapped]) {
    const buckets = [...Object.values(r.byTask), r.unattributed];
    assert.equal(r.messagesCounted, MESSAGES);
    assert.equal(buckets.reduce((sum, bucket) => sum + bucket.messages, 0), MESSAGES);
    assert.equal(buckets.reduce((sum, bucket) => sum + bucket.outputTokens, 0), r.totals.outputTokens);
  }
});
