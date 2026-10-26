import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionContextBreakdown } from 'claude-code'

// 200k window, auto-compact at 167k (83.5%); the last response read 116k (58%).
const WINDOW = 200000
// Only the fields the bar reads.
const BREAKDOWN = { totalTokens: 30000, isAutoCompactEnabled: true, autoCompactThreshold: 167000 } as unknown as SessionContextBreakdown

function world (on: On, percent: number | undefined) {
  mock.clock(on, { now: 0 })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', (_, e) => ({
    value: {
      startedAt: 0,
      context: { window: WINDOW, percent, ...(e.breakdown ? { breakdown: BREAKDOWN } : {}) },
      rateLimits: []
    }
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{''}</Text>
  })
}

const FOOTER = {
  plugin: 'context-bar',
  component: 'SessionMode',
  props: { modes: [] },
  viewport: { columns: 160, rows: 40 }
} as const

async function footer ($: Engine, surface: 'terminal' | 'desktop') {
  const ui = await $.ui.mount({ ...FOOTER, surface })
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
  await ui.unmount()
  return text
}

test('the bar, the mark where auto-compact runs, and its %', async ($, on) => {
  world(on, 58)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await $.session.measure({ context: { window: WINDOW, percent: 58 }, rateLimits: [], changed: ['context'] })

  for (const surface of ['terminal', 'desktop'] as const) {
    // 12 cells: 58% fills 7, the mark sits at cell 10 (83.5%)
    expect(await footer($, surface)).toBe('ctx ━━━━━━━───┃─ 58% · compact 84%')
  }
})

test('before the first response it shows the local count with ~', async ($, on) => {
  world(on, undefined)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await $.session.measure({ context: { window: WINDOW }, rateLimits: [], changed: ['context'] })

  expect(await footer($, 'terminal')).toBe('ctx ━━────────┃─ ~15% · compact 84%')
})

test('a narrow terminal keeps the % alone', async ($, on) => {
  world(on, 58)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await $.session.measure({ context: { window: WINDOW, percent: 58 }, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ ...FOOTER, surface: 'terminal', viewport: { columns: 36, rows: 40 } })
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text).join('')).toBe('ctx 58%')
  await ui.unmount()
})
