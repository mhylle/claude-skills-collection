import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { projectSlug, defaultTranscriptsDir, discoverTranscripts } from "../src/discover.mjs";
import { FIXTURE_TRANSCRIPTS } from "./helpers.mjs";

test("projectSlug replaces every non-alphanumeric character with '-' like Claude Code does", () => {
  assert.equal(
    projectSlug("/home/someone/projects/example.com/games/acme"),
    "-home-someone-projects-example-com-games-acme",
  );
});

test("defaultTranscriptsDir points at ~/.claude/projects/<slug>", () => {
  assert.equal(
    defaultTranscriptsDir("/work/my.app", "/home/someone"),
    path.join("/home/someone", ".claude", "projects", "-work-my-app"),
  );
});

test("discoverTranscripts finds main sessions and subagents with their agent type", () => {
  const found = discoverTranscripts(FIXTURE_TRANSCRIPTS);
  const simplified = found.map(({ file, sessionId, agent }) => ({ file, sessionId, agent }));
  assert.deepEqual(simplified, [
    { file: "session-a.jsonl", sessionId: "session-a", agent: "main" },
    { file: "session-a/subagents/agent-x.jsonl", sessionId: "session-a", agent: "Explore" },
    { file: "session-a/subagents/agent-y.jsonl", sessionId: "session-a", agent: "subagent" },
    { file: "session-b.jsonl", sessionId: "session-b", agent: "main" },
  ]);
  for (const entry of found) {
    assert.equal(entry.path, path.join(FIXTURE_TRANSCRIPTS, entry.file));
  }
});

test("discoverTranscripts throws when the transcripts dir cannot be read", () => {
  assert.throws(() => discoverTranscripts(path.join(FIXTURE_TRANSCRIPTS, "does-not-exist")));
  assert.throws(() => discoverTranscripts(path.join(FIXTURE_TRANSCRIPTS, "session-a.jsonl")));
});
