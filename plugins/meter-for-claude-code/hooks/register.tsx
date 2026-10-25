import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode, RenderViewport, SessionRateLimit } from 'claude-code'

import type { Calibration, Derived, Limit } from '../types'
import { parseTranscript } from './parse.mjs'
import {
  DAY_MS, WEEK_MS, calibrate, merge, monthPercent, short, sumRange, until, weekHistory, weeklyLimitOf
} from './usage'
import type { Hourly } from './usage'

const limits = atom({ plugin: 'meter-for-claude-code', key: 'limits' } as const, [] as Limit[])
const derived = atom({ plugin: 'meter-for-claude-code', key: 'derived' } as const, { history: [], isPartial: false } as Derived, {
  shape: 'derived-1'
})
const tick = atom({ plugin: 'meter-for-claude-code', key: 'tick' } as const, 0)

const WINDOWS = ['five_hour', 'seven_day']
const LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d' }
const SYNC_MS = 8000 // another session's reading shows up within this
const SCAN_MS = 5 * 60000 // transcripts are re-read at most this often
const MAX_READ = 4 * 1024 * 1024 // what $.fs.read takes; bigger ones go to Node
// The oldest transcript that can count: six plan weeks back, a day to spare.
const LOOKBACK_MS = 6 * WEEK_MS + DAY_MS
// The terminal footer: padding at each end, the mode label at the left and the
// hint after it, a gap before what is drawn here (as sub-meter measures it).
const FOOTER_PADDING = 4
const FOOTER_GAP = 2
const MODE_LABEL = 20
const SEPARATOR = ' · '

const isSpanish = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('es') } catch { return false }
})()
const t = (en: string, es: string) => (isSpanish ? es : en)

// Per transcript: the size and mtime it was read at, and its tokens per hour.
const files = new Map<string, { size: number; mtime: number; hourly: Hourly }>()
let hourly: Hourly = {}
let isPartial = false
let scannedAt = 0
let scanning: Promise<void> | undefined
let seenAt = 0
let hintWidth = 0
let timers: Array<{ cancel: () => void }> = []

const colorFor = (percent: number) => (percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'success')
const widthOf = (text: string) => [...text.replace(/[︎️]/g, '')].length

const windowsOf = (rateLimits: readonly SessionRateLimit[]): Limit[] =>
  WINDOWS.flatMap(kind => {
    const found = rateLimits.find(limit => limit.kind === kind)
    return found ? [{ kind, percentUsed: found.percentUsed, resetsAt: found.resetsAt }] : []
  })

/** Where Claude Code keeps the transcripts: `CLAUDE_CONFIG_DIR`, else `~/.claude`. */
async function projectsDir ($: EngineInterface) {
  const config = await $.env.get('CLAUDE_CONFIG_DIR')
  if (config) return `${config.replace(/[\\/]$/, '')}/projects`
  const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || ''
  return `${home.replace(/[\\/]$/, '')}/.claude/projects`
}

async function walk ($: EngineInterface, dir: string, since: number, out: Array<{ path: string; size: number; mtime: number }>) {
  const entries = await $.fs.list(dir).catch(() => [])
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`
    if (entry.kind === 'dir') await walk($, path, since, out)
    else if (entry.kind === 'file' && entry.name.endsWith('.jsonl') && entry.mtimeMs >= since) {
      out.push({ path, size: entry.size, mtime: entry.mtimeMs })
    }
  }
}

/** Re-reads the transcripts that changed since the last scan, the big ones in one Node run. */
async function scan ($: EngineInterface, now: number) {
  const found: Array<{ path: string; size: number; mtime: number }> = []
  await walk($, await projectsDir($), now - LOOKBACK_MS, found)
  const changed = found.filter(f => {
    const kept = files.get(f.path)
    return !kept || kept.size !== f.size || kept.mtime !== f.mtime
  })
  let missed = false
  const big: typeof changed = []
  for (const f of changed) {
    if (f.size > MAX_READ) { big.push(f); continue }
    try {
      files.set(f.path, { size: f.size, mtime: f.mtime, hourly: parseTranscript(await $.fs.read(f.path)) })
    } catch {
      missed = true
    }
  }
  if (big.length > 0) {
    try {
      const run = await $.process.run(['node', `${$.plugin.root}/scripts/scan.mjs`, ...big.map(f => f.path)], {
        timeoutMs: 120000
      })
      const parsed = JSON.parse(run.stdout) as Record<string, Hourly>
      for (const f of big) {
        const got = parsed[f.path]
        if (got) files.set(f.path, { size: f.size, mtime: f.mtime, hourly: got })
        else missed = true
      }
    } catch {
      missed = true // no Node: the big transcripts keep what an earlier scan read, if anything
    }
  }
  const live = new Set(found.map(f => f.path))
  for (const path of [...files.keys()]) if (!live.has(path)) files.delete(path)
  hourly = merge([...files.values()].map(f => f.hourly))
  isPartial = missed
  scannedAt = now
}

/** Calibrates the weekly limit on the current reading and derives the month and the past weeks. */
async function derive ($: EngineInterface, countCacheRead: boolean) {
  const now = await $.clock.now()
  if (now - scannedAt >= SCAN_MS && !scanning) {
    scanning = scan($, now).finally(() => { scanning = undefined })
  }
  if (scanning) await scanning
  const week = (await read($, limits)).find(limit => limit.kind === 'seven_day')
  const saved = (await $.store.get('calib')) as Calibration | undefined
  let best = saved
  let history: Derived['history'] = []
  const resetMs = week?.resetsAt ? Date.parse(week.resetsAt) : NaN
  if (week && !Number.isNaN(resetMs) && resetMs > now) {
    const tokens = sumRange(hourly, resetMs - WEEK_MS, now, countCacheRead)
    best = calibrate(saved, week.percentUsed / 100, tokens, now)
    if (best !== saved) await $.store.set('calib', best ?? null)
  }
  const weeklyLimit = weeklyLimitOf(best ?? undefined)
  if (weeklyLimit && !Number.isNaN(resetMs)) history = weekHistory(hourly, resetMs, weeklyLimit, now, countCacheRead)
  await update($, derived, () => ({
    monthPercent: weeklyLimit ? monthPercent(hourly, weeklyLimit, now, countCacheRead) : undefined,
    weeklyLimit,
    history,
    isPartial
  }))
}

// Off the dispatch that asks for it: a timer runs on after that hook returns.
function refresh ($: EngineInterface, countCacheRead: boolean) {
  $.clock.after(0, () => { void derive($, countCacheRead).catch(() => {}) })
}

/** Keeps the latest reading, and shares it with the other sessions through the store. */
async function remember ($: EngineInterface, found: Limit[]) {
  if (found.length === 0) return
  seenAt = await $.clock.now()
  await update($, limits, () => found)
  await $.store.set('limits', found)
  await $.store.set('at', seenAt) // after the limits, so a reader that sees the new time finds them
}

async function syncFromStore ($: EngineInterface) {
  const at = Number(await $.store.get('at')) || 0
  if (at <= seenAt) return false
  const saved = await $.store.get('limits')
  if (!Array.isArray(saved)) return false
  seenAt = at
  await update($, limits, () => saved as Limit[])
  return true
}

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

/** The current % of a window, 0 once its reset has passed. */
const percentOf = (limit: Limit, now: number) =>
  limit.resetsAt !== undefined && Date.parse(limit.resetsAt) <= now ? 0 : limit.percentUsed

export const register: Register = (on, options) => {
  const showMonth = options.showMonth !== false
  const countCacheRead = options.countCacheRead === true
  files.clear()
  hourly = {}
  scannedAt = 0
  seenAt = 0

  on('session.start', async ($, e, next) => {
    for (const timer of timers) timer.cancel()
    timers = []
    await $.command.register({
      name: 'meter',
      description: t('Plan usage: 5h, 7d, month (M), resets and past weeks', 'Uso del plan: 5h, 7d, mes (M), reinicios y semanas anteriores')
    })
    const [saved, storedAt, usage] = await Promise.all([$.store.get('limits'), $.store.get('at'), $.session.usage()])
    if (Array.isArray(saved)) await update($, limits, () => saved as Limit[])
    seenAt = Number(storedAt) || 0
    await remember($, windowsOf(usage.rateLimits))
    if (showMonth) refresh($, countCacheRead)

    if (e.isInteractive) {
      timers.push($.clock.every(SYNC_MS, () => {
        void syncFromStore($).then(isNew => { if (isNew && showMonth) refresh($, countCacheRead) }).catch(() => {})
        void update($, tick, n => n + 1)
      }))
      if (showMonth) timers.push($.clock.every(SCAN_MS, () => refresh($, countCacheRead)))
    }
    return next(e)
  })

  on('session.end', ($, e, next) => {
    for (const timer of timers) timer.cancel()
    timers = []
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await remember($, windowsOf(e.rateLimits))
    if (showMonth && e.changed.includes('rateLimits')) refresh($, countCacheRead)
    return next(e)
  })

  on('command.run', { command: 'meter' }, async $ => {
    const now = await $.clock.now()
    const all = await read($, limits)
    const d = await read($, derived)
    if (all.length === 0) {
      return { text: t('No plan reading yet: it arrives with the first response (needs a subscription, not an API key).', 'Aún no hay lectura del plan: llega con la primera respuesta (hace falta suscripción, no API key).') }
    }
    const lines = ['Claude Code Meter']
    for (const limit of all) {
      const name = limit.kind === 'five_hour' ? t('Session (5h)', 'Sesión (5h)') : t('Week (7d)', 'Semana (7d)')
      const reset = limit.resetsAt ? Date.parse(limit.resetsAt) - now : NaN
      const resets = reset > 0 ? `  ↻ ${until(reset)}` : ''
      lines.push(`  ${name.padEnd(14)} ${String(Math.round(percentOf(limit, now))).padStart(3)}%${resets}`)
    }
    if (d.monthPercent !== undefined && d.weeklyLimit !== undefined) {
      lines.push(`  ${t('Month (M)', 'Mes (M)').padEnd(14)} ${String(Math.round(d.monthPercent)).padStart(3)}%  ${t('weekly limit', 'límite semanal')} ≈ ${short(d.weeklyLimit)} tok`)
    } else {
      lines.push(`  ${t('Month (M)', 'Mes (M)').padEnd(14)}   —   ${t('calibrating: needs the week above 3%', 'calibrando: necesita la semana por encima del 3 %')}`)
    }
    if (d.history.length > 0) {
      lines.push('', t('Plan weeks', 'Semanas del plan'))
      const date = (ms: number) => new Date(ms).toLocaleDateString(isSpanish ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short' })
      for (const row of d.history) {
        const mark = row.isCurrent ? t('  ← now', '  ← actual') : ''
        lines.push(`  ${`${date(row.start)} – ${date(row.end)}`.padEnd(18)} ${String(Math.round(row.percent)).padStart(3)}%  ${short(row.tokens).padStart(6)}${mark}`)
      }
    }
    if (d.isPartial) lines.push('', t('Some transcripts over 4 MiB could not be read (is Node on the PATH?).', 'Hay transcripciones de más de 4 MiB que no se han podido leer (¿está Node en el PATH?).'))
    return { text: lines.join('\n') }
  })

  // Bottom right of the footer: 5h · 7d · M, then what is beneath (the engine's
  // mode labels, another plugin's drawing). Where the row is short M goes first.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const all = await read($, limits)
    if (all.length === 0) return next(e)
    const d = await read($, derived)
    const [, now, beneath] = await Promise.all([read($, tick), $.clock.now(), next(e)])
    const items = all.map(limit => ({ label: LABELS[limit.kind] ?? limit.kind, percent: percentOf(limit, now) }))
    if (showMonth && d.monthPercent !== undefined) items.push({ label: 'M', percent: d.monthPercent })
    const hasBeneath = e.props.modes.length > 0 || !isBlank(beneath)
    const room = roomOf(e) - (hasBeneath ? widthOfNode(beneath, e.props.modes) + SEPARATOR.length : 0)
    const widthOfItems = (list: typeof items) =>
      list.reduce((sum, item) => sum + widthOf(`${item.label} ${Math.round(item.percent)}%`), (list.length - 1) * SEPARATOR.length)
    let shown = items
    while (shown.length > 0 && widthOfItems(shown) > room) shown = shown.slice(0, -1)
    if (shown.length === 0) return beneath

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        {shown.map((item, i) => (
          <Box flexDirection="row" key={item.label}>
            {i > 0 ? <Text dimColor>{SEPARATOR}</Text> : null}
            <Text dimColor>{item.label + ' '}</Text>
            <Text color={colorFor(item.percent)}>{`${Math.round(item.percent)}%`}</Text>
          </Box>
        ))}
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
