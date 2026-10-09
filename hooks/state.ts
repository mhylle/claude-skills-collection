// Shared constants and pure helpers. The state atoms themselves are declared in register.tsx: the engine
// reads `$.state` references only where they are written in the file that uses them.

export const PANE = 'devflow-hud'

/** Statuses of an agent whose loop still works (a HudAgent or a $.agent.list() row). */
export function isRunning(agent: { status: string }): boolean {
  return agent.status === 'pending' || agent.status === 'running' || agent.status === 'waiting'
}
