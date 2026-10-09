/** A TaskTracker task as the HUD shows it. */
export type HudTask = { id: string; title: string; type: string; status: string }

/** One acceptance criterion of a requirement linked to the phase. */
export type HudCriterion = { text: string; isSatisfied: boolean }

/** A requirement linked to the phase, with its acceptance criteria. */
export type HudRequirement = { id: string; slug: string; criteria: HudCriterion[] }

/** The phase the active task belongs to, as last read from TaskTracker. */
export type HudPhase = {
  phase: HudTask
  /** The active task when it is a task under the phase; null when the phase itself is active. */
  active: HudTask | null
  subtasks: HudTask[]
  requirements: HudRequirement[]
  refreshedAt: number
  /** True when no task is active any more (the view is the last one seen). */
  isIdle: boolean
  error?: string
}

/** A subagent of this session. */
export type HudAgent = {
  id: string
  description: string
  type: string
  status: string
  startedAt: number
  endedAt?: number
}

/** A build, test or verify result read from a shell command's output. */
export type HudCheck = {
  label: string
  isOk: boolean
  failed: number
  passed: number
  warnings?: number
  errors?: number
  /** Test projects of the solution that reported no result. */
  missing: string[]
  projects: number
  at: number
  /** "main" or the agent's description. */
  loop: string
  summary?: string
}

/** The orchestrator guard: on while an orchestrator skill leads the main thread. */
export type HudGuard = { isEnabled: boolean; isActive: boolean; skill: string }

declare module 'claude-code' {
  interface PluginState {
    devflow: {
      phase: HudPhase | null
      activeTaskId: string | null
      agents: HudAgent[]
      checks: HudCheck[]
      guard: HudGuard
      isBandHidden: boolean
      /** Bumped every 30 s while agents run, so elapsed times redraw. */
      tick: number
    }
  }
}
