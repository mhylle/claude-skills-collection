import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { summarize } from "../src/summary.mjs";
import { buildReport } from "../src/aggregate.mjs";
import { loadPricing } from "../src/pricing.mjs";
import { FIXTURE_TRANSCRIPTS, PRICING_PATH, assertUsd, makeTmpDir } from "./helpers.mjs";
import { TOTALS, BY_TASK, UNATTRIBUTED, BY_DAY, BY_MODEL_COST, BY_SESSION_COST, COST } from "./expected.mjs";

const pricing = loadPricing(PRICING_PATH);
const NOW = new Date("2026-09-29T00:00:00.000Z");
const TOKEN_FIELDS = ["inputTokens", "outputTokens", "cacheWrite5mTokens", "cacheWrite1hTokens", "cacheReadTokens", "totalTokens"];

function fixtureReport(options = {}) {
  return summarize({ transcriptsDir: FIXTURE_TRANSCRIPTS, logPath: null, pricing, now: NOW, ...options });
}

function assertBucket(actual, expected, label) {
  for (const field of TOKEN_FIELDS) {
    if (field in expected) assert.equal(actual[field], expected[field], `${label}.${field}`);
  }
  if ("messages" in expected) assert.equal(actual.messages, expected.messages, `${label}.messages`);
  if ("unpricedMessages" in expected) assert.equal(actual.unpricedMessages, expected.unpricedMessages, `${label}.unpricedMessages`);
  assertUsd(actual.costUsd, expected.costUsd, `${label}.costUsd`);
}

test("report header carries generation time, pricing provenance and the billing note", () => {
  const report = fixtureReport();
  assert.equal(report.generatedAt, "2026-09-29T00:00:00.000Z");
  assert.deepEqual(report.pricing, { source: "claude-api skill model table, cached 2026-09-25", updated: pricing.updated });
  assert.equal(report.note, "API-equivalent list price; subscription billing differs");
});

test("totals are exact after deduplicating per-block usage lines", () => {
  const report = fixtureReport();
  assertBucket(report.totals, TOTALS, "totals");
  assert.equal(report.messagesCounted, 16);
  assert.equal(report.malformedLines, 1);
  assert.deepEqual(report.unknownModels, ["claude-mystery-9"]);
});

test("DISTRACTOR: naively summing every usage line does not reproduce the expected totals", () => {
  // A naive reader: every assistant line with usage is counted, no dedup.
  const naive = { outputTokens: 0, inputTokens: 0, cacheReadTokens: 0 };
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".jsonl") ? [path.join(dir, e.name)] : []));
  for (const file of walk(FIXTURE_TRANSCRIPTS)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const usage = entry?.message?.usage;
      if (entry.type !== "assistant" || !usage) continue;
      naive.outputTokens += usage.output_tokens;
      naive.inputTokens += usage.input_tokens;
      naive.cacheReadTokens += usage.cache_read_input_tokens;
    }
  }
  // Duplicates: A1 (+10 in, +5 out, +1000 read), A3 (+3, +200, +4000), X1 (+50, +60), B1 (+7, +35, +700)
  assert.equal(naive.outputTokens, TOTALS.outputTokens + 5 + 200 + 60 + 35);
  assert.equal(naive.inputTokens, TOTALS.inputTokens + 10 + 3 + 50 + 7);
  assert.equal(naive.cacheReadTokens, TOTALS.cacheReadTokens + 1000 + 4000 + 700);
  assert.notEqual(naive.outputTokens, TOTALS.outputTokens);

  const report = fixtureReport();
  assert.equal(report.totals.outputTokens, TOTALS.outputTokens);
  assert.notEqual(report.totals.outputTokens, naive.outputTokens);
});

test("usage is attributed to the task active in its session at the message timestamp", () => {
  const report = fixtureReport();
  assert.deepEqual(Object.keys(report.byTask).sort(), ["phase-a", "task-1", "task-2"]);
  for (const [taskId, expected] of Object.entries(BY_TASK)) {
    assertBucket(report.byTask[taskId], expected, `byTask[${taskId}]`);
  }
  const task1 = report.byTask["task-1"];
  assert.equal(task1.firstSeen, BY_TASK["task-1"].firstSeen);
  assert.equal(task1.lastSeen, BY_TASK["task-1"].lastSeen);
  assert.equal(report.byTask["phase-a"].firstSeen, BY_TASK["phase-a"].firstSeen);
  assert.equal(report.byTask["phase-a"].lastSeen, BY_TASK["phase-a"].lastSeen);
});

test("per-task breakdowns by agent and by model", () => {
  const report = fixtureReport();
  const task1 = report.byTask["task-1"];
  assert.deepEqual(Object.keys(task1.byAgent).sort(), ["Explore", "main"]);
  assertUsd(task1.byAgent.main.costUsd, BY_TASK["task-1"].byAgentCost.main);
  assertUsd(task1.byAgent.Explore.costUsd, BY_TASK["task-1"].byAgentCost.Explore);
  assertUsd(task1.byModel["claude-opus-5-5"].costUsd, BY_TASK["task-1"].byModelCost["claude-opus-5-5"]);
  assertUsd(task1.byModel["claude-haiku-4-5"].costUsd, BY_TASK["task-1"].byModelCost["claude-haiku-4-5"]);

  const task2 = report.byTask["task-2"];
  assertUsd(task2.byAgent.main.costUsd, BY_TASK["task-2"].byAgentCost.main);
  assertUsd(task2.byAgent.subagent.costUsd, BY_TASK["task-2"].byAgentCost.subagent);
});

test("usage with no active task lands in the unattributed bucket", () => {
  const report = fixtureReport();
  assertBucket(report.unattributed, UNATTRIBUTED, "unattributed");
});

test("byTask + unattributed reconcile with totals", () => {
  const report = fixtureReport();
  const buckets = [...Object.values(report.byTask), report.unattributed];
  const sum = (field) => buckets.reduce((acc, b) => acc + b[field], 0);
  for (const field of TOKEN_FIELDS) assert.equal(sum(field), report.totals[field], field);
  assertUsd(sum("costUsd"), TOTALS.costUsd);
});

test("byDay groups by UTC date of the message", () => {
  const report = fixtureReport();
  assert.deepEqual(Object.keys(report.byDay), ["2026-09-27", "2026-09-28"]);
  for (const [day, expected] of Object.entries(BY_DAY)) assertBucket(report.byDay[day], expected, `byDay[${day}]`);
});

test("byModel and bySession roll-ups", () => {
  const report = fixtureReport();
  for (const [model, cost] of Object.entries(BY_MODEL_COST)) assertUsd(report.byModel[model].costUsd, cost, model);
  assert.equal(report.byModel["claude-mystery-9"].costUsd, null, "a bucket with only unpriced messages has no cost");
  assert.equal(report.byModel["claude-mystery-9"].unpricedMessages, 1);
  for (const [session, cost] of Object.entries(BY_SESSION_COST)) assertUsd(report.bySession[session].costUsd, cost, session);
});

test("fast-mode message is priced at fast rates", () => {
  const report = fixtureReport();
  // task-2 = A10 (fast) + A11 + Y1; pricing A10 at standard rates would give a different number.
  const a10AtStandard = (100 * 4 + 1000 * 20 + 10000 * 0.2 + 500 * 5) / 1e6;
  assert.notEqual(Math.round(a10AtStandard * 1e6), Math.round(COST.A10 * 1e6));
  assertUsd(report.byTask["task-2"].costUsd, COST.A10 + COST.A11 + COST.Y1);
});

test("without a task map there are no phase or release roll-ups", () => {
  const report = fixtureReport();
  assert.equal(report.byPhase, undefined);
  assert.equal(report.byRelease, undefined);
});

test("a task map adds byPhase and byRelease; a phase task maps to itself", () => {
  const taskMap = {
    "task-1": { phaseId: "phase-a", phaseTitle: "Phase A", release: "R1" },
    "task-2": { phaseId: "phase-b", phaseTitle: "Phase B", release: "R2" },
  };
  const report = fixtureReport({ taskMap });
  assert.deepEqual(Object.keys(report.byPhase).sort(), ["phase-a", "phase-b", "unattributed"]);
  assertUsd(report.byPhase["phase-a"].costUsd, BY_TASK["task-1"].costUsd + BY_TASK["phase-a"].costUsd);
  assert.equal(report.byPhase["phase-a"].phaseTitle, "Phase A");
  assert.equal(report.byPhase["phase-a"].release, "R1");
  assert.deepEqual(report.byPhase["phase-a"].taskIds, ["phase-a", "task-1"]);
  assertUsd(report.byPhase["phase-b"].costUsd, BY_TASK["task-2"].costUsd);
  assertUsd(report.byPhase.unattributed.costUsd, UNATTRIBUTED.costUsd);

  assert.deepEqual(Object.keys(report.byRelease).sort(), ["R1", "R2", "unattributed"]);
  assertUsd(report.byRelease.R1.costUsd, BY_TASK["task-1"].costUsd + BY_TASK["phase-a"].costUsd);
  assertUsd(report.byRelease.R2.costUsd, BY_TASK["task-2"].costUsd);
});

test("tasks missing from the task map roll up under 'unmapped'", () => {
  const taskMap = { "task-1": { phaseId: "phase-a", phaseTitle: "Phase A", release: "R1" } };
  const report = fixtureReport({ taskMap });
  assertUsd(report.byPhase.unmapped.costUsd, BY_TASK["task-2"].costUsd);
  assertUsd(report.byRelease.unmapped.costUsd, BY_TASK["task-2"].costUsd);
  assertUsd(report.byPhase["phase-a"].costUsd, BY_TASK["task-1"].costUsd + BY_TASK["phase-a"].costUsd);
});

test("a missing log file is treated as an empty log", () => {
  const report = fixtureReport({ logPath: path.join(makeTmpDir(), "absent.jsonl") });
  assertBucket(report.totals, TOTALS, "totals");
});

test("task ids named after Object.prototype members resolve only through the task map's own entries", () => {
  const record = (messageId, taskId, outputTokens) => ({
    ts: "2026-09-28T10:00:00.000Z", sessionId: "s", agent: "main", file: "s.jsonl", messageId, model: "claude-opus-5-5", speed: "standard",
    inputTokens: 0, outputTokens, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, cacheReadTokens: 0, taskId,
  });
  // Parsed like loadTaskMap does, so "__proto__" is an own entry rather than the prototype setter.
  const taskMap = JSON.parse(
    '{"task-1": {"phaseId": "constructor", "phaseTitle": "Ctor phase", "release": "R1"}, "__proto__": {"phaseId": "phase-p", "phaseTitle": "Proto phase", "release": "R2"}}',
  );
  const records = [record("m1", "constructor", 1), record("m2", "task-1", 2), record("m3", "__proto__", 4), record("m4", "toString", 8)];
  const report = buildReport(records, { pricing, taskMap, now: NOW });

  assert.deepEqual(Object.keys(report.byPhase).sort(), ["constructor", "phase-p", "unmapped"]);
  assert.equal(report.byPhase.constructor.outputTokens, 1 + 2, "a phase task maps to itself, not to Object");
  assert.equal(report.byPhase.constructor.phaseTitle, "Ctor phase");
  assert.equal(report.byPhase.constructor.release, "R1");
  assert.deepEqual(report.byPhase.constructor.taskIds, ["constructor", "task-1"]);
  assert.equal(report.byPhase["phase-p"].outputTokens, 4);
  assert.equal(report.byPhase.unmapped.outputTokens, 8);
  assert.deepEqual({ R1: report.byRelease.R1.outputTokens, R2: report.byRelease.R2.outputTokens, unmapped: report.byRelease.unmapped.outputTokens }, { R1: 3, R2: 4, unmapped: 8 });
});
