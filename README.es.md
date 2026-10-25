# Drac Plugins

[English](README.md) · **Español**

Plugins y mods de Claude Code de [Marc Mayol](https://github.com/marcmayol), en un solo marketplace.

| Plugin | Qué hace |
| --- | --- |
| [meter-for-claude-code](plugins/meter-for-claude-code/README.es.md) | El uso de tu plan abajo a la derecha del prompt: `5h 42% · 7d 20% · M 7%`. Las ventanas de 5 horas y semanal tal como las da `/usage`, más una estimación del mes calibrada con tus transcripciones. `/meter` muestra los reinicios y las semanas anteriores. |
| [creality-print](https://github.com/marcmayol/claude-code-creality-print-plugin/blob/main/README.es.md) | Lamina con Creality Print, comprueba el gcode contra la cama real, colores y filamentos mezclados, ranuras del CFS, y maneja impresoras con Creality OS (K2, K1…). No oficial. |

## Instalación

En el prompt de una sesión de Claude Code en el terminal:

```text
/plugin install meter-for-claude-code --marketplace marcmayol/drac-plugins
/plugin install creality-print --marketplace marcmayol/drac-plugins
```

Desde una terminal:

```bash
claude plugin install meter-for-claude-code --marketplace marcmayol/drac-plugins
```

En la app de escritorio, donde `/plugin` no funciona: pulsa + junto al cuadro del prompt, luego Plugins, Add marketplace con `marcmayol/drac-plugins` y después Add plugin.

## Añadir un plugin

Un plugin puede vivir aquí, en `plugins/<nombre>/` (`"source": "./plugins/<nombre>"`), o seguir en su propio repositorio y estar solo listado (`"source": { "source": "github", "repo": "<owner>/<repo>" }`). Añade su entrada a [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) y compruébalo con:

```bash
claude plugin validate .
claude plugin validate ./plugins/<nombre>
```

MIT © Marc Mayol
