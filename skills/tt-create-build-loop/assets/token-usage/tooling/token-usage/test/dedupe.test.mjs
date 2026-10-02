import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeUsage } from "../src/dedupe.mjs";

const base = { model: "claude-opus-5-5", speed: "standard", inputTokens: 1, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, cacheReadTokens: 0 };

test("dedupeUsage keeps the largest output_tokens and the earliest timestamp per (file, messageId)", () => {
  const records = [
    { ...base, file: "a.jsonl", messageId: "m1", ts: "2026-09-27T10:00:02.000Z", outputTokens: 5 },
    { ...base, file: "a.jsonl", messageId: "m1", ts: "2026-09-27T10:00:01.000Z", outputTokens: 50 },
    { ...base, file: "a.jsonl", messageId: "m1", ts: "2026-09-27T10:00:03.000Z", outputTokens: 20 },
  ];
  const result = dedupeUsage(records);
  assert.equal(result.length, 1);
  assert.equal(result[0].outputTokens, 50);
  assert.equal(result[0].ts, "2026-09-27T10:00:01.000Z");
});

test("dedupeUsage treats the same messageId in different files as different messages", () => {
  const records = [
    { ...base, file: "a.jsonl", messageId: "m1", ts: "2026-09-27T10:00:00.000Z", outputTokens: 5 },
    { ...base, file: "b.jsonl", messageId: "m1", ts: "2026-09-27T10:00:00.000Z", outputTokens: 5 },
  ];
  assert.equal(dedupeUsage(records).length, 2);
});

test("dedupeUsage does not mutate its input", () => {
  const records = [
    { ...base, file: "a.jsonl", messageId: "m1", ts: "2026-09-27T10:00:02.000Z", outputTokens: 50 },
    { ...base, file: "a.jsonl", messageId: "m1", ts: "2026-09-27T10:00:01.000Z", outputTokens: 5 },
  ];
  const snapshot = structuredClone(records);
  dedupeUsage(records);
  assert.deepEqual(records, snapshot);
});
