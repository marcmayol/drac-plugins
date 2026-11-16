import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.parse('2026-10-25T12:00:00Z')
const DAY = 86400000
const ROOT = 'C:/u/.claude/projects'
const FILE = `${ROOT}/p/s.jsonl`
const row = (at: string, input: number) =>
  JSON.stringify({ timestamp: at, message: { usage: { input_tokens: input, output_tokens: 0, cache_read_input_tokens: 5e6 } } })
// 2M inside the plan week (it started 23 Oct 22:00), 1M earlier in the month.
const TRANSCRIPT = [row('2026-10-24T10:00:00Z', 2e6), row('2026-10-02T10:00:00Z', 1e6)].join('\n')
const RATE_LIMITS = [
  { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-25T14:00:00Z' },
  { kind: 'seven_day', percentUsed: 20, resetsAt: '2026-10-30T22:00:00Z' }
]

// The engine hands paths over in the platform's own spelling: on macOS and Linux
// `C:/u/...` is a relative path, resolved against the working directory. So a path
// is matched by its end, the drive left out, and the tests run on every system.
const slash = (path: string) => path.replaceAll('\\', '/')
const isPath = (path: string, want: string) => slash(path).endsWith(want.replace(/^[A-Za-z]:/, ''))

function world (on: On, store = new Map<string, unknown>()) {
  const clock = mock.clock(on, { now: NOW })
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('env.get', (_, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/u' : undefined }))
  on('fs.list', (_, e) => ({
    value: isPath(e.path, ROOT)
      ? [{ name: 'p', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }]
      : isPath(e.path, `${ROOT}/p`)
        ? [{ name: 's.jsonl', kind: 'file', size: TRANSCRIPT.length, mtimeMs: NOW - 1000, isLink: false }]
        : []
  }))
  on('fs.read', (_, e) => (isPath(e.path, FILE) ? { value: TRANSCRIPT } : { deny: 'ENOENT' }))
  on('command.register', () => ({ value: { command: 'meter' } }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200000 }, rateLimits: RATE_LIMITS } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({}))
  // the engine's own footer, with no mode label on
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{''}</Text>
  })
  return { store, clock }
}

const FOOTER = {
  plugin: 'meter-for-claude-code',
  component: 'SessionMode',
  props: { modes: [] },
  viewport: { columns: 160, rows: 40 }
} as const

test('the footer shows 5h · 7d · M, M calibrated by rule of three', async ($, on) => {
  const { store, clock } = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await clock.advance(1)

  // weekly limit = 2M / 20% = 10M; October = 10M × 31/7 ≈ 44.3M; month 3M → 7%
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...FOOTER, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
    expect(texts).toBe('5h 42% · 7d 20% · M 7%')
    await ui.unmount()
  }
  expect(store.get('calib')).toEqual({ util: 0.2, tokens: 2e6, at: NOW })

  const out = await $.command.run({
    command: 'meter', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 }
  })
  expect(out.text).toMatch(/10\.0M/)
})

test('a reading without five_hour keeps the 5h window seen before', async ($, on) => {
  const { store, clock } = world(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await clock.advance(1)
  await $.session.measure({
    changed: ['rateLimits'],
    rateLimits: [{ kind: 'seven_day', percentUsed: 21, resetsAt: '2026-10-30T22:00:00Z' }]
  } as never)
  await clock.advance(1)

  const ui = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
  expect(texts.startsWith('5h 42% · 7d 21%')).toBe(true)
  await ui.unmount()
  expect((store.get('limits') as Array<{ kind: string }>).map(l => l.kind)).toEqual(['five_hour', 'seven_day'])
})

test('a lower weekly % than the stored calibration means new limits: M recalibrates', async ($, on) => {
  // An old calibration at 76% (a much smaller weekly limit), as before the plan changed.
  const store = new Map<string, unknown>([['calib', { util: 0.76, tokens: 2e6, at: NOW - DAY }]])
  const { clock } = world(on, store)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await clock.advance(1)
  expect(store.get('calib')).toEqual({ util: 0.2, tokens: 2e6, at: NOW })
  const ui = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text).join('')).toBe('5h 42% · 7d 20% · M 7%')
  await ui.unmount()
})

test('a window the readings stop bringing goes once its reset has passed', async ($, on) => {
  const { store, clock } = world(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await clock.advance(3 * 3600000) // past the 5h reset (14:00)
  await $.session.measure({
    changed: ['rateLimits'],
    rateLimits: [{ kind: 'seven_day', percentUsed: 21, resetsAt: '2026-10-30T22:00:00Z' }]
  } as never)
  await clock.advance(1)
  expect((store.get('limits') as Array<{ kind: string }>).map(l => l.kind)).toEqual(['seven_day'])
})

test('without a reading the footer is the engine\'s', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

// A transcript over the 4 MiB $.fs.read takes: read through the system's own tool,
// streamed in pieces that cut lines anywhere, with no Node.
function bigWorld (on: On, os: string | undefined, reader: (argv: readonly string[], env?: Record<string, string>) => { pieces: string[]; code: number }) {
  const store = new Map<string, unknown>()
  const clock = mock.clock(on, { now: NOW })
  const seen: Array<{ argv: readonly string[]; env?: Record<string, string> }> = []
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('env.get', (_, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/u' : e.name === 'OS' ? os : undefined }))
  on('fs.list', (_, e) => ({
    value: isPath(e.path, ROOT)
      ? [{ name: 'p', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }]
      : isPath(e.path, `${ROOT}/p`)
        ? [{ name: 's.jsonl', kind: 'file', size: 5 * 1024 * 1024, mtimeMs: NOW - 1000, isLink: false }]
        : []
  }))
  on('fs.read', () => ({ deny: 'over 4 MiB' }))
  on('process.run', () => ({ deny: 'node: command not found' }))
  on('process.spawn', async function * (_, e) {
    seen.push({ argv: e.argv, env: e.env })
    const { pieces, code } = reader(e.argv, e.env)
    for (const text of pieces) yield { stream: 'stdout' as const, text }
    return { value: { code, signal: null } }
  })
  on('command.register', () => ({ value: { command: 'meter' } }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200000 }, rateLimits: RATE_LIMITS } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({}))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{''}</Text>
  })
  return { store, clock, seen }
}

// The usage lines as a reader passes them on, cut every 7 characters.
const inPieces = (eol: string) => {
  const text = TRANSCRIPT.split('\n').join(eol) + eol
  const pieces: string[] = []
  for (let i = 0; i < text.length; i += 7) pieces.push(text.slice(i, i + 7))
  return pieces
}

test('macOS and Linux: a big transcript streams through grep, no Node needed', async ($, on) => {
  const { store, clock, seen } = bigWorld(on, undefined, () => ({ pieces: inPieces('\n'), code: 0 }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await clock.advance(1)
  expect(seen[0].argv.slice(0, 3)).toEqual(['grep', '-F', '"usage"'])
  expect(isPath(seen[0].argv[seen[0].argv.length - 1], FILE)).toBe(true)
  expect(store.get('calib')).toEqual({ util: 0.2, tokens: 2e6, at: NOW })
  const ui = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text).join('')).toBe('5h 42% · 7d 20% · M 7%')
  await ui.unmount()
})

test('Windows: a big transcript streams through PowerShell, the path in the environment', async ($, on) => {
  const { store, clock, seen } = bigWorld(on, 'Windows_NT', () => ({ pieces: inPieces('\r\n'), code: 0 }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await clock.advance(1)
  expect(seen[0].argv[0]).toBe('powershell.exe')
  expect(seen[0].argv).toContain('-EncodedCommand')
  expect(isPath(seen[0].env?.METER_TRANSCRIPT ?? '', FILE)).toBe(true)
  expect(store.get('calib')).toEqual({ util: 0.2, tokens: 2e6, at: NOW })
})

test('a reader that fails and no Node: /meter says the count is partial', async ($, on) => {
  const { clock } = bigWorld(on, undefined, () => ({ pieces: [], code: 2 }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await clock.advance(1)
  const out = await $.command.run({
    command: 'meter', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 }
  })
  expect(out.text).toMatch(/partial|parcial/)
})
