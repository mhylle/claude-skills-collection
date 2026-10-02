import { collectTranscripts } from "./collect.mjs";
import { readUsageLog, mergeLiveWithLog } from "./log.mjs";
import { splitTaskMap, applyAgentTasks } from "./agents.mjs";
import { buildReport } from "./aggregate.mjs";

/**
 * Full backfill summary: every live transcript of the project unioned with the persisted
 * usage log (which keeps usage whose transcripts were cleaned up), deduplicated per message.
 * The task map's `agents` overrides are applied after that merge, so they also re-attribute
 * records logged before the mapping existed (see agents.mjs).
 * @param {{transcriptsDir: string, logPath?: string|null, pricing: object, taskMap?: object|null, now?: Date}} options
 * @returns {object} report
 */
export function summarize({ transcriptsDir, logPath = null, pricing, taskMap = null, now = new Date() }) {
  const live = collectTranscripts(transcriptsDir);
  const logged = readUsageLog(logPath);
  const { tasks, agents } = splitTaskMap(taskMap);
  const records = applyAgentTasks(mergeLiveWithLog(live.records, logged.records), agents, [...live.transcripts, ...logged.records]);
  return buildReport(records, {
    pricing,
    taskMap: tasks,
    malformedLines: live.malformedLines + logged.malformedLines,
    now,
  });
}
