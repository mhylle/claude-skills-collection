import { subagentId } from "./discover.mjs";

/**
 * Usage-log records as TaskTracker token-usage events (the `events` of
 * tasktracker_recordTokenUsage), in the wire shape TaskTracker's own Stop-hook reporter sends
 * (mcp-server/lib/transcript-usage.js), so both reporters converge on the same rows:
 * - messageId is TaskTracker's dedupe key for the same message, so a main-session message the
 *   official reporter already sent is a duplicate there, never a second bill;
 * - usage is rebuilt in Anthropic's snake_case shape from the logged meters. A legacy line without
 *   a TTL breakdown was logged as 5-minute writes, which is also how TaskTracker prices a missing
 *   breakdown; a line without `speed` is sent as "standard", which TaskTracker prices identically.
 * Unlike the official reporter, which keeps a message's first line, a message logged twice carries
 * its final (largest) output count, as in our own reports.
 */

/**
 * @param {import("./collect.mjs").AttributedRecord} record one deduplicated message
 * @returns {object|null} null when the record has no model: TaskTracker rejects a whole batch over one
 */
export function toTaskTrackerEvent(record) {
  if (typeof record.model !== "string" || record.model.trim() === "") return null;
  const agentId = subagentId(record.file);
  return {
    messageId: messageIdOf(record),
    ...(record.requestId ? { requestId: record.requestId } : {}),
    sessionId: record.sessionId,
    ...(agentId === null ? {} : { agentId }),
    occurredAt: record.ts,
    model: record.model.trim(),
    isSidechain: agentId !== null,
    usage: wireUsage(record),
  };
}

/**
 * TaskTracker keys a message on its message.id and, when a line has none, on `req:<requestId>`;
 * our log then keys it on the bare requestId. (Its last resort, a line uuid, needs a line with
 * neither id, which a billed Claude Code response never is.)
 */
function messageIdOf(record) {
  return record.requestId !== undefined && record.messageId === record.requestId ? `req:${record.requestId}` : record.messageId.trim();
}

function wireUsage(record) {
  return {
    input_tokens: record.inputTokens,
    output_tokens: record.outputTokens,
    cache_creation_input_tokens: record.cacheWrite5mTokens + record.cacheWrite1hTokens,
    cache_read_input_tokens: record.cacheReadTokens,
    cache_creation: { ephemeral_5m_input_tokens: record.cacheWrite5mTokens, ephemeral_1h_input_tokens: record.cacheWrite1hTokens },
    ...(record.serviceTier ? { service_tier: record.serviceTier } : {}),
    speed: record.speed,
  };
}
