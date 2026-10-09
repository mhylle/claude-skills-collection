import { expect, mock, test } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'

// The band and the pane validate on the surfaces that take them, and show a recorded check.

const SURFACES = ['terminal', 'desktop'] as const

const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10 }, view: {} }
const PANE_PROPS = { title: 'devflow HUD', isFocused: false, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }

function world(on: On) {
  mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('agent.list', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  const output = 'Failed!  - Failed:    28, Passed:   186, Skipped:     0, Total:   214, Duration: 2 s - Strago.Contracts.Tests.dll (net10.0)'
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: output, stderr: '', interrupted: false }, text: output }))
}

test('the band draws the last check on every surface', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'Bash', command: 'dotnet test src/Strago.Contracts.Tests' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'devflow', surface, component: 'AbovePrompt', props: BAND_PROPS })
    expect(await ui.find({ type: 'Text', text: /tests 28✗\/186✓/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the band leaves the engine its own row when there is nothing to show', async ($, on) => {
  world(on)
  // Stands for the engine's own band beneath the plugins.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'engine band') as RenderElement
  })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'devflow', surface, component: 'AbovePrompt', props: BAND_PROPS })
    expect(await ui.find({ type: 'Text', text: /engine band/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /tests/ })).toBe(undefined)
    await ui.unmount()
  }
})

test('the pane lists the checks and its guard button switches the guard', async ($, on) => {
  world(on)
  on('tool.call', () => ({ result: 'ok' }))
  await $.tool.call({ tool: 'Bash', command: 'dotnet test src/Strago.Contracts.Tests' })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:tt-implement-plan' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'devflow', surface, component: 'Pane', requestId: 'devflow-hud', props: PANE_PROPS })
    expect(await ui.find({ type: 'Text', text: /Checks/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /orchestrator guard|leads the main thread/ })).toBeDefined()
    await ui.unmount()
  }

  expect((await $.tool.call({ tool: 'Write', file_path: 'C:/repo/a.cs', content: 'x' })).deny).toContain('orchestrator guard')
  const ui = await $.ui.mount({ plugin: 'devflow', surface: 'terminal', component: 'Pane', requestId: 'devflow-hud', props: PANE_PROPS })
  await ui.press({ key: 'guard' })
  await ui.unmount()
  expect((await $.tool.call({ tool: 'Write', file_path: 'C:/repo/a.cs', content: 'x' })).deny).toBe(undefined)
})
