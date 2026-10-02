import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { withLock, withLockAsync, takeOverStaleLock } from "../src/lock.mjs";
import { makeTmpDir } from "./helpers.mjs";

test("withLock runs the callback and releases the lock, even when the callback throws", () => {
  const lockPath = path.join(makeTmpDir(), "nested", "ingest.lock");
  assert.equal(withLock(lockPath, () => fs.existsSync(lockPath)), true);
  assert.equal(fs.existsSync(lockPath), false);
  assert.throws(() => withLock(lockPath, () => { throw new Error("boom"); }), /boom/);
  assert.equal(fs.existsSync(lockPath), false);
});

test("withLock gives up when another run holds a fresh lock", () => {
  const lockPath = path.join(makeTmpDir(), "ingest.lock");
  fs.writeFileSync(lockPath, "12345");
  assert.throws(() => withLock(lockPath, () => "ran", { waitMs: 100 }), /held by another run/);
  assert.equal(fs.existsSync(lockPath), true, "someone else's lock is left alone");
});

test("withLock takes over an abandoned (stale) lock", () => {
  const lockPath = path.join(makeTmpDir(), "ingest.lock");
  fs.writeFileSync(lockPath, "12345");
  const twoMinutesAgo = new Date(Date.now() - 120_000);
  fs.utimesSync(lockPath, twoMinutesAgo, twoMinutesAgo);
  assert.equal(withLock(lockPath, () => "ran", { waitMs: 100 }), "ran");
  assert.equal(fs.existsSync(lockPath), false);
});

test("release never removes a lock that meanwhile belongs to another run", () => {
  const lockPath = path.join(makeTmpDir(), "ingest.lock");
  withLock(lockPath, () => fs.writeFileSync(lockPath, "another-run-token"));
  assert.equal(fs.readFileSync(lockPath, "utf8"), "another-run-token");
});

test("stale takeover removes the lock only if it is still the stale one that was observed", () => {
  const dir = makeTmpDir();
  const lockPath = path.join(dir, "ingest.lock");
  fs.writeFileSync(lockPath, "stale-token");
  assert.equal(takeOverStaleLock(lockPath, "stale-token"), true);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("stale takeover that races with a fresh acquirer puts the fresh lock back", () => {
  const dir = makeTmpDir();
  const lockPath = path.join(dir, "ingest.lock");
  // Another waiter already replaced the stale lock with its own fresh one.
  fs.writeFileSync(lockPath, "fresh-token");
  assert.equal(takeOverStaleLock(lockPath, "stale-token"), false);
  assert.equal(fs.readFileSync(lockPath, "utf8"), "fresh-token");
  assert.deepEqual(fs.readdirSync(dir), ["ingest.lock"]);
});

test("stale takeover of a lock that is already gone is a no-op", () => {
  const dir = makeTmpDir();
  assert.equal(takeOverStaleLock(path.join(dir, "ingest.lock"), "stale-token"), false);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("a lock whose holder process has exited is taken over at once, however fresh it is", () => {
  const lockPath = path.join(makeTmpDir(), "push.lock");
  const exited = spawnSync(process.execPath, ["-e", ""]).pid;
  fs.writeFileSync(lockPath, `${exited}-${Date.now()}-abc123`);
  assert.equal(withLock(lockPath, () => "ran", { waitMs: 0 }), "ran");
});

test("withLockAsync holds the lock until the async callback settles; a second caller with waitMs 0 gets ELOCKED at once", async () => {
  const lockPath = path.join(makeTmpDir(), "push.lock");
  let release;
  const first = withLockAsync(lockPath, () => new Promise((resolve) => (release = resolve)));
  assert.equal(fs.existsSync(lockPath), true);
  await assert.rejects(() => withLockAsync(lockPath, async () => "second", { waitMs: 0 }), (error) => error.code === "ELOCKED");
  release("first");
  assert.equal(await first, "first");
  assert.equal(fs.existsSync(lockPath), false);
  await assert.rejects(() => withLockAsync(lockPath, async () => { throw new Error("boom"); }), /boom/);
  assert.equal(fs.existsSync(lockPath), false, "released after a rejection too");
});
