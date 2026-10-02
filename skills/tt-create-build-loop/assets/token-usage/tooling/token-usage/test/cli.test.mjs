import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { projectSlug } from "../src/discover.mjs";
import { FIXTURE_TRANSCRIPTS, assertUsd, copyFixtureTranscripts, makeTmpDir, readJsonl, runCli } from "./helpers.mjs";
import { TOTALS, BY_TASK } from "./expected.mjs";

function isolatedPaths() {
  const root = makeTmpDir();
  return { root, logPath: path.join(root, "usage", "token-usage.jsonl") };
}

test("--json prints the machine-readable report and writes nothing", () => {
  const { root, logPath } = isolatedPaths();
  const { status, stdout, stderr } = runCli(["--json", "--transcripts-dir", FIXTURE_TRANSCRIPTS, "--log", logPath]);
  assert.equal(status, 0, stderr);
  const report = JSON.parse(stdout);
  assert.match(report.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(report.note, "API-equivalent list price; subscription billing differs");
  assert.equal(report.messagesCounted, TOTALS.messages);
  assert.equal(report.malformedLines, 1);
  assert.equal(report.totals.totalTokens, TOTALS.totalTokens);
  assertUsd(report.totals.costUsd, TOTALS.costUsd);
  assert.deepEqual(report.unknownModels, ["claude-mystery-9"]);
  assert.deepEqual(fs.readdirSync(root), [], "a summary run must not create files");
});

test("--backfill is the same full scan as the default", () => {
  const { logPath } = isolatedPaths();
  const { status, stdout } = runCli(["--backfill", "--json", "--transcripts-dir", FIXTURE_TRANSCRIPTS, "--log", logPath]);
  assert.equal(status, 0);
  assert.equal(JSON.parse(stdout).totals.totalTokens, TOTALS.totalTokens);
});

test("default output is a human-readable summary", () => {
  const { logPath } = isolatedPaths();
  const { status, stdout } = runCli(["--transcripts-dir", FIXTURE_TRANSCRIPTS, "--log", logPath]);
  assert.equal(status, 0);
  assert.match(stdout, /API-equivalent list price; subscription billing differs/);
  assert.match(stdout, /Messages counted: 16/);
  assert.match(stdout, /40,196/);
  assert.match(stdout, /\$0\.0921/);
  assert.match(stdout, /task-2/);
  assert.match(stdout, /unattributed/);
  assert.match(stdout, /2026-09-27/);
  assert.match(stdout, /claude-mystery-9/);
});

test("--task-map adds phase and release roll-ups to the JSON output", () => {
  const { root, logPath } = isolatedPaths();
  const mapPath = path.join(root, "task-map.json");
  fs.writeFileSync(mapPath, JSON.stringify({ "task-1": { phaseId: "phase-a", phaseTitle: "Phase A", release: "R1" } }));
  const { status, stdout, stderr } = runCli(["--json", "--task-map", mapPath, "--transcripts-dir", FIXTURE_TRANSCRIPTS, "--log", logPath]);
  assert.equal(status, 0, stderr);
  const report = JSON.parse(stdout);
  assertUsd(report.byPhase["phase-a"].costUsd, BY_TASK["task-1"].costUsd + BY_TASK["phase-a"].costUsd);
  assertUsd(report.byRelease.R1.costUsd, BY_TASK["task-1"].costUsd + BY_TASK["phase-a"].costUsd);
});

test("--ingest reports how many records it appended; a second run appends zero", () => {
  const { root, logPath } = isolatedPaths();
  const transcripts = copyFixtureTranscripts(path.join(root, "transcripts"));
  const first = runCli(["--ingest", "--transcripts-dir", transcripts, "--log", logPath]);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Appended 16 /);
  const second = runCli(["--ingest", "--transcripts-dir", transcripts, "--log", logPath]);
  assert.match(second.stdout, /Appended 0 /);
  assert.equal(readJsonl(logPath).length, 16);
});

test("hook form: --ingest --quiet prints nothing and exits 0", () => {
  const { root, logPath } = isolatedPaths();
  const transcripts = copyFixtureTranscripts(path.join(root, "transcripts"));
  const { status, stdout, stderr } = runCli(["--ingest", "--quiet", "--transcripts-dir", transcripts, "--log", logPath]);
  assert.equal(status, 0);
  assert.equal(stdout, "");
  assert.equal(stderr, "");
  assert.equal(readJsonl(logPath).length, 16);
});

test("fail-safe: an unreadable transcripts dir in --quiet mode exits 0 and logs the error", () => {
  const { root, logPath } = isolatedPaths();
  const notADir = path.join(root, "not-a-dir");
  fs.writeFileSync(notADir, "plain file");
  const { status, stdout, stderr } = runCli(["--ingest", "--quiet", "--transcripts-dir", notADir, "--log", logPath]);
  assert.equal(status, 0);
  assert.equal(stdout, "");
  assert.equal(stderr, "");
  const errorLog = fs.readFileSync(path.join(root, "usage", "hook-errors.log"), "utf8");
  assert.match(errorLog, /not-a-dir/);
  assert.match(errorLog, /^\d{4}-\d{2}-\d{2}T/);
});

test("fail-safe: a malformed task map in --quiet mode exits 0 and logs the error", () => {
  const { root, logPath } = isolatedPaths();
  const mapPath = path.join(root, "bad-map.json");
  fs.writeFileSync(mapPath, "{ not json");
  const { status, stdout } = runCli(["--quiet", "--task-map", mapPath, "--transcripts-dir", FIXTURE_TRANSCRIPTS, "--log", logPath]);
  assert.equal(status, 0);
  assert.equal(stdout, "");
  assert.match(fs.readFileSync(path.join(root, "usage", "hook-errors.log"), "utf8"), /bad-map\.json/);
});

test("interactive runs report errors on stderr with a non-zero exit code", () => {
  const { root, logPath } = isolatedPaths();
  const { status, stderr } = runCli(["--transcripts-dir", path.join(root, "missing"), "--log", logPath]);
  assert.equal(status, 1);
  assert.match(stderr, /token-usage:/);
});

test("unknown options are rejected in interactive mode", () => {
  const { status, stderr } = runCli(["--bogus"]);
  assert.equal(status, 1);
  assert.match(stderr, /--bogus/);
});

test("without overrides the CLI reads ~/.claude/projects/<slug of CLAUDE_PROJECT_DIR> and logs under the project", () => {
  const home = makeTmpDir("token-usage-home-");
  const projectDir = path.join(makeTmpDir("token-usage-proj-"), "my.game");
  fs.mkdirSync(projectDir);
  copyFixtureTranscripts(path.join(home, ".claude", "projects", projectSlug(projectDir)));
  const env = { HOME: home, CLAUDE_PROJECT_DIR: projectDir };

  const summary = runCli(["--json"], { env });
  assert.equal(summary.status, 0, summary.stderr);
  assert.equal(JSON.parse(summary.stdout).messagesCounted, TOTALS.messages);

  const hook = runCli(["--ingest", "--quiet"], { env });
  assert.equal(hook.status, 0);
  assert.equal(hook.stdout, "");
  assert.equal(readJsonl(path.join(projectDir, ".claude", "usage", "token-usage.jsonl")).length, 16);
});
