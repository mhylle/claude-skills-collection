import fs from "node:fs";
import path from "node:path";
import { discoverTranscripts } from "./discover.mjs";
import { readTranscript, attribute } from "./collect.mjs";
import { dedupeUsage, earliestTs, recordKey } from "./dedupe.mjs";
import { buildTimelines, attributionSettled } from "./timeline.mjs";
import { readUsageLog, appendUsageLog, toLogRecord } from "./log.mjs";
import { withLock } from "./lock.mjs";

const STATE_VERSION = 2;
/** A task tool call still without a result after this long is accepted as successful. */
const PENDING_RESULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Incrementally appends newly seen per-message usage records to the append-only log.
 * Per-transcript byte offsets, each session's active-task events and any deferred records
 * live in state.json next to the log, so a run only reads bytes written since the previous
 * run. The log itself decides what is new: a message is appended when unseen, or again when
 * it now carries a larger output_tokens. A record whose task depends on a setActiveTask /
 * clearActiveTask call that has no tool result yet is deferred (the call may still fail),
 * because a logged taskId is never rewritten. Logged taskIds are always the timeline's; a task
 * map's per-agent overrides are applied when a summary is built (see agents.mjs).
 * @param {{transcriptsDir: string, logPath: string, pricing: object, now?: Date}} options
 * @returns {{appended: number, deferred: number, filesRead: number, bytesRead: number}}
 */
export function ingest({ transcriptsDir, logPath, pricing, now = new Date() }) {
  const usageDir = path.dirname(logPath);
  return withLock(path.join(usageDir, "ingest.lock"), () =>
    ingestUnlocked({ transcriptsDir, logPath, statePath: path.join(usageDir, "state.json"), pricing, now }),
  );
}

function ingestUnlocked({ transcriptsDir, logPath, statePath, pricing, now }) {
  const state = readState(statePath);
  const batches = discoverTranscripts(transcriptsDir).flatMap((transcript) => {
    const size = fs.statSync(transcript.path).size;
    const stored = state.files[transcript.file]?.offset ?? 0;
    const offset = stored > size ? 0 : stored; // shrunk file: it was replaced, start over
    return offset === size ? [] : [readTranscript(transcript, offset)];
  });

  const sessions = mergeSessions(state.sessions, batches);
  const timelines = sessionTimelines(sessions, now);
  const logged = new Map(dedupeUsage(readUsageLog(logPath).records).map((record) => [recordKey(record), record]));
  const candidates = dedupeUsage([...state.pending, ...batches.flatMap((batch) => batch.usage)]).flatMap((record) => {
    const previous = logged.get(recordKey(record));
    if (previous && previous.outputTokens >= record.outputTokens) return [];
    return [previous ? { ...record, ts: earliestTs(previous.ts, record.ts) } : record];
  });
  const settled = candidates.filter((record) => attributionSettled(timelines.get(record.sessionId), record.ts));
  const pending = candidates.filter((record) => !attributionSettled(timelines.get(record.sessionId), record.ts));

  const toAppend = attribute(settled, timelines).map((record) => toLogRecord(record, pricing));
  appendUsageLog(logPath, toAppend);

  const offsets = Object.fromEntries(batches.map((batch) => [batch.file, { offset: batch.endOffset }]));
  writeState(statePath, { version: STATE_VERSION, files: { ...state.files, ...offsets }, sessions, pending });
  return {
    appended: toAppend.length,
    deferred: pending.length,
    filesRead: batches.length,
    bytesRead: batches.reduce((sum, batch) => sum + (batch.endOffset - batch.startOffset), 0),
  };
}

function sessionTimelines(sessions, now) {
  const isPending = (event) => !event.resolved && now.getTime() - Date.parse(event.ts) <= PENDING_RESULT_TIMEOUT_MS;
  return buildTimelines(
    Object.entries(sessions).flatMap(([sessionId, session]) => session.events.map((event) => ({ ...event, sessionId, pending: isPending(event) }))),
    Object.values(sessions).flatMap((session) => session.erroredToolUseIds),
  );
}

function readState(statePath) {
  try {
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (state?.version === STATE_VERSION && state.files && state.sessions && Array.isArray(state.pending)) return state;
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }
  // Missing, corrupt or older state: re-read everything; the log prevents duplicate appends.
  return { version: STATE_VERSION, files: {}, sessions: {}, pending: [] };
}

function writeState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2) + "\n");
  fs.renameSync(tmpPath, statePath);
}

/**
 * Adds this run's task events and tool results to each session's persisted history. Keyed through a
 * Map, so sessions named like Object.prototype members ("constructor", "__proto__") are ordinary keys.
 */
function mergeSessions(previousSessions, batches) {
  const sessions = new Map(Object.entries(previousSessions));
  for (const batch of batches) {
    const previous = sessions.get(batch.sessionId) ?? { events: [], erroredToolUseIds: [] };
    const resolved = new Set(batch.resolvedToolUseIds);
    const knownToolUseIds = new Set(previous.events.map((event) => event.toolUseId));
    const newEvents = batch.events
      .filter((event) => !knownToolUseIds.has(event.toolUseId))
      .map(({ ts, taskId, toolUseId }) => ({ ts, taskId, toolUseId, resolved: false }));
    sessions.set(batch.sessionId, {
      events: [...previous.events, ...newEvents].map((event) => (resolved.has(event.toolUseId) ? { ...event, resolved: true } : event)),
      erroredToolUseIds: [...new Set([...previous.erroredToolUseIds, ...batch.erroredToolUseIds])],
    });
  }
  return Object.fromEntries(sessions);
}
