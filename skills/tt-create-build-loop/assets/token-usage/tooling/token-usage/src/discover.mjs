import fs from "node:fs";
import path from "node:path";

const MAIN_AGENT = "main";
const DEFAULT_SUBAGENT = "subagent";
const SUBAGENTS_DIR = "subagents";
const AGENT_META_FIELDS = ["agentName", "agentDescription", "parentAgentId"];

/**
 * Claude Code's per-project directory name: the absolute project path with every
 * non-alphanumeric character replaced by '-'.
 * @param {string} projectDir absolute project path
 * @returns {string}
 */
export function projectSlug(projectDir) {
  return projectDir.replace(/[^a-zA-Z0-9]/g, "-");
}

/**
 * Where Claude Code keeps this project's transcripts.
 * @param {string} projectDir absolute project path
 * @param {string} homeDir user home directory
 * @returns {string}
 */
export function defaultTranscriptsDir(projectDir, homeDir) {
  return path.join(homeDir, ".claude", "projects", projectSlug(projectDir));
}

/**
 * @typedef {object} AgentMeta identity fields from a subagent's meta.json; each is present only when set
 * @property {string} [agentName] meta name (teammates and other named subagents)
 * @property {string} [agentDescription] meta description
 * @property {string} [parentAgentId] id of the subagent that spawned this one; absent when the main session did
 */

/**
 * @typedef {object} TranscriptFile
 * @property {string} path absolute path
 * @property {string} file path relative to the transcripts dir, '/'-separated (stable log key)
 * @property {string} sessionId
 * @property {string} agent "main" or the subagent type
 */

/**
 * @typedef {object} AgentIdentity what a task map's `agents` entry can match a subagent transcript by;
 *   each field is present only when known
 * @property {string} [agentName]
 * @property {string} [agentType]
 * @property {string} [agentDescription]
 * @property {string} [parentFile] transcript file of the subagent that spawned this one
 */

/**
 * Lists main-session and subagent transcripts, sorted by relative path.
 * Main sessions: <dir>/<sessionId>.jsonl. Subagents: <dir>/<sessionId>/subagents/agent-<id>.jsonl
 * with an optional sibling agent-<id>.meta.json naming the agent (agentType, name, description) and
 * the subagent that spawned it (parentAgentId).
 * @param {string} transcriptsDir
 * @returns {(TranscriptFile & AgentMeta)[]}
 * @throws when transcriptsDir is missing or not a directory
 */
export function discoverTranscripts(transcriptsDir) {
  const found = [];
  for (const entry of fs.readdirSync(transcriptsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      const sessionId = entry.name.slice(0, -".jsonl".length);
      found.push(transcript(transcriptsDir, entry.name, sessionId, MAIN_AGENT));
    } else if (entry.isDirectory()) {
      found.push(...discoverSubagents(transcriptsDir, entry.name));
    }
  }
  return found.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

/**
 * The identity fields of a transcript or usage record that are set (non-empty strings).
 * @param {object} source
 * @returns {AgentMeta}
 */
export function pickAgentMeta(source) {
  return Object.fromEntries(AGENT_META_FIELDS.filter((field) => isNonEmptyString(source[field])).map((field) => [field, source[field]]));
}

/**
 * The identity of a subagent transcript, from its discovered transcript or from one of its logged
 * records (lines logged before the identity fields existed carry only the agent type).
 * @param {{file: string, agent?: string} & AgentMeta} source
 * @returns {AgentIdentity|null} null for main-session transcripts
 */
export function agentIdentity(source) {
  if (!isSubagentFile(source.file)) return null;
  const segments = source.file.split("/");
  const { agentName, agentDescription, parentAgentId } = pickAgentMeta(source);
  const identity = {
    agentName,
    agentType: isNonEmptyString(source.agent) && source.agent !== DEFAULT_SUBAGENT ? source.agent : undefined,
    agentDescription,
    // A spawning subagent's transcript sits next to its child's.
    parentFile: parentAgentId === undefined ? undefined : [...segments.slice(0, -1), `agent-${parentAgentId}.jsonl`].join("/"),
  };
  return Object.fromEntries(Object.entries(identity).filter(([, value]) => value !== undefined));
}

/**
 * The id Claude Code gives a subagent (its transcript lines' agentId), from its transcript file
 * name agent-<id>.jsonl.
 * @param {string} file transcript path relative to the transcripts dir
 * @returns {string|null} null for main-session transcripts
 */
export function subagentId(file) {
  if (!isSubagentFile(file)) return null;
  return file.split("/").at(-1).replace(/^agent-/, "").replace(/\.jsonl$/, "");
}

function isSubagentFile(file) {
  return file.split("/").at(-2) === SUBAGENTS_DIR;
}

function discoverSubagents(transcriptsDir, sessionId) {
  const subagentsDir = path.join(transcriptsDir, sessionId, SUBAGENTS_DIR);
  if (!fs.existsSync(subagentsDir)) return [];
  return fs
    .readdirSync(subagentsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => {
      const meta = readMeta(path.join(subagentsDir, entry.name.replace(/\.jsonl$/, ".meta.json")));
      const agent = isNonEmptyString(meta.agentType) ? meta.agentType : DEFAULT_SUBAGENT;
      const agentMeta = pickAgentMeta({ agentName: meta.name, agentDescription: meta.description, parentAgentId: meta.parentAgentId });
      return { ...transcript(transcriptsDir, `${sessionId}/${SUBAGENTS_DIR}/${entry.name}`, sessionId, agent), ...agentMeta };
    });
}

function readMeta(metaPath) {
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    return meta && typeof meta === "object" ? meta : {};
  } catch {
    return {};
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value !== "";
}

function transcript(transcriptsDir, file, sessionId, agent) {
  return { path: path.join(transcriptsDir, ...file.split("/")), file, sessionId, agent };
}
