import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPricing, costOf } from "../src/pricing.mjs";
import { buildReport } from "../src/aggregate.mjs";
import { PRICING_PATH, assertUsd } from "./helpers.mjs";

const pricing = loadPricing(PRICING_PATH);

const tokens = (overrides) => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 0,
  cacheReadTokens: 0,
  speed: "standard",
  ...overrides,
});

test("scripts/pricing.json carries its source and update date", () => {
  assert.equal(pricing.source, "claude-api skill model table, cached 2026-09-25");
  assert.equal(typeof pricing.updated, "string");
});

test("scripts/pricing.json has the agreed USD-per-million rates", () => {
  const rates = (model) => {
    const { input, output, cacheWrite5m, cacheWrite1h, cacheRead } = pricing.models[model];
    return [input, output, cacheWrite5m, cacheWrite1h, cacheRead];
  };
  assert.deepEqual(rates("claude-opus-5-5"), [4.0, 20.0, 5.0, 8.0, 0.2]);
  assert.deepEqual(rates("claude-sonnet-5-5"), [2.0, 10.0, 2.5, 4.0, 0.2]);
  assert.deepEqual(rates("claude-fable-5-1"), [10.0, 50.0, 12.5, 20.0, 0.25]);
  assert.deepEqual(rates("claude-haiku-4-5"), [1.0, 5.0, 1.25, 2.0, 0.1]);

  const fast = pricing.models["claude-opus-5-5"].fast;
  assert.deepEqual([fast.input, fast.output, fast.cacheWrite5m, fast.cacheWrite1h, fast.cacheRead], [8.0, 40.0, 10.0, 16.0, 0.4]);
  assert.equal(fast.verified, false, "fast-mode cache rates are an unverified 2x assumption");
});

test("costOf prices every token class", () => {
  const record = tokens({ model: "claude-opus-5-5", inputTokens: 1_000_000, outputTokens: 1_000_000, cacheWrite5mTokens: 1_000_000, cacheWrite1hTokens: 1_000_000, cacheReadTokens: 1_000_000 });
  assertUsd(costOf(record, pricing), 4 + 20 + 5 + 8 + 0.2);
});

test("costOf uses fast-mode rates for speed=fast", () => {
  const record = tokens({ model: "claude-opus-5-5", speed: "fast", inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000 });
  assertUsd(costOf(record, pricing), 8 + 40 + 0.4);
});

test("costOf never guesses: unknown models and unpriced fast mode return null", () => {
  assert.equal(costOf(tokens({ model: "claude-mystery-9", inputTokens: 10 }), pricing), null);
  assert.equal(costOf(tokens({ model: "claude-sonnet-5-5", speed: "fast", inputTokens: 10 }), pricing), null);
  assert.equal(costOf(tokens({ model: undefined, inputTokens: 10 }), pricing), null);
});

test("costOf resolves explicitly listed model aliases such as dated snapshot ids", () => {
  const record = tokens({ model: "claude-haiku-4-5-20251001", inputTokens: 1_000_000 });
  assertUsd(costOf(record, pricing), 1.0);
});

test("an incomplete pricing entry is treated as unpriced (null cost, listed as unknown) instead of producing NaN", () => {
  const partial = { ...pricing, models: { ...pricing.models, "claude-partial": { input: 1, output: 5, cacheWrite5m: 1.25, cacheWrite1h: 2 } } };
  const record = tokens({ model: "claude-partial", inputTokens: 10, cacheReadTokens: 10 });
  assert.equal(costOf(record, partial), null);

  const report = buildReport([{ ...record, ts: "2026-09-28T10:00:00.000Z", sessionId: "s", agent: "main", file: "f", messageId: "m", taskId: null }], { pricing: partial });
  assert.deepEqual(report.unknownModels, ["claude-partial"]);
  assert.equal(report.totals.costUsd, null);
});
