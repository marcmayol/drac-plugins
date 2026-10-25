/** One rate-limit window of the plan, as the last response reported it. */
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** One plan week rebuilt from the transcripts: its % by the calibrated limit. */
export type WeekRow = { start: number; end: number; tokens: number; percent: number; isCurrent: boolean }

/** What the meter derives from the transcripts and the weekly window. */
export type Derived = {
  /** This month's tokens against the calibrated weekly limit scaled to the month; absent until calibrated. */
  monthPercent?: number
  /** Tokens the weekly window holds, by rule of three (window tokens / weekly %). */
  weeklyLimit?: number
  history: WeekRow[]
  /** Some transcripts could not be read (over 4 MiB and no Node to read them). */
  isPartial: boolean
}

/** The best calibration seen: the reading with the highest weekly %, least hurt by rounding. */
export type Calibration = { util: number; tokens: number; at: number }

declare module 'claude-code' {
  interface PluginState {
    'meter-for-claude-code': { limits: Limit[]; derived: Shaped<Derived>; tick: number }
  }
}
