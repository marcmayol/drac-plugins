import type { Register } from 'claude-code'

// With several sessions open at once, a subagent named after its task alone doesn't say which
// session it belongs to. This mod asks for "Project: task": it tells the model up front, in the
// tool's description, and refuses the call when the name doesn't fit.
//
// It only checks the shape. Whether the part before the colon really is the project is up to the
// model, and the description tells it what to put there.

const MAX = 60
const FORMA = /^\S[^:\n]{0,29}: \S/u

const REGLA = `Name it "Project: task": the project or request this session is working on, a colon, then the task in a few plain words, in the user's language. Use the name the user knows the project by, never a path. Under ${MAX} characters. Examples: "LinkedIn: reply to Edwin", "Billing app: review login".`

export const esValido = (nombre: string) => nombre.length <= MAX && FORMA.test(nombre)

function motivo (nombre: string) {
  const cuanto = nombre.length > MAX ? `It has ${nombre.length} characters. ` : ''
  return `agent-names: «${nombre}» isn't a valid subagent name. ${cuanto}${REGLA} Call the tool again with a new description.`
}

export const register: Register = on => {
  on('tool.describe', { tool: 'Agent' }, async ($, e, next) => {
    const r = await next(e)
    return { ...r, description: `${r.description}\n\nThe \`description\` parameter is what the user sees in the list of agents. ${REGLA}` }
  })

  // A broken guard must not stop the work: if it fails, the subagent still starts.
  on('tool.call', { tool: 'Agent' }, ($, e, next) =>
    esValido(e.description) ? next(e) : { deny: motivo(e.description) },
  ).catch(($, e, next) => next(e))
}
