import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// The hooks this test registers sit beneath the plugin and stand for the engine: the tools, the agent list
// (no agents) and the toast line (recorded).

function world(on: On): { toasts: string[] } {
  mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('agent.list', () => ({ value: [] }))
  const toasts: string[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { toasts }
}

test('the orchestrator guard refuses main-thread writes only while an orchestrator skill leads', async ($, on) => {
  world(on)
  on('tool.call', () => ({ result: 'ok' }))
  const write = (path: string) => $.tool.call({ tool: 'Write', file_path: path, content: 'x' })

  expect((await write('C:/repo/src/World.cs')).deny).toBe(undefined)

  await $.tool.call({ tool: 'Skill', skill: 'devflow:tt-implement-plan' })
  expect((await write('C:/repo/src/World.cs')).deny).toContain('orchestrator guard')
  const edit = await $.tool.call({ tool: 'Edit', file_path: 'C:/repo/src/World.cs', old_string: 'a', new_string: 'b' })
  expect(edit.deny).toContain('orchestrator guard')

  // Claude's own folders stay writable (memory, scratchpad).
  expect((await write('C:/Users/m/.claude/projects/p/memory/a.md')).deny).toBe(undefined)

  // A tt-* skill, or adr / continuous-learning called by the phase lead, keeps the mode;
  // any other skill ends it.
  await $.tool.call({ tool: 'Skill', skill: 'devflow:tt-implement-phase' })
  expect((await write('C:/repo/a.cs')).deny).toContain('orchestrator guard')
  await $.tool.call({ tool: 'Skill', skill: 'devflow:adr' })
  expect((await write('C:/repo/a.cs')).deny).toContain('orchestrator guard')
  await $.tool.call({ tool: 'Skill', skill: 'plugin-authoring' })
  expect((await write('C:/repo/a.cs')).deny).toBe(undefined)
})

test('the guard can be switched off with /hud guard off', async ($, on) => {
  world(on)
  on('tool.call', () => ({ result: 'ok' }))
  await $.tool.call({ tool: 'Skill', skill: 'devflow:tt-implement-plan' })

  // The engine stamps origin and presentation on a run; the test passes what a typed command would.
  const answer = await $.command.run({ command: 'hud', args: 'guard off' } as Parameters<typeof $.command.run>[0])

  expect(JSON.stringify(answer)).toContain('guard off')
  expect((await $.tool.call({ tool: 'Write', file_path: 'C:/repo/a.cs', content: 'x' })).deny).toBe(undefined)
})

test('a test run with failures raises a toast, and the result reaches the model unchanged', async ($, on) => {
  const { toasts } = world(on)
  const output = [
    'Passed!  - Failed:     0, Passed:   540, Skipped:     0, Total:   540, Duration: 5 s - Strago.Sim.Tests.dll (net10.0)',
    'Failed!  - Failed:    28, Passed:   186, Skipped:     0, Total:   214, Duration: 2 s - Strago.Contracts.Tests.dll (net10.0)',
  ].join('\n')
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: output, stderr: '', interrupted: false }, text: output }))

  const ran = await $.tool.call({ tool: 'Bash', command: 'dotnet test src/Strago.Contracts.Tests' })

  expect(ran.text).toBe(output)
  expect(ran.context ?? []).toEqual([])
  expect(toasts).toEqual(['✗ tests (main): 28 failed'])
})

test('a clean build raises no toast; one with a warning does', async ($, on) => {
  const { toasts } = world(on)
  let output = 'Build succeeded.\n    0 Warning(s)\n    0 Error(s)'
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: output, stderr: '', interrupted: false }, text: output }))

  await $.tool.call({ tool: 'Bash', command: 'dotnet build Strago.sln -c Release' })
  expect(toasts).toEqual([])

  output = 'Build succeeded.\n    1 Warning(s)\n    0 Error(s)'
  await $.tool.call({ tool: 'Bash', command: 'dotnet build Strago.sln -c Release' })
  expect(toasts).toEqual(['✗ build (main): build'])
})
