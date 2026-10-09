import { describe, expect, test } from 'claude-code/testing'

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
  progressBar,
  shapeOf,
} from '../hooks/parse'

// Samples are TaskTracker answers and dotnet output as they appeared in a real session.

describe('TaskTracker texts', () => {
  test('getTask head gives title, id, type and status', () => {
    const text = 'Task "It1 · K2 — Simulation contracts" (id 6d9e3f91-23eb-4fc8-bc7d-d927fefba1db) v2 [phase/in_progress/high]\n\n## Objective'
    expect(parseTask(text)).toEqual({
      title: 'It1 · K2 — Simulation contracts',
      id: '6d9e3f91-23eb-4fc8-bc7d-d927fefba1db',
      type: 'phase',
      status: 'in_progress',
    })
    expect(parseTask('no such task')).toBe(null)
  })

  test('child and ancestor lists, indented or not', () => {
    const children = [
      '4 direct children:',
      ' - [task/pending] K2.4 Live verify + distractor checks (id 4657d4e0-5673-4a83-9b9f-a33b5074c69b)',
      ' - [task/completed] K2.1 Design + decision note (id a8878058-7097-41c0-b158-53fc856e8c7c)',
      '  - [subtask/completed] Note: K2 RED evidence (skeleton-first; 229 new failing tests) (id 92c409d3-25fb-4c87-bc7b-f69ae8987fd8)',
    ].join('\n')
    const list = parseTaskList(children)
    expect(list.map(t => `${t.type}/${t.status}`)).toEqual(['task/pending', 'task/completed', 'subtask/completed'])
    expect(list[2]?.title).toBe('Note: K2 RED evidence (skeleton-first; 229 new failing tests)')

    const ancestors = '2 ancestors:\n- [phase/in_progress] It1 · K2 — Simulation contracts (id 6d9e3f91-23eb-4fc8-bc7d-d927fefba1db)\n - [task/in_progress] K2.3 Implement to GREEN (id 94e69827-d417-4478-a895-8aec90de7878)'
    expect(parseTaskList(ancestors).find(t => t.type === 'phase')?.id).toBe('6d9e3f91-23eb-4fc8-bc7d-d927fefba1db')
  })

  test('requirements, links and criteria', () => {
    const requirements = '13 requirements:\n- [approved/high] it1-sdk-state-ownership: Single-writer state: kernel grid, read views and write contracts with causes v2 (id 9f7bd2a7-50f5-4c6a-8710-44bb0a808192)'
    expect(parseRequirements(requirements)).toEqual([{ slug: 'it1-sdk-state-ownership', id: '9f7bd2a7-50f5-4c6a-8710-44bb0a808192' }])

    const links = '1 link:\n- implements: task 6d9e3f91-23eb-4fc8-bc7d-d927fefba1db (linked 2026-10-08T19:09:38.496Z)'
    expect(linksTask(links, '6d9e3f91-23eb-4fc8-bc7d-d927fefba1db')).toBe(true)
    expect(linksTask(links, '94e69827-d417-4478-a895-8aec90de7878')).toBe(false)

    const criteria = [
      '2 criteriona:',
      '- [ ] (0) Given a world grid whose width is not a multiple of 32 (e.g. 250x256), then creation is rejected. (id 39549fc9-0961-4532-adc2-bb539861675d)',
      '- [x] (1) Given writes to a grid-layer section, then Changes lists the chunks. (id a069f3b6-1c7c-4c3f-8cd4-44eb3f5d4d43)',
    ].join('\n')
    const parsed = parseCriteria(criteria)
    expect(parsed.map(c => c.isSatisfied)).toEqual([false, true])
    expect(parsed[0]?.text).toBe('Given a world grid whose width is not a multiple of 32 (e.g. 250x256), then creation is rejected.')
  })
})

describe('dotnet output', () => {
  const testOutput = [
    'Test run for C:\\projects\\games\\strago\\src\\Strago.Sim.Tests\\bin\\Debug\\net10.0\\Strago.Sim.Tests.dll (.NETCoreApp,Version=v10.0)',
    'Passed!  - Failed:     0, Passed:     1, Skipped:     0, Total:     1, Duration: 216 ms - Strago.Gen.Tests.dll (net10.0)',
    'Failed!  - Failed:    10, Passed:     2, Skipped:     0, Total:    12, Duration: 382 ms - Strago.ReferenceModules.Crops.Tests.dll (net10.0)',
    'Failed!  - Failed:    41, Passed:   498, Skipped:     0, Total:   539, Duration: 5 s - Strago.Sim.Tests.dll (net10.0)',
    'Failed!  - Failed:    41, Passed:   498, Skipped:     0, Total:   539, Duration: 5 s - Strago.Sim.Tests.dll (net10.0)',
  ].join('\n')

  test('test summaries, one per project, in name order', () => {
    expect(parseTestSummaries(testOutput)).toEqual([
      { project: 'Strago.Gen.Tests', failed: 0, passed: 1, skipped: 0 },
      { project: 'Strago.ReferenceModules.Crops.Tests', failed: 10, passed: 2, skipped: 0 },
      { project: 'Strago.Sim.Tests', failed: 41, passed: 498, skipped: 0 },
    ])
    expect(parseTestRuns(testOutput)).toEqual(['Strago.Sim.Tests'])
  })

  test('grep line numbers in front of a summary are read past', () => {
    expect(parseTestSummaries('12:Passed!  - Failed:     0, Passed:     7, Skipped:     0, Total:     7, Duration: 1 s - Echo.Tests.dll (net10.0)')).toEqual([
      { project: 'Echo.Tests', failed: 0, passed: 7, skipped: 0 },
    ])
  })

  test('build summary takes the last pair', () => {
    expect(parseBuildSummary('Build succeeded.\n    0 Warning(s)\n    0 Error(s)\n\nTime Elapsed 00:00:01.98')).toEqual({ warnings: 0, errors: 0 })
    expect(parseBuildSummary('    3 Warning(s)\n    1 Error(s)')).toEqual({ warnings: 3, errors: 1 })
    expect(parseBuildSummary('no summary here')).toBe(null)
  })

  test('a solution lists its test projects', () => {
    const sln = [
      'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Strago.Sim", "src\\Strago.Sim\\Strago.Sim.csproj", "{1}"',
      'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Strago.Contracts.Tests", "src\\Strago.Contracts.Tests\\Strago.Contracts.Tests.csproj", "{2}"',
      'Project("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "ReferenceModules", "ReferenceModules", "{3}"',
      'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Strago.Sim.Tests", "src\\Strago.Sim.Tests\\Strago.Sim.Tests.csproj", "{4}"',
    ].join('\n')
    expect(parseSlnTestProjects(sln)).toEqual(['Strago.Contracts.Tests', 'Strago.Sim.Tests'])
  })
})

describe('commands', () => {
  test('a dotnet test of a solution after a cd, in Git Bash form', () => {
    expect(shapeOf('cd /c/projects/games/strago && dotnet test Strago.sln')).toEqual({
      isDotnetTest: true,
      isBuild: false,
      isVerify: false,
      sln: 'C:/projects/games/strago/Strago.sln',
      isPartial: false,
    })
  })

  test('a filter, a pipe or a redirect makes the output partial', () => {
    expect(shapeOf('dotnet test Strago.sln --filter "Name~Alloc"').isPartial).toBe(true)
    expect(shapeOf('dotnet test Strago.sln > $S/logs/t.log 2>&1').isPartial).toBe(true)
    expect(shapeOf('dotnet test Strago.sln | tail -5').isPartial).toBe(true)
    expect(shapeOf('dotnet test src/Strago.Contracts.Tests').sln).toBe(null)
  })

  test('build and verify are recognised', () => {
    expect(shapeOf('dotnet build Strago.sln -c Release').isBuild).toBe(true)
    expect(shapeOf('powershell -NoProfile -File ./verify.ps1').isVerify).toBe(true)
  })

  test("the guard exempts Claude's own folders only", () => {
    expect(isGuardExempt('C:\\Users\\m\\.claude\\projects\\x\\memory\\a.md')).toBe(true)
    expect(isGuardExempt('C:/Users/m/AppData/Local/Temp/claude/s/scratchpad/n.txt')).toBe(true)
    expect(isGuardExempt('C:\\projects\\games\\strago\\src\\Strago.Sim\\World.cs')).toBe(false)
  })
})

test('durations and bars', () => {
  expect(formatDuration(40_000)).toBe('40s')
  expect(formatDuration(12 * 60_000)).toBe('12m')
  expect(formatDuration(65 * 60_000)).toBe('1h05m')
  expect(progressBar(2, 4)).toBe('▮▮▮▯▯')
  expect(progressBar(0, 0)).toBe('')
})
