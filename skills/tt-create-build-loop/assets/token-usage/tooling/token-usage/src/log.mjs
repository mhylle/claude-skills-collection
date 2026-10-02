import fs from "node:fs";
import path from "node:path";
import { readLines, TOKEN_FIELDS } from "./parse.mjs";
import { dedupeUsage, mergeDuplicate, recordKey } from "./dedupe.mjs";
import { costOf } from "./pricing.mjs";
import { pickAgentMeta } from "./discover.mjs";

/**
 * Reads the append-only usage log. A missing file is an empty log. Each line is one
 * per-message record; the same message may appear more than once (readers keep the max).
 * @param {string|null} logPath
 * @returns {{records: import("./collect.mjs").AttributedRecord[], malformedLines: number}} records without the stored costUsd
 */
export function readUsageLog(logPath) {
  if (!logPath || !fs.existsSync(logPath)) return { records: [], malformedLines: 0 };
  const records = [];
  let malformedLines = 0;
  for (const line of readLines(logPath, 0).lines) {
    if (line.trim() === "") continue;
    const record = parseLogLine(line);
    if (record) records.push(record);
    else malformedLines += 1;
  }
  return { records, malformedLines };
}

/**
 * Reads the usage log from a byte offset, keeping each complete line's end offset so a reader can
 * resume exactly after the last line it has dealt with. A missing file is an empty log.
 * @param {string} logPath
 * @param {number} startOffset byte offset of a line start
 * @returns {{lines: {record: import("./collect.mjs").AttributedRecord|null, endOffset: number}[], endOffset: number}}
 *   record is null for blank and malformed lines
 */
export function readUsageLogFrom(logPath, startOffset) {
  if (!fs.existsSync(logPath)) return { lines: [], endOffset: startOffset };
  const { lines, endOffset } = readLines(logPath, startOffset);
  let offset = startOffset;
  return {
    lines: lines.map((line) => {
      offset += Buffer.byteLength(line, "utf8") + 1;
      return { record: line.trim() === "" ? null : parseLogLine(line), endOffset: offset };
    }),
    endOffset,
  };
}

function parseLogLine(line) {
  try {
    const { costUsd: _storedCost, ...record } = JSON.parse(line);
    return isValidLogRecord(record) ? record : null;
  } catch {
    return null;
  }
}

function isValidLogRecord(record) {
  return (
    typeof record.file === "string" &&
    typeof record.messageId === "string" &&
    typeof record.ts === "string" &&
    !Number.isNaN(Date.parse(record.ts)) &&
    TOKEN_FIELDS.every((field) => Number.isFinite(record[field]) && record[field] >= 0)
  );
}

/**
 * Appends records to the usage log (creating its directory if needed).
 * @param {string} logPath
 * @param {object[]} logRecords records already shaped by toLogRecord
 */
export function appendUsageLog(logPath, logRecords) {
  if (logRecords.length === 0) return;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, logRecords.map((record) => JSON.stringify(record) + "\n").join(""));
}

/**
 * Shapes an attributed record as a log line, pricing it at the current table. A subagent's meta
 * name, description and parent are logged when set, so per-agent overrides still match after
 * Claude Code has cleaned up the transcript and its meta.json.
 * @param {import("./collect.mjs").AttributedRecord} record
 * @param {object} pricing
 * @returns {object}
 */
export function toLogRecord(record, pricing) {
  return {
    ts: record.ts,
    sessionId: record.sessionId,
    agent: record.agent,
    ...pickAgentMeta(record),
    file: record.file,
    messageId: record.messageId,
    ...(record.requestId ? { requestId: record.requestId } : {}),
    model: record.model,
    speed: record.speed,
    ...(record.serviceTier ? { serviceTier: record.serviceTier } : {}),
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cacheWrite5mTokens: record.cacheWrite5mTokens,
    cacheWrite1hTokens: record.cacheWrite1hTokens,
    cacheReadTokens: record.cacheReadTokens,
    costUsd: costOf(record, pricing),
    taskId: record.taskId,
  };
}

/**
 * Unions live transcript records with logged ones, one record per (file, messageId).
 * Token counts come from whichever has the larger output_tokens; attribution comes from the
 * live transcripts when present (they carry the full timeline). Log-only records (their
 * transcript was cleaned up) are kept as logged.
 * @param {import("./collect.mjs").AttributedRecord[]} liveRecords already deduplicated
 * @param {import("./collect.mjs").AttributedRecord[]} loggedRecords may contain repeats
 * @returns {import("./collect.mjs").AttributedRecord[]}
 */
export function mergeLiveWithLog(liveRecords, loggedRecords) {
  const logged = new Map(dedupeUsage(loggedRecords).map((record) => [recordKey(record), record]));
  const merged = liveRecords.map((live) => {
    const key = recordKey(live);
    const previous = logged.get(key);
    if (!previous) return live;
    logged.delete(key);
    return { ...mergeDuplicate(live, previous), taskId: live.taskId };
  });
  return [...merged, ...logged.values()];
}
