import fs from "node:fs";
import path from "node:path";

const STALE_AFTER_MS = 60_000;
const WAIT_MS = 5_000;
const POLL_MS = 50;
/** Tokens this module writes: `<pid>-<ms>-<random>`, so a lock names the process holding it. */
const TOKEN_PID = /^(\d+)-\d+-[a-z0-9]+$/;

/**
 * Runs `fn` while holding an exclusive lock file, so concurrent hook runs (e.g. several
 * SubagentStop events at once) do not append the same records twice. The lock file holds a
 * per-run token: release only removes the lock while it still carries that token, and a lock is
 * considered abandoned and taken over (see takeOverStaleLock) once it is older than
 * `staleAfterMs` or the process that holds it has exited (a hook killed at its timeout).
 * @template T
 * @param {string} lockPath
 * @param {() => T} fn
 * @param {{waitMs?: number, staleAfterMs?: number}} [options] how long to wait for another run to
 *   finish (0: give up at once), and the age at which a lock counts as abandoned
 * @returns {T}
 * @throws an error with code "ELOCKED" when the lock is still held after waiting
 */
export function withLock(lockPath, fn, options = {}) {
  const token = lock(lockPath, options);
  try {
    return fn();
  } finally {
    release(lockPath, token);
  }
}

/**
 * withLock for an async `fn`: the lock is held until the promise settles.
 * @template T
 * @param {string} lockPath
 * @param {() => Promise<T>} fn
 * @param {{waitMs?: number, staleAfterMs?: number}} [options] as for withLock
 * @returns {Promise<T>}
 */
export async function withLockAsync(lockPath, fn, options = {}) {
  const token = lock(lockPath, options);
  try {
    return await fn();
  } finally {
    release(lockPath, token);
  }
}

function lock(lockPath, { waitMs = WAIT_MS, staleAfterMs = STALE_AFTER_MS }) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const token = uniqueToken();
  acquire(lockPath, token, waitMs, staleAfterMs);
  return token;
}

function release(lockPath, token) {
  if (readToken(lockPath) === token) fs.rmSync(lockPath, { force: true });
}

/**
 * Removes a lock judged stale, but only if it is still the lock that was judged. The lock is
 * first moved aside atomically (only one racer can move a given file); if the moved file turns
 * out to be a fresh lock another run created meanwhile, it is linked back into place.
 * @param {string} lockPath
 * @param {string} staleToken token read from the lock when it was judged stale
 * @returns {boolean} true when the stale lock was removed by this call
 */
export function takeOverStaleLock(lockPath, staleToken) {
  const aside = `${lockPath}.${uniqueToken()}.stale`;
  try {
    fs.renameSync(lockPath, aside);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  try {
    if (readToken(aside) === staleToken) return true;
    try {
      fs.linkSync(aside, lockPath);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    return false;
  } finally {
    fs.rmSync(aside, { force: true });
  }
}

function acquire(lockPath, token, waitMs, staleAfterMs) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      fs.writeFileSync(lockPath, token, { flag: "wx" });
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const holder = readHolder(lockPath);
    if (holder && (Date.now() - holder.mtimeMs > staleAfterMs || holderExited(holder.token))) {
      takeOverStaleLock(lockPath, holder.token);
      continue;
    }
    if (Date.now() >= deadline) throw Object.assign(new Error(`lock ${lockPath} is held by another run`), { code: "ELOCKED" });
    if (holder) sleep(POLL_MS);
  }
}

/** True only when the token names a process that no longer exists; unknown tokens count as alive. */
function holderExited(token) {
  const pid = Number(TOKEN_PID.exec(token)?.[1]);
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error.code === "ESRCH";
  }
}

function readHolder(lockPath) {
  const token = readToken(lockPath);
  if (token === null) return null;
  try {
    return { token, mtimeMs: fs.statSync(lockPath).mtimeMs };
  } catch {
    return null;
  }
}

function readToken(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function uniqueToken() {
  return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
