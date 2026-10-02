import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readUsageLogFrom } from "./log.mjs";
import { dedupeUsage, recordKey } from "./dedupe.mjs";
import { costOf } from "./pricing.mjs";
import { TOKEN_FIELDS } from "./parse.mjs";
import { withLockAsync } from "./lock.mjs";
import { toTaskTrackerEvent } from "./tasktracker-events.mjs";
import { readPushState, writePushState } from "./tasktracker-push-state.mjs";

/**
 * Pushes the usage log into TaskTracker's native cost system, so TaskTracker prices and attributes
 * every message, subagents included. (TaskTracker's own Stop-hook reporter reads only the main
 * session's transcript, which misses every <session>/subagents/agent-*.jsonl.)
 *
 * - Through TaskTracker's own MCP client, never its REST API (TaskTracker's MCP-only rule): one MCP
 *   session per push, batches of 100 events, and a 413 halves a batch and retries, as TaskTracker's
 *   reporter does.
 * - One push at a time: Stop, SubagentStop and SessionEnd fire together, and each push spawns a
 *   TaskTracker MCP server that fetches a JWT, which TaskTracker throttles. A push that finds another
 *   one running skips (the running one, or the next hook, sends its messages).
 * - tasktracker.json next to the log (committed) holds {"projectId": "<uuid>"}, the hint for every event.
 *   TaskTracker's mcp-server is machine-specific: tasktracker.local.json beside it (gitignored) holds
 *   {"mcpServerDir": "<path>"}, absolute or relative to that file; TASKTRACKER_MCP_DIR overrides both, and an
 *   mcpServerDir in tasktracker.json is still honoured when there is no local file.
 * - tasktracker-push.json next to the log (see tasktracker-push-state.mjs) holds a byte-offset
 *   watermark, advanced after every acknowledged batch, so a run killed at the hook timeout resumes
 *   at the next batch. It never moves backwards for the same log. TaskTracker ignores duplicate
 *   messageIds anyway, so a lost watermark only costs bandwidth.
 * - Hook-sized runs: no new batch starts after PUSH_DEADLINE_MS, and for PUSH_BACKOFF_MS after a
 *   failed push every push is skipped (logged once), so an unreachable TaskTracker does not delay
 *   every session stop.
 * - An event TaskTracker rejects as invalid (HTTP 400/422) is isolated by halving its batch, then
 *   skipped and logged with its messageId, so it cannot block every later message. More than
 *   MAX_REJECTED_PER_PUSH such events in one push means the rejection is systemic, so the push stops.
 * - Never throws: failures are appended to hook-errors.log next to the log and returned.
 */

/** No batch starts after this; the hooks in .claude/settings.json kill a push at 120 s. */
export const PUSH_DEADLINE_MS = 90_000;
/** After a failed push, pushes are skipped for this long. */
export const PUSH_BACKOFF_MS = 60_000;
/** Rejected events one push may skip before it treats the rejections as systemic and stops. */
export const MAX_REJECTED_PER_PUSH = 3;
/** Suffix of the reporter's session id; see reporterSessionId. */
const REPORTER_SUFFIX = "-token-push";

const CONFIG_FILE = "tasktracker.json";
const LOCAL_CONFIG_FILE = "tasktracker.local.json";
const STATE_FILE = "tasktracker-push.json";
const LOCK_FILE = "push.lock";
const HOOK_ERRORS_FILE = "hook-errors.log";
/** A push lock older than this is abandoned: a hook is killed at 120 s, a manual push ends soon after its deadline. */
const PUSH_LOCK_STALE_MS = 5 * 60_000;
const RECORD_TOOL = "tasktracker_recordTokenUsage";
const REATTRIBUTE_TOOL = "tasktracker_reattributeTokenUsage";
/** Events per call, as TaskTracker's reporter: ~46 kB, inside the server's default 100 kB body limit. */
const MAX_EVENTS_PER_BATCH = 100;
/** A batch rejected as too large is halved down to this size before the push gives up. */
const MIN_EVENTS_PER_BATCH = 5;
const TOO_LARGE = /413|too large/i;
/**
 * TaskTracker reports backend errors as "... (HTTP <status>)". Only validation rejections blame the
 * payload; auth (401/403), timeouts and throttling (429, or the JWT ThrottlerException) never do.
 */
const PAYLOAD_REJECTED = /\(HTTP (?:400|422)\)/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INGEST_FIELDS = ["received", "inserted", "duplicates", "attributedToTask", "attributedToProject", "unattributed", "unpriced", "costUsdInserted"];
const USD_DECIMALS = 1e6;

/**
 * @typedef {object} TaskTrackerMcp TaskTracker's mcp-server/lib/mcp-client.js
 * @property {(fn: (client: object) => Promise<unknown>) => Promise<unknown>} withMcpClient
 * @property {(client: object, name: string, args: object) => Promise<unknown>} callToolOn
 */

/**
 * The CLAUDE_CODE_SESSION_ID of the TaskTracker server a push spawns: `<project directory name>-token-push`.
 * TaskTracker names that server's agent `mcp:<CLAUDE_CODE_SESSION_ID>`, and a hook inherits the session's id,
 * so the server would be the session's own agent: it would load the session's active task, heartbeat it and
 * take over the session's work lease, splitting the time log TaskTracker attributes cost by. Under its own id
 * it has no active task, so it does neither. Every event carries its own sessionId, so attribution does not
 * depend on it.
 * @param {string} projectDir the project's root directory
 * @returns {string}
 */
export function reporterSessionId(projectDir) {
  const slug = path
    .basename(path.resolve(projectDir))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "project"}${REPORTER_SUFFIX}`;
}

/**
 * TaskTracker's mcp-server directory: TASKTRACKER_MCP_DIR, else tasktracker.json's mcpServerDir.
 * @param {Record<string, string|undefined>} env
 * @param {{mcpServerDir?: string}} config as readConfig returns it
 * @returns {string}
 * @throws when neither is set
 */
export function resolveMcpDir(env, config) {
  const dir = env.TASKTRACKER_MCP_DIR || config.mcpServerDir;
  if (!dir) {
    throw new Error(`TaskTracker's mcp-server is not configured: set TASKTRACKER_MCP_DIR, or "mcpServerDir" in ${LOCAL_CONFIG_FILE}`);
  }
  return dir;
}

/**
 * Loads TaskTracker's MCP client and resolves its credentials the way TaskTracker's own hook
 * scripts do (Claude Code's MCP server config first, then TaskTracker's .env).
 * @param {string} mcpDir TaskTracker's mcp-server directory
 * @param {string} reporterId the session id the spawned server runs under (reporterSessionId)
 * @returns {Promise<TaskTrackerMcp>}
 */
export async function loadTaskTrackerMcp(mcpDir, reporterId) {
  const lib = (name) => pathToFileURL(path.join(mcpDir, "lib", name)).href;
  const { loadHookEnv } = await import(lib("load-env.js"));
  loadHookEnv();
  const { withMcpClient, callToolOn } = await import(lib("mcp-client.js"));
  return { withMcpClient: asReporter(withMcpClient, reporterId), callToolOn };
}

/**
 * Makes the server withMcpClient spawns run as the reporter. TaskTracker's client copies the server's
 * env from process.env and takes none of its own, so the id is swapped in only while the session opens and
 * restored before the first call (or when the spawn fails). This hook process does nothing else meanwhile,
 * and nothing in it reads the variable.
 * @param {TaskTrackerMcp["withMcpClient"]} withMcpClient mcp-client.js's withMcpClient
 * @param {string} reporterId
 * @returns {TaskTrackerMcp["withMcpClient"]}
 */
function asReporter(withMcpClient, reporterId) {
  return async (fn) => {
    const inherited = process.env.CLAUDE_CODE_SESSION_ID;
    const restore = () => {
      if (inherited === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
      else process.env.CLAUDE_CODE_SESSION_ID = inherited;
    };
    process.env.CLAUDE_CODE_SESSION_ID = reporterId;
    try {
      return await withMcpClient((client) => {
        restore();
        return fn(client);
      });
    } finally {
      restore();
    }
  };
}

/**
 * Pushes every logged message not yet acknowledged by TaskTracker (or, with dryRun, reports what
 * would be pushed: message count, tokens and cost at our own list prices).
 * @param {{logPath: string, pricing: object, loadMcp: (config: object) => Promise<TaskTrackerMcp>, dryRun?: boolean, clock?: () => number}} options
 *   loadMcp gets tasktracker.json's config and is only called when there is something to send; clock (epoch
 *   ms) drives the deadline and backoff
 * @returns {Promise<object>} what was pushed, TaskTracker's summed IngestResult, the reattribute result,
 *   and `failure` when the push did not complete or `skipped` when it did not run
 */
export async function pushToTaskTracker({ logPath, pricing, loadMcp, dryRun = false, clock = Date.now }) {
  const usageDir = path.dirname(logPath);
  try {
    if (dryRun) return dryRunReport(logPath, pricing);
    return await withLockAsync(path.join(usageDir, LOCK_FILE), () => pushLocked({ logPath, loadMcp, clock }), { waitMs: 0, staleAfterMs: PUSH_LOCK_STALE_MS });
  } catch (error) {
    if (error.code === "ELOCKED") return { dryRun: false, skipped: "another push is running" };
    logHookError(usageDir, error.message);
    return { dryRun, failure: error.message };
  }
}

/**
 * One line of text for a push result.
 * @param {object} result from pushToTaskTracker
 * @returns {string}
 */
export function describePush(result) {
  if (result.skipped) return `TaskTracker push skipped: ${result.skipped}.\n`;
  if (result.dryRun && !result.failure) {
    return (
      `Dry run: would push ${result.messages} message(s), ${result.totalTokens} tokens, $${result.costUsd} at our list prices ` +
      `(${result.unpricedMessages} unpriced; models ${result.models.join(", ") || "none"}) to TaskTracker project ${result.projectHintId}.\n`
    );
  }
  if (result.sent === undefined) return `TaskTracker push failed: ${result.failure}\n`;
  const i = result.ingest;
  const lines = [
    `Pushed ${result.sent} of ${result.messages} message(s) to TaskTracker in ${result.batches} batch(es): ` +
      `${i.inserted} inserted, ${i.duplicates} already known; ${i.attributedToTask} to tasks, ${i.attributedToProject} to the project, ` +
      `${i.unattributed} unattributed; ${i.unpriced} unpriced; $${i.costUsdInserted} priced by TaskTracker.`,
    ...(result.rejected.length > 0 ? [`Rejected by TaskTracker and skipped: ${result.rejected.join(", ")}.`] : []),
    ...(result.deadlineReached ? [`Stopped at the ${PUSH_DEADLINE_MS / 1000} s deadline; the next push continues.`] : []),
    ...(result.reattribute
      ? [`Reattribute: examined ${result.reattribute.examined}, upgraded ${result.reattribute.upgraded}, corrected ${result.reattribute.corrected}, claimed by session ${result.reattribute.claimedBySession}.`]
      : []),
    ...(result.failure ? [`TaskTracker push failed: ${result.failure}`] : []),
  ];
  return lines.join("\n") + "\n";
}

async function pushLocked({ logPath, loadMcp, clock }) {
  const startedAt = clock();
  const usageDir = path.dirname(logPath);
  const config = readConfig(path.join(usageDir, CONFIG_FILE));
  const projectHintId = config.projectId;
  const statePath = path.join(usageDir, STATE_FILE);
  const state = readPushState(statePath, logPath);
  const backoff = backingOff(state, startedAt);
  if (backoff) {
    if (!state.backoffLogged) {
      logHookError(usageDir, `${backoff}; skipping pushes until then`);
      writePushState(statePath, { ...state, backoffLogged: true });
    }
    return { dryRun: false, skipped: backoff };
  }

  const { lines } = readUsageLogFrom(logPath, state.offset);
  const { pending, skipped } = pendingMessages(lines);
  const progress = watermarkProgress({ statePath, lines, state, settled: skipped });
  const delivery = emptyDelivery();
  if (pending.length > 0) {
    await deliver({ loadMcp: () => loadMcp(config), pending, projectHintId, progress, clock, deadline: startedAt + PUSH_DEADLINE_MS }, delivery);
  }
  progress.save(delivery.failure ? { lastFailureAt: clock(), backoffLogged: false } : {});
  for (const problem of delivery.problems) logHookError(usageDir, problem);
  return {
    dryRun: false,
    projectHintId,
    fromOffset: state.offset,
    toOffset: progress.offset(),
    messages: pending.length,
    sent: delivery.sent,
    batches: delivery.batches,
    rejected: delivery.rejected,
    deadlineReached: delivery.deadlineReached,
    ingest: { ...delivery.ingest, costUsdInserted: roundUsd(delivery.ingest.costUsdInserted) },
    reattribute: delivery.reattribute,
    ...(delivery.failure ? { failure: delivery.failure } : {}),
  };
}

function backingOff(state, now) {
  if (state.lastFailureAt === null || now - state.lastFailureAt >= PUSH_BACKOFF_MS) return null;
  return `backing off after a failed push until ${new Date(state.lastFailureAt + PUSH_BACKOFF_MS).toISOString()}`;
}

/**
 * The watermark as batches are acknowledged: the offset just past the longest run of lines whose
 * messages are settled (acknowledged, skipped as rejected, or unsendable), written whenever it moves.
 */
function watermarkProgress({ statePath, lines, state, settled }) {
  const settledKeys = new Set(settled);
  let offset = state.offset;
  const write = (extra = {}) => writePushState(statePath, { offset, fingerprint: state.fingerprint, ...extra });
  const settle = (keys) => {
    for (const key of keys) settledKeys.add(key);
    const next = settledOffset(lines, settledKeys, state.offset);
    if (next > offset) {
      offset = next;
      write();
    }
  };
  return {
    offset: () => offset,
    settle,
    /** Final write: records a failure for the backoff, or clears a past one; unsendable lines settle here too. */
    save(extra) {
      settle([]);
      if (Object.keys(extra).length > 0 || state.lastFailureAt !== null) write(extra);
    },
  };
}

/**
 * tasktracker.json, validated, merged with the machine-local tasktracker.local.json beside it; mcpServerDir
 * is made absolute, relative to the file that set it.
 */
function readConfig(configPath) {
  const shared = readJson(configPath, `{"projectId": "<TaskTracker project uuid>"}`);
  if (typeof shared.projectId !== "string" || !UUID.test(shared.projectId)) throw new Error(`${configPath} must be {"projectId": "<TaskTracker project uuid>"}`);
  const localPath = path.join(path.dirname(configPath), LOCAL_CONFIG_FILE);
  const local = fs.existsSync(localPath) ? readJson(localPath, `{"mcpServerDir": "<TaskTracker's mcp-server directory>"}`) : null;
  if (local && (Object.keys(local).some((key) => key !== "mcpServerDir") || !isPath(local.mcpServerDir))) {
    throw new Error(`${localPath} must be {"mcpServerDir": "<TaskTracker's mcp-server directory>"}`);
  }
  if (!local && shared.mcpServerDir !== undefined && !isPath(shared.mcpServerDir)) throw new Error(`${configPath}: "mcpServerDir" must be a path`);
  const [source, dir] = local ? [localPath, local.mcpServerDir] : [configPath, shared.mcpServerDir];
  return dir === undefined ? { projectId: shared.projectId } : { projectId: shared.projectId, mcpServerDir: path.resolve(path.dirname(source), dir) };
}

function readJson(file, shape) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch (error) {
    throw new Error(`cannot read ${file}: ${error.message}`);
  }
  throw new Error(`${file} must be ${shape}`);
}

function isPath(value) {
  return typeof value === "string" && value !== "";
}

/** One event per message read (a message logged twice is sent once); `skipped` keys can never be sent. */
function pendingMessages(lines) {
  const records = dedupeUsage(lines.flatMap((line) => (line.record ? [line.record] : [])));
  const items = records.map((record) => ({ key: recordKey(record), record, event: toTaskTrackerEvent(record) }));
  return {
    pending: items.filter((item) => item.event !== null),
    skipped: items.filter((item) => item.event === null).map((item) => item.key),
  };
}

/** The offset just past the longest run of lines whose messages are settled. */
function settledOffset(lines, settled, fromOffset) {
  let offset = fromOffset;
  for (const line of lines) {
    if (line.record && !settled.has(recordKey(line.record))) break;
    offset = line.endOffset;
  }
  return offset;
}

function dryRunReport(logPath, pricing) {
  const usageDir = path.dirname(logPath);
  const projectHintId = readConfig(path.join(usageDir, CONFIG_FILE)).projectId;
  const { offset } = readPushState(path.join(usageDir, STATE_FILE), logPath);
  const { lines, endOffset } = readUsageLogFrom(logPath, offset);
  const records = pendingMessages(lines).pending.map((item) => item.record);
  const costs = records.map((record) => costOf(record, pricing));
  return {
    dryRun: true,
    projectHintId,
    fromOffset: offset,
    toOffset: endOffset,
    messages: records.length,
    totalTokens: records.reduce((sum, record) => sum + TOKEN_FIELDS.reduce((tokens, field) => tokens + record[field], 0), 0),
    costUsd: roundUsd(costs.reduce((sum, cost) => sum + (cost ?? 0), 0)),
    unpricedMessages: costs.filter((cost) => cost === null).length,
    models: [...new Set(records.map((record) => record.model))].sort(),
  };
}

function emptyDelivery() {
  return {
    sent: 0,
    batches: 0,
    ingest: Object.fromEntries(INGEST_FIELDS.map((field) => [field, 0])),
    rejected: [],
    untasked: false,
    deadlineReached: false,
    reattribute: null,
    problems: [],
    failure: undefined,
  };
}

function fail(delivery, message) {
  delivery.failure = message;
  delivery.problems.push(message);
  return false;
}

/** Sends every pending event in one MCP session, then sweeps un-tasked rows onto their tasks. */
async function deliver(context, delivery) {
  let mcp;
  try {
    mcp = await context.loadMcp();
  } catch (error) {
    return fail(delivery, `cannot load TaskTracker's MCP client: ${error.message}`);
  }
  const send = { ...context, mcp };
  try {
    await mcp.withMcpClient(async (client) => {
      for (let i = 0; i < send.pending.length; i += MAX_EVENTS_PER_BATCH) {
        if (!(await sendSlice(send, client, send.pending.slice(i, i + MAX_EVENTS_PER_BATCH), delivery))) break;
      }
      // Rows that matched no time-log segment may match one now (TaskTracker's reporter does the same).
      if (delivery.untasked && !delivery.deadlineReached) {
        try {
          delivery.reattribute = await mcp.callToolOn(client, REATTRIBUTE_TOOL, {});
        } catch (error) {
          delivery.problems.push(`reattribute sweep failed (non-fatal): ${error.message}`);
        }
      }
    });
  } catch (error) {
    if (!delivery.failure) fail(delivery, `MCP session failed after ${delivery.sent} message(s): ${error.message}`);
  }
  return !delivery.failure;
}

/** Records one slice; halves it on 413, isolates what TaskTracker rejects. False stops the push. */
async function sendSlice(send, client, slice, delivery) {
  if (send.clock() >= send.deadline) {
    delivery.deadlineReached = true;
    return false;
  }
  try {
    const result = await send.mcp.callToolOn(client, RECORD_TOOL, { events: slice.map((item) => item.event), projectHintId: send.projectHintId });
    delivery.batches += 1;
    delivery.sent += slice.length;
    delivery.ingest = Object.fromEntries(INGEST_FIELDS.map((field) => [field, delivery.ingest[field] + (Number(result?.[field]) || 0)]));
    if ((Number(result?.attributedToProject) || 0) + (Number(result?.unattributed) || 0) > 0) delivery.untasked = true;
    send.progress.settle(slice.map((item) => item.key));
    return true;
  } catch (error) {
    const message = error?.message ?? String(error);
    if (PAYLOAD_REJECTED.test(message)) return rejectSlice(send, client, slice, delivery, message);
    if (TOO_LARGE.test(message) && slice.length > MIN_EVENTS_PER_BATCH) return sendHalves(send, client, slice, delivery);
    return fail(delivery, `${RECORD_TOOL} failed after ${delivery.sent} message(s): ${message}`);
  }
}

async function sendHalves(send, client, slice, delivery) {
  const mid = Math.ceil(slice.length / 2);
  return (await sendSlice(send, client, slice.slice(0, mid), delivery)) && (await sendSlice(send, client, slice.slice(mid), delivery));
}

/** Narrows a rejected slice down to the event TaskTracker rejects, and skips that one. */
async function rejectSlice(send, client, slice, delivery, message) {
  if (slice.length > 1) return sendHalves(send, client, slice, delivery);
  const { key, event } = slice[0];
  if (delivery.rejected.length >= MAX_REJECTED_PER_PUSH) {
    return fail(delivery, `TaskTracker rejected more than ${MAX_REJECTED_PER_PUSH} events in one push, which is systemic, not bad events; stopped at ${event.messageId}: ${message}`);
  }
  delivery.rejected.push(event.messageId);
  delivery.problems.push(`TaskTracker rejected ${event.messageId}; skipped it: ${message}`);
  send.progress.settle([key]);
  return true;
}

function logHookError(usageDir, message) {
  try {
    fs.mkdirSync(usageDir, { recursive: true });
    fs.appendFileSync(path.join(usageDir, HOOK_ERRORS_FILE), `${new Date().toISOString()} push-tasktracker: ${message}\n`);
  } catch {
    // Best effort: a push must never fail because its failure could not be logged.
  }
}

function roundUsd(value) {
  return Math.round(value * USD_DECIMALS) / USD_DECIMALS;
}
