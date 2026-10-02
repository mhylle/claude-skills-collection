#!/usr/bin/env node
// Installs the bundled token-usage tooling into a project (run with --help).
//
// It plans every change first and writes nothing if any of them conflicts with what the project
// already has: a differing file is never overwritten, settings.json is merged (every existing key
// and hook kept, ours added once), the gitignore only gains the lines it lacks, an existing
// tasktracker.json must name the same project, and an existing tasktracker.local.json the same
// mcp-server. Each file is written whole, through a rename. Running it again changes nothing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS = path.resolve(import.meta.dirname, "..", "assets", "token-usage");
/** Asset files that are merged into the project rather than copied. */
const SNIPPETS = new Set(["settings-hooks.json", "gitignore.snippet"]);
const SETTINGS = path.join(".claude", "settings.json");
/** Committed: the project id. */
const CONFIG = path.join(".claude", "usage", "tasktracker.json");
/** Gitignored: where this machine's TaskTracker mcp-server is. */
const LOCAL_CONFIG = path.join(".claude", "usage", "tasktracker.local.json");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const USAGE = `Usage: node install-token-tooling.mjs --target <repo> --project-id <uuid> --mcp-dir <dir> [--dry-run]

  --target      the project's root (an existing git work tree)
  --project-id  its TaskTracker project id (written to .claude/usage/tasktracker.json, committed)
  --mcp-dir     TaskTracker's mcp-server directory, the one holding lib/mcp-client.js (written to
                .claude/usage/tasktracker.local.json, gitignored)
  --dry-run     print the plan and write nothing
`;

/**
 * Plans the install. Each step is {action, file, content?}: create, merge or append steps carry the
 * full new content; unchanged steps carry none; conflict steps carry a reason.
 * @param {{target: string, projectId: string, mcpDir: string}} options
 * @returns {{action: string, file: string, content?: string, reason?: string}[]}
 */
export function planInstall({ target, projectId, mcpDir }) {
  return [...planCopies(target), planSettings(target), planGitignore(target), planConfig(target, projectId), planLocalConfig(target, mcpDir)];
}

/**
 * Applies a plan whose steps are free of conflicts. Each file is written to a temporary sibling and
 * renamed over its destination, so no file is ever left half-written.
 * @param {string} target
 * @param {ReturnType<typeof planInstall>} plan
 */
export function applyPlan(target, plan) {
  for (const step of plan) {
    if (step.content === undefined) continue;
    const file = path.join(target, step.file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, step.content);
    fs.renameSync(temporary, file);
  }
}

function planCopies(target) {
  return listFiles(ASSETS)
    .filter((file) => !SNIPPETS.has(file))
    .map((file) => {
      const content = fs.readFileSync(path.join(ASSETS, file), "utf8");
      const existing = readIfExists(path.join(target, file));
      if (existing === null) return { action: "create", file, content };
      if (existing === content) return { action: "unchanged", file };
      return { action: "conflict", file, reason: "the project already has a different file here" };
    });
}

function planSettings(target) {
  const snippet = JSON.parse(fs.readFileSync(path.join(ASSETS, "settings-hooks.json"), "utf8"));
  const existingText = readIfExists(path.join(target, SETTINGS));
  let settings = {};
  if (existingText !== null) {
    try {
      settings = JSON.parse(existingText);
    } catch (error) {
      return { action: "conflict", file: SETTINGS, reason: `not valid JSON (${error.message}); fix it, then run again` };
    }
  }
  const hooks = { ...(settings.hooks ?? {}) };
  let added = 0;
  for (const [event, groups] of Object.entries(snippet.hooks)) {
    const present = new Set((hooks[event] ?? []).flatMap((group) => group.hooks ?? []).map((hook) => hook.command));
    // Only the hooks that are missing, so a command already present is never repeated.
    const missing = groups
      .map((group) => ({ ...group, hooks: group.hooks.filter((hook) => !present.has(hook.command)) }))
      .filter((group) => group.hooks.length > 0);
    if (missing.length > 0) {
      hooks[event] = [...(hooks[event] ?? []), ...missing];
      added += missing.length;
    }
  }
  if (added === 0) return { action: "unchanged", file: SETTINGS };
  return { action: existingText === null ? "create" : "merge", file: SETTINGS, content: JSON.stringify({ ...settings, hooks }, null, 2) + "\n" };
}

function planGitignore(target) {
  const snippet = fs.readFileSync(path.join(ASSETS, "gitignore.snippet"), "utf8").split(/\r?\n/).filter((line) => line.trim() !== "");
  const existing = readIfExists(path.join(target, ".gitignore"));
  const lines = new Set((existing ?? "").split(/\r?\n/).map((line) => line.trim()));
  const missing = snippet.filter((line) => !line.startsWith("#") && !lines.has(line));
  if (missing.length === 0) return { action: "unchanged", file: ".gitignore" };
  const header = snippet.filter((line) => line.startsWith("#"));
  const eol = existing?.includes("\r\n") ? "\r\n" : "\n";
  const base = existing === null || existing === "" ? "" : existing.endsWith("\n") ? existing + eol : existing + eol + eol;
  return { action: existing === null ? "create" : "append", file: ".gitignore", content: base + [...header, ...missing].join(eol) + eol };
}

function planConfig(target, projectId) {
  const existing = readJsonIfExists(target, CONFIG);
  if (existing === null) return { action: "create", file: CONFIG, content: JSON.stringify({ projectId }, null, 2) + "\n" };
  if (existing.error) return { action: "conflict", file: CONFIG, reason: existing.error };
  if (String(existing.value.projectId).toLowerCase() !== projectId.toLowerCase()) {
    return { action: "conflict", file: CONFIG, reason: `names project ${existing.value.projectId}, not ${projectId}` };
  }
  return { action: "unchanged", file: CONFIG };
}

function planLocalConfig(target, mcpDir) {
  const existing = readJsonIfExists(target, LOCAL_CONFIG);
  if (existing === null) return { action: "create", file: LOCAL_CONFIG, content: JSON.stringify({ mcpServerDir: mcpDir }, null, 2) + "\n" };
  if (existing.error) return { action: "conflict", file: LOCAL_CONFIG, reason: existing.error };
  const current = existing.value.mcpServerDir;
  if (typeof current === "string" && path.resolve(path.dirname(path.join(target, LOCAL_CONFIG)), current) === mcpDir) {
    return { action: "unchanged", file: LOCAL_CONFIG };
  }
  return { action: "conflict", file: LOCAL_CONFIG, reason: `points at ${JSON.stringify(current)}, not ${mcpDir}` };
}

/** Files under dir, relative and '/'-separated, sorted. */
function listFiles(dir, prefix = "") {
  return fs
    .readdirSync(path.join(dir, prefix), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory() ? listFiles(dir, relative) : [relative];
    })
    .sort();
}

function readIfExists(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/** null when absent, {value} when a JSON object, {error} otherwise. */
function readJsonIfExists(target, file) {
  const text = readIfExists(path.join(target, file));
  if (text === null) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? { value } : { error: "not a JSON object" };
  } catch (error) {
    return { error: `not valid JSON (${error.message})` };
  }
}

function parseArgs(argv) {
  const options = { target: null, projectId: null, mcpDir: null, dryRun: false, help: false };
  const valued = { "--target": "target", "--project-id": "projectId", "--mcp-dir": "mcpDir" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg in valued) {
      if (argv[i + 1] === undefined) throw new Error(`${arg} needs a value`);
      options[valued[arg]] = argv[i + 1];
      i += 1;
    } else throw new Error(`unknown option ${arg}`);
  }
  if (options.help) return options;
  if (!options.target || !options.projectId || !options.mcpDir) throw new Error("--target, --project-id and --mcp-dir are required");
  if (!UUID.test(options.projectId)) throw new Error(`--project-id must be a TaskTracker project uuid, not ${options.projectId}`);
  options.target = path.resolve(options.target);
  if (!fs.existsSync(path.join(options.target, ".git"))) throw new Error(`--target ${options.target} is not the root of a git work tree`);
  options.mcpDir = path.resolve(options.mcpDir);
  if (!fs.existsSync(path.join(options.mcpDir, "lib", "mcp-client.js"))) {
    throw new Error(`--mcp-dir ${options.mcpDir} has no lib/mcp-client.js; point it at TaskTracker's mcp-server`);
  }
  return options;
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  const plan = planInstall(options);
  const conflicts = plan.filter((step) => step.action === "conflict");
  if (conflicts.length > 0) {
    throw new Error(`nothing written; resolve these first:\n${conflicts.map((step) => `  ${step.file}: ${step.reason}`).join("\n")}`);
  }
  if (!options.dryRun) applyPlan(options.target, plan);
  const counts = Object.entries(Object.groupBy(plan, (step) => step.action)).map(([action, steps]) => `${steps.length} ${action}`);
  const changed = plan.filter((step) => step.action !== "unchanged" && !step.file.startsWith("tooling/"));
  const lines = [
    `${options.dryRun ? "Would install" : "Installed"} the token-usage tooling into ${options.target}: ${counts.join(", ")}.`,
    ...changed.map((step) => `  ${step.action} ${step.file}`),
    ...(plan.some((step) => step.file.startsWith("tooling/") && step.action === "create") ? ["  create tooling/token-usage/** (README, source, tests, fixtures)"] : []),
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

/** True when this file is the program being run, however it was reached (through a symlink, say). */
function isMain() {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`install-token-tooling: ${error.message}\n`);
    process.exitCode = 1;
  }
}
