import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode, RenderViewport, SessionContextUsage, Timer } from 'claude-code'

import type { Fill } from '../types'

const fill = atom({ plugin: 'context-bar', key: 'fill' } as const, null as Fill, { shape: 'fill-1' })

// A resume, a rewind or a compaction changes the fill without a measurement:
// the plain $.session.usage() is free, so it is read again this often.
const SYNC_MS = 3000
const CELLS = 12
const SEPARATOR = ' · '
// The terminal footer: padding at each end, the mode label at the left and the
// hint after it, a gap before what is drawn here.
const FOOTER_PADDING = 4
const FOOTER_GAP = 2
const MODE_LABEL = 20

let shown: Fill = null
// Where auto-compact runs (% of the window) and the window it was read for.
let compactAt: number | undefined
let thresholdWindow = 0
let isCounting = false
let hintWidth = 0
let timer: Timer | undefined

const widthOf = (text: string) => [...text].length

function isBlank (node: RenderNode | undefined): boolean {
  if (node === undefined || node === null) return true
  if (typeof node === 'string') return node.trim() === ''
  if (node.type === 'engine') return true
  return (node.type === 'Box' || node.type === 'Text') && (node.children ?? []).every(isBlank)
}

function widthOfNode (node: RenderNode | undefined, modes: readonly string[]): number {
  if (node === undefined || node === null) return 0
  if (typeof node === 'string') return widthOf(node)
  if (node.type === 'engine') return widthOf(modes.join(' & '))
  return (node.children ?? []).reduce((sum, child) => sum + widthOfNode(child, modes), 0)
}

function roomOf (e: { surface: string; viewport?: RenderViewport }) {
  if (e.surface !== 'terminal' || e.viewport === undefined) return Infinity
  return e.viewport.columns - FOOTER_PADDING - FOOTER_GAP - MODE_LABEL - (hintWidth > 0 ? 1 + hintWidth : 0)
}

/** Writes the fill when it differs from the one drawn (an equal write would redraw for nothing). */
async function show ($: EngineInterface, next: Fill) {
  if (shown?.percent === next?.percent && shown?.isEstimate === next?.isEstimate && shown?.compactAt === next?.compactAt) return
  shown = next
  await update($, fill, () => next)
}

/**
 * Counts the window as /context does, estimating locally (`summary`): where
 * auto-compact runs, and, while the engine has no figure, the fill itself.
 */
async function count ($: EngineInterface) {
  if (isCounting) return undefined
  isCounting = true
  try {
    const { context } = await $.session.usage({ breakdown: 'summary' })
    const b = context.breakdown
    thresholdWindow = context.window
    compactAt = b?.isAutoCompactEnabled && b.autoCompactThreshold && context.window > 0
      ? (b.autoCompactThreshold / context.window) * 100
      : undefined
    return b && context.window > 0 ? (b.totalTokens / context.window) * 100 : undefined
  } finally {
    isCounting = false
  }
}

/** Takes the engine's figure; while it has none (a fresh, resumed or compacted window), shows the local count with `~`. */
async function sync ($: EngineInterface, context: SessionContextUsage) {
  const estimate = context.window !== thresholdWindow || context.percent === undefined ? await count($) : undefined
  if (context.percent !== undefined) return show($, { percent: context.percent, isEstimate: false, compactAt })
  if (estimate !== undefined) return show($, { percent: estimate, isEstimate: true, compactAt })
}

export const register: Register = (on, options) => {
  const warnPoints = typeof options.warnPoints === 'number' ? options.warnPoints : 25
  const dangerPoints = typeof options.dangerPoints === 'number' ? options.dangerPoints : 10
  /** By the points left before the compact (before 100% when auto-compact is off). */
  const colorFor = (f: NonNullable<Fill>) => {
    const left = (f.compactAt ?? 100) - f.percent
    return left <= dangerPoints ? 'error' : left <= warnPoints ? 'warning' : 'success'
  }
  shown = null
  compactAt = undefined
  thresholdWindow = 0
  isCounting = false
  timer?.cancel()
  timer = undefined

  on('session.start', async ($, e, next) => {
    timer?.cancel()
    shown = null
    thresholdWindow = 0
    await update($, fill, () => null)
    // The count runs off the start, which it would otherwise hold up.
    $.clock.after(0, () => { void $.session.usage().then(u => sync($, u.context)).catch(() => {}) })
    if (e.isInteractive) {
      timer = $.clock.every(SYNC_MS, () => { void $.session.usage().then(u => sync($, u.context)).catch(() => {}) })
    }
    return next(e)
  })

  on('session.end', ($, e, next) => {
    timer?.cancel()
    timer = undefined
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) await sync($, e.context).catch(() => {})
    return next(e)
  })

  // Footer, bottom right: the bar, then what is beneath (the engine's mode labels,
  // another plugin's drawing such as the meter). Where the row is short it gives up
  // the compact figure, then the bar, then itself.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const [f, beneath] = await Promise.all([read($, fill), next(e)])
    if (f === null) return beneath
    const hasBeneath = e.props.modes.length > 0 || !isBlank(beneath)
    const room = roomOf(e) - (hasBeneath ? widthOfNode(beneath, e.props.modes) + SEPARATOR.length : 0)

    const used = `${f.isEstimate ? '~' : ''}${Math.round(f.percent)}%`
    const compact = f.compactAt !== undefined ? `${SEPARATOR}compact ${Math.round(f.compactAt)}%` : ''
    const label = 'ctx '
    const fit = [
      { hasBar: true, hasCompact: true, width: widthOf(label + used + compact) + CELLS + 1 },
      { hasBar: true, hasCompact: false, width: widthOf(label + used) + CELLS + 1 },
      { hasBar: false, hasCompact: false, width: widthOf(label + used) }
    ].find(form => form.width <= room)
    if (!fit) return beneath

    const color = colorFor(f)
    const filled = Math.round((Math.min(Math.max(f.percent, 0), 100) / 100) * CELLS)
    const mark = f.compactAt === undefined ? -1 : Math.min(CELLS - 1, Math.floor((f.compactAt / 100) * CELLS))
    // The bar as runs of one kind: filled, empty, and the compact mark (red once passed).
    const runs: Array<{ kind: 'on' | 'off' | 'mark' | 'passed'; text: string }> = []
    for (let i = 0; i < CELLS; i++) {
      const kind = i === mark ? (i < filled ? 'passed' : 'mark') : i < filled ? 'on' : 'off'
      const glyph = kind === 'mark' || kind === 'passed' ? '┃' : kind === 'on' ? '━' : '─'
      const last = runs[runs.length - 1]
      if (last && last.kind === kind) last.text += glyph
      else runs.push({ kind, text: glyph })
    }
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row">
        <Text dimColor>{label}</Text>
        {fit.hasBar
          ? runs.map((run, i) => (
            <Box key={`run${i}`}>
              {run.kind === 'on'
                ? <Text color={color}>{run.text}</Text>
                : run.kind === 'passed'
                  ? <Text color="error">{run.text}</Text>
                  : <Text dimColor>{run.text}</Text>}
            </Box>))
          : null}
        <Text color={color}>{(fit.hasBar ? ' ' : '') + used}</Text>
        {fit.hasCompact ? <Text dimColor>{compact}</Text> : null}
        {hasBeneath ? <Text dimColor>{SEPARATOR}</Text> : null}
        {beneath}
      </Box>
    )
  })

  // Only measures the hint line, to know how much room the footer leaves.
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    if (e.surface === 'terminal') {
      const width = widthOf(e.props.hint)
      if (width !== hintWidth) {
        hintWidth = width
        $.ui.invalidate('ui.render')
      }
    }
    return next(e)
  })
}
