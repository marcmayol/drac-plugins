// El log: qué reglas salta lo que escribe el modelo, para ver cuáles se repiten.
// Idea de Edwin Jimenez. Guarda la fecha, la nota y el nombre de las reglas, nunca el texto.
// El binario para otros agentes hace lo mismo en humanizar-mcp/src/log.rs.

import type { Revision } from './humanizar'

export type Entrada = { t: string; puntos: number; reglas: string[] }

/** El nombre de cada regla que ha saltado, sin las cifras ni el consejo que lleva el aviso. */
export function reglas (r: Pick<Revision, 'arreglos' | 'avisos'>): string[] {
  const salen = [...r.arreglos]
  for (const a of r.avisos) {
    if (a.startsWith('relleno de IA: ')) {
      for (const m of a.matchAll(/«([^»]+)»/gu)) salen.push(`relleno: «${m[1]}»`)
    } else {
      salen.push(a.replace(/^\d+ /u, '').split(':')[0]!)
    }
  }
  return salen
}

/** Lo que enseña `/humanizar-log`: cuántos textos, qué reglas saltan más y los últimos. */
export function informe (entradas: readonly Entrada[]): string {
  if (entradas.length === 0) return 'El log está vacío: se llena cada vez que la herramienta revisa un texto.'
  const cuenta = new Map<string, number>()
  for (const e of entradas) for (const r of e.reglas) cuenta.set(r, (cuenta.get(r) ?? 0) + 1)
  const orden = [...cuenta].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0))
  const conFallos = entradas.filter(e => e.reglas.length > 0).length

  const lineas = [`${entradas.length} textos revisados desde ${entradas[0]!.t.slice(0, 10)}; ${conFallos} con algo que corregir.`]
  if (orden.length > 0) {
    lineas.push('', 'Reglas que más saltan:')
    for (const [regla, n] of orden) lineas.push(`${String(n).padStart(5)}  ${regla}`)
  }
  lineas.push('', 'Últimos:')
  for (const e of entradas.slice(-5).reverse()) {
    const fecha = `${e.t.slice(0, 10)} ${e.t.slice(11, 16)}`
    lineas.push(`  ${fecha}  nota ${String(e.puntos).padStart(3)}  ${e.reglas.join(', ') || 'sin avisos'}`)
  }
  return lineas.join('\n')
}
