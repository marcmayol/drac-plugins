# humanizar

[English](README.md) · **Español**

Limpia y puntúa cualquier texto en español (0-100) para que no suene a IA: un post, un
artículo, un correo o un README. Todo es local: no llama a ningún modelo ni API. Funciona en
Claude Code como plugin y [en otros 14 agentes](#en-otros-agentes) como servidor MCP.

## Qué hace

| Pieza | Para qué |
|---|---|
| Herramienta `humanizar` | Recibe una lista de textos y devuelve cada uno limpio, con su nota, sus avisos y el desglose de pruebas |
| Modo automático | Revisa solo el texto de producto en español mientras Claude trabaja ([abajo](#el-modo-automático)) |
| Orden `/humanizar-auto` | Enciende (`on`), apaga (`off`) o enseña cómo está el modo automático |
| Orden `/humanizar-log` | Enseña qué reglas saltan más ([el log](#el-log)) |
| Skill `humanizar` (`/humanizar`) | Le dice a Claude cómo usarla: pasar el texto, reescribir solo lo que avisa, repetir como mucho dos veces y entregar lo último que devolvió la herramienta |

### Arreglos automáticos (no cambian el sentido)

- Caracteres invisibles (ancho cero, BOM, guion blando) y espacios raros.
- Letras Unicode de «negrita» o «cursiva» (𝗮𝗯𝗰, 𝘢𝘣𝘤) a letras normales.
- Muletillas con sustituto exacto: «a día de hoy» → «hoy», «con el fin de» → «para»,
  «utilizar» → «usar»…

### Avisos (los reescribe Claude)

Relleno de IA («en el mundo actual», «profundizar», «dicho esto», «un sinfín de»…), «no es X, es Y»
con o sin «solo», «fundamental», «crucial» y «clave» juntas en un párrafo, tres adjetivos seguidos, preguntas retóricas cortas («¿El resultado?»), cebo de comentarios,
markdown `**…**`, rayas «—», más de 3 hashtags, más de un emoji, empezar con emoji, frases
todas del mismo largo y texto poco concreto.

Desde la 2.0, también lo que vigila la skill no-ai-slop, en español: gerundios que fingen análisis
(«…, destacando su compromiso»), importancia inflada («marca un hito», «juega un papel»), frases que
le dicen al lector qué pensar («lo importante es», «como ves»), fuentes vagas («los expertos
coinciden»), dos puntos de efecto («Lo mejor: …»), pasivas sin sujeto («se volverá a intentar») y
finales que rematan («Así de simple», «Al fin y al cabo»). Con varios textos de una misma pieza,
`coherencia` avisa de palabras distintas para lo mismo («Finalizar» y «Terminar», «teléfono» y «móvil»).

### La nota

Cinco pruebas de 0 a 100: ritmo (variación del largo de las frases), concreción (cifras,
nombres, enlaces), relleno, huella (rayas y emojis) y voz (primera persona). La nota mezcla
la media con la peor, así que un solo fallo grave la baja.

## El modo automático

Viene encendido. Mira solo el **texto de producto en español**: el que va a leer otra gente.

| Dónde | Qué hace |
|---|---|
| Write y Edit de .md, .mdx, .txt, .html, .rst, .adoc, .eml | Arregla lo seguro antes de escribir y le dice a Claude qué reescribir |
| Publicar un Artifact | Revisa el fichero si no pasó ya por Write con el mismo contenido |
| Claude Docs, Notion, Google Drive, Gmail (borradores), Canva, generar imágenes | Arregla lo seguro en los argumentos y deja la nota después |
| Enviar un correo o publicar un post (Gmail send, `send`, `publish`, `post`, `tweet`) | Si hay avisos, lo para una vez para que se corrija; la segunda llamada igual pasa |
| Un correo, WhatsApp, Teams o post que pides en el chat («escríbeme un correo para…») | En ese turno, arregla lo seguro en la cita o el bloque de texto plano y avisa si la nota es baja |

No toca nunca el código (.kt, .ts, .py…, los bloques de código, `<script>` y `<style>`), las
instrucciones para agentes (CLAUDE.md, AGENTS.md, SKILL.md, memorias, `.claude/`), los textos en
otro idioma ni las respuestas normales del chat. Además añade al prompt de sistema las reglas para
ese texto, para que salga limpio desde el principio.

Se apaga con `/humanizar-auto off` (o `HUMANIZAR_AUTO=0`). Las reglas del prompt cambian en la
próxima conversación; la revisión de las herramientas, al momento.

## El log

Cada vez que la herramienta revisa un texto, apunta qué reglas han saltado. Así ves qué vicios repite el
modelo y puedes corregirlos en sus instrucciones, o decidir que la regla está mal puesta. La idea es de
Edwin Jimenez, en los comentarios de LinkedIn.

| Dónde | Ver el log | Vaciarlo |
|---|---|---|
| Claude Code | `/humanizar-log` | `/humanizar-log borrar` |
| Otros agentes (Windows, Linux y macOS) | `humanizar log` | `humanizar log --clear` |

```
12 textos revisados desde 2026-11-02; 8 con algo que corregir.

Reglas que más saltan:
    5  poco concreto
    3  raya(s) «—»
    1  relleno: «cabe destacar»

Últimos:
  2026-11-02 09:12  nota  43  poco concreto, raya(s) «—»
```

Guarda la fecha en UTC, la nota y el nombre de las reglas, nunca tu texto, y no sale de tu equipo. Se queda con
las últimas 5000 revisiones más o menos. En Claude Code vive en el almacén del plugin; en el binario, en
`~/.humanizar/log.jsonl`, y `humanizar log --raw` lo saca tal cual. Son logs separados. Para que no anote nada,
define `HUMANIZAR_NO_LOG=1`.

## Instalar en Claude Code

```
/plugin marketplace add marcmayol/drac-plugins
/plugin install humanizar@drac
```

No hay que instalar nada más: ni Python, ni uv, ni servidor MCP. Desde la 0.2.0 el motor corre dentro del propio
Claude Code, como un módulo de hooks (`hooks/humanizar.ts`) que registra la herramienta `humanizar`
(`mcp__humanizar__humanizar`).

## En otros agentes

La misma herramienta funciona en los 14 agentes que prepara [Omoikane](https://github.com/marcmayol/omoikane):
Codex, Gemini CLI, Cursor, OpenCode, Qwen Code, Kiro, GitHub Copilot, Windsurf, Antigravity, Kimi Code,
Pi, Amp, Kilo Code y Grok Build. Es un solo binario de menos de 2 MB que no necesita nada más: ni Node, ni Python, ni uv, ni el redistribuible de
Visual C++, ni una distribución de Linux concreta, ni red. Da las mismas respuestas que el plugin, y los tests lo comparan con él.

Un solo comando lo instala y deja listos los agentes que encuentre en tu equipo:

**Windows** (PowerShell)
```powershell
irm https://raw.githubusercontent.com/marcmayol/drac-plugins/main/humanizar-mcp/install.ps1 | iex
```

**Linux y macOS**
```sh
curl -fsSL https://raw.githubusercontent.com/marcmayol/drac-plugins/main/humanizar-mcp/install.sh | sh
```

Abre una sesión nueva del agente y ya está. Para un agente que instales más tarde, o que no hayas abierto nunca
(todavía sin carpeta de configuración):

```sh
humanizar setup codex      # o gemini, cursor, opencode, qwen, kiro, copilot, windsurf, antigravity, kimi, pi, amp, kilo, grok
```

Para instalar solo el binario sin tocar los agentes, define antes `HUMANIZAR_NO_SETUP=1`.

`setup` registra el servidor MCP, añade un párrafo a las instrucciones del agente y crea la orden
`/humanizar` donde hay órdenes de usuario. Copilot, Antigravity, Kimi Code y Amp no las tienen, y Cursor
no tiene fichero global de instrucciones: ahí basta con la descripción de la herramienta. Enseña lo que
cambia, guarda una copia de cada fichero que toca (`<fichero>.before-humanizar`) y no repite nada.
`--dry-run` solo mira. Para quitarlo, borra la entrada `humanizar` de su configuración MCP y el párrafo
entre las marcas `<!-- humanizar -->`.

Probado de punta a punta con OpenCode 1.19.5. Gemini CLI lee bien la configuración. El resto sigue la
documentación de cada agente, con las mismas rutas que `omoi setup`.

`humanizar check <fichero>` da el resultado en la terminal, sin agente.

### Conectado en los hooks del agente

Con el MCP, el agente tiene que acordarse de llamar a la herramienta. Desde la 2.1.0, donde el agente
tiene hooks que dejan cambiar los argumentos de una herramienta, `setup` conecta además `humanizar hook`:
cada vez que el agente va a escribir un documento (.md, .txt, .html…; nunca código ni las instrucciones
de los agentes) en español, el hook arregla lo seguro antes de escribirlo y le dice al modelo qué
reescribir. Sin que nadie lo pida.

| Agente | Cómo se conecta | Dónde |
|---|---|---|
| Qwen Code | Hook `PreToolUse` en `write_file` y `edit` | `~/.qwen/settings.json` |
| Gemini CLI | Hooks `BeforeTool` (arregla) y `AfterTool` (avisa) en `write_file` y `replace` | `~/.gemini/settings.json` |
| Antigravity | Hook `PreToolUse` (arregla) en `write_to_file` y `replace_file_content` (app e IDE) y en `write_file` y `edit_file` (CLI `agy`), y `PreInvocation` (avisa al modelo antes de su siguiente turno) | `~/.gemini/config/hooks.json` |
| El resto | Solo el MCP y las reglas | |

En el resto todavía no: o sus hooks no pueden cambiar los argumentos (Kimi Code), o su documentación no
dice qué campos trae la herramienta de escribir (Devin, Kiro, Grok Build, GitHub Copilot, Cursor), o
mandan un parche en vez del texto (Codex), o hacen falta plugins en TypeScript (OpenCode, Kilo, Pi, Amp).

Además, `setup` deja en las instrucciones de cada agente las reglas cortas del texto de producto (voz
activa, una palabra para cada cosa, nada de relleno ni rayas…), y Windsurf, que ahora es Devin, las
recibe también en `~/.devin/global_rules.md`. Si ya estaban de una versión anterior, las pone al día.

El hook no mira las respuestas del chat y no para ningún envío: eso solo lo hace el plugin de Claude
Code. Entre llamadas solo guarda, en la carpeta temporal, la nota de Antigravity que espera al siguiente
`PreInvocation`, y la borra al entregarla.

Probado de punta a punta con Qwen Code 0.28, Gemini CLI 0.70 y Antigravity CLI 1.5 (escribir y editar,
con un modelo de pruebas): el fichero queda arreglado y el modelo recibe lo que tiene que reescribir. Se apaga con `HUMANIZAR_AUTO=0`. Para quitarlo, borra el grupo del hook
`humanizar` del fichero de cada agente.

## Tests

```
claude plugin validate .
claude plugin test .
cargo test --release --manifest-path ../../humanizar-mcp/Cargo.toml
```

## Créditos

Idea de `li-human`, de [linkedin-agent-skill](https://github.com/Jakeschincariol/linkedin-agent-skill)
(MIT), rehecha en español y sin su léxico inglés. Nació dentro del plugin social-publish.

Licencia MIT.
