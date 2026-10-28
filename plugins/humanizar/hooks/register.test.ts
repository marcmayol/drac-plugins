import { expect, test } from 'claude-code/testing'

import { limpiar, revisar } from './humanizar'

const IA = `🚀 En el vertiginoso mundo de la IA, esto lo cambia todo.

No es solo una herramienta, es un cambio de paradigma. ¿El resultado? Un antes y un después.

A día de hoy es fundamental aprovechar al máximo cada oportunidad — y esta es la clave.

¿Qué opinas? 👇 #IA #AI #Innovación #Tech #Futuro`

const HUMANO = `Llevaba semanas difundiendo a mano cada post de LinkedIn en X y Threads. Unos 15 minutos por post.

Ayer monté un plugin para Claude Code que lo hace solo: lee mi actividad cada 2 horas y publica en las tres redes con mi propio Chrome. Sin APIs de pago.

Lo he subido aquí: https://github.com/marcmayol/drac-plugins #ClaudeCode`

test('un texto de IA suspende y avisa', () => {
  const r = revisar(IA)
  expect(r.puntos).toBe(22)
  const avisos = r.avisos.join(' ')
  for (const esperado of ['vertiginoso', 'no es solo', '¿El resultado?', 'raya', '5 hashtags', 'emoji']) {
    expect(avisos).toContain(esperado)
  }
})

test('un texto con voz propia aprueba sin avisos', () => {
  const r = revisar(HUMANO)
  expect(r.avisos).toEqual([])
  expect(r.puntos >= 90).toBe(true)
  expect(r.cambiado).toBe(false)
})

test('quita invisibles y negrita Unicode', () => {
  expect(revisar('𝗘𝘀𝘁𝗼 es​ así').texto).toBe('Esto es así')
})

test('la muletilla con sustituto respeta la mayúscula', () => {
  expect(limpiar('A día de hoy lo utilizo')[0]).toBe('Hoy lo uso')
})

test('una palabra con tilde detrás no cuenta como límite', () => {
  expect(limpiar('Utilizarás esto')[0]).toBe('Utilizarás esto')
})

test('no toca enlaces ni comillas españolas', () => {
  const t = 'Lo dice «el README»: https://github.com/a/b'
  expect(limpiar(t)[0]).toBe(t)
})

test('a un tuit corto no se le castiga por ritmo', () => {
  expect(revisar('Mi plugin ya publica en Bluesky. Gratis.').pruebas.ritmo).toBe(100)
})

test('pregunta retórica tras una raya', () => {
  expect(revisar('Esto lo cambia todo — ¿El resultado? Nada.').avisos.some(a => a.includes('retórica'))).toBe(true)
})

test('la herramienta responde a una lista de textos', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.register', () => ({ value: { tool: 'mcp__humanizar__humanizar' } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })

  const out = await $.tool.call({ tool: 'mcp__humanizar__humanizar', textos: ['A día de hoy lo utilizo.'] } as never)
  const { result } = JSON.parse(String((out as { result: unknown }).result)) as { result: Array<{ texto: string }> }
  expect(result[0]?.texto).toBe('Hoy lo uso.')
})
