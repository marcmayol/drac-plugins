/** How full the context window is, in % of the model's window. */
export type Fill = {
  percent: number
  /** Counted locally before the first response of this window; the next response brings the real figure. */
  isEstimate: boolean
  /** Where auto-compact runs, in % of the same window; absent when it is off. */
  compactAt?: number
} | null

declare module 'claude-code' {
  interface PluginState {
    'context-bar': { fill: Shaped<Fill> }
  }
}
