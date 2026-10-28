# Meter for Claude Code

[English](README.md) · **Español**

Un mod de Claude Code que sale de [Claude Code Meter](https://github.com/marcmayol/claude-code-meter). Muestra el uso de tu plan abajo a la derecha del prompt, en la línea del modo de permisos.

```text
⏵⏵ auto mode on                                   5h 42% · 7d 20% · M 7%
```

- **5h** es la ventana de sesión y **7d** la semanal. Son las mismas cifras que `/usage` y salen de lo que Claude Code ya mide tras cada respuesta, así que no hay peticiones extra ni se gastan tokens.
- **M** es el mes. El plan no tiene cuota mensual, así que M es una estimación. El límite semanal en tokens se saca por regla de tres (tokens de la semana del plan entre su %) y los tokens del mes se miden contra ese límite escalado a los días del mes. La semana del plan va anclada a su reinicio real, no de lunes a domingo. Se guarda la mejor calibración (la del % semanal más alto) entre sesiones. M aparece cuando la semana pasa del 3 %.

Verde por debajo del 70 %, ámbar por debajo del 90 % y rojo a partir de ahí. Si falta sitio en el pie, lo primero que se quita es M.

`/meter` enseña las dos ventanas con sus reinicios, el límite semanal calibrado y tus últimas semanas del plan, reconstruidas a partir de las transcripciones.

Los tokens salen de las transcripciones de `~/.claude/projects` (o de `CLAUDE_CONFIG_DIR`). Las de más de 4 MiB las lee `scripts/scan.mjs`, así que hace falta Node en el PATH. Sin Node, `/meter` avisa de que la cuenta es parcial. Las lecturas de caché no cuentan salvo que actives `countCacheRead` en `/config`.

Necesita suscripción. Si pagas por API key no hay ventanas del plan y el pie se queda como está.

## Instalación

```text
/plugin marketplace add marcmayol/drac-plugins
/plugin install meter-for-claude-code@drac
```

## Desarrollo

```bash
claude plugin validate .
claude plugin test .
```

MIT © Marc Mayol
