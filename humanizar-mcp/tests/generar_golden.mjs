// Rebuilds golden.json with what the TypeScript engine (the Claude Code plugin's) returns for each
// text in corpus.json. The Rust tests check they answer the same. Needs Node 22.18 or newer.
//   node humanizar-mcp/tests/generar_golden.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { revisar } from '../../plugins/humanizar/hooks/humanizar.ts'
import { reglas } from '../../plugins/humanizar/hooks/log.ts'
import { registerHooks } from 'node:module'

// producto.ts imports './humanizar' with no extension, as the plugin's bundler wants it.
registerHooks({
  resolve (especificador, contexto, siguiente) {
    try {
      return siguiente(especificador, contexto)
    } catch (e) {
      if (especificador.startsWith('.') && !especificador.endsWith('.ts')) return siguiente(especificador + '.ts', contexto)
      throw e
    }
  },
})
const { arreglar, esEspanol, informar, mensaje, textosHtml, textosMd, tipoDeFichero } = await import('../../plugins/humanizar/hooks/producto.ts')

const aqui = new URL('.', import.meta.url)
const textos = JSON.parse(readFileSync(new URL('corpus.json', aqui), 'utf8'))
const golden = textos.map(texto => ({ entrada: texto, salida: revisar(texto), reglas: reglas(revisar(texto)) }))
writeFileSync(new URL('golden.json', aqui), JSON.stringify(golden, null, 1) + '\n')
console.log(`${golden.length} texts`)

// What `humanizar hook` borrows from producto.ts: the same answers for each document in producto_corpus.json.
const casos = JSON.parse(readFileSync(new URL('producto_corpus.json', aqui), 'utf8'))
const producto = casos.map(({ ruta, contenido }) => {
  const tipo = tipoDeFichero(ruta)
  if (tipo === null) return { ruta, contenido, tipo }
  const [arreglado, arreglos] = arreglar(contenido, tipo)
  const textos = tipo === 'html' ? textosHtml(arreglado) : textosMd(arreglado)
  const espanol = esEspanol(textos.join('\n'))
  return { ruta, contenido, tipo, arreglado, arreglos, textos, espanol, mensaje: espanol ? mensaje(ruta, informar(textos, tipo, arreglos)) : null }
})
writeFileSync(new URL('producto.json', aqui), JSON.stringify(producto, null, 1) + '\n')
console.log(`${producto.length} documents`)
