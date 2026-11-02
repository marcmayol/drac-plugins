// Rebuilds golden.json with what the TypeScript engine (the Claude Code plugin's) returns for each
// text in corpus.json. The Rust tests check they answer the same. Needs Node 22.18 or newer.
//   node humanizar-mcp/tests/generar_golden.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { revisar } from '../../plugins/humanizar/hooks/humanizar.ts'
import { reglas } from '../../plugins/humanizar/hooks/log.ts'

const aqui = new URL('.', import.meta.url)
const textos = JSON.parse(readFileSync(new URL('corpus.json', aqui), 'utf8'))
const golden = textos.map(texto => ({ entrada: texto, salida: revisar(texto), reglas: reglas(revisar(texto)) }))
writeFileSync(new URL('golden.json', aqui), JSON.stringify(golden, null, 1) + '\n')
console.log(`${golden.length} texts`)
