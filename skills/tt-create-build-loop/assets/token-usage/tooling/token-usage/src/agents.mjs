import { agentIdentity } from "./discover.mjs";

/**
 * Per-agent task overrides.
 *
 * Parallel subagents share their session's single active-task pointer, so the timeline credits
 * their usage to whatever task the orchestrator has active. An orchestrator-written task map may
 * therefore carry an `agents` object mapping an agent key to the task that agent works on; every
 * record of a subagent transcript that resolves to a task is credited to it instead. A transcript
 * resolves, first match wins, through:
 *   1. its own meta name;
 *   2. its nearest ancestor's resolution (by these same rules, along the meta.json parentAgentId
 *      chain, stopping at a missing parent or a cycle);
 *   3. its own agentType;
 *   4. its own description.
 * Names identify one agent; agentType and description are shared by many, so they are last-resort
 * keys: a reviewer spawned under a named, mapped teammate works for that teammate even when
 * reviewers in general are mapped elsewhere. Main-session records, and subagents that resolve to
 * nothing, keep the timeline.
 *
 * The override is applied when a summary is built, never at ingest: the usage log keeps the
 * timeline taskId each record was written with, and every summary re-applies the current mapping
 * to the merged live + logged records (already one per message). A mapping added later thus
 * re-attributes earlier records as well, and since the override only relabels records, totals
 * never change and nothing is counted twice. Ingest logs each subagent record's name, description
 * and parent next to its agent type, so a log-only record (its transcript and meta.json were
 * cleaned up) resolves just as it did live; lines logged before those fields existed fall back to
 * their agent type.
 */

const AGENTS_KEY = "agents";

/**
 * Splits an orchestrator task map into its per-task entries and its agent → task overrides.
 * @param {Record<string, unknown>|null} taskMap
 * @returns {{tasks: Record<string, {phaseId: string, phaseTitle?: string, release?: string}>|null, agents: Record<string, string>}}
 */
export function splitTaskMap(taskMap) {
  if (!taskMap) return { tasks: null, agents: {} };
  const { [AGENTS_KEY]: agents, ...tasks } = taskMap;
  return { tasks, agents: agents ?? {} };
}

/**
 * Whether a task map's `agents` entry, if present and not null, maps non-empty agent keys to
 * non-empty task ids.
 * @param {Record<string, unknown>} taskMap
 * @returns {boolean}
 */
export function hasValidAgents(taskMap) {
  const agents = taskMap[AGENTS_KEY];
  if (agents === undefined || agents === null) return true;
  if (typeof agents !== "object" || Array.isArray(agents)) return false;
  return Object.entries(agents).every(([key, taskId]) => key !== "" && typeof taskId === "string" && taskId !== "");
}

/**
 * Credits every record of a subagent transcript that resolves to a mapped task (see above) to
 * that task, overriding the timeline.
 * @param {import("./collect.mjs").AttributedRecord[]} records merged live + logged records
 * @param {Record<string, string>} agents agent key → taskId
 * @param {Iterable<{file: string, agent?: string} & import("./discover.mjs").AgentMeta>} identitySources
 *   live transcripts first, then logged records; only read when some agent is mapped
 * @returns {import("./collect.mjs").AttributedRecord[]}
 */
export function applyAgentTasks(records, agents, identitySources) {
  // A Map, so agent keys such as "constructor" never resolve to Object.prototype members.
  const taskOf = new Map(Object.entries(agents));
  if (taskOf.size === 0) return records;
  const identities = agentIdentities(identitySources);
  const taskOfFile = new Map();
  return records.map((record) => {
    if (!taskOfFile.has(record.file)) taskOfFile.set(record.file, resolveTask(record.file, taskOf, identities, new Set()));
    const taskId = taskOfFile.get(record.file);
    return taskId === undefined ? record : { ...record, taskId };
  });
}

/**
 * Identity of every subagent transcript file known live or from the log. Sources listed first win
 * per field, so live meta.json files take precedence and any logged line of a file that carries
 * a field fills it in for the whole file.
 */
function agentIdentities(sources) {
  const identities = new Map();
  for (const source of sources) {
    const identity = agentIdentity(source);
    if (identity) identities.set(source.file, { ...identity, ...identities.get(source.file) });
  }
  return identities;
}

/** The task a transcript file resolves to by the precedence above; `visiting` guards against cycles. */
function resolveTask(file, taskOf, identities, visiting) {
  const identity = identities.get(file);
  // No identity: a main session, or a parent never seen live or in the log. After cleanup a parent
  // is known only through its logged records, which always exist: spawning a child is itself an
  // API call with usage.
  if (!identity || visiting.has(file)) return undefined;
  visiting.add(file);
  const own = (key) => (key !== undefined && taskOf.has(key) ? taskOf.get(key) : undefined);
  return (
    own(identity.agentName) ??
    (identity.parentFile === undefined ? undefined : resolveTask(identity.parentFile, taskOf, identities, visiting)) ??
    own(identity.agentType) ??
    own(identity.agentDescription)
  );
}
