import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import {
  arreglarEntregable, arreglarHtml, arreglarMd, esEspanol, esHerramientaDeProducto, informar, noTieneVueltaAtras,
  pideTexto, textosHtml, textosMd, tipoDeFichero,
} from './producto'
import { revisar } from './humanizar'

test('qué fichero es texto de producto', () => {
  expect(tipoDeFichero('/p/README.md')).toBe('md')
  expect(tipoDeFichero('/p/project/S-Inicio.dc.html')).toBe('html')
  expect(tipoDeFichero('/p/nota.txt')).toBe('texto')
  for (const no of ['/p/App.kt', '/p/main.ts', '/p/CLAUDE.md', '/p/skills/x/SKILL.md', '/Users/m/.claude/memory/a.md', '/p/node_modules/a/README.md']) {
    expect(tipoDeFichero(no)).toBe(null)
  }
})

test('qué herramienta es de producto', () => {
  for (const si of ['mcp__claude_ai_Claude_Docs__batch', 'mcp__claude_ai_Gmail__create_draft', 'mcp__claude_ai_Gmail__send_message', 'mcp__claude_ai_Notion__notion-create-pages', 'mcp__claude_ai_Canva__generate-design', 'mcp__claude_ai_Google_Drive__create_file', 'mcp__linkedin__create_post']) {
    expect(esHerramientaDeProducto(si)).toBe(true)
  }
  for (const no of ['mcp__claude_ai_Gmail__search_threads', 'mcp__claude_ai_Notion__notion-search', 'mcp__humanizar__humanizar', 'mcp__omoikane__remember', 'Bash']) {
    expect(esHerramientaDeProducto(no)).toBe(false)
  }
  expect(noTieneVueltaAtras('mcp__claude_ai_Gmail__send_message')).toBe(true)
  expect(noTieneVueltaAtras('mcp__claude_ai_Gmail__create_draft')).toBe(false)
})

test('detecta cuándo piden en el chat un texto para entregar', () => {
  const si = [
    'Escríbeme un email para Laura diciéndole que llego tarde',
    'prepárame un WhatsApp para el grupo de la cena',
    'Redacta un mensaje de Teams para el equipo sobre la reunión del lunes',
    '¿Cómo le contesto a mi jefe que no puedo ir?',
    'Necesito mandar un correo al casero',
    'hazme un post para LinkedIn sobre Omoikane',
    'pásame el texto para la invitación',
    'mejora este mensaje: hola que tal',
  ]
  const no = [
    '¿Cómo funciona el envío de emails en la app?',
    'Escribe el mensaje del commit',
    'lee el correo de Marta',
    'el mensaje de error dice null',
    'Arregla el test del correo',
    'busca los mensajes de Teams de ayer',
    'Dame el log del servidor',
    'cómo funciona humanizar',
    'redacta la función que envía el email',
    '/humanizar escríbeme un correo',
  ]
  for (const t of si) expect([t, pideTexto(t)]).toEqual([t, true])
  for (const t of no) expect([t, pideTexto(t)]).toEqual([t, false])
})

test('en la respuesta del chat solo se toca la cita o el bloque de texto plano', () => {
  const r = arreglarEntregable('A día de hoy te lo dejo así:\n\n> Hola Laura, a día de hoy no puedo ir.\n\n```ts\nutilizar()\n```')
  expect(r.texto).toBe('A día de hoy te lo dejo así:\n\n> Hola Laura, hoy no puedo ir.\n\n```ts\nutilizar()\n```')
  expect(r.partes).toEqual(['Hola Laura, hoy no puedo ir.'])
  const plano = arreglarEntregable('Mira:\n\n```\nHola, sin lugar a dudas voy.\n```')
  expect(plano.texto).toBe('Mira:\n\n```\nHola, sin duda voy.\n```')
  // Sin cita ni bloque, el texto entero es el entregable.
  expect(arreglarEntregable('Hola Laura, a día de hoy no puedo ir.').texto).toBe('Hola Laura, hoy no puedo ir.')
})

test('el markdown se arregla fuera del código, los enlaces y los espacios duros', () => {
  const md = '# A día de hoy\n\nLo utilizo en https://x.com/utilizar y `utilizar()`. Cuesta 10 €.\n\n```\nutilizar()\n```\n'
  const [nuevo, arreglos] = arreglarMd(md)
  expect(nuevo).toBe('# Hoy\n\nLo uso en https://x.com/utilizar y `utilizar()`. Cuesta 10 €.\n\n```\nutilizar()\n```\n')
  expect(arreglos).toEqual(['«a día de hoy» → «hoy»', '«utilizo» → «uso»'])
})

test('el HTML se arregla solo entre etiquetas, nunca en scripts ni atributos', () => {
  const html = '<p title="utilizar">A día de hoy</p><script>utilizar()</script><style>.utilizar{}</style>'
  expect(arreglarHtml(html)[0]).toBe('<p title="utilizar">Hoy</p><script>utilizar()</script><style>.utilizar{}</style>')
  expect(textosHtml('<button aria-label="Cerrar">Finalizar día</button><span>Día&nbsp;terminado</span>')).toEqual(['Cerrar', 'Finalizar día', 'Día terminado'])
})

test('los textos de una interfaz avisan de palabras distintas para lo mismo y no de sus títulos con pregunta', () => {
  const inf = informar(['¿Qué ha pasado?', 'Finalizar día', 'Día terminado', 'Subir del móvil', 'Tu teléfono'], 'html')
  expect(inf.coherencia.length).toBe(2)
  expect(inf.hallazgos).toEqual([])
})

test('los párrafos de un markdown salen sin la sintaxis', () => {
  expect(textosMd('---\ntitle: x\n---\n# Título\n\nUna línea\ny otra con [enlace](https://a.b).\n\n- punto uno\n\n    código\n')).toEqual(['Título', 'Una línea y otra con enlace.', 'punto uno'])
})

test('solo español', () => {
  expect(esEspanol('Hola, te escribo para decirte que mañana no puedo ir a la cena.')).toBe(true)
  expect(esEspanol('Hi, I am writing to tell you that I cannot make it to dinner tomorrow.')).toBe(false)
})

test('las señales de no-ai-slop saltan y lo normal no', () => {
  const avisos = (t: string) => revisar(t).avisos.join(' ')
  expect(avisos('El lanzamiento añade búsqueda, destacando el compromiso del equipo.')).toContain('gerundio')
  expect(avisos('Esta herramienta juega un papel fundamental.')).toContain('importancia inflada')
  expect(avisos('Lo importante aquí es que funciona.')).toContain('qué pensar')
  expect(avisos('Los expertos coinciden en que es mejor.')).toContain('fuente vaga')
  expect(avisos('Lo mejor de todo: aprende solo.')).toContain('dos puntos')
  expect(avisos('Se volverá a intentar cuando haya conexión.')).toContain('pasiva')
  expect(avisos('He montado el plugin en dos tardes. Funciona con Claude. Así de simple.')).toContain('remata')
  const normal = avisos('Ayer subí 14 fotos de Osaka a Drive. Tardó 3 minutos con el wifi del hotel.')
  for (const s of ['gerundio', 'inflada', 'qué pensar', 'fuente vaga', 'dos puntos', 'pasiva', 'remata']) expect(normal).not.toContain(s)
})

function base (on: On) {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.register', () => ({ value: { tool: 'mcp__humanizar__humanizar' } }))
  on('command.register', (_, e) => ({ value: { command: (e as { name: string }).name } }))
  mock.store(on)
  mock.env(on, {})
}

test('Write de un documento: arregla lo seguro y le dice al modelo qué reescribir', async ($, on) => {
  base(on)
  let escrito = ''
  on('tool.call', { tool: 'Write' }, (_, e) => {
    escrito = e.content
    return { result: { type: 'create', filePath: e.file_path, content: e.content, structuredPatch: [], originalFile: null } } as never
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  const r = await $.tool.call({ tool: 'Write', file_path: '/p/post.md', content: 'A día de hoy lo utilizo para todo, destacando su potencia. Los expertos coinciden en que es lo mejor para el equipo.\n\n```\nutilizar()\n```\n' } as never)
  expect(escrito).toBe('Hoy lo uso para todo, destacando su potencia. Los expertos coinciden en que es lo mejor para el equipo.\n\n```\nutilizar()\n```\n')
  const ctx = ((r as { context?: string[] }).context ?? []).join('\n')
  expect(ctx).toContain('gerundio')
  expect(ctx).toContain('fuente vaga')
})

test('Write de código no se toca', async ($, on) => {
  base(on)
  let escrito = ''
  on('tool.call', { tool: 'Write' }, (_, e) => {
    escrito = e.content
    return { result: { type: 'create', filePath: e.file_path, content: e.content, structuredPatch: [], originalFile: null } } as never
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  const codigo = '// A día de hoy lo utilizo\nconst utilizar = 1\n'
  const r = await $.tool.call({ tool: 'Write', file_path: '/p/a.ts', content: codigo } as never)
  expect(escrito).toBe(codigo)
  expect((r as { context?: string[] }).context).toBe(undefined)
})

test('con /humanizar-auto off no revisa nada', async ($, on) => {
  base(on)
  let escrito = ''
  on('tool.call', { tool: 'Write' }, (_, e) => {
    escrito = e.content
    return { result: { type: 'create', filePath: e.file_path, content: e.content, structuredPatch: [], originalFile: null } } as never
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  expect((await $.command.run({ command: 'humanizar-auto', args: 'off' } as never)).text).toContain('Apagado')
  await $.tool.call({ tool: 'Write', file_path: '/p/post.md', content: 'A día de hoy lo utilizo para escribir el blog de la empresa.' } as never)
  expect(escrito).toBe('A día de hoy lo utilizo para escribir el blog de la empresa.')
  expect((await $.command.run({ command: 'humanizar-auto', args: 'on' } as never)).text).toContain('Encendido')
})

test('un correo que se envía con avisos se para una vez y la segunda pasa', async ($, on) => {
  base(on)
  let enviados = 0
  on('tool.call', (_, e) => {
    if (String(e.tool) === 'mcp__claude_ai_Gmail__send_message') enviados++
    return { result: { ok: true } } as never
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  const correo = { tool: 'mcp__claude_ai_Gmail__send_message', to: 'a@b.c', subject: 'Cena', body: 'Hola Laura, te escribo porque lo importante aquí es que no puedo ir a la cena del viernes.' }
  const primera = await $.tool.call(correo as never)
  expect((primera as { deny?: string }).deny ?? '').toContain('qué pensar')
  expect(enviados).toBe(0)
  await $.tool.call(correo as never)
  expect(enviados).toBe(1)
})

test('un correo pedido en el chat: recordatorio en ese turno y arreglos solo en la cita', async ($, on) => {
  base(on)
  let contexto: readonly string[] = []
  on('prompt.submit', (_, e) => { contexto = e.context ?? []; return { text: e.text } })
  const sesion = mock.session(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'Escríbeme un correo para Laura diciéndole que no voy a la cena', wait: false, origin: { kind: 'composer' } } as never)
  expect(contexto.join(' ')).toContain('texto para entregar')
  const fila = (texto: string) => ({ message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: texto }] }, door: 'response', origin: { kind: 'model', model: 'm' }, uuid: crypto.randomUUID() })
  await $.session.append(fila('A día de hoy te lo dejo así:\n\n> Hola Laura, a día de hoy no puedo ir a la cena.') as never)
  const guardada = sesion.appended().find(r => r.door === 'response')
  expect(JSON.stringify(guardada?.message.content)).toContain('> Hola Laura, hoy no puedo ir a la cena.')
  expect(JSON.stringify(guardada?.message.content)).toContain('A día de hoy te lo dejo así')

  // Un turno normal no se toca.
  await $.prompt.submit({ text: '¿Cómo funciona el envío de emails en la app?', wait: false, origin: { kind: 'composer' } } as never)
  expect(contexto.length).toBe(0)
  await $.session.append(fila('> A día de hoy se envían con SMTP.') as never)
  const normal = sesion.appended().filter(r => r.door === 'response').at(-1)
  expect(JSON.stringify(normal?.message.content)).toContain('A día de hoy se envían')
})

test('un mensaje de otra sesión que pide un correo no marca el turno', async ($, on) => {
  base(on)
  let contexto: readonly string[] = []
  on('prompt.submit', (_, e) => { contexto = e.context ?? []; return { text: e.text } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'Escríbeme un correo para Laura', wait: false, origin: { kind: 'peer' } } as never)
  expect(contexto.length).toBe(0)
})
