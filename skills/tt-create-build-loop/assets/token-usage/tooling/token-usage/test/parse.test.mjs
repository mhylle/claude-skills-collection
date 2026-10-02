import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readLines, parseTranscriptLines } from "../src/parse.mjs";
import { FIXTURE_TRANSCRIPTS, makeTmpDir } from "./helpers.mjs";

test("readLines returns only newline-terminated lines and the byte offset after them", () => {
  const file = path.join(makeTmpDir(), "t.jsonl");
  fs.writeFileSync(file, "a\næø\npartial");
  const first = readLines(file, 0);
  assert.deepEqual(first.lines, ["a", "æø"]);
  assert.equal(first.endOffset, Buffer.byteLength("a\næø\n"));

  fs.appendFileSync(file, "-tail\n");
  const second = readLines(file, first.endOffset);
  assert.deepEqual(second.lines, ["partial-tail"]);
  assert.equal(second.endOffset, fs.statSync(file).size);
});

test("readLines at end of file returns nothing and keeps the offset", () => {
  const file = path.join(makeTmpDir(), "t.jsonl");
  fs.writeFileSync(file, "a\n");
  assert.deepEqual(readLines(file, 2), { lines: [], endOffset: 2 });
});

test("parseTranscriptLines extracts usage, task events, tool errors and counts malformed lines", () => {
  const { lines } = readLines(path.join(FIXTURE_TRANSCRIPTS, "session-a.jsonl"), 0);
  const parsed = parseTranscriptLines(lines);

  assert.equal(parsed.malformedLines, 1);
  assert.equal(parsed.usage.length, 13, "13 assistant lines carry usage (before dedup)");
  assert.deepEqual(parsed.erroredToolUseIds, ["toolu_set_err"]);
  assert.deepEqual(
    parsed.events.map(({ ts, taskId, toolUseId }) => ({ ts, taskId, toolUseId })),
    [
      { ts: "2026-09-27T10:01:00.000Z", taskId: "task-1", toolUseId: "toolu_set1" },
      { ts: "2026-09-27T10:03:00.000Z", taskId: null, toolUseId: "toolu_clr1" },
      { ts: "2026-09-27T10:05:00.000Z", taskId: "task-2", toolUseId: "toolu_set_err" },
      { ts: "2026-09-28T09:00:00.000Z", taskId: "task-2", toolUseId: "toolu_set2" },
    ],
  );

  const a1 = parsed.usage.filter((u) => u.messageId === "msg_A1");
  assert.deepEqual(
    a1.map((u) => u.outputTokens),
    [5, 50],
  );
  assert.deepEqual(a1[1], {
    ts: "2026-09-27T10:00:02.000Z",
    messageId: "msg_A1",
    requestId: "req_A1",
    model: "claude-opus-5-5",
    speed: "standard",
    inputTokens: 10,
    outputTokens: 50,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 2000,
    cacheReadTokens: 1000,
  });

  const fast = parsed.usage.find((u) => u.messageId === "msg_A10");
  assert.equal(fast.speed, "fast");
  assert.equal(fast.cacheWrite5mTokens, 500);

  const legacy = parsed.usage.find((u) => u.messageId === "msg_A11");
  assert.equal(legacy.cacheWrite5mTokens, 300, "cache_creation_input_tokens counts as 5m writes when cache_creation is absent");
  assert.equal(legacy.cacheWrite1hTokens, 0);
  assert.equal(legacy.speed, "standard", "missing speed means standard");
});

test("parseTranscriptLines falls back to requestId when message.id is missing", () => {
  const { lines } = readLines(path.join(FIXTURE_TRANSCRIPTS, "session-b.jsonl"), 0);
  const parsed = parseTranscriptLines(lines);
  assert.deepEqual(
    parsed.usage.map((u) => u.messageId),
    ["req_B1", "req_B1"],
  );
});

test("parseTranscriptLines skips blank lines without counting them as malformed", () => {
  const parsed = parseTranscriptLines(["", "   ", "not json"]);
  assert.equal(parsed.malformedLines, 1);
  assert.equal(parsed.usage.length, 0);
});
