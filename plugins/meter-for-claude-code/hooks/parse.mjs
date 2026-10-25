// Shared by the hooks module and scripts/scan.mjs (Node), so both read a
// transcript the same way: plain ESM, no imports.

const HOUR_MS = 3600000

/**
 * Tokens per hour of one .jsonl transcript: { [hourIndex]: [work, cacheRead] },
 * hourIndex = floor(epoch ms / 1 h) in UTC, work = input + output + cache_creation.
 */
export function parseTranscript (text) {
  const hourly = {}
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue
    let d
    try { d = JSON.parse(line) } catch { continue }
    const u = d?.message?.usage
    const ts = Date.parse(d?.timestamp ?? '')
    if (!u || typeof u !== 'object' || Number.isNaN(ts)) continue
    const hour = Math.floor(ts / HOUR_MS)
    const b = hourly[hour] ?? (hourly[hour] = [0, 0])
    b[0] += (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0)
    b[1] += u.cache_read_input_tokens || 0
  }
  return hourly
}
