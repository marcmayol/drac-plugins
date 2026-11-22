import type { EngineInterface, Register } from 'claude-code'

import { coherencia, revisar } from './humanizar'
import { informe, reglas, type Entrada } from './log'
import {
  argumentos, arreglar, arreglarEntregable, esEspanol, esHerramientaDeProducto, informar, mensaje, noTieneVueltaAtras,
  pideTexto, RECORDATORIO, textosHtml, textosMd, tipoDeFichero, type Informe, type Tipo,
} from './producto'

// Registered by this plugin, the tool is listed as mcp__humanizar__humanizar.
const TOOL = 'mcp__humanizar__humanizar'

const DESCRIPTION = `Limpia y puntúa cada texto (0-100, más alto = más humano) antes de publicarlo.
Arregla solo lo que no cambia el sentido (invisibles, letras Unicode de negrita,
«a día de hoy» → «hoy»…) y devuelve \`texto\` ya limpio; lo que haya en \`avisos\`
(relleno de IA, «no es solo X, es Y», rayas, muro de hashtags…) reescríbelo tú y
vuelve a pasarlo. Publica el \`texto\` devuelto, no el original. Si pasas varios textos
de una misma pieza (los de una interfaz), \`coherencia\` avisa de palabras distintas para lo mismo.`

// Las reglas, en el prompt de sistema, para que el texto de producto salga limpio desde el principio.
// Solo para lo que se entrega; las respuestas del chat quedan fuera a propósito.
export const SECCION = `# Texto de producto en español (humanizar)

Estas reglas valen SOLO para el texto que entregas como producto para que lo lea otra gente: ficheros de documento (.md, .html, .txt), artifacts, documentos, correos, posts, textos de interfaz o de un diseño y texto que va dentro de una imagen. NO valen para tus respuestas en el chat: ahí escribe como siempre. La excepción es cuando en el chat te piden un texto para entregar (un correo, un mensaje de WhatsApp o Teams, un post): ese texto sí las sigue, y va en un bloque de cita o de texto plano, separado de lo que le dices a la persona.

Al escribir ese texto:
- Ve al grano y sé concreto: nombres, cifras, fechas y ejemplos que estén en la fuente. No inventes ninguno.
- Voz activa y con sujeto: «Tokimichi lo intentará otra vez», no «se volverá a intentar».
- Una palabra para cada cosa: si un botón dice «Terminar», no pongas «Finalizar» en otro.
- Nada de: «no es solo X, es Y»; gerundios que fingen análisis («…, destacando su compromiso»); importancia inflada («marca un hito», «juega un papel clave»); decirle al lector qué pensar («lo importante es», «como ves»); fuentes vagas («los expertos coinciden»); dos puntos de efecto («Lo mejor: …»); preguntas retóricas; finales que rematan o resumen («Así de simple», «En definitiva»); relleno («a día de hoy», «cabe destacar», «sin lugar a dudas»).
- Sin rayas «—» como muletilla: coma, punto o paréntesis.
- Si corriges un texto de otra persona, haz la edición mínima y respeta su voz.

Un mod revisa ese texto cuando lo escribes con una herramienta, o cuando lo entregas en el chat porque te lo han pedido: arregla solo lo que no cambia el sentido y te dice qué reescribir.`

const LOG = 'log'
const AUTO = 'auto'
const MAXIMO = 5000

type Motor = EngineInterface

async function anotar ($: Motor, revisiones: Array<ReturnType<typeof revisar>>) {
  if (!revisiones.length || await $.env.get('HUMANIZAR_NO_LOG')) return
  const t = new Date(await $.clock.now()).toISOString().slice(0, 19) + 'Z'
  const nuevas = revisiones.map(r => ({ t, puntos: r.puntos, reglas: reglas(r) }))
  const viejas = ((await $.store.get(LOG)) ?? []) as Entrada[]
  await $.store.set(LOG, [...viejas, ...nuevas].slice(-MAXIMO))
}

/** Si el modo automático está encendido: lo está salvo que se apague con la orden o con HUMANIZAR_AUTO=0. */
async function encendido ($: Motor): Promise<boolean> {
  const env = await $.env.get('HUMANIZAR_AUTO')
  if (env === '0' || env === 'off') return false
  return ((await $.store.get(AUTO)) ?? true) !== false
}

const RESERVADAS = new Set(['tool', 'tool_use_id', 'agentId', 'requestMeta', 'consent'])

// Lo último que se escribió en cada fichero ya revisado, para no repetir los avisos al publicarlo.
const revisado = new Map<string, string>()

function revisarFichero (ruta: string, texto: string, tipo: Tipo): Informe | null {
  const textos = tipo === 'html' ? textosHtml(texto) : textosMd(texto)
  if (!esEspanol(textos.join('\n'))) return null
  return informar(textos, tipo)
}

// Si `old_string` cae dentro de un bloque de código o de un <script>/<style>, la edición es código.
function dentroDeCodigo (fichero: string, viejo: string, tipo: Tipo): boolean {
  const i = fichero.indexOf(viejo)
  if (i < 0) return false
  const antes = fichero.slice(0, i)
  if (tipo === 'html') {
    const abre = Math.max(antes.lastIndexOf('<script'), antes.lastIndexOf('<style'), antes.lastIndexOf('<pre'), antes.lastIndexOf('<code'))
    const cierra = Math.max(antes.lastIndexOf('</script'), antes.lastIndexOf('</style'), antes.lastIndexOf('</pre'), antes.lastIndexOf('</code'))
    return abre > cierra
  }
  return (antes.match(/^\s*(?:```|~~~)/gm) ?? []).length % 2 === 1
}

const conContexto = <T extends { context?: readonly string[]; deny?: unknown; isError?: unknown }>(r: T, texto: string | null): T =>
  texto === null || r.deny !== undefined || r.isError === true ? r : { ...r, context: [...(r.context ?? []), texto] }

// Avisa del texto entregado en el chat: un aviso para la persona y una nota para el modelo.
async function avisarDelTexto ($: Motor, partes: string[], arreglos: string[]) {
  if (!partes.length || !esEspanol(partes.join('\n'))) return
  const inf = informar(partes, 'mensaje', [...new Set(arreglos)])
  await anotar($, inf.revisiones).catch(() => undefined)
  const peor = Math.min(...inf.revisiones.map(r => r.puntos))
  if (inf.hallazgos.length) {
    const avisos = [...new Set(inf.hallazgos.flatMap(h => h.avisos.map(a => a.split(':')[0])))]
    $.ui.toast(`humanizar: el texto saca un ${peor}. Revisa: ${avisos.join(', ')}.`)
    // Para que, si piden corregirlo, el modelo sepa qué saltó.
    await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: mensaje('texto entregado en el chat', inf)! + '\n(No contestes a esta nota: úsala solo si te piden corregir ese texto.)' }] } }).catch(() => undefined)
  } else if (inf.arreglos.length) {
    $.ui.toast(`humanizar: arreglado en el texto: ${inf.arreglos.join('; ')}.`)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'humanizar-log',
      description: 'Qué reglas de humanizar saltan más. Con «borrar», lo vacía.',
    })
    await $.command.register({
      name: 'humanizar-auto',
      description: 'Revisión automática del texto de producto (documentos, artifacts, correos, diseños): on, off o sin nada para ver cómo está.',
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

  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (!(await encendido($))) return r
    return { sections: [...r.sections, { id: 'humanizar:producto', text: SECCION, scope: 'session' as const }] }
  })

  on('command.run', { command: 'humanizar-log' }, async ($, e) => {
    if (e.args.trim() === 'borrar') {
      await $.store.delete(LOG)
      return { text: 'Log borrado.' }
    }
    return { text: informe(((await $.store.get(LOG)) ?? []) as Entrada[]) }
  })

  on('command.run', { command: 'humanizar-auto' }, async ($, e) => {
    const pedido = e.args.trim().toLowerCase()
    if (pedido === 'on' || pedido === 'off') await $.store.set(AUTO, pedido === 'on')
    else if (pedido !== '') return { text: 'Usa /humanizar-auto on, /humanizar-auto off o /humanizar-auto para ver cómo está.' }
    const env = await $.env.get('HUMANIZAR_AUTO')
    const activo = await encendido($)
    const estado = activo
      ? 'Encendido: reviso el texto de producto en español que escribes con Write, Edit, Artifact, documentos, correos y diseños. Las respuestas del chat no.'
      : env === '0' || env === 'off' ? 'Apagado por HUMANIZAR_AUTO.' : 'Apagado.'
    const aviso = pedido ? ' Las reglas del prompt de sistema cambian en la próxima conversación o tras compactar; la revisión de las herramientas, ya.' : ''
    return { text: estado + aviso }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const { textos } = e as unknown as { textos?: unknown }
    if (!Array.isArray(textos) || textos.some((t: unknown) => typeof t !== 'string')) {
      return { deny: 'humanizar: `textos` tiene que ser una lista de textos.' }
    }
    const lista = textos as string[]
    const result = lista.map(revisar)
    const avisos = coherencia(lista)
    // Un log que falla no puede romper la herramienta.
    await anotar($, result).catch(() => undefined)
    return { result: JSON.stringify(avisos.length ? { result, coherencia: avisos } : { result }) }
  })

  // Lo que escribe la persona: en la terminal, desde el móvil (Remote Control) o con claude -p.
  const DE_LA_PERSONA = new Set(['composer', 'bridge', 'sdk'])
  // Un texto pedido en el chat (correo, WhatsApp, Teams…): se marca el turno y solo ese turno.
  let turnoDeTexto = false
  on('prompt.submit', async ($, e, next) => {
    // Solo lo que escribe la persona decide; las notificaciones y lo que entra a mitad de turno, no.
    if (e.isMeta || e.command || !DE_LA_PERSONA.has(e.origin.kind)) return next(e)
    turnoDeTexto = pideTexto(e.text) && await encendido($)
    return next(turnoDeTexto ? { ...e, context: [...(e.context ?? []), RECORDATORIO] } : e)
  }).catch(($, e, next) => next(e))

  on('session.append', { door: 'response' }, async ($, e, next) => {
    if (!turnoDeTexto || e.agentId !== undefined) return next(e)
    let partes: string[] = []
    let arreglos: string[] = []
    const content = e.message.content.map(b => {
      if (b.type !== 'text') return b
      const r = arreglarEntregable(String(b.text))
      partes = [...partes, ...r.partes]
      arreglos = [...arreglos, ...r.arreglos]
      return { ...b, text: r.texto }
    })
    const guardado = await next({ ...e, message: { ...e.message, content } })
    try {
      await avisarDelTexto($, partes, arreglos)
    } catch {
      // Un aviso que falla no puede romper la respuesta ya guardada.
    }
    return guardado
  }).catch(($, e, next) => next(e))

  // Write de un documento: arregla lo seguro antes de escribir y, después, dice qué reescribir.
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const tipo = tipoDeFichero(e.file_path)
    if (tipo === null || !(await encendido($))) return next(e)
    const [contenido, arreglos] = arreglar(e.content, tipo)
    const inf = revisarFichero(e.file_path, contenido, tipo)
    if (inf === null) return next(e)
    const r = await next({ ...e, content: contenido })
    revisado.set(e.file_path, contenido)
    await anotar($, inf.revisiones).catch(() => undefined)
    return conContexto(r, mensaje(e.file_path, { ...inf, arreglos }))
  }).catch(($, e, next) => next(e))

  // Edit de un documento: lo mismo, solo con el texto nuevo y nunca dentro de un bloque de código.
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const tipo = tipoDeFichero(e.file_path)
    if (tipo === null || !(await encendido($))) return next(e)
    const fichero = await $.fs.read(e.file_path).catch(() => '')
    if (typeof fichero !== 'string' || dentroDeCodigo(fichero, e.old_string, tipo)) return next(e)
    const deFichero = tipo === 'html' ? textosHtml(fichero) : textosMd(fichero)
    if (!esEspanol([...deFichero, ...(tipo === 'html' ? textosHtml(e.new_string) : textosMd(e.new_string))].join('\n'))) return next(e)
    const [nuevo, arreglos] = arreglar(e.new_string, tipo)
    const textos = tipo === 'html' ? textosHtml(nuevo) : textosMd(nuevo)
    const r = await next({ ...e, new_string: nuevo })
    revisado.delete(e.file_path)
    const inf = informar(textos, tipo, arreglos)
    // La coherencia se mira en todo el fichero, y solo cuenta la que trae esta edición.
    if (tipo === 'html') {
      const sinNumeros = (c: string) => c.replace(/ \([^)]*\)/g, '')
      const habia = new Set(coherencia(deFichero).map(sinNumeros))
      inf.coherencia = coherencia(textosHtml(fichero.replace(e.old_string, () => nuevo))).filter(c => !habia.has(sinNumeros(c)))
    }
    await anotar($, inf.revisiones).catch(() => undefined)
    return conContexto(r, mensaje(e.file_path, inf))
  }).catch(($, e, next) => next(e))

  // Publicar un Artifact: si el fichero no pasó por Write con el mismo contenido, se revisa ahora.
  on('tool.call', { tool: 'Artifact' }, async ($, e, next) => {
    const args = e as unknown as { action?: string; file_path?: string; asset?: boolean }
    const r = await next(e)
    if ((args.action ?? 'publish') !== 'publish' || !args.file_path || args.asset || !(await encendido($))) return r
    const tipo = tipoDeFichero(args.file_path)
    if (tipo === null) return r
    const texto = await $.fs.read(args.file_path).catch(() => '')
    if (typeof texto !== 'string' || revisado.get(args.file_path) === texto) return r
    const inf = revisarFichero(args.file_path, texto, tipo)
    if (inf === null) return r
    await anotar($, inf.revisiones).catch(() => undefined)
    const m = mensaje(`artifact ${args.file_path}`, inf)
    return conContexto(r, m && m + '\n  Corrige el fichero y vuelve a publicar.')
  }).catch(($, e, next) => next(e))

  // Herramientas MCP de documentos, correos, diseños, imágenes y publicaciones.
  const avisados = new Set<string>()
  on('tool.call', async ($, e, next) => {
    const nombre = String(e.tool)
    if (!esHerramientaDeProducto(nombre) || !(await encendido($))) return next(e)
    const entrada = Object.fromEntries(Object.entries(e).filter(([k]) => !RESERVADAS.has(k)))
    const { textos, arreglado, arreglos } = argumentos(entrada)
    if (!textos.length || !esEspanol(textos.join('\n'))) return next(e)
    const inf = informar(textos, /Canva|image|video/i.test(nombre) ? 'html' : 'mensaje', arreglos)
    const siguiente = { ...e, ...(arreglado as object) } as typeof e
    // Lo que no tiene vuelta atrás (enviar un correo, publicar un post) se avisa antes, una vez.
    if (noTieneVueltaAtras(nombre) && (inf.hallazgos.length || inf.coherencia.length)) {
      const huella = nombre + JSON.stringify(arreglado)
      if (!avisados.has(huella)) {
        avisados.add(huella)
        await anotar($, inf.revisiones).catch(() => undefined)
        return { deny: mensaje(nombre, inf, true)! }
      }
      return next(siguiente)
    }
    const r = await next(siguiente)
    await anotar($, inf.revisiones).catch(() => undefined)
    return conContexto(r, mensaje(nombre, inf))
  }).catch(($, e, next) => next(e))
}
