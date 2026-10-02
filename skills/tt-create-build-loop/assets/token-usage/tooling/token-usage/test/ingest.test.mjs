import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ingest } from "../src/ingest.mjs";
import { summarize } from "../src/summary.mjs";
import { loadPricing } from "../src/pricing.mjs";
import { PRICING_PATH, assertUsd, assistantLine, copyFixtureTranscripts, makeTmpDir, readJsonl, setActiveTaskBlock, toolResultLine } from "./helpers.mjs";
import { COST, TOTALS, BY_SESSION_COST } from "./expected.mjs";

const pricing = loadPricing(PRICING_PATH);

function setup() {
  const root = makeTmpDir();
  const transcriptsDir = copyFixtureTranscripts(path.join(root, "transcripts"));
  const usageDir = path.join(root, "usage");
  const logPath = path.join(usageDir, "token-usage.jsonl");
  const run = (now) => ingest({ transcriptsDir, logPath, pricing, ...(now ? { now } : {}) });
  return { root, transcriptsDir, usageDir, logPath, run };
}

// A hook can fire after a setActiveTask tool_use is written but before its tool_result.
// session-b has no task events in the fixture, so its attribution only depends on these lines.
const CALL_AT = Date.parse("2026-09-28T12:00:00.000Z");
const at = (secondsAfterCall) => new Date(CALL_AT + secondsAfterCall * 1000);
function appendPendingSetActiveTask(transcriptsDir) {
  fs.appendFileSync(
    path.join(transcriptsDir, "session-b.jsonl"),
    [
      assistantLine({ id: "msg_B3", sessionId: "session-b", ts: at(0).toISOString(), input: 1, output: 2, content: [setActiveTaskBlock("toolu_b_set", "task-9")] }),
      assistantLine({ id: "msg_B4", sessionId: "session-b", ts: at(10).toISOString(), input: 1, output: 3 }),
    ].join("\n") + "\n",
  );
}
function appendResult(transcriptsDir, isError) {
  fs.appendFileSync(
    path.join(transcriptsDir, "session-b.jsonl"),
    toolResultLine({ toolUseId: "toolu_b_set", sessionId: "session-b", ts: at(20).toISOString(), isError }) + "\n",
  );
}

const LOG_FIELDS = [
  "ts", "sessionId", "agent", "file", "messageId", "model", "speed",
  "inputTokens", "outputTokens", "cacheWrite5mTokens", "cacheWrite1hTokens", "cacheReadTokens",
  "costUsd", "taskId",
];

test("first ingest appends one deduplicated, attributed, priced record per message", () => {
  const { logPath, run } = setup();
  const result = run();
  assert.equal(result.appended, 16);

  const log = readJsonl(logPath);
  assert.equal(log.length, 16);
  for (const record of log) {
    // Every fixture line has a requestId (and none a service_tier); agent-x's meta.json has a
    // description (no name, no parent); agent-y has no meta.json.
    const fields = [...LOG_FIELDS, "requestId", ...(record.agent === "Explore" ? ["agentDescription"] : [])];
    assert.deepEqual(Object.keys(record).sort(), fields.sort());
  }

  const a3 = log.find((r) => r.messageId === "msg_A3");
  assert.equal(a3.taskId, "task-1");
  assert.equal(a3.agent, "main");
  assert.equal(a3.file, "session-a.jsonl");
  assert.equal(a3.sessionId, "session-a");
  assertUsd(a3.costUsd, COST.A3);

  const x1 = log.find((r) => r.messageId === "msg_X1");
  assert.equal(x1.agent, "Explore");
  assert.equal(x1.file, "session-a/subagents/agent-x.jsonl");
  assert.equal(x1.outputTokens, 70);
  assert.equal(x1.taskId, "task-1");
  assert.equal(x1.agentDescription, "fixture explorer");
  assert.equal(x1.requestId, "req_X1");
  assert.equal(log.find((r) => r.messageId === "req_B1").requestId, "req_B1", "a requestId-keyed message keeps its requestId too");

  const a5 = log.find((r) => r.messageId === "msg_A5");
  assert.equal(a5.costUsd, null);
  assert.equal(a5.taskId, null);
});

test("ingest stores per-transcript byte offsets in state.json next to the log", () => {
  const { transcriptsDir, usageDir, run } = setup();
  run();
  const state = JSON.parse(fs.readFileSync(path.join(usageDir, "state.json"), "utf8"));
  for (const file of ["session-a.jsonl", "session-b.jsonl", "session-a/subagents/agent-x.jsonl", "session-a/subagents/agent-y.jsonl"]) {
    assert.equal(state.files[file].offset, fs.statSync(path.join(transcriptsDir, file)).size, file);
  }
});

test("a second ingest with no new transcript bytes appends zero records and reads zero bytes", () => {
  const { logPath, run } = setup();
  run();
  const second = run();
  assert.equal(second.appended, 0);
  assert.equal(second.bytesRead, 0);
  assert.equal(readJsonl(logPath).length, 16);
});

test("appending new lines to a transcript appends only those messages, attributed via the persisted timeline", () => {
  const { transcriptsDir, logPath, run } = setup();
  run();
  const file = path.join(transcriptsDir, "session-a.jsonl");
  fs.appendFileSync(
    file,
    [
      assistantLine({ id: "msg_A12", ts: "2026-09-28T10:00:00.000Z", input: 1, output: 5 }),
      assistantLine({ id: "msg_A12", ts: "2026-09-28T10:00:01.000Z", input: 1, output: 9 }),
    ].join("\n") + "\n",
  );
  const result = run();
  assert.equal(result.appended, 1);
  const log = readJsonl(logPath);
  assert.equal(log.length, 17);
  const a12 = log.at(-1);
  assert.equal(a12.messageId, "msg_A12");
  assert.equal(a12.outputTokens, 9);
  assert.equal(a12.taskId, "task-2", "setActiveTask(task-2) was read in the previous run");
  assertUsd(a12.costUsd, (1 * 4 + 9 * 20) / 1e6);
});

test("a message re-logged with a larger output_tokens appends a new record; readers keep the max", () => {
  const { transcriptsDir, logPath, run } = setup();
  run();
  const file = path.join(transcriptsDir, "session-b.jsonl");
  const bLine = JSON.parse(fs.readFileSync(file, "utf8").split("\n")[1]);
  bLine.message.usage.output_tokens = 70; // same as already ingested -> nothing new
  fs.appendFileSync(file, JSON.stringify(bLine) + "\n");
  assert.equal(run().appended, 0);

  bLine.message.usage.output_tokens = 90; // larger -> new record
  fs.appendFileSync(file, JSON.stringify(bLine) + "\n");
  assert.equal(run().appended, 1);
  const b1 = readJsonl(logPath).filter((r) => r.messageId === "req_B1");
  assert.deepEqual(b1.map((r) => r.outputTokens), [70, 90]);

  const report = summarize({ transcriptsDir, logPath, pricing });
  assert.equal(report.totals.outputTokens, TOTALS.outputTokens + 20);
  assert.equal(report.messagesCounted, 16);
});

test("a partially written trailing line is left for the next run", () => {
  const { transcriptsDir, logPath, run } = setup();
  run();
  const file = path.join(transcriptsDir, "session-b.jsonl");
  const sizeBefore = fs.statSync(file).size;
  fs.appendFileSync(file, assistantLine({ id: "msg_B2", sessionId: "session-b", ts: "2026-09-28T09:40:00.000Z", input: 2, output: 3 }));
  assert.equal(run().appended, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(path.dirname(logPath), "state.json"), "utf8")).files["session-b.jsonl"].offset, sizeBefore);

  fs.appendFileSync(file, "\n");
  assert.equal(run().appended, 1);
  assert.equal(readJsonl(logPath).at(-1).messageId, "msg_B2");
});

test("losing state.json does not duplicate records: the log itself is the source of truth", () => {
  const { usageDir, logPath, run } = setup();
  run();
  fs.rmSync(path.join(usageDir, "state.json"));
  assert.equal(run().appended, 0);
  assert.equal(readJsonl(logPath).length, 16);
});

test("the summary unions the persisted log with live transcripts, so usage survives transcript cleanup", () => {
  const { transcriptsDir, logPath, run } = setup();
  run();
  fs.rmSync(path.join(transcriptsDir, "session-b.jsonl"));

  const withLog = summarize({ transcriptsDir, logPath, pricing });
  assert.equal(withLog.messagesCounted, 16);
  assert.equal(withLog.totals.totalTokens, TOTALS.totalTokens);
  assertUsd(withLog.totals.costUsd, TOTALS.costUsd);
  assertUsd(withLog.bySession["session-b"].costUsd, BY_SESSION_COST["session-b"]);

  const liveOnly = summarize({ transcriptsDir, logPath: null, pricing });
  assert.equal(liveOnly.messagesCounted, 15);
  assertUsd(liveOnly.totals.costUsd, BY_SESSION_COST["session-a"]);
});

test("records after a setActiveTask whose result has not arrived are deferred; an error result then leaves them unattributed", () => {
  const { transcriptsDir, logPath, run } = setup();
  run(at(-60));
  appendPendingSetActiveTask(transcriptsDir);

  const first = run(at(15));
  assert.equal(first.appended, 1, "msg_B3 (the call itself) is settled: the event only applies after it");
  assert.equal(first.deferred, 1, "msg_B4 waits for the tool result");
  assert.equal(readJsonl(logPath).at(-1).messageId, "msg_B3");

  appendResult(transcriptsDir, true);
  const second = run(at(25));
  assert.equal(second.appended, 1);
  assert.equal(second.deferred, 0);
  const b4 = readJsonl(logPath).filter((r) => r.messageId === "msg_B4");
  assert.equal(b4.length, 1);
  assert.equal(b4[0].taskId, null, "the failed setActiveTask must not attribute usage");
});

test("deferred records are attributed to the task once the setActiveTask result succeeds", () => {
  const { transcriptsDir, logPath, run } = setup();
  run(at(-60));
  appendPendingSetActiveTask(transcriptsDir);
  assert.equal(run(at(15)).deferred, 1);
  appendResult(transcriptsDir, false);
  assert.equal(run(at(25)).appended, 1);
  assert.equal(readJsonl(logPath).find((r) => r.messageId === "msg_B4").taskId, "task-9");
});

test("an unanswered setActiveTask is accepted after the timeout so usage is never held back forever", () => {
  const { transcriptsDir, logPath, run } = setup();
  run(at(-60));
  appendPendingSetActiveTask(transcriptsDir);
  assert.equal(run(at(15)).deferred, 1);
  const later = run(at(11 * 60));
  assert.equal(later.appended, 1);
  assert.equal(later.deferred, 0);
  assert.equal(readJsonl(logPath).find((r) => r.messageId === "msg_B4").taskId, "task-9");
});

test("log lines with an invalid timestamp or token counts are counted as malformed instead of crashing the summary", () => {
  const { transcriptsDir, logPath, run } = setup();
  run();
  const [good] = readJsonl(logPath);
  fs.appendFileSync(
    logPath,
    [
      JSON.stringify({ ...good, messageId: "bad-ts", ts: "not a date" }),
      JSON.stringify({ ...good, messageId: "bad-tokens", outputTokens: "many" }),
    ].join("\n") + "\n",
  );
  const report = summarize({ transcriptsDir, logPath, pricing });
  assert.equal(report.malformedLines, 1 + 2, "fixture malformed line + two bad log lines");
  assert.equal(report.messagesCounted, 16);
  assertUsd(report.totals.costUsd, TOTALS.costUsd);
});

test("sessions named like Object.prototype members are persisted and attributed like any other", () => {
  const root = makeTmpDir();
  const transcriptsDir = path.join(root, "transcripts");
  fs.mkdirSync(transcriptsDir);
  const logPath = path.join(root, "usage", "token-usage.jsonl");
  const sessions = [["constructor", "task-c"], ["__proto__", "task-p"], ["toString", "task-t"]];
  const line = (sessionId, n, ts, extra = {}) => assistantLine({ id: `msg_${sessions.findIndex(([id]) => id === sessionId)}_${n}`, sessionId, ts, input: 1, output: n, ...extra });
  for (const [sessionId, taskId] of sessions) {
    fs.writeFileSync(
      path.join(transcriptsDir, `${sessionId}.jsonl`),
      [
        line(sessionId, 1, "2026-09-28T10:00:00.000Z", { content: [setActiveTaskBlock(`toolu_${taskId}`, taskId)] }),
        toolResultLine({ toolUseId: `toolu_${taskId}`, sessionId, ts: "2026-09-28T10:00:01.000Z" }),
        line(sessionId, 2, "2026-09-28T10:01:00.000Z"),
      ].join("\n") + "\n",
    );
  }
  assert.equal(ingest({ transcriptsDir, logPath, pricing }).appended, 6);
  const state = JSON.parse(fs.readFileSync(path.join(root, "usage", "state.json"), "utf8"));
  assert.deepEqual(Object.keys(state.sessions).sort(), ["__proto__", "constructor", "toString"]);

  // The setActiveTask calls are now behind the stored offsets: only the persisted sessions know them.
  for (const [sessionId] of sessions) fs.appendFileSync(path.join(transcriptsDir, `${sessionId}.jsonl`), line(sessionId, 3, "2026-09-28T10:02:00.000Z") + "\n");
  assert.equal(ingest({ transcriptsDir, logPath, pricing }).appended, 3);
  const log = readJsonl(logPath);
  for (const [sessionId, taskId] of sessions) {
    assert.deepEqual(log.filter((record) => record.sessionId === sessionId).map((record) => record.taskId), [null, taskId, taskId], sessionId);
  }
});
