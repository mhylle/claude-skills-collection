import fs from "node:fs";

const CHUNK_BYTES = 4 * 1024 * 1024;
const NEWLINE = 0x0a;

/** Token classes carried by every usage record, in report order. */
export const TOKEN_FIELDS = ["inputTokens", "outputTokens", "cacheWrite5mTokens", "cacheWrite1hTokens", "cacheReadTokens"];

const SET_ACTIVE_TASK = "mcp__tasktracker__tasktracker_setActiveTask";
const CLEAR_ACTIVE_TASK = "mcp__tasktracker__tasktracker_clearActiveTask";

/**
 * Reads the newline-terminated lines of a file starting at a byte offset. A trailing line
 * without '\n' (still being written) is not returned and not consumed.
 * @param {string} filePath
 * @param {number} [startOffset=0] byte offset to start reading at
 * @returns {{lines: string[], endOffset: number}} endOffset is the byte offset just past the last complete line
 */
export function readLines(filePath, startOffset = 0) {
  const fd = fs.openSync(filePath, "r");
  try {
    const lines = [];
    const chunk = Buffer.allocUnsafe(CHUNK_BYTES);
    let position = startOffset;
    let endOffset = startOffset;
    let carry = Buffer.alloc(0);
    for (;;) {
      const bytesRead = fs.readSync(fd, chunk, 0, CHUNK_BYTES, position);
      if (bytesRead === 0) break;
      position += bytesRead;
      const data = Buffer.concat([carry, chunk.subarray(0, bytesRead)]);
      const lastNewline = data.lastIndexOf(NEWLINE);
      if (lastNewline === -1) {
        carry = data;
        continue;
      }
      for (const line of data.subarray(0, lastNewline).toString("utf8").split("\n")) lines.push(line);
      carry = Buffer.from(data.subarray(lastNewline + 1));
      endOffset = position - carry.length;
    }
    return { lines, endOffset };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * @typedef {object} UsageLine
 * @property {string} ts ISO timestamp of the transcript line
 * @property {string} messageId message.id, else requestId, else the line uuid
 * @property {string} [requestId] the API request id, when the line has one
 * @property {string|undefined} model
 * @property {"standard"|"fast"} speed
 * @property {string} [serviceTier] usage.service_tier, when the line has one
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} cacheWrite5mTokens
 * @property {number} cacheWrite1hTokens
 * @property {number} cacheReadTokens
 */

/**
 * Extracts usage lines, active-task tool calls and tool results from transcript lines.
 * Unparseable lines (and usage lines without a timestamp) are counted as malformed.
 * @param {string[]} lines
 * @returns {{usage: UsageLine[], events: {ts: string, taskId: string|null, toolUseId: string}[], erroredToolUseIds: string[], resolvedToolUseIds: string[], malformedLines: number}}
 *   resolvedToolUseIds lists every tool call whose result (success or error) was seen
 */
export function parseTranscriptLines(lines) {
  const usage = [];
  const events = [];
  const erroredToolUseIds = [];
  const resolvedToolUseIds = [];
  let malformedLines = 0;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const entry = parseJsonObject(line);
    if (!entry) {
      malformedLines += 1;
      continue;
    }
    if (entry.type === "assistant") {
      const record = usageFromEntry(entry);
      if (record === INVALID) malformedLines += 1;
      else if (record) usage.push(record);
      events.push(...taskEventsFromEntry(entry));
    } else if (entry.type === "user") {
      for (const result of toolResults(entry)) {
        resolvedToolUseIds.push(result.tool_use_id);
        if (result.is_error === true) erroredToolUseIds.push(result.tool_use_id);
      }
    }
  }
  return { usage, events, erroredToolUseIds, resolvedToolUseIds, malformedLines };
}

const INVALID = Symbol("invalid usage line");

function parseJsonObject(line) {
  try {
    const value = JSON.parse(line);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function usageFromEntry(entry) {
  const message = entry.message;
  const usage = message?.usage;
  if (!usage || typeof usage !== "object") return null;
  const messageId = message.id ?? entry.requestId ?? entry.uuid;
  if (typeof entry.timestamp !== "string" || Number.isNaN(Date.parse(entry.timestamp)) || !messageId) return INVALID;
  const cacheCreation = usage.cache_creation;
  const record = {
    ts: entry.timestamp,
    messageId,
    ...(typeof entry.requestId === "string" && entry.requestId !== "" ? { requestId: entry.requestId } : {}),
    model: message.model,
    speed: usage.speed === "fast" ? "fast" : "standard",
    ...(typeof usage.service_tier === "string" ? { serviceTier: usage.service_tier } : {}),
    inputTokens: tokenCount(usage.input_tokens),
    outputTokens: tokenCount(usage.output_tokens),
    cacheWrite5mTokens: cacheCreation ? tokenCount(cacheCreation.ephemeral_5m_input_tokens) : tokenCount(usage.cache_creation_input_tokens),
    cacheWrite1hTokens: cacheCreation ? tokenCount(cacheCreation.ephemeral_1h_input_tokens) : 0,
    cacheReadTokens: tokenCount(usage.cache_read_input_tokens),
  };
  // Zero-usage lines (e.g. synthetic error messages) carry no cost and would only add noise.
  return hasTokens(record) ? record : null;
}

function tokenCount(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function hasTokens(record) {
  return record.inputTokens + record.outputTokens + record.cacheWrite5mTokens + record.cacheWrite1hTokens + record.cacheReadTokens > 0;
}

function taskEventsFromEntry(entry) {
  const content = entry.message?.content;
  if (!Array.isArray(content) || typeof entry.timestamp !== "string") return [];
  return content.flatMap((block) => {
    if (block?.type !== "tool_use") return [];
    if (block.name === SET_ACTIVE_TASK && typeof block.input?.taskId === "string") {
      return [{ ts: entry.timestamp, taskId: block.input.taskId, toolUseId: block.id }];
    }
    if (block.name === CLEAR_ACTIVE_TASK) return [{ ts: entry.timestamp, taskId: null, toolUseId: block.id }];
    return [];
  });
}

function toolResults(entry) {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter((block) => block?.type === "tool_result" && typeof block.tool_use_id === "string");
}
