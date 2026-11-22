// Qué es «texto de producto» y cómo sacarlo de cada sitio sin tocar el código.
//
// Texto de producto es el que se entrega para que lo lea otra gente: un documento, un post,
// un correo, los textos de un diseño o de una interfaz, el texto de una imagen. Las respuestas
// del chat no lo son: el mod no las mira. Lo que sí mira:
//
// - Write y Edit de ficheros de documento (.md, .mdx, .txt, .html, .htm, .rst, .adoc, .eml),
//   menos los que son instrucciones para agentes (CLAUDE.md, AGENTS.md, SKILL.md, memorias,
//   lo que está dentro de .claude/). El código no se toca nunca: ni .kt, ni .ts, ni .py…
// - La publicación de un Artifact (el fichero que publica).
// - Las herramientas MCP que escriben documentos, correos, diseños o posts: Claude Docs,
//   Notion, Google Drive/Docs, Gmail, Canva, generación de imágenes y cualquiera cuyo nombre
//   sea de publicar, enviar, redactar o responder (post, publish, send, draft, reply…).
//
// Dentro de cada uno, solo la prosa: fuera bloques de código, código en línea, enlaces,
// etiquetas, <script> y <style>, y los espacios duros (el «10 €» con espacio fino es
// tipografía correcta). Y solo si el texto está en español: el motor solo sabe español.

import { coherencia, limpiar, revisar } from './humanizar'

export type Tipo = 'md' | 'html' | 'texto'

export type Hallazgo = { trozo: string; avisos: string[] }

export type Informe = {
  /** Lo que se ha arreglado solo, sin repetir. */
  arreglos: string[]
  /** Avisos por trozo de texto (párrafo, elemento de la interfaz…). */
  hallazgos: Hallazgo[]
  /** Palabras distintas para lo mismo entre los textos de una interfaz. */
  coherencia: string[]
  /** Las revisiones hechas, para el log. */
  revisiones: Array<ReturnType<typeof revisar>>
}

const DOCUMENTO = /\.(?:md|mdx|markdown|txt|html?|rst|adoc|eml)$/i
// Instrucciones para agentes y memorias: no son producto, y reescribirlas cambia cómo trabajan.
const DE_AGENTES = /(?:^|[\\/])(?:CLAUDE|AGENTS|GEMINI|SKILL|MEMORY)\.md$|(?:^|[\\/])\.(?:claude|codex|gemini|cursor|agents)[\\/]|[\\/]memory[\\/]|[\\/]node_modules[\\/]/i

/** El tipo de un fichero de documento, o null si no es texto de producto. */
export function tipoDeFichero (ruta: string): Tipo | null {
  if (!DOCUMENTO.test(ruta) || DE_AGENTES.test(ruta)) return null
  if (/\.html?$/i.test(ruta)) return 'html'
  if (/\.txt$/i.test(ruta) || /\.eml$/i.test(ruta)) return 'texto'
  return 'md'
}

// Herramientas que producen texto de producto. Por servidor conocido y, para el resto, por el
// nombre de la acción.
const HERRAMIENTAS = [
  /Claude_Docs__(?:batch|update|create)$/i,
  /Notion__notion-(?:create-pages|update-page|create-comment|create-suggested-edit|update-comment)$/i,
  /Google_Drive__(?:create_file|update_file)$/i,
  /Google_Docs?__/i,
  /Gmail__(?:create_draft|update_draft|send_message|reply|forward)$/i,
  /Canva__(?:generate-design|generate-design-structured|create-design|create-design-from-brand-template|edit-design|comment-on-design|reply-to-comment|create-video)$/i,
  /(?:^|[_-])(?:generate|create)[_-]?(?:image|video)s?$/i,
  /^mcp__.+__(?:[\w-]*[_-])?(?:post|posts|publish|tweet|compose|send|draft|reply|comment)(?:[_-][\w-]*)?$/i,
]
// Las que no tienen vuelta atrás: se avisa antes, no después.
const SIN_VUELTA = /(?:Gmail__(?:send_message|reply|forward)$)|^mcp__.+__(?:[\w-]*[_-])?(?:send|publish|tweet|post)(?:[_-][\w-]*)?$/i

export function esHerramientaDeProducto (nombre: string): boolean {
  return nombre.startsWith('mcp__') && !/__humanizar$/.test(nombre) && HERRAMIENTAS.some(r => r.test(nombre))
}

export function noTieneVueltaAtras (nombre: string): boolean {
  return SIN_VUELTA.test(nombre)
}

// Claves de los argumentos que nunca son prosa.
const CLAVES_NO_PROSA = /^(?:id|ids|.*_id|.*Id|url|uri|href|link|path|file_path|filePath|to|cc|bcc|from|email|mime|mimeType|mime_type|type|kind|format|language|lang|locale|query|parent|container|ref|token|cursor|color|colors|font|fonts|width|height|size)$/

// Lo que hay que dejar tal cual dentro de una línea de prosa.
const PROTEGIDO = /(`[^`\n]*`|\]\([^)\s]*\)|https?:\/\/\S+|<[^>\n]*>|&[a-z#0-9]+;|[  ]|(?:\p{Extended_Pictographic}️?‍)+\p{Extended_Pictographic}️?)/u

function limpiarLinea (linea: string, hechos: Set<string>): string {
  return linea.split(PROTEGIDO).map((parte, i) => {
    if (i % 2 === 1 || parte === undefined) return parte ?? ''
    const [limpio, arreglos] = limpiar(parte)
    for (const a of arreglos) hechos.add(a)
    return limpio
  }).join('')
}

const VALLA = /^\s*(?:```|~~~)/

/** Aplica los arreglos seguros solo a la prosa de un markdown o un texto. */
export function arreglarMd (texto: string): [string, string[]] {
  const hechos = new Set<string>()
  let enCodigo = false
  let enCabecera = texto.startsWith('---\n')
  const lineas = texto.split('\n').map((linea, i) => {
    if (enCabecera) {
      if (i > 0 && linea.trim() === '---') enCabecera = false
      return linea
    }
    if (VALLA.test(linea)) {
      enCodigo = !enCodigo
      return linea
    }
    // Código sangrado con cuatro espacios o un tabulador, fuera de las listas.
    if (enCodigo || /^(?: {4}|\t)(?!\s*(?:[-*+]|\d+\.)\s)/.test(linea)) return linea
    return limpiarLinea(linea, hechos)
  })
  return [lineas.join('\n'), [...hechos]]
}

const BLOQUES_HTML = /<(script|style|code|pre|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi

/** Aplica los arreglos seguros solo al texto entre etiquetas de un HTML. */
export function arreglarHtml (html: string): [string, string[]] {
  const hechos = new Set<string>()
  let fuera = ''
  let ultimo = 0
  for (const m of html.matchAll(BLOQUES_HTML)) {
    fuera += arreglarTextoHtml(html.slice(ultimo, m.index), hechos) + m[0]
    ultimo = m.index! + m[0].length
  }
  fuera += arreglarTextoHtml(html.slice(ultimo), hechos)
  return [fuera, [...hechos]]
}

function arreglarTextoHtml (trozo: string, hechos: Set<string>): string {
  // Las etiquetas (con sus atributos) se quedan como están; el texto de en medio se limpia.
  return trozo.split(/(<[^>]*>)/).map((parte, i) => i % 2 === 1 ? parte : parte.split('\n').map(l => limpiarLinea(l, hechos)).join('\n')).join('')
}

export function arreglar (texto: string, tipo: Tipo): [string, string[]] {
  return tipo === 'html' ? arreglarHtml(texto) : arreglarMd(texto)
}

const ENTIDADES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", hellip: '…', laquo: '«', raquo: '»', ndash: '–', mdash: '—', iexcl: '¡', iquest: '¿' }
function sinEntidades (s: string) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, n: string) => {
    if (n[0] === '#') return String.fromCodePoint(n[1]?.toLowerCase() === 'x' ? parseInt(n.slice(2), 16) : parseInt(n.slice(1), 10))
    return ENTIDADES[n.toLowerCase()] ?? m
  })
}

/** Los textos que ve la gente en un HTML: cada nodo de texto y los atributos que se leen. */
export function textosHtml (html: string): string[] {
  const sin = html.replace(BLOQUES_HTML, ' ')
  const textos: string[] = []
  for (const m of sin.matchAll(/\b(?:alt|title|placeholder|aria-label)\s*=\s*"([^"]*)"/gi)) textos.push(sinEntidades(m[1]!))
  for (const parte of sin.split(/<[^>]*>/)) textos.push(sinEntidades(parte).replace(/\s+/g, ' ').trim())
  return textos.filter(t => /\p{L}/u.test(t))
}

/** Los párrafos de un markdown, sin código ni la sintaxis que no se lee. */
export function textosMd (md: string): string[] {
  const unidades: string[] = []
  let actual: string[] = []
  const cerrar = () => { if (actual.length) unidades.push(actual.join(' ')); actual = [] }
  let enCodigo = false
  let enCabecera = md.startsWith('---\n')
  md.split('\n').forEach((linea, i) => {
    if (enCabecera) { if (i > 0 && linea.trim() === '---') enCabecera = false; return }
    if (VALLA.test(linea)) { enCodigo = !enCodigo; cerrar(); return }
    if (enCodigo || /^(?: {4}|\t)/.test(linea) || linea.trim() === '') { cerrar(); return }
    const limpia = linea
      .replace(/`[^`\n]*`/g, 'código')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, 'enlace')
      .replace(/<[^>]*>/g, '')
      .trim()
    // Títulos, elementos de lista y filas de tabla van sueltos.
    if (/^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\|)/.test(limpia)) {
      cerrar()
      unidades.push(limpia.replace(/^(?:#{1,6}|[-*+]|\d+[.)])\s+/, '').replace(/\|/g, ' ').trim())
      return
    }
    actual.push(limpia.replace(/^>\s?/, ''))
  })
  cerrar()
  return unidades.filter(u => /\p{L}/u.test(u))
}

const ES = /(?<![\p{L}])(?:de|la|que|el|en|y|los|se|del|las|un|por|con|una|su|para|es|al|lo|como|más|pero|sus|le|ya|o|este|sí|porque|esta|cuando|muy|sin|sobre|también|me|hasta|hay|donde|desde|todo|nos|durante|uno|ni|contra|ese|eso|mí|qué|otro|él|cual|poco|ella|estar|estas|algunas|algo|nosotros|tu|tus|te|tú|puedes|aquí)(?![\p{L}])/giu
const EN = /(?<![\p{L}])(?:the|and|of|to|is|in|that|it|for|with|as|was|on|are|be|this|by|you|or|from|at|have|an|not|your|can|will|but|we|they|which|their|has|if|its|would|what|all|when|there|been|more)(?![\p{L}])/giu

/** Si el texto parece español: el motor no sabe juzgar otro idioma. */
export function esEspanol (texto: string): boolean {
  const es = (texto.match(ES) ?? []).length
  const en = (texto.match(EN) ?? []).length
  return es >= 3 && es > en * 1.5
}

// Avisos que en un documento o una interfaz no ayudan: la nota de ritmo o de concreción está
// pensada para posts, y en una interfaz un título «¿Qué ha pasado?» no es una pregunta retórica.
const NUNCA = /^(?:poco concreto|todas las frases miden parecido)/
const NO_EN_INTERFAZ = /^(?:pregunta retórica|pregunta de cebo|\d+ emojis|empieza con emoji|markdown|\d+ hashtags)/
const NO_EN_DOCUMENTO = /^markdown/

/** Revisa los textos de una pieza y devuelve lo que hay que contar. */
export function informar (textos: string[], tipo: Tipo | 'mensaje', arreglos: string[] = []): Informe {
  const revisiones = textos.map(revisar)
  const fuera = tipo === 'html' ? NO_EN_INTERFAZ : tipo === 'md' ? NO_EN_DOCUMENTO : null
  const hallazgos = revisiones.flatMap((r, i) => {
    const avisos = r.avisos.filter(a => !NUNCA.test(a) && !(fuera?.test(a) ?? false))
    return avisos.length ? [{ trozo: textos[i]!, avisos }] : []
  })
  return { arreglos, hallazgos, coherencia: tipo === 'html' ? coherencia(textos) : [], revisiones }
}

const recortar = (s: string, n = 90) => s.length > n ? s.slice(0, n - 1) + '…' : s

/** El texto para el modelo: qué se ha arreglado y qué tiene que reescribir él. */
export function mensaje (donde: string, inf: Informe, antes = false): string | null {
  if (!inf.arreglos.length && !inf.hallazgos.length && !inf.coherencia.length) return null
  const l = [`humanizar (${donde}):`]
  if (inf.arreglos.length) l.push(`- Arreglado solo: ${inf.arreglos.join('; ')}.`)
  if (inf.hallazgos.length || inf.coherencia.length) {
    l.push(antes
      ? '- Antes de enviarlo, reescribe esto sin cambiar el sentido ni inventar datos, y vuelve a llamar a la herramienta (si lo quieres tal cual, repite la misma llamada):'
      : '- Reescribe esto sin cambiar el sentido ni inventar datos, con la edición mínima y respetando la voz del texto:')
    for (const h of inf.hallazgos.slice(0, 12)) l.push(`  - «${recortar(h.trozo)}»: ${h.avisos.join('; ')}`)
    if (inf.hallazgos.length > 12) l.push(`  - y ${inf.hallazgos.length - 12} trozos más`)
    for (const c of inf.coherencia) l.push(`  - ${c}`)
  }
  return l.join('\n')
}

/** Los textos en prosa dentro de los argumentos de una herramienta, y los argumentos con los arreglos hechos. */
export function argumentos (entrada: unknown): { textos: string[]; arreglado: unknown; arreglos: string[] } {
  const textos: string[] = []
  const hechos = new Set<string>()
  const visitar = (v: unknown, clave: string): unknown => {
    if (typeof v === 'string') {
      if (CLAVES_NO_PROSA.test(clave) || !/\p{L}+\s+\p{L}+\s+\p{L}+/u.test(v) || /^\s*(?:https?:|\/|[{[<])/.test(v) && !/^\s*</.test(v)) return v
      const html = /<\/?[a-z][^>]*>/i.test(v)
      textos.push(...(html ? textosHtml(v) : textosMd(v)))
      const [nuevo, arreglos] = html ? arreglarHtml(v) : arreglarMd(v)
      for (const a of arreglos) hechos.add(a)
      return nuevo
    }
    if (Array.isArray(v)) return v.map(x => visitar(x, clave))
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, visitar(x, k)]))
    return v
  }
  const arreglado = visitar(entrada, '')
  return { textos, arreglado, arreglos: [...hechos] }
}

// ── Textos para entregar que se piden en el chat ──────────────────────────────────────────────
// «Escríbeme un correo para…», «prepárame un WhatsApp…», «cómo le contesto a…». La respuesta va
// en el chat, sin herramienta, pero ese texto lo va a leer otra persona: se revisa solo ese turno.
// Ante la duda, no: un falso positivo reescribiría una respuesta normal.

const PIDE = /(?<!\p{L})(?:escr[ií]be(?:me|le|les|nos)?|redact[aá](?:me|le|les|nos)?|prep[aá]ra(?:me|le|les|nos)|hazme|p[aá]same|dame|ponme|prop[oó]n(?:me)?|sugi[eé]re(?:me)?|reescr[ií]be(?:me)?|mejora(?:me)?|corr[ií]ge(?:me)?|ay[uú]dame a (?:escribir|redactar|contestar|responder)|quiero (?:escribir|mandar|enviar)|necesito (?:escribir|mandar|enviar|redactar)|(?:me )?puedes (?:escribir|redactar|preparar))(?!\p{L})[^.?!\n]{0,40}?(?<!\p{L})(?:un|una|el|la|otro|otra|este|esta|ese|esa|mi|tu|su)?\s*(?:e-?mail|mail|correo|mensaje|whats?app|wasap|guasap|teams|slack|telegram|sms|post|publicaci[oó]n|tuit|tweet|hilo|respuesta|contestaci[oó]n|carta|comunicado|felicitaci[oó]n|invitaci[oó]n|anuncio|bio|biograf[ií]a|descripci[oó]n|copy|asunto|texto para)(?!\p{L})/iu
const COMO_CONTESTO = /(?<!\p{L})(?:c[oó]mo|qu[eé]) (?:le |les |te )?(?:contesto|respondo|digo|escribo|pongo|explico)(?!\p{L})/iu
// Lo que suena a pedir un texto pero es trabajo técnico.
const TECNICO = /(?<!\p{L})(?:commit|pr|pull request|error|errores|log|logs|excepci[oó]n|stack|traza|c[oó]digo|funci[oó]n|variable|test|tests|rama|branch|endpoint|api|json|yaml|regex|consola|terminal|script)(?!\p{L})/iu

/** Si el mensaje de la persona pide un texto para entregar a otra gente. */
export function pideTexto (prompt: string): boolean {
  const t = prompt.trim()
  if (t.length === 0 || t.length > 2000 || t.startsWith('/')) return false
  if (!PIDE.test(t) && !COMO_CONTESTO.test(t)) return false
  return !TECNICO.test(t)
}

export const RECORDATORIO = `humanizar: este mensaje pide un texto para entregar a otra persona (un correo, un mensaje, un post…). Ese texto, y solo ese, sigue las reglas de texto de producto: al grano y concreto sin inventar datos, voz activa, sin «no es solo X, es Y», sin relleno («a día de hoy», «cabe destacar»), sin rayas «—», sin preguntas retóricas ni remates («Así de simple», «En definitiva»), con la voz de quien lo firma. Ponlo en un bloque de cita (>) o en un bloque de código de texto plano, separado de lo que le digas a la persona.`

const VALLA_TEXTO = /^(\s*)(```|~~~)\s*(?:text|txt|plain|plaintext|markdown|md|email|mensaje)?\s*$/i

/**
 * Lo entregable de una respuesta: los bloques de cita y los bloques de código de texto plano;
 * si no hay ninguno, toda la respuesta. Devuelve la respuesta con los arreglos seguros hechos
 * solo ahí y los textos entregables para revisarlos.
 */
export function arreglarEntregable (respuesta: string): { texto: string; arreglos: string[]; partes: string[] } {
  const lineas = respuesta.split('\n')
  const hechos = new Set<string>()
  const partes: string[] = []
  const hayCita = lineas.some(l => /^\s*>/.test(l))
  const hayValla = lineas.some(l => VALLA_TEXTO.test(l))
  if (!hayCita && !hayValla) {
    const [texto, arreglos] = arreglarMd(respuesta)
    return { texto, arreglos, partes: textosMd(texto).length ? [textosMd(texto).join('\n\n')] : [] }
  }
  const fuera: string[] = []
  let valla: string | null = null // la valla de texto plano abierta
  let otraValla = false // dentro de un bloque de código de verdad
  let actual: string[] = []
  const cerrar = () => { if (actual.length) partes.push(actual.join('\n').trim()); actual = [] }
  for (const l of lineas) {
    if (valla !== null) {
      if (l.trim().startsWith(valla)) { valla = null; cerrar(); fuera.push(l); continue }
      const limpia = limpiarLinea(l, hechos)
      actual.push(limpia)
      fuera.push(limpia)
      continue
    }
    if (otraValla) { if (/^\s*(?:```|~~~)\s*$/.test(l)) otraValla = false; fuera.push(l); continue }
    const v = VALLA_TEXTO.exec(l)
    if (v) { cerrar(); valla = v[2]!; fuera.push(l); continue }
    if (/^\s*(?:```|~~~)/.test(l)) { cerrar(); otraValla = true; fuera.push(l); continue }
    const cita = /^(\s*>\s?)(.*)$/.exec(l)
    if (cita) {
      const limpia = limpiarLinea(cita[2]!, hechos)
      actual.push(limpia)
      fuera.push(cita[1]! + limpia)
      continue
    }
    cerrar()
    fuera.push(l)
  }
  cerrar()
  return { texto: fuera.join('\n'), arreglos: [...hechos], partes: partes.filter(p => /\p{L}/u.test(p)) }
}
