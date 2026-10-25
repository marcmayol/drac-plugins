// node scan.mjs <file.jsonl>... → {"<file>": {hour: [work, cacheRead]}} on stdout.
// For transcripts over the 4 MiB a hooks module can read with $.fs.read.
import { readFile } from 'node:fs/promises'
import { parseTranscript } from '../hooks/parse.mjs'

const out = {}
for (const path of process.argv.slice(2)) {
  try {
    out[path] = parseTranscript(await readFile(path, 'utf8'))
  } catch {
    // unreadable: left out, the meter counts what it could read
  }
}
process.stdout.write(JSON.stringify(out))
