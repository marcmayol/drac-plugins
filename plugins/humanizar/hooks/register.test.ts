import { expect, mock, test } from 'claude-code/testing'

import { limpiar, revisar } from './humanizar'
import { informe, reglas } from './log'

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

test('las señales nuevas saltan todas', () => {
  const casos: Array<[string, string]> = [
    ['Hoy voy a profundizar en esto.', 'profundizar'],
    ['Uso Claude para optimizar flujos.', 'optimizar'],
    ['Dicho esto, me quedo con Codex.', 'dicho esto'],
    ['Tengo un abanico de opciones.', 'abanico'],
    ['Tengo un sinfín de ideas.', 'sinfín'],
    ['Esto no es una moda, es un cambio.', 'no es X'],
    ['No eran errores: eran avisos.', 'no es X'],
    ['Uso Claude —un modelo— y ya.', '2 raya(s)'],
    ['Es crucial y clave para mí.', 'juntas en un párrafo'],
    ['Un Claude rápido, eficaz e intuitivo.', 'tres adjetivos'],
  ]
  for (const [texto, aviso] of casos) expect(revisar(texto).avisos.join(' ')).toContain(aviso)
})

test('lo que se parece pero no es una señal no salta', () => {
  const avisos = (t: string) => revisar(t).avisos.join(' ')
  expect(avisos('Esto no es fácil, es decir, me costó.')).not.toContain('no es X')
  expect(avisos('La clave API va aquí.\n\nY es una decisión crucial.')).not.toContain('juntas')
  expect(avisos('Funciona en Windows, Linux y Mac.')).not.toContain('adjetivos')
  expect(avisos('Guardo fotos, vídeos y audios.')).not.toContain('adjetivos')
  expect(avisos('Del 10–20 de mayo.')).not.toContain('raya')
})

test('«no es solo X, es Y» no avisa dos veces', () => {
  expect(revisar('No es solo una moda, es un cambio.').avisos.filter(a => a.startsWith('«no es')).length).toBe(1)
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
  on('command.register', () => ({ value: { command: 'humanizar-log' } }))
  mock.store(on)
  mock.env(on, {})
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })

  const out = await $.tool.call({ tool: 'mcp__humanizar__humanizar', textos: ['A día de hoy lo utilizo.'] } as never)
  const { result } = JSON.parse(String((out as { result: unknown }).result)) as { result: Array<{ texto: string }> }
  expect(result[0]?.texto).toBe('Hoy lo uso.')
})

test('el nombre de la regla va sin cifras ni consejo', () => {
  expect(reglas({
    arreglos: ['«utilizar» → «usar»'],
    avisos: ['relleno de IA: «cabe destacar», «es crucial»', '3 raya(s) «—»: cámbialas', '«no es solo X, es Y»: di Y directamente', 'poco concreto: añade una cifra'],
  })).toEqual(['«utilizar» → «usar»', 'relleno: «cabe destacar»', 'relleno: «es crucial»', 'raya(s) «—»', '«no es solo X, es Y»', 'poco concreto'])
})

test('el informe ordena por veces', () => {
  const t = informe([
    { t: '2026-11-02T01:00:00Z', puntos: 43, reglas: ['poco concreto', 'raya(s) «—»'] },
    { t: '2026-11-03T02:30:00Z', puntos: 90, reglas: ['poco concreto'] },
    { t: '2026-11-03T02:31:00Z', puntos: 100, reglas: [] },
  ])
  expect(t).toContain('3 textos revisados desde 2026-11-02; 2 con algo que corregir.')
  expect(t.indexOf('poco concreto') < t.indexOf('raya(s)')).toBe(true)
  expect(t).toContain('2026-11-03 02:31  nota 100  sin avisos')
})

test('cada revisión va al log sin el texto, y el comando lo enseña y lo borra', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.register', () => ({ value: { tool: 'mcp__humanizar__humanizar' } }))
  on('command.register', () => ({ value: { command: 'humanizar-log' } }))
  mock.store(on)
  mock.env(on, {})
  mock.clock(on, { now: Date.UTC(2026, 10, 2, 1, 40) })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await $.tool.call({ tool: 'mcp__humanizar__humanizar', textos: ['Mi secreto — con raya y poco más.'] } as never)

  const correr = (args: string) => $.command.run({ command: 'humanizar-log', args } as never)
  const t = (await correr('')).text
  expect(t).toContain('1 texto revisado desde')
  expect(t).toContain('raya(s)')
  expect(t).toContain('2026-11-02 01:40')
  expect(t.includes('secreto')).toBe(false)
  await correr('borrar')
  expect((await correr('')).text).toContain('vacío')
})

test('HUMANIZAR_NO_LOG lo apaga', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.register', () => ({ value: { tool: 'mcp__humanizar__humanizar' } }))
  on('command.register', () => ({ value: { command: 'humanizar-log' } }))
  mock.store(on)
  mock.env(on, { HUMANIZAR_NO_LOG: '1' })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await $.tool.call({ tool: 'mcp__humanizar__humanizar', textos: ['Una raya — aquí.'] } as never)
  expect((await $.command.run({ command: 'humanizar-log', args: '' } as never)).text).toContain('vacío')
})
