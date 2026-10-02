import { discoverTranscripts, pickAgentMeta } from "./discover.mjs";
import { readLines, parseTranscriptLines } from "./parse.mjs";
import { dedupeUsage } from "./dedupe.mjs";
import { buildTimelines, activeTaskAt } from "./timeline.mjs";

/**
 * @typedef {import("./parse.mjs").UsageLine & {sessionId: string, agent: string, file: string} & import("./discover.mjs").AgentMeta} UsageRecord
 * @typedef {UsageRecord & {taskId: string|null}} AttributedRecord
 */

/**
 * Reads one transcript from a byte offset and tags everything with its origin.
 * @param {import("./discover.mjs").TranscriptFile & import("./discover.mjs").AgentMeta} transcript
 * @param {number} startOffset
 * @returns {{file: string, sessionId: string, startOffset: number, endOffset: number, usage: UsageRecord[], events: import("./timeline.mjs").TaskEvent[], erroredToolUseIds: string[], resolvedToolUseIds: string[], malformedLines: number}}
 */
export function readTranscript(transcript, startOffset) {
  const { lines, endOffset } = readLines(transcript.path, startOffset);
  const parsed = parseTranscriptLines(lines);
  const origin = { sessionId: transcript.sessionId, agent: transcript.agent, file: transcript.file, ...pickAgentMeta(transcript) };
  return {
    file: transcript.file,
    sessionId: transcript.sessionId,
    startOffset,
    endOffset,
    usage: parsed.usage.map((line) => ({ ...line, ...origin })),
    events: parsed.events.map((event) => ({ ...event, sessionId: transcript.sessionId })),
    erroredToolUseIds: parsed.erroredToolUseIds,
    resolvedToolUseIds: parsed.resolvedToolUseIds,
    malformedLines: parsed.malformedLines,
  };
}

/**
 * Tags each record with the task active in its session at the record's timestamp.
 * @param {UsageRecord[]} records
 * @param {Map<string, {at: number, taskId: string|null}[]>} timelines
 * @returns {AttributedRecord[]}
 */
export function attribute(records, timelines) {
  return records.map((record) => ({ ...record, taskId: activeTaskAt(timelines.get(record.sessionId), record.ts) }));
}

/**
 * Full scan of every transcript (main sessions and subagents) in a project transcripts dir.
 * @param {string} transcriptsDir
 * @returns {{records: AttributedRecord[], malformedLines: number, transcripts: import("./discover.mjs").TranscriptFile[]}}
 *   one record per API response, plus the transcripts read (with their agent meta)
 */
export function collectTranscripts(transcriptsDir) {
  const transcripts = discoverTranscripts(transcriptsDir);
  const batches = transcripts.map((transcript) => readTranscript(transcript, 0));
  const timelines = buildTimelines(
    batches.flatMap((batch) => batch.events),
    batches.flatMap((batch) => batch.erroredToolUseIds),
  );
  return {
    records: attribute(dedupeUsage(batches.flatMap((batch) => batch.usage)), timelines),
    malformedLines: batches.reduce((sum, batch) => sum + batch.malformedLines, 0),
    transcripts,
  };
}
