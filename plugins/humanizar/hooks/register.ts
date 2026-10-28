import type { Register } from 'claude-code'

import { revisar } from './humanizar'

// Registered by this plugin, the tool is listed as mcp__humanizar__humanizar.
const TOOL = 'mcp__humanizar__humanizar'

const DESCRIPTION = `Limpia y puntúa cada texto (0-100, más alto = más humano) antes de publicarlo.
Arregla solo lo que no cambia el sentido (invisibles, letras Unicode de negrita,
«a día de hoy» → «hoy»…) y devuelve \`texto\` ya limpio; lo que haya en \`avisos\`
(relleno de IA, «no es solo X, es Y», rayas, muro de hashtags…) reescríbelo tú y
vuelve a pasarlo. Publica el \`texto\` devuelto, no el original.`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
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

  on('tool.call', { tool: TOOL }, ($, e) => {
    const { textos } = e as unknown as { textos?: unknown }
    if (!Array.isArray(textos) || !textos.every(t => typeof t === 'string')) {
      return { deny: 'humanizar: `textos` tiene que ser una lista de textos.' }
    }
    return { result: JSON.stringify({ result: textos.map(revisar) }) }
  })
}
