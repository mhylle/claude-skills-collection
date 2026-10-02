/**
 * Identity of one API response: the transcript it was logged in plus its message id.
 * @param {{file: string, messageId: string}} record
 * @returns {string}
 */
export function recordKey(record) {
  return `${record.file}\u0000${record.messageId}`;
}

/**
 * Collapses the per-content-block duplicates Claude Code writes for each API response.
 * Keeps the token counts of the line with the largest output_tokens (later lines can carry
 * the final count) and the earliest timestamp (when the response started).
 * @template {{file: string, messageId: string, ts: string, outputTokens: number}} T
 * @param {T[]} records
 * @returns {T[]} one record per key, in first-seen order
 */
export function dedupeUsage(records) {
  const byKey = new Map();
  for (const record of records) {
    const key = recordKey(record);
    const kept = byKey.get(key);
    byKey.set(key, kept ? mergeDuplicate(kept, record) : record);
  }
  return [...byKey.values()];
}

/**
 * Merges two records for the same message: max output tokens wins, earliest timestamp kept.
 * @template {{ts: string, outputTokens: number}} T
 * @param {T} kept
 * @param {T} candidate
 * @returns {T}
 */
export function mergeDuplicate(kept, candidate) {
  const winner = candidate.outputTokens > kept.outputTokens ? candidate : kept;
  const ts = earliestTs(kept.ts, candidate.ts);
  return winner.ts === ts ? winner : { ...winner, ts };
}

/**
 * The earlier of two ISO timestamps (either may be missing).
 * @param {string|undefined} a
 * @param {string|undefined} b
 * @returns {string|undefined}
 */
export function earliestTs(a, b) {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) < Date.parse(a) ? b : a;
}
