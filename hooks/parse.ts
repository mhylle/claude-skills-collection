// Pure parsers: TaskTracker MCP texts, dotnet test/build output, .sln files and shell commands.
// No `$` here, so every function is unit-tested in parse.test.ts.

import type { HudCriterion, HudTask } from '../types'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** Capture group `i` of a match; '' when it did not take part. */
function group(m: RegExpMatchArray, i: number): string {
  return m[i] ?? ''
}

/** `Task "<title>" (id <uuid>) v<n> [<type>/<status>/<priority>]`, the head of getTask's answer. */
export function parseTask(text: string): HudTask | null {
  const m = new RegExp(`^Task "(.*)" \\(id (${UUID})\\) v\\d+ \\[([a-z_]+)/([a-z_]+)`, 'm').exec(text)
  return m ? { title: group(m, 1), id: group(m, 2), type: group(m, 3), status: group(m, 4) } : null
}

/** The `- [<type>/<status>] <title> (id <uuid>)` lines of getChildTasks and getTaskAncestors. */
export function parseTaskList(text: string): HudTask[] {
  const line = new RegExp(`^\\s*-\\s+\\[([a-z_]+)/([a-z_]+)\\]\\s+(.*?)\\s+\\(id (${UUID})\\)\\s*$`, 'gm')
  return [...text.matchAll(line)].map(m => ({ type: group(m, 1), status: group(m, 2), title: group(m, 3), id: group(m, 4) }))
}

/** The `- [<status>/<priority>] <slug>: <title> (id <uuid>)` lines of listRequirements. */
export function parseRequirements(text: string): { id: string; slug: string }[] {
  const line = new RegExp(`^\\s*-\\s+\\[[a-z_]+/[a-z_]+\\]\\s+([^:\\s]+):.*\\(id (${UUID})\\)\\s*$`, 'gm')
  return [...text.matchAll(line)].map(m => ({ slug: group(m, 1), id: group(m, 2) }))
}

/** The `- [x] (<n>) <text> (id <uuid>)` lines of listAcceptanceCriteria; any mark but a space is satisfied. */
export function parseCriteria(text: string): HudCriterion[] {
  const line = new RegExp(`^\\s*-\\s+\\[(.)\\]\\s+\\(\\d+\\)\\s+(.*?)\\s+\\(id ${UUID}\\)\\s*$`, 'gm')
  return [...text.matchAll(line)].map(m => ({ isSatisfied: group(m, 1) !== ' ', text: group(m, 2) }))
}

/** Whether listRequirementTaskLinks' answer links the requirement to task `taskId`. */
export function linksTask(text: string, taskId: string): boolean {
  return new RegExp(`\\btask ${taskId}\\b`).test(text)
}

export type TestSummary = { project: string; failed: number; passed: number; skipped: number }

/** dotnet test's `Passed!/Failed!  - Failed: n, Passed: n, Skipped: n, Total: n, Duration: … - X.dll` lines, last per project. */
export function parseTestSummaries(text: string): TestSummary[] {
  const line = /^[^\S\n]*(?:\d+[:-])?\s*(?:Passed!|Failed!)\s+-\s+Failed:\s+(\d+),\s+Passed:\s+(\d+),\s+Skipped:\s+(\d+),\s+Total:\s+\d+,.*?-\s+([^\s\\/]+?)\.dll\b/gm
  const byProject = new Map<string, TestSummary>()
  for (const m of text.matchAll(line)) {
    byProject.set(group(m, 4), { project: group(m, 4), failed: Number(group(m, 1)), passed: Number(group(m, 2)), skipped: Number(group(m, 3)) })
  }

  return [...byProject.values()].sort((a, b) => (a.project < b.project ? -1 : a.project > b.project ? 1 : 0))
}

/** The projects dotnet test started: `Test run for <path>/<X>.dll (…)`. */
export function parseTestRuns(text: string): string[] {
  return [...new Set([...text.matchAll(/Test run for .*?[\\/]([^\\/\s]+?)\.dll\b/g)].map(m => group(m, 1)))].sort()
}

/** MSBuild's closing `n Warning(s)` / `n Error(s)` lines (the last of each). */
export function parseBuildSummary(text: string): { warnings: number; errors: number } | null {
  const warnings = [...text.matchAll(/^\s*(\d+) Warning\(s\)\s*$/gm)].at(-1)
  const errors = [...text.matchAll(/^\s*(\d+) Error\(s\)\s*$/gm)].at(-1)
  return warnings && errors ? { warnings: Number(group(warnings, 1)), errors: Number(group(errors, 1)) } : null
}

/** The test projects a .sln lists: projects whose name contains "Test". */
export function parseSlnTestProjects(sln: string): string[] {
  const line = /^Project\("\{[^}]+\}"\)\s*=\s*"([^"]+)",\s*"([^"]+\.(?:cs|fs|vb)proj)"/gm
  return [...sln.matchAll(line)].map(m => group(m, 1)).filter(name => /test/i.test(name)).sort()
}

/** What a shell command runs, for the check alarms. */
export type CommandShape = {
  isDotnetTest: boolean
  isBuild: boolean
  isVerify: boolean
  /** The solution `dotnet test` names, resolved against a leading `cd <dir> &&`; null when none. */
  sln: string | null
  /** A filter, a pipe or a redirect: the output may not show every project. */
  isPartial: boolean
}

/** Reads a Bash or PowerShell command line. */
export function shapeOf(command: string): CommandShape {
  const test = /\bdotnet\s+test\b([^|&;>]*)/.exec(command)
  const testArgs = test === null ? '' : group(test, 1)
  let sln: string | null = null
  const named = /(\S+\.slnx?)\b/.exec(testArgs)
  if (named) {
    sln = group(named, 1).replace(/^["']|["']$/g, '')
    const cd = /^\s*cd\s+(["']?)([^"'&;]+?)\1\s*&&/.exec(command)
    if (cd && !isAbsolute(sln)) {
      sln = `${group(cd, 2).replace(/[\\/]+$/, '')}/${sln}`
    }

    sln = fromGitBash(sln)
  }

  return {
    isDotnetTest: test !== null,
    isBuild: /\bdotnet\s+build\b/.test(command),
    isVerify: /verify\.ps1\b/.test(command),
    sln,
    isPartial: test !== null && (/--filter\b/.test(testArgs) || /[|>]/.test(command.slice(test.index))),
  }
}

function isAbsolute(path: string): boolean {
  return /^([a-zA-Z]:)?[\\/]/.test(path)
}

/** `/c/projects/x` (Git Bash) as `C:/projects/x`; other paths unchanged. */
export function fromGitBash(path: string): string {
  return path.replace(/^\/([a-zA-Z])\//, (_, drive: string) => `${drive.toUpperCase()}:/`)
}

/** Whether a Write/Edit path is outside the orchestrator guard: Claude's own folders (memory, plans, scratchpad). */
export function isGuardExempt(path: string): boolean {
  const p = path.replace(/\\/g, '/').toLowerCase()
  return p.includes('/.claude/') || p.includes('/appdata/local/temp/claude/') || p.startsWith('/tmp/claude')
}

/** `12m`, `1h05m`, `40s`. */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

/** `▮▮▯▯` for done of total, `width` cells. */
export function progressBar(done: number, total: number, width = 5): string {
  if (total <= 0) return ''
  const full = Math.round((done / total) * width)
  return '▮'.repeat(full) + '▯'.repeat(width - full)
}

/** A title cut to `max` characters with an ellipsis. */
export function short(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`
}
