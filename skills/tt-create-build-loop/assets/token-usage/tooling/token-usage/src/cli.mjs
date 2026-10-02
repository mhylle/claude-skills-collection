import fs from "node:fs";
import path from "node:path";
import { defaultTranscriptsDir } from "./discover.mjs";
import { loadPricing } from "./pricing.mjs";
import { summarize } from "./summary.mjs";
import { ingest } from "./ingest.mjs";
import { formatReport } from "./format.mjs";
import { hasValidAgents } from "./agents.mjs";
import { describePush, loadTaskTrackerMcp, pushToTaskTracker, reporterSessionId, resolveMcpDir } from "./tasktracker-push.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

export const USAGE = `Usage: node scripts/token-usage.mjs [options]

Summarises Claude Code token usage and API-equivalent cost for this project, attributed to
the TaskTracker task that was active when each API response was produced, or to the task a
subagent is mapped to in the task map's "agents" object.

  (default), --backfill    scan all transcripts (main + subagents) plus the usage log and print a summary
  --json                   machine-readable output
  --ingest                 append newly seen per-message records to the usage log (incremental)
  --push-tasktracker       ingest, then push every logged message TaskTracker has not acknowledged into
                           its cost system through its MCP client: project from <log dir>/tasktracker.json,
                           TaskTracker's mcp-server from TASKTRACKER_MCP_DIR or <log dir>/tasktracker.local.json
                           {"mcpServerDir"}, watermark in <log dir>/tasktracker-push.json; one push at a time,
                           no new batch after 90 s, and 60 s of skipped pushes after a failure
  --dry-run                with --push-tasktracker: report what would be pushed and send nothing
  --quiet                  no stdout; errors go to <log dir>/hook-errors.log and the exit code is 0
  --task-map <path>        JSON {taskId: {phaseId, phaseTitle, release}} adding byPhase/byRelease; an
                           optional "agents": {agentKey: taskId} credits every message of a subagent
                           to the task it resolves to, first match wins: its own meta name, then its
                           nearest ancestor's resolution (parentAgentId chain), then its own
                           agentType, then its own description
  --transcripts-dir <dir>  override ~/.claude/projects/<project slug>
  --log <path>             override .claude/usage/token-usage.jsonl (state.json lives next to it)
`;

const FLAGS = {
  "--json": "json",
  "--backfill": "backfill",
  "--ingest": "ingest",
  "--push-tasktracker": "pushTaskTracker",
  "--dry-run": "dryRun",
  "--quiet": "quiet",
  "--help": "help",
  "-h": "help",
};
const VALUED = { "--task-map": "taskMap", "--transcripts-dir": "transcriptsDir", "--log": "log" };

/**
 * Parses CLI arguments.
 * @param {string[]} argv
 * @returns {{json: boolean, backfill: boolean, ingest: boolean, pushTaskTracker: boolean, dryRun: boolean, quiet: boolean, help: boolean, taskMap: string|null, transcriptsDir: string|null, log: string|null}}
 * @throws on unknown options, missing values, or --dry-run without --push-tasktracker
 */
export function parseArgs(argv) {
  const options = { json: false, backfill: false, ingest: false, pushTaskTracker: false, dryRun: false, quiet: false, help: false, taskMap: null, transcriptsDir: null, log: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg in FLAGS) {
      options[FLAGS[arg]] = true;
    } else if (arg in VALUED) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      options[VALUED[arg]] = path.resolve(value);
      i += 1;
    } else {
      throw new Error(`unknown option ${arg} (see --help)`);
    }
  }
  if (options.dryRun && !options.pushTaskTracker) throw new Error("--dry-run only applies to --push-tasktracker");
  return options;
}

/**
 * Resolves where transcripts and the usage log live.
 * @param {{transcriptsDir: string|null, log: string|null}} options
 * @param {Record<string, string|undefined>} env
 * @returns {{projectDir: string, transcriptsDir: string, logPath: string}}
 */
export function resolvePaths(options, env) {
  const projectDir = path.resolve(env.CLAUDE_PROJECT_DIR || REPO_ROOT);
  const home = env.HOME || env.USERPROFILE;
  if (!options.transcriptsDir && !home) throw new Error("cannot locate transcripts: HOME is not set (use --transcripts-dir)");
  return {
    projectDir,
    transcriptsDir: options.transcriptsDir ?? defaultTranscriptsDir(projectDir, home),
    logPath: options.log ?? path.join(projectDir, ".claude", "usage", "token-usage.jsonl"),
  };
}

/**
 * Loads an orchestrator-written task map.
 * @param {string} mapPath
 * @returns {Record<string, {phaseId: string, phaseTitle?: string, release?: string}> & {agents?: Record<string, string>}}
 */
export function loadTaskMap(mapPath) {
  let taskMap;
  try {
    taskMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  } catch (error) {
    throw new Error(`cannot read task map ${mapPath}: ${error.message}`);
  }
  if (!taskMap || typeof taskMap !== "object" || Array.isArray(taskMap)) {
    throw new Error(`task map ${mapPath} must be a JSON object keyed by task id`);
  }
  if (!hasValidAgents(taskMap)) {
    throw new Error(`task map ${mapPath}: "agents" must be an object mapping agent keys to task ids`);
  }
  return taskMap;
}

/**
 * Runs the CLI. Throws on failure; scripts/token-usage.mjs turns errors into the hook-safe
 * exit behaviour. A failed TaskTracker push is already logged to hook-errors.log, so it only
 * throws (for a non-zero exit code) outside --quiet.
 * @param {string[]} argv
 * @param {{env?: Record<string, string|undefined>, write?: (text: string) => void}} [io]
 * @returns {Promise<void>}
 */
export async function main(argv, { env = process.env, write = (text) => process.stdout.write(text) } = {}) {
  const options = parseArgs(argv);
  const out = options.quiet ? () => {} : write;
  if (options.help) {
    out(USAGE);
    return;
  }
  const { projectDir, transcriptsDir, logPath } = resolvePaths(options, env);
  const pricing = loadPricing();

  if (options.ingest || options.pushTaskTracker) {
    const ingested = ingest({ transcriptsDir, logPath, pricing });
    if (!options.pushTaskTracker) {
      out(options.json ? JSON.stringify(ingested) + "\n" : describeIngest(ingested, logPath));
      return;
    }
    const loadMcp = (config) => loadTaskTrackerMcp(resolveMcpDir(env, config), reporterSessionId(projectDir));
    const pushed = await pushToTaskTracker({ logPath, pricing, dryRun: options.dryRun, loadMcp });
    out(options.json ? JSON.stringify({ ingest: ingested, pushTaskTracker: pushed }) + "\n" : describeIngest(ingested, logPath) + describePush(pushed));
    if (pushed.failure && !options.quiet) throw new Error(`push to TaskTracker failed: ${pushed.failure}`);
    return;
  }

  const taskMap = options.taskMap ? loadTaskMap(options.taskMap) : null;
  const report = summarize({ transcriptsDir, logPath, pricing, taskMap });
  out(options.json ? JSON.stringify(report, null, 2) + "\n" : formatReport(report));
}

function describeIngest(result, logPath) {
  return `Appended ${result.appended} new usage record(s) to ${logPath} (read ${result.bytesRead} bytes from ${result.filesRead} transcript file(s); ${result.deferred} deferred until pending task calls resolve).\n`;
}
