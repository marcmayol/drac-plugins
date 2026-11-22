// Limpia y puntúa un texto para que no suene a IA.
//
// Idea sacada de `li-human` (github.com/Jakeschincariol/linkedin-agent-skill), pero en español
// y sin su léxico inglés. Tres cosas:
//
// 1. Arregla solo lo que no cambia el sentido: caracteres invisibles, letras Unicode de
//    «negrita» (𝗮𝗯𝗰) y unas pocas muletillas con sustituto exacto («a día de hoy» → «hoy»).
// 2. Avisa de lo que hay que reescribir a mano: «no es solo X, es Y», «¿El resultado?»,
//    rayas, muro de hashtags, cebo de comentarios…
// 3. Puntúa de 0 a 100 (más alto = más humano) con cinco comprobaciones. Son heurísticas
//    locales, no un detector de verdad.
//
// Los límites de palabra de JavaScript (\b, \w) solo conocen el ASCII: aquí van como
// lookarounds sobre letras y números Unicode, para que «utilizarás» no cuente como «utilizar».

/** Lo que devuelve `revisar`, con las mismas claves que la versión en Python. */
export type Revision = {
  texto: string
  cambiado: boolean
  arreglos: string[]
  avisos: string[]
  puntos: number
  pruebas: { ritmo: number; concreción: number; relleno: number; huella: number; voz: number }
}

const W = '[\\p{L}\\p{N}_]'
const B = `(?<!${W})` // inicio de palabra
const E = `(?!${W})` // final de palabra

// Invisibles que se cuelan al copiar de un chat: ancho cero, BOM, guion blando, etiquetas.
const INVISIBLES = /[\u200b\u200c\u200d\u2060\ufeff\xad\u{e0000}-\u{e007f}]/gu
const ESPACIOS_RAROS = /[\xa0\u202f\u2007\u2009\u200a]/gu
// Letras matemáticas (𝗮𝗯𝗰, 𝘢𝘣𝘤, 𝐀𝐁𝐂…): NFKC las devuelve a letras normales.
const MATEMATICAS = /[\u{1d400}-\u{1d7ff}]/gu

// Muletillas con un sustituto que no cambia el sentido: se arreglan solas.
const CAMBIOS: Array<[string, string]> = [
  ['a día de hoy', 'hoy'],
  ['en el día de hoy', 'hoy'],
  ['sin lugar a dudas', 'sin duda'],
  ['con el objetivo de', 'para'],
  ['con el fin de', 'para'],
  ['de cara a', 'para'],
  ['en base a', 'según'],
  ['utiliza', 'usa'],
  ['utilizan', 'usan'],
  ['utilizar', 'usar'],
  ['utilizando', 'usando'],
  ['utilizo', 'uso'],
]

// Muletillas sin sustituto exacto: se avisa y se reescribe la frase.
const RELLENO = [
  'en el vertiginoso mundo', 'en el mundo actual', 'en la era digital', 'en la era de la ia',
  'hoy más que nunca', 'más que nunca', 'cabe destacar', 'es importante destacar',
  'es importante tener en cuenta', 'es crucial', 'es fundamental', 'no es ningún secreto',
  'revoluciona', 'revolucionar', 'revolucionario', 'revolucionaria', 'game changer',
  'cambia las reglas del juego', 'cambio de paradigma', 'un antes y un después',
  'desbloquear', 'desbloquea', 'potenciar', 'potencia tu', 'sinergia', 'de vanguardia',
  'vanguardista', 'transformador', 'transformadora', 'llevar al siguiente nivel',
  'al siguiente nivel', 'a otro nivel', 'aprovechar al máximo', 'sácale el máximo partido',
  'sumérgete', 'sumergirnos', 'adentrarnos', 'adéntrate', 'panorama actual', 'navegar por',
  'en definitiva', 'en conclusión', 'en resumen', 'la clave está en', 'pieza clave',
  'el futuro ya está aquí', 'el futuro es ahora', 'no te lo puedes perder', 'imprescindible',
  'fascinante', 'apasionante', 'me complace', 'encantado de anunciar', 'orgulloso de anunciar',
  'emocionado de anunciar', 'os presento', 'te presento', 'déjame contarte', 'te cuento un secreto',
  'aquí te dejo', 'abróchate el cinturón', 'spoiler:', 'atención:', 'ojo al dato',
  'un mundo de posibilidades', 'infinitas posibilidades', 'esto lo cambia todo',
  'profundizar', 'profundiza', 'profundizamos', 'profundizaremos', 'optimizar', 'dicho esto',
  'un abanico de', 'un amplio abanico de', 'un sinfín de',
]

// Lo que viene de la skill no-ai-slop, en español. Cada señal suma al relleno.
const SENALES: Array<[RegExp, string]> = [
  [new RegExp(`,\\s*(?:destacando|subrayando|reflejando|evidenciando|resaltando|poniendo de (?:manifiesto|relieve)|consolidando|reafirmando)${E}`, 'iu'),
    'gerundio que finge análisis («…, destacando…»): di la consecuencia concreta o quítalo'],
  [new RegExp(`${B}(?:marca(?:rá|ba)? un hito|supone un hito|(?:juega|desempeña) un papel|se erige como|sienta las bases|de vital importancia|un testimonio de|un paso de gigante|consolida su (?:posición|liderazgo))${E}`, 'iu'),
    'importancia inflada («marca un hito», «juega un papel»): da el dato y deja que el lector juzgue'],
  [new RegExp(`${B}(?:lo (?:importante|interesante|curioso|relevante) (?:aquí )?es|como (?:puedes|podéis|podemos|se puede) ver|como ves|como veis|esto (?:importa|es clave|es importante)|fíjate (?:en|que)|no es casualidad|en otras palabras|dicho de otro modo|lo que (?:casi )?nadie (?:te )?(?:cuenta|dice)|lo que (?:la mayoría|mucha gente|muchos) (?:no sabe|no saben|pasa por alto|pasan por alto|ignora|ignoran))${E}`, 'iu'),
    'le dice al lector qué pensar («lo importante es», «como ves»): enséñalo con el dato y quita el comentario'],
  [new RegExp(`${B}(?:los expertos (?:coinciden|afirman|dicen|aseguran|recomiendan)|según (?:los )?expertos|(?:diversos|varios|numerosos|muchos) estudios|los estudios (?:demuestran|muestran|dicen|indican)|está (?:científicamente )?demostrado|se dice que|es bien sabido|todo el mundo sabe|según (?:diversas|varias) fuentes|muchos (?:piensan|creen|opinan|afirman))${E}`, 'iu'),
    'fuente vaga («los expertos coinciden»): nombra la fuente o quita la afirmación'],
  [new RegExp(`(?:^|(?<=[.!?\\n]))\\s*(?:lo (?:mejor|peor|curioso|bueno|malo|interesante)|la (?:clave|diferencia|razón|sorpresa|moraleja|lección|trampa)|el (?:truco|secreto|resultado|problema|detalle|giro))${E}[^:.\\n]{0,30}:\\s`, 'iu'),
    'dos puntos de efecto («Lo mejor: …»): dilo en una frase normal'],
  [new RegExp(`${B}(?:(?:ha|han|había|habían|será|serán|fue|fueron) sido \\p{L}+(?:ado|ada|ados|adas|ido|ida|idos|idas)|se \\p{L}+(?:ará|erá|irá|arán|erán|irán))${E}`, 'iu'),
    'pasiva sin sujeto («se volverá a intentar», «ha sido creado»): di quién lo hace'],
]
// La última frase: el remate «profundo» o el resumen que repite lo que ya se ha leído.
const REMATE = new RegExp(`^\\s*(?:y eso es todo|así de (?:simple|fácil|sencillo)|ni más ni menos|y punto|(?:esa|ahí) (?:es|está) la clave|eso es lo que (?:importa|cuenta)|en pocas palabras|en síntesis|para (?:terminar|concluir|acabar)|en última instancia|al fin y al cabo)${E}`, 'iu')

const ESTRUCTURAS: Array<[RegExp, string]> = [
  [new RegExp(`${B}no (?:es|se trata de) (?:solo|sólo|simplemente|únicamente)${E}[^.\\n]{1,80}?` +
    `[,;:.—–-]\\s*(?:es|sino|se trata de)${E}`, 'iu'),
  '«no es solo X, es Y»: di Y directamente'],
  [new RegExp(`${B}no es [^.\\n]{1,50}\\.\\s+es${E}`, 'iu'), '«No es X. Es Y.»: di Y directamente'],
  [new RegExp(`${B}(?:no es (?!(?:solo|sólo|simplemente|únicamente)${E})[^.,;:\\n]{1,50}[,;:—–]\\s*es(?!\\s+decir)|no son (?!(?:solo|sólo|simplemente|únicamente)${E})[^.,;:\\n]{1,50}[,;:—–]\\s*son|no era (?!(?:solo|sólo|simplemente|únicamente)${E})[^.,;:\\n]{1,50}[,;:—–]\\s*era|no eran (?!(?:solo|sólo|simplemente|únicamente)${E})[^.,;:\\n]{1,50}[,;:—–]\\s*eran)${E}`, 'iu'), '«no es X, es Y»: di Y directamente'],
  [/(?:^|(?<=[.!?\n—–:]))\s*¿[^?\n]{1,25}\?(?=\s|$)/u,
    'pregunta retórica corta («¿El resultado?»): cuéntalo sin preguntar'],
  [new RegExp(`${B}(?:comenta|escribe|responde)\\s+[«"']?${W}+[»"']?\\s+(?:y|para que)\\s+te${E}`, 'iu'),
    'cebo de comentarios («comenta X y te lo envío»): pon el enlace'],
  [/¿(?:y tú|y vosotros|qué opinas|qué opináis|qué piensas|estás de acuerdo)\??/iu,
    'pregunta de cebo al final: solo si de verdad quieres esa respuesta'],
  [new RegExp(`${B}(?:dale (?:a )?like|comparte si|sígueme para más|guárdalo para)${E}`, 'iu'),
    'petición de interacción: quítala'],
  [/\*\*[^*\n]+\*\*/u, 'markdown (**…**): en las redes sale tal cual, quítalo'],
]

// «Fundamental», «crucial», «clave»: una suelta es normal; lo que delata es juntarlas en un párrafo.
const ENFASIS = new RegExp(`${B}(?:fundamental(?:es)?|crucial(?:es)?|claves?)${E}`, 'gu')
// «Rápido, eficaz e intuitivo». Sin diccionario no se sabe qué es un adjetivo: basta con que
// lo parezcan dos de los tres, para no saltar con «fotos, vídeos y audios».
const TRIO = new RegExp(`${B}(\\p{L}{4,}), (\\p{L}{4,}) (?:y|e) (\\p{L}{4,})${E}`, 'gu')
const ADJETIVO = new RegExp('^(?:r[aá]pid[oa]s?|sencill[oa]s?|f[aá]cil(?:es)?|simples?|eficaz|eficaces|eficientes?|potentes?|robust[oa]s?|[aá]gil(?:es)?|modern[oa]s?|limpi[oa]s?|clar[oa]s?|segur[oa]s?|barat[oa]s?|liger[oa]s?|precis[oa]s?|complet[oa]s?|elegantes?|inteligentes?|innovador(?:a|es|as)?|[uú]til(?:es)?|nuev[oa]s?|direct[oa]s?|\\p{L}*(?:iv[oa]s?|bles?|os[oa]s?|ic[oa]s?))$', 'u')
const RAYA = /—|\s–\s/gu
const HASHTAG = new RegExp(`(?<!${W})#${W}+`, 'gu')
const EMOJI = /[\u{1f300}-\u{1faff}\u2600-\u27bf\u{1f000}-\u{1f2ff}]/gu
const EMOJI_AL_INICIO = /^[\u{1f300}-\u{1faff}\u2600-\u27bf\u{1f000}-\u{1f2ff}]/u
const URL = /https?:\/\/\S+/giu
const PALABRA = new RegExp(`${W}+`, 'gu')
const NUMERO = /\d/gu
// Primera persona: lo que delata que habla alguien y no un folleto.
const PRIMERA = new RegExp(`${B}(?:yo|me|mi|mis|conmigo|he|hice|llevo|tengo|uso|hago|probé|monté|` +
  `estoy|quiero|creo|pienso|nosotros|nos|nuestro|nuestra)${E}`, 'iu')

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const contar = (re: RegExp, s: string) => (s.match(re) ?? []).length
const esMayuscula = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase()

/** El redondeo de Python: los .5 van al par, para que las notas salgan iguales. */
function redondear (x: number) {
  const f = Math.floor(x)
  const d = x - f
  if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1
  return Math.round(x)
}

const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
function desviacion (xs: number[]) {
  const m = media(xs)
  return Math.sqrt(media(xs.map(x => (x - m) ** 2)))
}

/** Arreglos automáticos; devuelve el texto y qué se ha tocado. */
export function limpiar (texto: string): [string, string[]] {
  const hecho: string[] = []
  if (contar(INVISIBLES, texto)) {
    texto = texto.replace(INVISIBLES, '')
    hecho.push('caracteres invisibles quitados')
  }
  if (contar(ESPACIOS_RAROS, texto)) {
    texto = texto.replace(ESPACIOS_RAROS, ' ')
    hecho.push('espacios raros normalizados')
  }
  if (contar(MATEMATICAS, texto)) {
    texto = texto.replace(MATEMATICAS, c => c.normalize('NFKC'))
    hecho.push('letras Unicode de negrita/cursiva pasadas a normales')
  }
  for (const [viejo, nuevo] of CAMBIOS) {
    let n = 0
    texto = texto.replace(new RegExp(`${B}${escapar(viejo)}${E}`, 'giu'), m => {
      n++
      return esMayuscula(m[0] ?? '') ? nuevo[0]!.toUpperCase() + nuevo.slice(1) : nuevo
    })
    if (n) hecho.push(`«${viejo}» → «${nuevo}»`)
  }
  return [texto, hecho]
}

function frases (texto: string) {
  const sinUrls = texto.replace(URL, 'enlace')
  return sinUrls.split(/(?<=[.!?…])\s+|\n+/u).filter(f => contar(PALABRA, f) > 0)
}

/** 0 en `cero`, 100 en `cien`, lineal entre medias. */
function escala (valor: number, cero: number, cien: number) {
  if (cien === cero) return 100
  return redondear(Math.max(0, Math.min(1, (valor - cero) / (cien - cero))) * 100)
}

export function revisar (texto: string): Revision {
  const [limpio, arreglos] = limpiar(texto)
  const bajo = limpio.toLowerCase()
  const palabras = limpio.match(PALABRA) ?? []
  const n = Math.max(palabras.length, 1)
  const avisos: string[] = []

  const relleno = RELLENO.filter(r => new RegExp(`(?<!${W})${escapar(r)}(?!${W})`, 'u').test(bajo))
  if (relleno.length) avisos.push('relleno de IA: ' + relleno.map(r => `«${r}»`).join(', '))
  for (const [patron, aviso] of ESTRUCTURAS) if (patron.test(limpio)) avisos.push(aviso)
  const senales = SENALES.filter(([p]) => p.test(limpio)).length
  for (const [p, aviso] of SENALES) if (p.test(limpio)) avisos.push(aviso)
  const enfasis = bajo.split(/\n+/u).some(p => contar(ENFASIS, p) >= 2)
  if (enfasis) avisos.push('«fundamental», «crucial», «clave» juntas en un párrafo: deja una o di por qué importa')
  const trio = [...bajo.matchAll(TRIO)].some(m => m.slice(1).filter(p => ADJETIVO.test(p)).length >= 2)
  if (trio) avisos.push('tres adjetivos seguidos: quédate con el que importa')
  const rayas = contar(RAYA, limpio)
  if (rayas) avisos.push(`${rayas} raya(s) «—»: cámbialas por coma, punto o paréntesis`)
  const tags = contar(HASHTAG, limpio)
  if (tags > 3) avisos.push(`${tags} hashtags: deja 1-3`)
  const emojis = contar(EMOJI, limpio)
  if (emojis > 1) avisos.push(`${emojis} emojis: como mucho uno`)
  if (EMOJI_AL_INICIO.test(limpio.trimStart())) avisos.push('empieza con emoji: empieza con la idea')

  const fs = frases(limpio.replace(HASHTAG, ''))
  const remate = fs.length >= 2 && REMATE.test(fs[fs.length - 1]!)
  if (remate) avisos.push('final que remata o resume («Así de simple», «Al fin y al cabo»): acaba en el último dato o en lo siguiente que hay que hacer')
  const largos = fs.map(f => contar(PALABRA, f))
  let ritmo = 100 // en un tuit de dos frases no hay ritmo que medir
  if (largos.length >= 3) {
    const variacion = desviacion(largos) / Math.max(media(largos), 1)
    ritmo = escala(variacion, 0.15, 0.55)
    if (ritmo < 50) avisos.push('todas las frases miden parecido: mezcla alguna corta con otra larga')
  }

  // Concreción: cifras, nombres propios (mayúscula fuera de inicio de frase), enlaces.
  const nombres = fs.reduce((s, f) => s + (f.match(PALABRA) ?? []).slice(1).filter(p => esMayuscula(p[0] ?? '')).length, 0)
  const concretos = Math.floor(contar(NUMERO, limpio) / 2) + nombres + contar(URL, limpio)
  const concrecion = escala((concretos * 100) / n, 0, 4)
  if (concrecion < 40) avisos.push('poco concreto: añade una cifra, un nombre o el enlace real (solo si están en la fuente)')

  const densidad = escala(((relleno.length + senales + Number(remate) + Number(enfasis) + Number(trio)) * 100) / n, 3, 0)
  const huella = escala(((rayas + Math.max(emojis - 1, 0)) * 1000) / Math.max([...limpio].length, 1), 6, 0)
  let voz = PRIMERA.test(limpio) ? 100 : 60
  voz -= 15 * ESTRUCTURAS.slice(0, 4).filter(([p]) => p.test(limpio)).length

  const pruebas = { ritmo, concreción: concrecion, relleno: densidad, huella, voz: Math.max(voz, 0) }
  const valores = Object.values(pruebas)
  const puntos = redondear(0.6 * media(valores) + 0.4 * Math.min(...valores))
  return { texto: limpio, cambiado: limpio !== texto, arreglos, avisos, puntos, pruebas }
}

// El mismo concepto con palabras distintas entre los textos de una lista (los de una interfaz,
// por ejemplo): «Finalizar» en un botón y «Terminar» en otro. Solo entre textos, no dentro de
// uno: en prosa alternar es normal.
const verbo = (raiz: string, extra = '') => `${raiz}(?:ar|a|as|an|ad[oa]s?|ó|ando|e|en|é)${extra}`
const SINONIMOS: Array<Array<[string, string]>> = [
  [['finalizar', 'finaliz(?:ar|a|as|an|ad[oa]s?|ó|ando)|finalic(?:e|en|é)'], ['terminar', verbo('termin')]],
  [['teléfono', 'tel[eé]fonos?'], ['móvil', 'm[oó]vil(?:es)?']],
  [['borrar', verbo('borr')], ['eliminar', verbo('elimin')]],
  [['añadir', 'añad(?:ir|e|es|en|id[oa]s?|ió|í|iendo|a|an)'], ['agregar', 'agreg(?:ar|a|as|an|ad[oa]s?|ó|ando)|agregu(?:e|en|é)']],
  [['enviar', 'envi(?:ar|ad[oa]s?|ando)|env[ií](?:a|as|an|ó|é|e|en)'], ['mandar', verbo('mand')]],
  [['ajustes', 'ajustes'], ['configuración', 'configuraci[oó]n'], ['preferencias', 'preferencias']],
  [['editar', verbo('edit')], ['modificar', 'modific(?:ar|a|as|an|ad[oa]s?|ó|ando)|modifiqu(?:e|en|é)']],
  [['correo', 'correos?'], ['email', 'e-?mails?']],
  [['cancelar', verbo('cancel')], ['anular', verbo('anul')]],
]
const SINONIMOS_RE = SINONIMOS.map(g => g.map(([n, p]) => [n, new RegExp(`${B}(?:${p})${E}`, 'iu')] as const))

const cuales = (ns: number[]) => ns.length === 1 ? `texto ${ns[0]}` : `textos ${ns.slice(0, -1).join(', ')} y ${ns[ns.length - 1]}`

/** Avisos de palabras distintas para lo mismo entre los textos (numerados desde 1). */
export function coherencia (textos: readonly string[]): string[] {
  if (textos.length < 2) return []
  const salen: string[] = []
  for (const grupo of SINONIMOS_RE) {
    const usos = grupo
      .map(([nombre, re]) => [nombre, textos.flatMap((t, i) => re.test(t) ? [i + 1] : [])] as const)
      .filter(([, ns]) => ns.length > 0)
    if (usos.length < 2) continue
    salen.push('mezcla ' + usos.map(([n, ns]) => `«${n}» (${cuales(ns)})`).join(' y ') + ': usa una sola palabra para lo mismo')
  }
  return salen
}
