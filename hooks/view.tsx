// The band above the prompt (one line) and the /hud pane: drawn from the session state alone.

import type { ElementTable } from 'claude-code'

import type { HudAgent, HudCheck, HudGuard, HudPhase } from '../types'
import { formatDuration, progressBar, short } from './parse'
import { isRunning } from './state'

export type HudView = {
  phase: HudPhase | null
  agents: HudAgent[]
  checks: HudCheck[]
  guard: HudGuard
  now: number
}

/** Done and total of the phase's direct sub-tasks (archived ones are not listed by TaskTracker). */
function subtaskProgress(phase: HudPhase): { done: number; total: number } {
  return { done: phase.subtasks.filter(t => t.status === 'completed').length, total: phase.subtasks.length }
}

function acProgress(phase: HudPhase): { done: number; total: number } {
  const all = phase.requirements.flatMap(r => r.criteria)
  return { done: all.filter(c => c.isSatisfied).length, total: all.length }
}

function checkLabel(check: HudCheck): string {
  if (check.label === 'build') return `build ${check.warnings ?? 0}w/${check.errors ?? 0}e`
  if (check.label === 'verify') return 'verify.ps1'
  return `tests ${check.failed}✗/${check.passed}✓`
}

/** Whether there is anything to show. */
export function hasContent(view: HudView): boolean {
  return view.phase !== null || view.agents.some(isRunning) || view.checks.length > 0 || (view.guard.isActive && view.guard.isEnabled)
}

/** The one-line band, drawn with the surface's element table. */
export function band(elements: ElementTable, view: HudView, columns: number) {
  const { Box, Text } = elements
  const { phase, agents, checks, guard, now } = view
  const running = agents.filter(isRunning)
  const first = running[0]
  const last = checks.at(-1)
  const titleRoom = Math.max(12, Math.floor(columns / 4))

  return (
    <Box flexDirection="row">
      <Text wrap="truncate-end">
        {phase !== null && (
          <Text color={phase.isIdle ? 'subtle' : 'claude'} bold={!phase.isIdle}>
            ◆ {short(phase.phase.title, titleRoom)}
          </Text>
        )}
        {phase?.active && <Text dimColor> › {short(phase.active.title, titleRoom)}</Text>}
        {phase !== null && phase.subtasks.length > 0 && (
          <Text>
            {'  '}
            {progressBar(subtaskProgress(phase).done, subtaskProgress(phase).total)} {subtaskProgress(phase).done}/
            {subtaskProgress(phase).total}
          </Text>
        )}
        {phase !== null && acProgress(phase).total > 0 && (
          <Text color={acProgress(phase).done === acProgress(phase).total ? 'success' : undefined}>
            {'  '}AC {acProgress(phase).done}/{acProgress(phase).total}
          </Text>
        )}
        {first !== undefined && (
          <Text color="suggestion">
            {'  '}⚙ {running.length > 1 ? `${running.length}× ` : ''}
            {short(first.type, 14)} "{short(first.description, 28)}" {formatDuration(now - first.startedAt)}
          </Text>
        )}
        {last !== undefined && (
          <Text color={last.isOk ? 'success' : 'error'}>
            {'  '}
            {last.isOk ? '✔' : '✗'} {checkLabel(last)}
            <Text dimColor> {formatDuration(now - last.at)}</Text>
          </Text>
        )}
        {last !== undefined && last.missing.length > 0 && <Text color="warning"> ⚠ {last.missing.length} not run</Text>}
        {guard.isActive && guard.isEnabled && <Text color="permission">{'  '}◈ orchestrator</Text>}
      </Text>
    </Box>
  )
}

const STATUS_GLYPH: Record<string, string> = {
  completed: '✔',
  in_progress: '▶',
  pending: '·',
  blocked: '⛔',
}

/** The /hud pane: the phase tree, every AC, the agents, the checks and the guard. */
export function pane(
  elements: ElementTable,
  view: HudView,
  actions: { refresh: () => void; toggleGuard: () => void; toggleBand: () => void },
  isBandHidden: boolean,
) {
  const { Box, Text, Button } = elements
  const { phase, agents, checks, guard, now } = view

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Button key="refresh" hotkey="r" label="Refresh" onPress={actions.refresh} />
        <Button key="guard" hotkey="g" label={guard.isEnabled ? 'Guard: on' : 'Guard: off'} onPress={actions.toggleGuard} />
        <Button key="band" hotkey="b" label={isBandHidden ? 'Band: hidden' : 'Band: shown'} onPress={actions.toggleBand} />
      </Box>

      <Text bold> </Text>
      {phase === null ? (
        <Text dimColor>No TaskTracker phase seen yet. It appears when a task is activated (setActiveTask), or press Refresh.</Text>
      ) : (
        <Box flexDirection="column">
          <Text bold color="claude">
            {STATUS_GLYPH[phase.phase.status] ?? '?'} {phase.phase.title} <Text dimColor>({phase.phase.status}{phase.isIdle ? ', no active task' : ''})</Text>
          </Text>
          {phase.error && <Text color="error">  last refresh failed: {phase.error}</Text>}
          {phase.subtasks.map(task => (
            <Text color={phase.active?.id === task.id ? 'suggestion' : undefined} dimColor={task.status === 'completed'}>
              {'  '}
              {STATUS_GLYPH[task.status] ?? '?'} {task.title}
              {phase.active?.id === task.id ? '  ← active' : ''}
            </Text>
          ))}
          {phase.requirements.length === 0 && (
            <Text dimColor>  No linked requirements read (set the projectId option, or let a TaskTracker call with a projectId pass).</Text>
          )}
          {phase.requirements.map(requirement => (
            <Box flexDirection="column">
              <Text bold>
                {'  '}
                {requirement.slug} {requirement.criteria.filter(c => c.isSatisfied).length}/{requirement.criteria.length}
              </Text>
              {requirement.criteria.map(criterion => (
                <Text wrap="truncate-end" dimColor={criterion.isSatisfied} color={criterion.isSatisfied ? 'success' : undefined}>
                  {'    '}
                  {criterion.isSatisfied ? '[x]' : '[ ]'} {criterion.text}
                </Text>
              ))}
            </Box>
          ))}
          <Text dimColor>  read {formatDuration(now - phase.refreshedAt)} ago</Text>
        </Box>
      )}

      <Text bold> </Text>
      <Text bold>Agents</Text>
      {agents.length === 0 && <Text dimColor>  none this session</Text>}
      {agents.slice(-12).map(agent => (
        <Text color={isRunning(agent) ? 'suggestion' : agent.status === 'completed' ? undefined : 'error'} dimColor={!isRunning(agent) && agent.status === 'completed'}>
          {'  '}
          {isRunning(agent) ? '⚙' : agent.status === 'completed' ? '✔' : '✗'} {agent.type} "{agent.description}" {agent.status}{' '}
          {formatDuration((agent.endedAt ?? now) - agent.startedAt)}
        </Text>
      ))}

      <Text bold> </Text>
      <Text bold>Checks</Text>
      {checks.length === 0 && <Text dimColor>  none read yet (dotnet build/test and verify.ps1 output is read from shell commands)</Text>}
      {checks.slice(-10).map(check => (
        <Text color={check.isOk ? undefined : 'error'}>
          {'  '}
          {check.isOk ? '✔' : '✗'} {checkLabel(check)} <Text dimColor>({check.loop}, {formatDuration(now - check.at)} ago{check.projects > 0 ? `, ${check.projects} projects` : ''})</Text>
          {check.missing.length > 0 && <Text color="warning"> ⚠ not run: {check.missing.join(', ')}</Text>}
          {check.summary && <Text dimColor> {check.summary}</Text>}
        </Text>
      ))}

      <Text bold> </Text>
      <Text>
        <Text bold>Guard </Text>
        {!guard.isEnabled ? (
          <Text dimColor>off (/hud guard on)</Text>
        ) : guard.isActive ? (
          <Text color="permission">active: {guard.skill} leads the main thread; its Write/Edit/NotebookEdit are refused</Text>
        ) : (
          <Text dimColor>armed; turns on when an orchestrator skill is invoked</Text>
        )}
      </Text>
    </Box>
  )
}
