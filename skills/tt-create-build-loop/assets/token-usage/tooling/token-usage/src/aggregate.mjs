import { costOf, unpricedLabel } from "./pricing.mjs";
import { TOKEN_FIELDS } from "./parse.mjs";

/** Disclaimer carried in every report. */
export const BILLING_NOTE = "API-equivalent list price; subscription billing differs";

const UNATTRIBUTED = "unattributed";
const UNMAPPED = "unmapped";
const USD_DECIMALS = 1e6;

/**
 * @typedef {object} Bucket
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} cacheWrite5mTokens
 * @property {number} cacheWrite1hTokens
 * @property {number} cacheReadTokens
 * @property {number} totalTokens
 * @property {number|null} costUsd sum of priced messages; null when every message is unpriced
 * @property {number} messages
 * @property {number} unpricedMessages
 */

/**
 * Builds the usage report from deduplicated, attributed records.
 * @param {import("./collect.mjs").AttributedRecord[]} records
 * @param {{pricing: object, taskMap?: Record<string, {phaseId: string, phaseTitle?: string, release?: string}>|null, malformedLines?: number, now?: Date}} options
 * @returns {object} report (see scripts/token-usage.mjs --json)
 */
export function buildReport(records, { pricing, taskMap = null, malformedLines = 0, now = new Date() }) {
  const priced = records.map((record) => ({ record, cost: costOf(record, pricing) }));
  const attributed = priced.filter((item) => item.record.taskId);
  const unattributed = priced.filter((item) => !item.record.taskId);
  return {
    generatedAt: now.toISOString(),
    pricing: { source: pricing.source, updated: pricing.updated },
    note: BILLING_NOTE,
    totals: sumBucket(priced),
    byTask: rollup(attributed, (item) => item.record.taskId, taskDetail),
    unattributed: { ...sumBucket(unattributed), ...taskDetail(unattributed) },
    byDay: rollup(priced, (item) => new Date(item.record.ts).toISOString().slice(0, 10)),
    byModel: rollup(priced, (item) => item.record.model ?? "(no model)"),
    bySession: rollup(priced, (item) => item.record.sessionId),
    ...(taskMap ? phaseRollups(priced, taskMap) : {}),
    unknownModels: [...new Set(priced.filter((item) => item.cost === null).map((item) => unpricedLabel(item.record)))].sort(),
    malformedLines,
    messagesCounted: priced.length,
  };
}

function sumBucket(items) {
  const tokens = Object.fromEntries(TOKEN_FIELDS.map((field) => [field, items.reduce((sum, item) => sum + item.record[field], 0)]));
  const costs = items.filter((item) => item.cost !== null).map((item) => item.cost);
  const unpricedMessages = items.length - costs.length;
  const allUnpriced = costs.length === 0 && unpricedMessages > 0;
  return {
    ...tokens,
    totalTokens: TOKEN_FIELDS.reduce((sum, field) => sum + tokens[field], 0),
    costUsd: allUnpriced ? null : roundUsd(costs.reduce((sum, cost) => sum + cost, 0)),
    messages: items.length,
    unpricedMessages,
  };
}

function roundUsd(value) {
  return Math.round(value * USD_DECIMALS) / USD_DECIMALS;
}

function rollup(items, keyOf, detail = () => ({})) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const keys = [...groups.keys()].sort();
  return Object.fromEntries(keys.map((key) => [key, { ...sumBucket(groups.get(key)), ...detail(groups.get(key), key) }]));
}

function taskDetail(items) {
  const times = items.map((item) => item.record.ts).sort((a, b) => Date.parse(a) - Date.parse(b));
  return {
    byModel: rollup(items, (item) => item.record.model ?? "(no model)"),
    byAgent: rollup(items, (item) => item.record.agent),
    firstSeen: times[0] ?? null,
    lastSeen: times.at(-1) ?? null,
  };
}

function phaseRollups(priced, taskMap) {
  const phaseOf = phaseResolver(taskMap);
  const phaseKey = (item) => (item.record.taskId ? (phaseOf(item.record.taskId)?.phaseId ?? UNMAPPED) : UNATTRIBUTED);
  const releaseKey = (item) => (item.record.taskId ? (phaseOf(item.record.taskId)?.release ?? UNMAPPED) : UNATTRIBUTED);
  const phaseDetail = (items, key) => {
    const entry = phaseOf(key);
    return {
      phaseTitle: entry?.phaseTitle ?? null,
      release: entry?.release ?? null,
      taskIds: [...new Set(items.map((item) => item.record.taskId).filter(Boolean))].sort(),
    };
  };
  return { byPhase: rollup(priced, phaseKey, phaseDetail), byRelease: rollup(priced, releaseKey) };
}

/**
 * Maps a task id to its task-map entry; a phase id with no entry of its own maps to itself.
 * Lookups go through Maps of own entries, so ids such as "constructor" never hit Object.prototype.
 */
function phaseResolver(taskMap) {
  const tasks = new Map(Object.entries(taskMap));
  const phases = new Map(
    [...tasks.values()]
      .filter((entry) => entry && typeof entry.phaseId === "string")
      .map((entry) => [entry.phaseId, entry]),
  );
  return (taskId) => tasks.get(taskId) ?? phases.get(taskId) ?? null;
}
