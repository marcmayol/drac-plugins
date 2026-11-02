import type { Register } from 'claude-code'

import { revisar } from './humanizar'
import { informe, reglas, type Entrada } from './log'

// Registered by this plugin, the tool is listed as mcp__humanizar__humanizar.
const TOOL = 'mcp__humanizar__humanizar'

const DESCRIPTION = `Limpia y puntúa cada texto (0-100, más alto = más humano) antes de publicarlo.
Arregla solo lo que no cambia el sentido (invisibles, letras Unicode de negrita,
«a día de hoy» → «hoy»…) y devuelve \`texto\` ya limpio; lo que haya en \`avisos\`
(relleno de IA, «no es solo X, es Y», rayas, muro de hashtags…) reescríbelo tú y
vuelve a pasarlo. Publica el \`texto\` devuelto, no el original.`

const LOG = 'log'
const MAXIMO = 5000

type Motor = Parameters<Parameters<Parameters<Register>[0]>[1]>[0]

async function anotar ($: Motor, revisiones: Array<ReturnType<typeof revisar>>) {
  if (await $.env.get('HUMANIZAR_NO_LOG')) return
  const t = new Date(await $.clock.now()).toISOString().slice(0, 19) + 'Z'
  const nuevas = revisiones.map(r => ({ t, puntos: r.puntos, reglas: reglas(r) }))
  const viejas = ((await $.store.get(LOG)) ?? []) as Entrada[]
  await $.store.set(LOG, [...viejas, ...nuevas].slice(-MAXIMO))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'humanizar-log',
      description: 'Qué reglas de humanizar saltan más. Con «borrar», lo vacía.',
    })
    await $.tool.register({
      name: 'humanizar',
      description: DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: { textos: { type: 'array', items: { type: 'string' }, title: 'Textos' } },
        required: ['textos'],
      },
      isDeferred: false,
    })
    return next(e)
  })

  on('command.run', { command: 'humanizar-log' }, async ($, e) => {
    if (e.args.trim() === 'borrar') {
      await $.store.delete(LOG)
      return { text: 'Log borrado.' }
    }
    return { text: informe(((await $.store.get(LOG)) ?? []) as Entrada[]) }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const { textos } = e as unknown as { textos?: unknown }
    if (!Array.isArray(textos) || !textos.every(t => typeof t === 'string')) {
      return { deny: 'humanizar: `textos` tiene que ser una lista de textos.' }
    }
    const result = textos.map(revisar)
    // Un log que falla no puede romper la herramienta.
    await anotar($, result).catch(() => undefined)
    return { result: JSON.stringify({ result }) }
  })
}
