import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

export const TEST_DIR = import.meta.dirname;
export const FIXTURE_TRANSCRIPTS = path.join(TEST_DIR, "fixtures", "transcripts");
export const REPO_ROOT = path.resolve(TEST_DIR, "..", "..", "..");
export const CLI_PATH = path.join(REPO_ROOT, "scripts", "token-usage.mjs");
export const PRICING_PATH = path.join(REPO_ROOT, "scripts", "pricing.json");

/** Creates a fresh temporary directory for one test. */
export function makeTmpDir(prefix = "token-usage-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Copies the fixture transcripts dir into `targetDir` (created) and returns it. */
export function copyFixtureTranscripts(targetDir) {
  fs.cpSync(FIXTURE_TRANSCRIPTS, targetDir, { recursive: true });
  return targetDir;
}

/** Copies a fixture transcripts dir into a fresh temporary dir, with a usage log path beside it. */
export function tmpTranscripts(fixtureDir) {
  const root = makeTmpDir();
  const transcriptsDir = path.join(root, "transcripts");
  fs.cpSync(fixtureDir, transcriptsDir, { recursive: true });
  return { root, transcriptsDir, logPath: path.join(root, "usage", "token-usage.jsonl") };
}

/** Output tokens per task id of a report, plus "unattributed" when anything is. */
export function outputsByTask(report) {
  const buckets = { ...report.byTask, ...(report.unattributed.messages > 0 ? { unattributed: report.unattributed } : {}) };
  return Object.fromEntries(Object.entries(buckets).map(([taskId, bucket]) => [taskId, bucket.outputTokens]));
}

/** Runs the CLI in a child process and returns { status, stdout, stderr }. */
export function runCli(args, { env = {}, cwd = REPO_ROOT } = {}) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Asserts two USD amounts are equal to the micro-dollar. */
export function assertUsd(actual, expected, message) {
  assert.equal(typeof actual, "number", message ?? `expected a number, got ${actual}`);
  assert.equal(Math.round(actual * 1e6), Math.round(expected * 1e6), message);
}

/** Reads a JSONL file into an array of objects. */
export function readJsonl(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

/** Builds one assistant transcript line in the Claude Code format. */
export function assistantLine({ id, model = "claude-opus-5-5", ts, sessionId = "session-a", input = 0, output = 0, cacheRead = 0, content = [{ type: "text", text: "x" }] }) {
  return JSON.stringify({
    type: "assistant",
    timestamp: ts,
    sessionId,
    requestId: `req_${id}`,
    message: {
      id,
      model,
      role: "assistant",
      content,
      usage: {
        input_tokens: input,
        output_tokens: output,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: 0,
        cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
        speed: "standard",
      },
    },
  });
}

/** A tool_use content block calling TaskTracker's setActiveTask. */
export function setActiveTaskBlock(toolUseId, taskId) {
  return { type: "tool_use", id: toolUseId, name: "mcp__tasktracker__tasktracker_setActiveTask", input: { taskId } };
}

/** Builds one user transcript line carrying a tool_result. */
export function toolResultLine({ toolUseId, ts, sessionId = "session-a", isError = false }) {
  const block = { type: "tool_result", tool_use_id: toolUseId, content: [{ type: "text", text: isError ? "Error" : "ok" }] };
  return JSON.stringify({ type: "user", timestamp: ts, sessionId, message: { role: "user", content: [isError ? { ...block, is_error: true } : block] } });
}
