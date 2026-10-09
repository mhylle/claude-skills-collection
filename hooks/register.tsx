// devflow HUD (part of the devflow plugin): a progress band and a /hud pane for the devflow TaskTracker skills, and the functions
// the skills lean on: the orchestrator guard, the in-flight watch, the time-tracking heartbeat and
// pause, and the test-run alarms. See README.md.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

import type { HudAgent, HudCheck, HudGuard, HudPhase, HudRequirement, HudTask } from '../types'
import {
  formatDuration,
  isGuardExempt,
  linksTask,
  parseBuildSummary,
  parseCriteria,
  parseRequirements,
  parseSlnTestProjects,
  parseTask,
  parseTaskList,
  parseTestRuns,
  parseTestSummaries,
  shapeOf,
} from './parse'
import { isRunning, PANE } from './state'
import { band, hasContent, pane, type HudView } from './view'

// Every function that takes `$`, and every state atom, lives in this file: the engine follows `$` and reads
// `$.state` references only where they are declared in the file that uses them.

// The session state the band and the pane draw from (declared in ../types, PluginState).
const phaseAtom = atom({ plugin: 'devflow', key: 'phase' } as const, null as HudPhase | null)
const activeTaskAtom = atom({ plugin: 'devflow', key: 'activeTaskId' } as const, null as string | null)
const agentsAtom = atom({ plugin: 'devflow', key: 'agents' } as const, [] as HudAgent[])
const checksAtom = atom({ plugin: 'devflow', key: 'checks' } as const, [] as HudCheck[])
const guardAtom = atom({ plugin: 'devflow', key: 'guard' } as const, { isEnabled: true, isActive: false, skill: '' } as HudGuard)
const bandHiddenAtom = atom({ plugin: 'devflow', key: 'isBandHidden' } as const, false)
const tickAtom = atom({ plugin: 'devflow', key: 'tick' } as const, 0)

/** How often the background tick polls the agents and runs a wanted refresh. */
const TICK_MS = 2_000

/** TaskTracker closes a time segment after ~5 minutes without a call; heartbeat inside that. */
const HEARTBEAT_MS = 240_000

/** TaskTracker tools after which the view is read again. */
const WRITES = new Set([
  'updateTaskStatus',
  'batchUpdateStatus',
  'createTask',
  'batchCreateTasks',
  'updateTask',
  'batchUpdateTasks',
  'archiveTask',
  'deleteTask',
  'reparentTask',
  'completeWithCaveat',
  'addAcceptanceCriterion',
  'updateAcceptanceCriterion',
  'deleteAcceptanceCriterion',
])

/** Writes that change which requirements a phase links (the cached links are read again). */
const LINK_WRITES = new Set(['linkRequirementToTask', 'unlinkRequirementFromTask'])

const PREFIX = 'mcp__tasktracker__tasktracker_'

const USAGE = '/hud opens the pane. /hud refresh | guard on|off | band on|off | project <uuid>'

/** Module state; a reload starts it over (what is drawn lives in $.state). */
const hud = {
  orchestrator: /implement-plan|implement-phase|tt-workflow-run/,
  projectId: '',
  /** After an automatic pause: no TaskTracker call of ours until the next turn, or it would book the wait. */
  isQuiet: false,
  isRefreshWanted: false,
  isForcedRefresh: false,
  isUserRefresh: false,
  isTicking: false,
  lastHeartbeat: 0,
  lastRedraw: 0,
  slnTests: new Map<string, string[]>(),
}

// TaskTracker, through the session's own MCP connection. Every call heartbeats the active task (TaskTracker
// books time from calls), so none is made during a wait for the person (hud.isQuiet).

/** One TaskTracker tool call; its text blocks joined. Rejects when the server reports an error. */
async function call($: EngineInterface, tool: string, args: Record<string, unknown>): Promise<string> {
  const result = await $.mcp.call('tasktracker', `tasktracker_${tool}`, args)
  const text = result.content.map(block => block.text ?? '').join('\n')
  if (result.isError) {
    throw new Error(`${tool}: ${text.slice(0, 200)}`)
  }

  return text
}

/** The requirements linked to a phase, cached in $.store for an hour (links rarely change). */
async function linkedRequirements($: EngineInterface, phaseId: string, isForced: boolean): Promise<{ id: string; slug: string }[]> {
  const key = `links:${phaseId}`
  const cached = (await $.store.get(key)) as { at: number; requirements: { id: string; slug: string }[] } | undefined
  const now = await $.clock.now()
  if (cached && !isForced && now - cached.at < 3_600_000) {
    return cached.requirements
  }

  const all = parseRequirements(await call($, 'listRequirements', { projectId: hud.projectId, status: 'approved' }))
  const linked: { id: string; slug: string }[] = []
  for (const requirement of all) {
    if (linksTask(await call($, 'listRequirementTaskLinks', { requirementId: requirement.id }), phaseId)) {
      linked.push(requirement)
    }
  }

  await $.store.set(key, { at: now, requirements: linked })
  return linked
}

/** The phase of task `taskId` with its sub-tasks and (when the project is known) its requirements' ACs. */
async function loadPhase($: EngineInterface, taskId: string, isForced: boolean): Promise<HudPhase> {
  const task = parseTask(await call($, 'getTask', { taskId }))
  if (task === null) {
    throw new Error(`getTask ${taskId}: unexpected answer`)
  }

  let phase: HudTask = task
  if (task.type !== 'phase') {
    phase = parseTaskList(await call($, 'getTaskAncestors', { taskId })).find(t => t.type === 'phase') ?? task
  }

  const subtasks = parseTaskList(await call($, 'getChildTasks', { taskId: phase.id }))
  const requirements: HudRequirement[] = []
  if (hud.projectId !== '' && phase.type === 'phase') {
    for (const requirement of await linkedRequirements($, phase.id, isForced)) {
      const criteria = parseCriteria(await call($, 'listAcceptanceCriteria', { requirementId: requirement.id }))
      requirements.push({ ...requirement, criteria })
    }
  }

  return { phase, active: task.id === phase.id ? null : task, subtasks, requirements, refreshedAt: await $.clock.now(), isIdle: false }
}

function requestRefresh(isForced: boolean, isUser: boolean) {
  hud.isRefreshWanted = true
  hud.isForcedRefresh ||= isForced
  hud.isUserRefresh ||= isUser
}

async function viewOf($: EngineInterface): Promise<HudView> {
  return {
    phase: await read($, phaseAtom),
    agents: await read($, agentsAtom),
    checks: await read($, checksAtom),
    guard: await read($, guardAtom),
    now: await $.clock.now(),
  }
}

/** Reads the phase of the active task (or, on a user's refresh with none active, of the last phase seen). */
async function refresh($: EngineInterface) {
  const active = await read($, activeTaskAtom)
  const shown = await read($, phaseAtom)
  const target = active ?? (hud.isUserRefresh ? (shown?.phase.id ?? null) : null)
  const wasQuiet = hud.isQuiet
  const isForced = hud.isForcedRefresh
  hud.isRefreshWanted = false
  hud.isForcedRefresh = false
  hud.isUserRefresh = false
  if (target === null) {
    return
  }

  try {
    const phase: HudPhase = { ...(await loadPhase($, target, isForced)), isIdle: active === null }
    await update($, phaseAtom, () => phase)
    await $.store.set('lastPhase', phase)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await update($, phaseAtom, p => (p === null ? p : { ...p, error: message }))
  }

  if (wasQuiet) {
    // A refresh the person asked for during a wait: close the segment its calls opened.
    await call($, 'pauseActiveTask', {}).catch(() => undefined)
  }
}

/** Mirrors $.agent.list() into the state; a toast for each agent that finished. */
async function pollAgents($: EngineInterface) {
  const listed = await $.agent.list()
  const known = await read($, agentsAtom)
  const now = await $.clock.now()
  const byId = new Map(known.map(agent => [agent.id, agent]))
  const finished: HudAgent[] = []
  let isChanged = false
  for (const info of listed) {
    const previous = byId.get(info.id)
    if (previous === undefined) {
      byId.set(info.id, {
        id: info.id,
        description: info.description,
        type: info.type,
        status: info.status,
        startedAt: now,
        ...(isRunning(info) ? {} : { endedAt: now }),
      })
      isChanged = true
    } else if (previous.status !== info.status) {
      const changed: HudAgent = { ...previous, status: info.status }
      if (isRunning(previous) && !isRunning(info)) {
        changed.endedAt = now
        finished.push(changed)
      }

      byId.set(info.id, changed)
      isChanged = true
    }
  }

  for (const previous of known) {
    if (isRunning(previous) && !listed.some(info => info.id === previous.id)) {
      const ended: HudAgent = { ...previous, status: 'completed', endedAt: now }
      byId.set(previous.id, ended)
      finished.push(ended)
      isChanged = true
    }
  }

  if (isChanged) {
    await update($, agentsAtom, () => [...byId.values()].sort((a, b) => a.startedAt - b.startedAt).slice(-30))
  }

  for (const agent of finished) {
    const mark = agent.status === 'completed' ? '✔' : '✗'
    $.ui.toast(`${mark} ${agent.type} "${agent.description}" ${agent.status} after ${formatDuration((agent.endedAt ?? now) - agent.startedAt)}`)
  }
}

/** The background tick: agents, elapsed-time redraws, wanted refreshes and the heartbeat. */
async function tick($: EngineInterface) {
  if (hud.isTicking) {
    return
  }

  hud.isTicking = true
  try {
    await pollAgents($)
    const now = await $.clock.now()
    const isAnyRunning = (await read($, agentsAtom)).some(isRunning)
    if (isAnyRunning && now - hud.lastRedraw >= 30_000) {
      hud.lastRedraw = now
      await update($, tickAtom, n => n + 1)
    }

    if (hud.isRefreshWanted && (!hud.isQuiet || hud.isUserRefresh)) {
      await refresh($)
    }

    const active = await read($, activeTaskAtom)
    if (!hud.isQuiet && isAnyRunning && active !== null && now - hud.lastHeartbeat >= HEARTBEAT_MS) {
      // Agents work while the main thread waits for them: keep the active task's segment open.
      hud.lastHeartbeat = now
      await call($, 'getCurrentTimer', { taskId: active }).catch(() => undefined)
    }
  } finally {
    hud.isTicking = false
  }
}

/** Pauses the active task's timer before a wait for the person, unless agents still work. */
async function pauseIfIdle($: EngineInterface) {
  if (hud.isQuiet || (await read($, activeTaskAtom)) === null) {
    return
  }

  if ((await $.agent.list()).some(isRunning)) {
    return
  }

  await call($, 'pauseActiveTask', {}).catch(() => undefined)
  hud.isQuiet = true
}

async function agentLabel($: EngineInterface, agentId: string | undefined): Promise<string> {
  if (agentId === undefined) return 'main'
  const agent = (await read($, agentsAtom)).find(a => a.id === agentId)
  return agent === undefined ? 'agent' : `${agent.type} "${agent.description}"`
}

async function testProjectsOf($: EngineInterface, sln: string): Promise<string[]> {
  let projects = hud.slnTests.get(sln)
  if (projects === undefined) {
    projects = parseSlnTestProjects(await $.fs.read(sln))
    hud.slnTests.set(sln, projects)
  }

  return projects
}

/** Reads build, test and verify results from a shell command's output; notes for the model when a project did not run. */
async function readChecks($: EngineInterface, command: string, agentId: string | undefined, ran: ToolCallResult): Promise<ToolCallResult> {
  if (ran.deny !== undefined) {
    return ran
  }

  const text = typeof ran.text === 'string' ? ran.text : ''
  const shape = shapeOf(command)
  const summaries = parseTestSummaries(text)
  const build = parseBuildSummary(text)
  if (summaries.length === 0 && build === null && !shape.isVerify) {
    return ran
  }

  const now = await $.clock.now()
  const loop = await agentLabel($, agentId)
  const checks: HudCheck[] = []
  const notes: string[] = []
  if (build !== null && summaries.length === 0 && !shape.isVerify) {
    checks.push({
      label: 'build',
      isOk: build.errors === 0 && build.warnings === 0,
      failed: 0,
      passed: 0,
      warnings: build.warnings,
      errors: build.errors,
      missing: [],
      projects: 0,
      at: now,
      loop,
    })
  }

  if (summaries.length > 0) {
    let missing: string[] = []
    const started = parseTestRuns(text)
    if (shape.isDotnetTest && shape.sln !== null && (!shape.isPartial || started.length > 0)) {
      const expected = await testProjectsOf($, shape.sln).catch(() => [] as string[])
      const seen = new Set([...summaries.map(s => s.project), ...started])
      missing = expected.filter(project => !seen.has(project))
    }

    const failed = summaries.reduce((n, s) => n + s.failed, 0)
    checks.push({
      label: 'tests',
      isOk: failed === 0 && missing.length === 0,
      failed,
      passed: summaries.reduce((n, s) => n + s.passed, 0),
      missing,
      projects: summaries.length,
      at: now,
      loop,
    })
    if (missing.length > 0) {
      notes.push(
        `devflow-hud: ${missing.length} test project(s) of ${shape.sln} reported no result: ${missing.join(', ')}. ` +
          'dotnet test can skip a project (for example while a test project it references fails): run each one separately before counting the totals.',
      )
    }
  }

  if (shape.isVerify) {
    const summary = text.split('\n').reverse().find(line => /\b(passed|failed|FAIL)\b/i.test(line))?.trim()
    checks.push({ label: 'verify', isOk: ran.isError !== true, failed: 0, passed: 0, missing: [], projects: 0, at: now, loop, summary })
  }

  await update($, checksAtom, list => [...list, ...checks].slice(-20))
  const bad = checks.find(check => !check.isOk)
  if (bad !== undefined) {
    const detail = bad.missing.length > 0 ? `not run: ${bad.missing.join(', ')}` : bad.label === 'tests' ? `${bad.failed} failed` : bad.label
    $.ui.toast(`✗ ${bad.label} (${loop}): ${detail}`)
  }

  return notes.length === 0 ? ran : { ...ran, context: [...(ran.context ?? []), ...notes] }
}

/** The guard's refusal of a main-thread write while an orchestrator skill leads, or undefined. */
async function guardRefusal($: EngineInterface, path: string, agentId: string | undefined): Promise<string | undefined> {
  if (agentId !== undefined || isGuardExempt(path)) {
    return undefined
  }

  const guard = await read($, guardAtom)
  if (!guard.isEnabled || !guard.isActive) {
    return undefined
  }

  return (
    `devflow-hud orchestrator guard: ${guard.skill} leads this session, and a plan orchestrator never writes code itself. ` +
    'Dispatch this change to the implementer role agent (devflow:implementer), as /tt-implement-phase describes; do not work around this with shell commands. ' +
    'Only the user can switch the guard off, with /hud guard off.'
  )
}

/** Notifies when a task goes blocked or the shown phase completes. */
async function notifyStatus($: EngineInterface, taskId: string, status: unknown) {
  const phase = await read($, phaseAtom)
  const task = [phase?.phase, phase?.active, ...(phase?.subtasks ?? [])].find(t => t?.id === taskId)
  const title = task?.title ?? taskId
  if (status === 'blocked') {
    await $.ui.notify(`Blocked: ${title}`, { title: 'devflow' })
  } else if (status === 'completed' && phase?.phase.id === taskId) {
    await $.ui.notify(`Phase completed: ${title}`, { title: 'devflow' })
  }
}

/** Reminder for the model of the agents still running, or undefined when none. */
async function runningNote($: EngineInterface, lead: string): Promise<string | undefined> {
  const running = (await $.agent.list()).filter(isRunning)
  if (running.length === 0) {
    return undefined
  }

  const names = running.map(agent => `${agent.type} "${agent.description}"`).join(', ')
  return `devflow-hud: ${lead} ${running.length} agent(s) still run: ${names}. Their reports arrive in this session as messages when they finish; do not report on their work, predict it, or start work that depends on it before then.`
}

async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: 'devflow HUD' })
}

async function setGuardEnabled($: EngineInterface, isEnabled: boolean) {
  await update($, guardAtom, guard => ({ ...guard, isEnabled }))
  await $.store.set('guardEnabled', isEnabled)
}

async function toggleGuard($: EngineInterface) {
  await setGuardEnabled($, !(await read($, guardAtom)).isEnabled)
}

async function toggleBand($: EngineInterface) {
  await update($, bandHiddenAtom, isHidden => !isHidden)
}

/** Loads what the HUD keeps across sessions and starts the background tick. */
async function start($: EngineInterface) {
  await $.command.register({
    name: 'hud',
    description: 'devflow HUD: the TaskTracker phase, agents and checks',
    argumentHint: '[refresh|guard on|off|band on|off|project <id>]',
  })
  const storedProject = await $.store.get('projectId')
  if (hud.projectId === '' && typeof storedProject === 'string') {
    hud.projectId = storedProject
  }

  const isGuardEnabled = await $.store.get('guardEnabled')
  if (typeof isGuardEnabled === 'boolean') {
    await update($, guardAtom, guard => ({ ...guard, isEnabled: isGuardEnabled }))
  }

  if ((await read($, phaseAtom)) === null) {
    const last = (await $.store.get('lastPhase')) as HudPhase | undefined | null
    if (last !== undefined && last !== null) {
      await update($, phaseAtom, () => ({ ...last, isIdle: true }))
    }
  }

  $.clock.every(TICK_MS, () => {
    void tick($)
  })
}

/** Follows a TaskTracker call: the project, the active task, refreshes after writes, status notifications. */
async function followTaskTracker($: EngineInterface, tool: string, args: Record<string, unknown>, ran: ToolCallResult): Promise<ToolCallResult> {
  if (ran.deny !== undefined || ran.isError === true) {
    return ran
  }

  const name = tool.slice(PREFIX.length)
  hud.isQuiet = name === 'pauseActiveTask'
  if (typeof args.projectId === 'string' && /^[0-9a-f-]{36}$/.test(args.projectId) && args.projectId !== hud.projectId) {
    hud.projectId = args.projectId
    await $.store.set('projectId', hud.projectId)
  }

  if (name === 'setActiveTask' && typeof args.taskId === 'string') {
    const taskId = args.taskId
    await update($, activeTaskAtom, () => taskId)
    requestRefresh(false, false)
  } else if (name === 'clearActiveTask') {
    await update($, activeTaskAtom, () => null)
    await update($, phaseAtom, p => (p === null ? p : { ...p, isIdle: true }))
  } else if (WRITES.has(name) || LINK_WRITES.has(name)) {
    requestRefresh(LINK_WRITES.has(name), false)
  }

  if (name === 'updateTaskStatus' && typeof args.taskId === 'string') {
    await notifyStatus($, args.taskId, args.status)
  }

  return ran
}

/** Orchestrator mode follows the main thread's skills; a fork that returns with agents still running is said so. */
async function followSkill($: EngineInterface, skill: string, ran: ToolCallResult, before: Set<string>): Promise<ToolCallResult> {
  if (ran.deny !== undefined) {
    return ran
  }

  const started = (await $.agent.list()).filter(agent => isRunning(agent) && !before.has(agent.id))
  if (started.length === 0) {
    return ran
  }

  const names = started.map(agent => `${agent.type} "${agent.description}"`).join(', ')
  return {
    ...ran,
    context: [
      ...(ran.context ?? []),
      `devflow-hud: the skill ${skill} returned while ${started.length} agent(s) it dispatched still run: ${names}. ` +
        'Their reports arrive in this session as messages when they finish. Do not report on their work, or start work that depends on it, before then.',
    ],
  }
}

async function noteSkill($: EngineInterface, skill: string): Promise<Set<string>> {
  if (hud.orchestrator.test(skill)) {
    await update($, guardAtom, guard => ({ ...guard, isActive: true, skill }))
  } else if (!/(^|:)(tt-|adr$|continuous-learning$)/.test(skill)) {
    await update($, guardAtom, guard => ({ ...guard, isActive: false, skill: '' }))
  }

  return new Set((await $.agent.list()).filter(isRunning).map(agent => agent.id))
}

async function runCommand($: EngineInterface, args: string): Promise<{ text: string }> {
  const [verb = '', arg = ''] = args.trim().split(/\s+/)
  switch (verb) {
    case '':
      await openPane($)
      requestRefresh(false, true)
      return { text: 'devflow HUD pane opened.' }
    case 'refresh':
      requestRefresh(true, true)
      return { text: 'devflow HUD: reading TaskTracker again.' }
    case 'guard':
      if (arg !== 'on' && arg !== 'off') return { text: USAGE }
      await setGuardEnabled($, arg === 'on')
      return { text: `devflow HUD: orchestrator guard ${arg}.` }
    case 'band':
      if (arg !== 'on' && arg !== 'off') return { text: USAGE }
      await update($, bandHiddenAtom, () => arg === 'off')
      return { text: `devflow HUD: band ${arg === 'on' ? 'shown' : 'hidden'}.` }
    case 'project':
      if (!/^[0-9a-f-]{36}$/.test(arg)) return { text: USAGE }
      hud.projectId = arg
      await $.store.set('projectId', hud.projectId)
      requestRefresh(true, true)
      return { text: `devflow HUD: project ${arg}.` }
    default:
      return { text: USAGE }
  }
}

export const register: Register = (on, options) => {
  hud.orchestrator = new RegExp(String(options.orchestratorSkills || 'implement-plan|implement-phase|tt-workflow-run'))
  hud.projectId = String(options.projectId ?? '')

  on('session.start', async ($, e, next) => {
    await start($)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (!tool.startsWith(PREFIX)) {
      return next(e)
    }

    return followTaskTracker($, tool, e as unknown as Record<string, unknown>, await next(e))
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    if (e.agentId !== undefined) {
      return next(e)
    }

    const before = await noteSkill($, e.skill)
    return followSkill($, e.skill, await next(e), before)
  }).catch(($, e, next) => next(e))

  // The orchestrator guard: main-thread file writes are refused while an orchestrator skill leads.
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const deny = await guardRefusal($, e.file_path, e.agentId)
    return deny === undefined ? next(e) : { deny }
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const deny = await guardRefusal($, e.file_path, e.agentId)
    return deny === undefined ? next(e) : { deny }
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => {
    const deny = await guardRefusal($, e.notebook_path, e.agentId)
    return deny === undefined ? next(e) : { deny }
  }).catch(($, e, next) => next(e))

  // A question to the person is a wait: pause the active task's timer first.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (e.agentId === undefined) {
      await pauseIfIdle($)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // Check alarms: build, test and verify results in any loop's shell output.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => readChecks($, e.command, e.agentId, await next(e))).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => readChecks($, e.command, e.agentId, await next(e))).catch(($, e, next) => next(e))

  // The end of a main-thread turn is a wait for the person, unless agents still work.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await pauseIfIdle($)
    }

    return next(e)
  })

  // The person's prompt ends the wait; it reminds the model of agents still running.
  on('prompt.submit', async ($, e, next) => {
    hud.isQuiet = false
    const note = await runningNote($, 'as this prompt arrives,')
    return next(note === undefined ? e : { ...e, context: [...(e.context ?? []), note] })
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'hud' }, async ($, e) => runCommand($, e.args))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, bandHiddenAtom))) {
      return next(e)
    }

    await read($, tickAtom)
    const view = await viewOf($)
    return hasContent(view) ? band($.ui.resolve(e), view, e.props.bodyColumns) : next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await read($, tickAtom)
    const actions = {
      refresh: () => requestRefresh(true, true),
      toggleGuard: () => void toggleGuard($),
      toggleBand: () => void toggleBand($),
    }

    return pane($.ui.resolve(e), await viewOf($), actions, await read($, bandHiddenAtom))
  })
}
