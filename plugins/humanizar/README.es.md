# humanizar · plugin para Claude Code

[English](README.md) · **Español**

Limpia y puntúa cualquier texto en español (0-100) para que no suene a IA: un post, un
artículo, un correo o un README. Todo es local: no llama a ningún modelo ni API.

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

## Instalar

```
/plugin install humanizar --marketplace marcmayol/drac-plugins
```

Necesita [uv](https://docs.astral.sh/uv/): el servidor MCP se lanza con `uv run --script` y
la única dependencia es `mcp`.

## Tests

```
uv run --with pytest pytest tests
```

## Créditos

Idea de `li-human`, de [linkedin-agent-skill](https://github.com/Jakeschincariol/linkedin-agent-skill)
(MIT), rehecha en español y sin su léxico inglés. Nació dentro del plugin social-publish.

Licencia MIT.
