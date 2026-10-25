// The same arithmetic as the Python widget's usage.py: the plan's weekly window
// is anchored to its reset (not Monday → Sunday), and the weekly limit in tokens
// comes by rule of three from the tokens of that window and its %.
import type { Calibration, WeekRow } from '../types'

export type Hourly = Record<string, [number, number]>

export const HOUR_MS = 3600000
export const DAY_MS = 86400000
export const WEEK_MS = 7 * DAY_MS
/** Below this weekly fraction the one-decimal % rounds too coarsely to calibrate on. */
export const MIN_UTIL = 0.03
/** A calibration older than this is dropped (the plan or its tier may have changed). */
export const MAX_AGE_MS = 45 * DAY_MS

/** Adds hourly maps together. */
export function merge (maps: Iterable<Hourly>): Hourly {
  const total: Hourly = {}
  for (const map of maps) {
    for (const [hour, [work, cr]] of Object.entries(map)) {
      const b = total[hour] ?? (total[hour] = [0, 0])
      b[0] += work
      b[1] += cr
    }
  }
  return total
}

/** Tokens of the hours that start in [startMs, endMs). */
export function sumRange (hourly: Hourly, startMs: number, endMs: number, countCacheRead: boolean): number {
  let sum = 0
  for (const [hour, [work, cr]] of Object.entries(hourly)) {
    const at = Number(hour) * HOUR_MS
    if (at >= startMs && at < endMs) sum += work + (countCacheRead ? cr : 0)
  }
  return sum
}

/** Keeps the reading with the highest weekly %, and drops one too old. */
export function calibrate (best: Calibration | undefined, util: number, tokens: number, now: number): Calibration | undefined {
  const kept = best && now - best.at <= MAX_AGE_MS ? best : undefined
  if (util < MIN_UTIL || tokens <= 0) return kept
  return !kept || util > kept.util ? { util, tokens, at: now } : kept
}

export const weeklyLimitOf = (c: Calibration | undefined) => (c ? c.tokens / c.util : undefined)

export function monthStart (now: number) {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

export function daysInMonth (now: number) {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

/** The month's tokens against the weekly limit scaled to the month's days, in %. */
export function monthPercent (hourly: Hourly, weeklyLimit: number, now: number, countCacheRead: boolean) {
  const budget = (weeklyLimit * daysInMonth(now)) / 7
  return budget > 0 ? (sumRange(hourly, monthStart(now), now, countCacheRead) / budget) * 100 : 0
}

/** The last `n` plan weeks, newest first, each one's % rebuilt from its tokens. */
export function weekHistory (hourly: Hourly, resetMs: number, weeklyLimit: number, now: number, countCacheRead: boolean, n = 6): WeekRow[] {
  const rows: WeekRow[] = []
  for (let i = 0; i < n; i++) {
    const end = resetMs - i * WEEK_MS
    const start = end - WEEK_MS
    if (start > now) continue
    const tokens = sumRange(hourly, start, Math.min(end, now), countCacheRead)
    rows.push({ start, end: Math.min(end, now), tokens, percent: (tokens / weeklyLimit) * 100, isCurrent: i === 0 })
  }
  return rows
}

/** "42m", "3h 5m", "2d 4h": how long until a reset. */
export function until (ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** "8.5M", "940k": a token count, short. */
export function short (tokens: number) {
  if (tokens >= 1e9) return `${(tokens / 1e9).toFixed(1)}B`
  if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(1)}M`
  if (tokens >= 1e3) return `${Math.round(tokens / 1e3)}k`
  return String(Math.round(tokens))
}
