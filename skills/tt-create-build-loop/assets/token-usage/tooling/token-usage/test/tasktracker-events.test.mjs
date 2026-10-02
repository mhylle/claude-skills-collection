import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ingest } from "../src/ingest.mjs";
import { readUsageLog } from "../src/log.mjs";
import { dedupeUsage } from "../src/dedupe.mjs";
import { loadPricing } from "../src/pricing.mjs";
import { toTaskTrackerEvent } from "../src/tasktracker-events.mjs";
import { FIXTURE_TRANSCRIPTS, PRICING_PATH, TEST_DIR, tmpTranscripts } from "./helpers.mjs";

// fixtures/wire-transcripts copies the shape of real Claude Code lines: main-session W1 (1h cache
// write, speed standard) and W2 (fast), subagent agent-aw1's S1 (speed standard) and S2 (no speed).
const WIRE_TRANSCRIPTS = path.join(TEST_DIR, "fixtures", "wire-transcripts");
// What TaskTracker's own extractor produced for both fixtures, vendored so the contract is checked
// even without a TaskTracker checkout (it records the TaskTracker commit it came from).
const GOLDEN = JSON.parse(fs.readFileSync(path.join(TEST_DIR, "fixtures", "tasktracker-golden.json"), "utf8"));
// The live check needs a TaskTracker checkout: TASKTRACKER_MCP_DIR=<its mcp-server> node --test ...
const TRANSCRIPT_USAGE = process.env.TASKTRACKER_MCP_DIR ? path.join(process.env.TASKTRACKER_MCP_DIR, "lib", "transcript-usage.js") : null;
const needsTaskTracker = {
  skip: TRANSCRIPT_USAGE && fs.existsSync(TRANSCRIPT_USAGE) ? false : `set TASKTRACKER_MCP_DIR to TaskTracker's mcp-server to check its live extractor`,
};

const pricing = loadPricing(PRICING_PATH);

/** Our events for a fixture, built as a push builds them: ingested into a log, then converted. */
function ourEvents(fixtureDir) {
  const { transcriptsDir, logPath } = tmpTranscripts(fixtureDir);
  ingest({ transcriptsDir, logPath, pricing });
  const events = dedupeUsage(readUsageLog(logPath).records).map(toTaskTrackerEvent).filter(Boolean);
  return new Map(events.map((event) => [event.messageId, event]));
}

/** TaskTracker's events for a fixture, from the vendored golden file. */
function goldenEvents(fixtureName) {
  return new Map(GOLDEN.fixtures[fixtureName].map((event) => [event.messageId, event]));
}

/** TaskTracker's events for a fixture from its live extractor, as its reporter sends them (cwd stripped). */
async function liveEvents(fixtureName) {
  const { extractUsageEvents } = await import(pathToFileURL(TRANSCRIPT_USAGE).href);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
  return walk(path.join(TEST_DIR, "fixtures", fixtureName))
    .filter((file) => file.endsWith(".jsonl"))
    .flatMap((file) => extractUsageEvents(fs.readFileSync(file, "utf8")))
    .map(({ cwd: _cwd, ...event }) => event)
    .sort((a, b) => (a.messageId < b.messageId ? -1 : 1));
}

test("each event equals what TaskTracker's extractor produces for the same real-shaped line", () => {
  const ours = ourEvents(WIRE_TRANSCRIPTS);
  const theirs = goldenEvents("wire-transcripts");
  for (const messageId of ["msg_W1", "msg_W2", "msg_S1"]) {
    const { agentId: _agentId, ...shared } = ours.get(messageId);
    assert.deepEqual(shared, theirs.get(messageId), messageId);
  }
  assert.equal(ours.get("msg_S1").agentId, "aw1", "a subagent event also names its agent");
  assert.equal("agentId" in ours.get("msg_W1"), false);
});

test("a line without speed differs only by an explicit speed 'standard', which TaskTracker prices identically", () => {
  const theirs = goldenEvents("wire-transcripts").get("msg_S2");
  assert.equal("speed" in theirs.usage, false);
  const { agentId: _agentId, ...shared } = ourEvents(WIRE_TRANSCRIPTS).get("msg_S2");
  // TaskTracker's cost calculator only treats speed === "fast" specially.
  assert.deepEqual(shared, { ...theirs, usage: { ...theirs.usage, speed: "standard" } });
});

test("message ids equal TaskTracker's dedupe keys, including its req: fallback, so an already-reported message is a duplicate", () => {
  const ours = ourEvents(FIXTURE_TRANSCRIPTS);
  assert.deepEqual([...ours.keys()].sort(), [...goldenEvents("transcripts").keys()].sort());
  assert.ok(ours.has("req:req_B1"), "session-b's message has no message.id");
  assert.equal(ours.get("req:req_B1").requestId, "req_B1");
});

test("the vendored golden events still match TaskTracker's live extractor", needsTaskTracker, async () => {
  for (const fixtureName of Object.keys(GOLDEN.fixtures)) {
    assert.deepEqual(await liveEvents(fixtureName), GOLDEN.fixtures[fixtureName], `${fixtureName}: regenerate tasktracker-golden.json (was from ${GOLDEN.tasktrackerCommit})`);
  }
});

test("usage is rebuilt in Anthropic's wire shape; a legacy total without a TTL split is sent as 5-minute writes", () => {
  const ours = ourEvents(FIXTURE_TRANSCRIPTS);
  assert.deepEqual(ours.get("msg_A10").usage, {
    input_tokens: 100,
    output_tokens: 1000,
    cache_creation_input_tokens: 500,
    cache_read_input_tokens: 10000,
    cache_creation: { ephemeral_5m_input_tokens: 500, ephemeral_1h_input_tokens: 0 },
    speed: "fast",
  });
  assert.deepEqual(ours.get("msg_A11").usage.cache_creation, { ephemeral_5m_input_tokens: 300, ephemeral_1h_input_tokens: 0 });
  assert.equal(ours.get("msg_A11").usage.cache_creation_input_tokens, 300);
});

test("subagent records are sidechain events carrying their agentId; main-session records are neither", () => {
  const ours = ourEvents(FIXTURE_TRANSCRIPTS);
  assert.equal(ours.get("msg_X1").isSidechain, true);
  assert.equal(ours.get("msg_X1").agentId, "x");
  assert.equal(ours.get("msg_X1").sessionId, "session-a");
  assert.equal(ours.get("msg_Y1").agentId, "y", "agent-y has no meta.json but is still a subagent");
  assert.equal(ours.get("msg_A3").isSidechain, false);
  assert.equal("agentId" in ours.get("msg_A3"), false);
});

test("a message logged twice is sent once, with its final (largest) output count and its first timestamp", () => {
  const a1 = ourEvents(FIXTURE_TRANSCRIPTS).get("msg_A1");
  assert.equal(a1.usage.output_tokens, 50);
  assert.equal(a1.occurredAt, "2026-09-27T10:00:01.000Z");
});

test("a record without a model is not sent, because TaskTracker rejects the whole batch without one", () => {
  const record = { ts: "2026-09-28T10:00:00.000Z", sessionId: "s", agent: "main", file: "s.jsonl", messageId: "msg_1", model: undefined, speed: "standard", inputTokens: 1, outputTokens: 1, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, cacheReadTokens: 0 };
  assert.equal(toTaskTrackerEvent(record), null);
  assert.equal(toTaskTrackerEvent({ ...record, model: "claude-opus-5-5" }).messageId, "msg_1");
});
