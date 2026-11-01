# humanizar

[English](README.md) · **Español**

Limpia y puntúa cualquier texto en español (0-100) para que no suene a IA: un post, un
artículo, un correo o un README. Todo es local: no llama a ningún modelo ni API. Funciona en
Claude Code como plugin y [en otros 14 agentes](#en-otros-agentes) como servidor MCP.

## Qué hace

| Pieza | Para qué |
|---|---|
| Herramienta `humanizar` | Recibe una lista de textos y devuelve cada uno limpio, con su nota, sus avisos y el desglose de pruebas |
| Skill `humanizar` (`/humanizar`) | Le dice a Claude cómo usarla: pasar el texto, reescribir solo lo que avisa, repetir como mucho dos veces y entregar lo último que devolvió la herramienta |

### Arreglos automáticos (no cambian el sentido)

- Caracteres invisibles (ancho cero, BOM, guion blando) y espacios raros.
- Letras Unicode de «negrita» o «cursiva» (𝗮𝗯𝗰, 𝘢𝘣𝘤) a letras normales.
- Muletillas con sustituto exacto: «a día de hoy» → «hoy», «con el fin de» → «para»,
  «utilizar» → «usar»…

### Avisos (los reescribe Claude)

Relleno de IA («en el mundo actual», «cambia las reglas del juego», «desbloquear»…),
«no es solo X, es Y», preguntas retóricas cortas («¿El resultado?»), cebo de comentarios,
markdown `**…**`, rayas «—», más de 3 hashtags, más de un emoji, empezar con emoji, frases
todas del mismo largo y texto poco concreto.

### La nota

Cinco pruebas de 0 a 100: ritmo (variación del largo de las frases), concreción (cifras,
nombres, enlaces), relleno, huella (rayas y emojis) y voz (primera persona). La nota mezcla
la media con la peor, así que un solo fallo grave la baja.

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
Pi, Amp, Kilo Code y Grok Build. Es un solo binario de 1,5 MB sin dependencias: ni Node, ni Python, ni red.
Da las mismas respuestas que el plugin, y los tests lo comparan con él.

**Windows** (PowerShell)
```powershell
irm https://raw.githubusercontent.com/marcmayol/drac-plugins/main/humanizar-mcp/install.ps1 | iex
```

**Linux y macOS**
```sh
curl -fsSL https://raw.githubusercontent.com/marcmayol/drac-plugins/main/humanizar-mcp/install.sh | sh
```

Y después prepara tu agente:

```sh
humanizar setup codex      # o gemini, cursor, opencode, qwen, kiro, copilot, windsurf, antigravity, kimi, pi, amp, kilo, grok
humanizar setup --all      # todos los que encuentre en este equipo
```

`setup` registra el servidor MCP, añade un párrafo a las instrucciones del agente y crea la orden
`/humanizar` donde hay órdenes de usuario. Copilot, Antigravity, Kimi Code y Amp no las tienen, y Cursor
no tiene fichero global de instrucciones: ahí basta con la descripción de la herramienta. Enseña lo que
cambia, guarda una copia de cada fichero que toca (`<fichero>.before-humanizar`) y no repite nada.
`--dry-run` solo mira. Para quitarlo, borra la entrada `humanizar` de su configuración MCP y el párrafo
entre las marcas `<!-- humanizar -->`.

Probado de punta a punta con OpenCode 1.19.5. Gemini CLI lee bien la configuración. El resto sigue la
documentación de cada agente, con las mismas rutas que `omoi setup`.

`humanizar check <fichero>` da el resultado en la terminal, sin agente.

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
