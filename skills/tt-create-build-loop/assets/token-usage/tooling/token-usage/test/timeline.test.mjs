import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimelines, activeTaskAt, attributionSettled } from "../src/timeline.mjs";

const events = [
  { sessionId: "s1", ts: "2026-09-27T10:05:00.000Z", taskId: "task-2", toolUseId: "t3" },
  { sessionId: "s1", ts: "2026-09-27T10:01:00.000Z", taskId: "task-1", toolUseId: "t1" },
  { sessionId: "s1", ts: "2026-09-27T10:03:00.000Z", taskId: null, toolUseId: "t2" },
  { sessionId: "s1", ts: "2026-09-27T10:04:00.000Z", taskId: "task-x", toolUseId: "t-err" },
  { sessionId: "s2", ts: "2026-09-27T09:00:00.000Z", taskId: "other", toolUseId: "t9" },
];

test("set -> clear -> set timeline resolves the active task at any instant", () => {
  const timelines = buildTimelines(events, ["t-err"]);
  const s1 = timelines.get("s1");
  assert.equal(activeTaskAt(s1, "2026-09-27T10:00:00.000Z"), null);
  assert.equal(activeTaskAt(s1, "2026-09-27T10:02:00.000Z"), "task-1");
  assert.equal(activeTaskAt(s1, "2026-09-27T10:03:30.000Z"), null);
  assert.equal(activeTaskAt(s1, "2026-09-27T10:06:00.000Z"), "task-2");
});

test("an event only applies strictly after its own timestamp (the calling message belongs to the previous state)", () => {
  const s1 = buildTimelines(events, []).get("s1");
  assert.equal(activeTaskAt(s1, "2026-09-27T10:01:00.000Z"), null);
  assert.equal(activeTaskAt(s1, "2026-09-27T10:03:00.000Z"), "task-1");
});

test("tool calls whose result was an error are ignored", () => {
  const s1 = buildTimelines(events, ["t-err"]).get("s1");
  assert.equal(activeTaskAt(s1, "2026-09-27T10:04:30.000Z"), null);
  const unfiltered = buildTimelines(events, []).get("s1");
  assert.equal(activeTaskAt(unfiltered, "2026-09-27T10:04:30.000Z"), "task-x");
});

test("timelines are per session and a missing timeline means no active task", () => {
  const timelines = buildTimelines(events, []);
  assert.equal(activeTaskAt(timelines.get("s2"), "2026-09-27T10:02:00.000Z"), "other");
  assert.equal(activeTaskAt(timelines.get("nope"), "2026-09-27T10:02:00.000Z"), null);
});

test("attribution is unsettled while the latest event before a message still awaits its tool result", () => {
  const pendingEvents = [
    { sessionId: "s1", ts: "2026-09-27T10:01:00.000Z", taskId: "task-1", toolUseId: "t1" },
    { sessionId: "s1", ts: "2026-09-27T10:05:00.000Z", taskId: "task-2", toolUseId: "t2", pending: true },
  ];
  const s1 = buildTimelines(pendingEvents, []).get("s1");
  assert.equal(attributionSettled(s1, "2026-09-27T10:02:00.000Z"), true);
  assert.equal(attributionSettled(s1, "2026-09-27T10:05:00.000Z"), true, "the calling message itself is not affected");
  assert.equal(attributionSettled(s1, "2026-09-27T10:06:00.000Z"), false);
  assert.equal(attributionSettled(undefined, "2026-09-27T10:06:00.000Z"), true);
});
