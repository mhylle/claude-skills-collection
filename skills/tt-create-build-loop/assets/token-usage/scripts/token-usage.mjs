#!/usr/bin/env node
// Token-usage and cost report for this project's Claude Code sessions (run with --help).
// This wrapper owns the hook contract: with --quiet it never writes to stdout/stderr and
// always exits 0, logging any failure (including a broken library import) to
// <usage dir>/hook-errors.log so a Stop/SubagentStop/SessionEnd hook can never block.
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const quiet = argv.includes("--quiet");

try {
  const { main } = await import("../tooling/token-usage/src/cli.mjs");
  await main(argv);
} catch (error) {
  if (quiet) {
    logHookError(error);
    process.exitCode = 0;
  } else {
    process.stderr.write(`token-usage: ${error?.message ?? error}\n`);
    process.exitCode = 1;
  }
}

function logHookError(error) {
  try {
    const logIndex = argv.indexOf("--log");
    const usageDir =
      logIndex !== -1 && argv[logIndex + 1]
        ? path.dirname(path.resolve(argv[logIndex + 1]))
        : path.join(process.env.CLAUDE_PROJECT_DIR || path.resolve(import.meta.dirname, ".."), ".claude", "usage");
    fs.mkdirSync(usageDir, { recursive: true });
    fs.appendFileSync(path.join(usageDir, "hook-errors.log"), `${new Date().toISOString()} ${error?.stack ?? error}\n`);
  } catch {
    // Logging is best effort; a hook must never fail because of it.
  }
}
