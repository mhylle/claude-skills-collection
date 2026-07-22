#!/usr/bin/env node
// Merge hooks.json's "hooks" object into a Claude Code settings.json file.
//
// Claude Code only loads hooks from the "hooks" key inside settings.json
// (user/project/local) - a standalone hooks.json next to it is never read.
// This merges by event, concatenating each event's hook-group array and
// skipping groups that are already present (by deep-equality), so re-running
// install.sh is idempotent instead of duplicating hooks on every install.
//
// Usage: node merge-hooks.js <hooks.json> <settings.json>

const fs = require('fs');

const [, , hooksPath, settingsPath] = process.argv;
if (!hooksPath || !settingsPath) {
  console.error('Usage: node merge-hooks.js <hooks.json> <settings.json>');
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
let target = {};
if (fs.existsSync(settingsPath)) {
  fs.copyFileSync(settingsPath, settingsPath + '.backup');
  target = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

target.hooks = target.hooks || {};
for (const [event, groups] of Object.entries(source.hooks || {})) {
  target.hooks[event] = target.hooks[event] || [];
  const existing = target.hooks[event].map((g) => JSON.stringify(g));
  for (const group of groups) {
    const serialized = JSON.stringify(group);
    if (!existing.includes(serialized)) {
      target.hooks[event].push(group);
      existing.push(serialized);
    }
  }
}

fs.writeFileSync(settingsPath, JSON.stringify(target, null, 2) + '\n');
console.log(`Merged hooks from ${hooksPath} into ${settingsPath}`);
