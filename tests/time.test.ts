import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// The booked time of the phase: the band and the pane sum the phase's own time and every descendant's,
// read from TaskTracker answers as they appeared in a real session.

const PHASE = '6d9e3f91-23eb-4fc8-bc7d-d927fefba1db'
const RED = '3bd1bf2a-ccbd-4f4c-8066-e68cc8d118f1'
const GREEN = '94e69827-d417-4478-a895-8aec90de7878'
const NOTE = '92c409d3-25fb-4c87-bc7b-f69ae8987fd8'

const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 160, scroll: { offset: 0, bodyRows: 10 }, view: {} }
const PANE_PROPS = { title: 'devflow HUD', isFocused: false, bodyColumns: 120, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 60 }, view: {} }

const ANSWERS: Record<string, string> = {
  getTask: `Task "K2.3 Implement to GREEN" (id ${GREEN}) v3 [task/in_progress/high]\n\n## Objective`,
  getTaskAncestors: `1 ancestors:\n - [phase/in_progress] It1 · K2 — Simulation contracts (id ${PHASE})`,
  getChildTasks: `2 children:\n - [task/completed] K2.2 Write failing AC tests (RED) (id ${RED})\n - [task/in_progress] K2.3 Implement to GREEN (id ${GREEN})`,
  getTaskDescendants:
    `3 descendants:\n - [task/completed] K2.2 Write failing AC tests (RED) (id ${RED})\n` +
    ` - [task/in_progress] K2.3 Implement to GREEN (id ${GREEN})\n` +
    `  - [subtask/completed] Note: K2 RED evidence (id ${NOTE})`,
}

const SUMMARIES: Record<string, string> = {
  [PHASE]: '36 min measured across 15 completed segments',
  [RED]: '24s measured across 4 completed segments',
  [GREEN]: '2h 32m measured across 5 completed segments',
  [NOTE]: 'unexpected answer',
}

function world(on: On) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('agent.list', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  const summaryCalls: string[] = []
  on('mcp.call', ($, e) => {
    const tool = e.tool.replace(/^tasktracker_/, '')
    const taskId = String(e.args.taskId ?? '')
    if (tool === 'getTimeSummary') {
      summaryCalls.push(taskId)
    }
    const text = tool === 'getTimeSummary' ? (SUMMARIES[taskId] ?? '') : (ANSWERS[tool] ?? '')
    return { value: { content: [{ type: 'text', text }], isError: false } }
  })
  on('tool.call', () => ({ result: 'ok' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  return { clock, summaryCalls }
}

/** Starts the session, which starts the HUD's tick: refreshes run from it. */
async function begin($: Parameters<Parameters<typeof test>[1]>[0]) {
  await $.session.start({ cwd: 'C:/repo', surface: 'terminal', isInteractive: true })
}

test('the band and the pane show the time booked for the phase and its tasks', async ($, on) => {
  const { clock } = world(on)
  await begin($)
  await $.tool.call({ tool: 'mcp__tasktracker__tasktracker_setActiveTask', taskId: GREEN })
  await clock.advance(2_000)

  // 36 min + 24 s + 2 h 32 min, with one summary unreadable: a lower bound.
  const bar = await $.ui.mount({ plugin: 'devflow', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
  expect(await bar.find({ type: 'Text', text: /⏱ ≥3h08m/ })).toBeDefined()
  await bar.unmount()

  const pane = await $.ui.mount({ plugin: 'devflow', surface: 'terminal', component: 'Pane', requestId: 'devflow-hud', props: PANE_PROPS })
  expect(await pane.find({ type: 'Text', text: /at least 3h08m booked for the phase and its tasks; 2h32m on K2\.3 Implement to GREEN/ })).toBeDefined()
  await pane.unmount()
})

test('a completed task that is not active has its time read once', async ($, on) => {
  const { clock, summaryCalls } = world(on)
  await begin($)
  await $.tool.call({ tool: 'mcp__tasktracker__tasktracker_setActiveTask', taskId: GREEN })
  await clock.advance(2_000)
  await $.tool.call({ tool: 'mcp__tasktracker__tasktracker_updateTaskStatus', taskId: GREEN, status: 'in_progress', version: 3 })
  await clock.advance(2_000)

  expect(summaryCalls.filter(id => id === RED).length).toBe(1)
  expect(summaryCalls.filter(id => id === GREEN).length).toBe(2)
  expect(summaryCalls.filter(id => id === PHASE).length).toBe(2)
})
