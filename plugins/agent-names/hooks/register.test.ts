import { expect, test } from 'claude-code/testing'

import { esValido } from './register'

test('accepts "Project: task"', () => {
  for (const nombre of ['LinkedIn: responder a Edwin', 'Faltis: revisar el login', 'humanizar: probar el log', 'Contestar LinkedIn: buscar comentarios']) {
    expect(esValido(nombre)).toBe(true)
  }
})

test('refuses a name without a project, or too long', () => {
  for (const nombre of [
    'Review the login flow',
    'LinkedIn:responder',
    ': responder',
    ' LinkedIn: responder',
    'LinkedIn: ',
    'Un nombre de proyecto larguísimo que no acaba nunca: tarea',
    `LinkedIn: ${'x'.repeat(60)}`,
  ]) {
    expect(esValido(nombre)).toBe(false)
  }
})

test('a bad name is denied, with the rule and without starting the agent', async ($, on) => {
  let arrancado = false
  on('tool.call', () => {
    arrancado = true
    return { result: 'started' }
  })
  const r = await $.tool.call({ tool: 'Agent', description: 'Review login', prompt: 'x' } as never) as { deny?: string }
  expect(r.deny).toContain('Review login')
  expect(r.deny).toContain('Project: task')
  expect(arrancado).toBe(false)
})

test('a good name goes through untouched', async ($, on) => {
  let visto = ''
  on('tool.call', (_, e) => {
    visto = (e as unknown as { description: string }).description
    return { result: 'started' }
  })
  const r = await $.tool.call({ tool: 'Agent', description: 'Faltis: revisar el login', prompt: 'x' } as never) as { deny?: string }
  expect(r.deny).toBe(undefined)
  expect(visto).toBe('Faltis: revisar el login')
})

test('other tools are left alone', async ($, on) => {
  on('tool.call', () => ({ result: 'ran' }))
  const r = await $.tool.call({ tool: 'Bash', command: 'ls', description: 'no colon here' } as never) as { deny?: string }
  expect(r.deny).toBe(undefined)
})

test('the model reads the rule in the tool description', async ($, on) => {
  on('tool.describe', (_, e) => ({ description: e.description }))
  const r = await $.tool.describe({ tool: 'Agent', description: 'Launch an agent.', provider: { plugin: 'engine', tier: 'core' } } as never)
  expect(r.description).toContain('Launch an agent.')
  expect(r.description).toContain('Project: task')
})
