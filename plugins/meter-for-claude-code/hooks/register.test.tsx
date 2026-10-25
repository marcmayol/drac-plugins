import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.parse('2026-10-25T12:00:00Z')
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

// The engine hands paths over in the platform's own spelling.
const slash = (path: string) => path.replaceAll('\\', '/')

function world (on: On, store = new Map<string, unknown>()) {
  const clock = mock.clock(on, { now: NOW })
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('env.get', (_, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/u' : undefined }))
  on('fs.list', (_, e) => ({
    value: slash(e.path) === ROOT
      ? [{ name: 'p', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }]
      : slash(e.path) === `${ROOT}/p`
        ? [{ name: 's.jsonl', kind: 'file', size: TRANSCRIPT.length, mtimeMs: NOW - 1000, isLink: false }]
        : []
  }))
  on('fs.read', (_, e) => (slash(e.path) === FILE ? { value: TRANSCRIPT } : { deny: 'ENOENT' }))
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

test('without a reading the footer is the engine\'s', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})
