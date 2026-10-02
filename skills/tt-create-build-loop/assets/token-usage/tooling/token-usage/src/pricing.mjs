import fs from "node:fs";
import path from "node:path";

/** Default location of the pricing table (repo-root scripts/pricing.json). */
export const DEFAULT_PRICING_PATH = path.resolve(import.meta.dirname, "..", "..", "..", "scripts", "pricing.json");

const TOKENS_PER_UNIT = 1_000_000;
const RATE_FIELDS = ["input", "output", "cacheWrite5m", "cacheWrite1h", "cacheRead"];

/**
 * Loads and minimally validates a pricing table (USD per million tokens).
 * @param {string} [pricingPath]
 * @returns {{source: string, updated: string, models: Record<string, object>, aliases?: Record<string, string>}}
 */
export function loadPricing(pricingPath = DEFAULT_PRICING_PATH) {
  const pricing = JSON.parse(fs.readFileSync(pricingPath, "utf8"));
  if (!pricing || typeof pricing.models !== "object") {
    throw new Error(`pricing table ${pricingPath} has no "models" object`);
  }
  return pricing;
}

/**
 * Returns the rate card for a model at a given speed, or null when it is not priced.
 * Only explicitly listed aliases are resolved and an entry missing any rate counts as
 * unpriced; nothing is guessed.
 * @param {object} pricing
 * @param {string|undefined} model
 * @param {"standard"|"fast"} speed
 * @returns {{input: number, output: number, cacheWrite5m: number, cacheWrite1h: number, cacheRead: number}|null}
 */
export function resolveRates(pricing, model, speed) {
  if (!model) return null;
  const canonical = pricing.aliases?.[model] ?? model;
  const rates = pricing.models[canonical];
  if (!rates) return null;
  const card = speed === "fast" ? rates.fast : rates;
  return card && RATE_FIELDS.every((field) => Number.isFinite(card[field])) ? card : null;
}

/**
 * API-equivalent cost of one usage record in USD, or null when the model/speed is not priced.
 * @param {{model?: string, speed: string, inputTokens: number, outputTokens: number, cacheWrite5mTokens: number, cacheWrite1hTokens: number, cacheReadTokens: number}} record
 * @param {object} pricing
 * @returns {number|null}
 */
export function costOf(record, pricing) {
  const rates = resolveRates(pricing, record.model, record.speed);
  if (!rates) return null;
  const weighted =
    record.inputTokens * rates.input +
    record.outputTokens * rates.output +
    record.cacheWrite5mTokens * rates.cacheWrite5m +
    record.cacheWrite1hTokens * rates.cacheWrite1h +
    record.cacheReadTokens * rates.cacheRead;
  return weighted / TOKENS_PER_UNIT;
}

/**
 * Human label for an unpriced model/speed combination, used in `unknownModels`.
 * @param {{model?: string, speed: string}} record
 * @returns {string}
 */
export function unpricedLabel(record) {
  const model = record.model ?? "(no model)";
  return record.speed === "fast" ? `${model} (fast)` : model;
}
