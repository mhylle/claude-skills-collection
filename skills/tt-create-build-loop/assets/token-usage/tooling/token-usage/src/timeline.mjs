/**
 * @typedef {object} TaskEvent
 * @property {string} sessionId
 * @property {string} ts ISO timestamp of the line carrying the tool call
 * @property {string|null} taskId task made active, or null for clearActiveTask
 * @property {string} toolUseId
 * @property {boolean} [pending] true while the call's tool result has not been seen yet
 */

/**
 * Builds a sorted active-task timeline per session. Calls whose tool result was an error
 * are dropped.
 * @param {TaskEvent[]} events
 * @param {Iterable<string>} erroredToolUseIds
 * @returns {Map<string, {at: number, taskId: string|null, pending: boolean}[]>}
 */
export function buildTimelines(events, erroredToolUseIds) {
  const errored = new Set(erroredToolUseIds);
  const timelines = new Map();
  for (const event of events) {
    if (errored.has(event.toolUseId)) continue;
    const at = Date.parse(event.ts);
    if (Number.isNaN(at)) continue;
    const timeline = timelines.get(event.sessionId) ?? [];
    timeline.push({ at, taskId: event.taskId, pending: event.pending === true });
    timelines.set(event.sessionId, timeline);
  }
  for (const timeline of timelines.values()) timeline.sort((a, b) => a.at - b.at);
  return timelines;
}

/**
 * Task active at `ts`. An event takes effect strictly after its own timestamp, so the
 * message that issues setActiveTask/clearActiveTask still belongs to the previous state.
 * @param {{at: number, taskId: string|null}[]|undefined} timeline
 * @param {string} ts ISO timestamp
 * @returns {string|null}
 */
export function activeTaskAt(timeline, ts) {
  if (!timeline) return null;
  const at = Date.parse(ts);
  let active = null;
  for (const event of timeline) {
    if (event.at >= at) break;
    active = event.taskId;
  }
  return active;
}

/**
 * Whether the task active at `ts` is final: false while the latest event before `ts`
 * still awaits its tool result (it may yet turn out to be an error and be dropped).
 * @param {{at: number, taskId: string|null, pending: boolean}[]|undefined} timeline
 * @param {string} ts ISO timestamp
 * @returns {boolean}
 */
export function attributionSettled(timeline, ts) {
  if (!timeline) return true;
  const at = Date.parse(ts);
  const latest = timeline.filter((event) => event.at < at).at(-1);
  return !latest?.pending;
}
