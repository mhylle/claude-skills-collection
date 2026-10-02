import crypto from "node:crypto";
import fs from "node:fs";

/**
 * The TaskTracker push's state file (tasktracker-push.json next to the log): how far into the log
 * TaskTracker has acknowledged, a fingerprint of the log that offset belongs to, and when the last
 * push failed (for the backoff window).
 *
 * The fingerprint is a hash of the log's first line. A log that is shorter than the offset, or
 * whose first line changed, was replaced (rotated, restored, regenerated), so the push starts it
 * over from 0; TaskTracker ignores messages it already has. A state file from the first version
 * (offset only) is trusted as long as the log is not shorter than the offset.
 */

const VERSION = 2;
const PREVIOUS_VERSION = 1;
/** Log lines are well under this; a longer first line is fingerprinted by its first 64 KiB. */
const FINGERPRINT_BYTES = 64 * 1024;
const NEWLINE = 0x0a;

/**
 * @typedef {object} PushState
 * @property {number} offset byte offset in the log up to which everything is settled
 * @property {string|null} fingerprint of the log `offset` belongs to (null: empty or missing log)
 * @property {number|null} lastFailureAt epoch ms of the last failed push
 * @property {boolean} backoffLogged whether skipping during that failure's backoff was logged
 */

/**
 * @param {string} statePath
 * @param {string} logPath
 * @returns {PushState} a fresh state (offset 0) when the file is missing, unreadable, or for another log
 */
export function readPushState(statePath, logPath) {
  const fingerprint = logFingerprint(logPath);
  const stored = readJson(statePath);
  const valid = (stored?.version === VERSION || stored?.version === PREVIOUS_VERSION) && Number.isSafeInteger(stored.offset) && stored.offset >= 0;
  if (!valid) return { offset: 0, fingerprint, lastFailureAt: null, backoffLogged: false };
  const sameLog = stored.offset <= logSize(logPath) && (stored.fingerprint === undefined || stored.fingerprint === fingerprint);
  return {
    offset: sameLog ? stored.offset : 0,
    fingerprint,
    lastFailureAt: Number.isFinite(stored.lastFailureAt) ? stored.lastFailureAt : null,
    backoffLogged: stored.backoffLogged === true,
  };
}

/**
 * Atomically replaces the state file.
 * @param {string} statePath
 * @param {PushState} state
 */
export function writePushState(statePath, state) {
  const tmpPath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify({ version: VERSION, ...state }) + "\n");
  fs.renameSync(tmpPath, statePath);
}

function logFingerprint(logPath) {
  let fd;
  try {
    fd = fs.openSync(logPath, "r");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  try {
    const buffer = Buffer.alloc(FINGERPRINT_BYTES);
    const bytesRead = fs.readSync(fd, buffer, 0, FINGERPRINT_BYTES, 0);
    if (bytesRead === 0) return null;
    const newline = buffer.subarray(0, bytesRead).indexOf(NEWLINE);
    const firstLine = buffer.subarray(0, newline === -1 ? bytesRead : newline);
    return crypto.createHash("sha256").update(firstLine).digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}

function logSize(logPath) {
  return fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}
