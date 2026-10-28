# Drac Plugins

[English](README.md) · **Español**

Plugins y mods de Claude Code de [Marc Mayol](https://github.com/marcmayol), en un solo marketplace.

| Plugin | Qué hace |
| --- | --- |
| [meter-for-claude-code](plugins/meter-for-claude-code/README.es.md) | El uso de tu plan abajo a la derecha del prompt: `5h 42% · 7d 20% · M 7%`. Las ventanas de 5 horas y semanal tal como las da `/usage`, más una estimación del mes calibrada con tus transcripciones. `/meter` muestra los reinicios y las semanas anteriores. |
| [context-bar](plugins/context-bar/README.es.md) | La ventana de contexto como una barra al lado del medidor, con una marca donde salta el auto-compact: `ctx ━━━━━━━───┃─ 58% · compact 84%`. Verde mientras hay sitio, ámbar a 25 puntos del compact y rojo a 10. |
| [humanizar](plugins/humanizar/README.es.md) | Limpia y puntúa textos en español (0-100) para que no suenen a IA: caracteres invisibles, negritas Unicode, relleno, «no es X, es Y», rayas, muros de hashtags. `/humanizar` para posts, artículos, correos o README. Heurísticas locales, sin API. |
| [omoikane](https://github.com/marcmayol/omoikane/blob/master/README.es.md) | Memoria a largo plazo: lo que Claude aprende en una sesión vuelve en la siguiente. Un fichero SQLite local, aviso de duplicados y, en cada mensaje, solo las memorias que de verdad tienen que ver (o ninguna). Necesita el binario `omoi`. |
| [creality-print](https://github.com/marcmayol/claude-code-creality-print-plugin/blob/main/README.es.md) | Lamina con Creality Print, comprueba el gcode contra la cama real, colores y filamentos mezclados, ranuras del CFS, y maneja impresoras con Creality OS (K2, K1…). No oficial. |

## Instalación

En el prompt de una sesión de Claude Code en el terminal:

```text
/plugin install meter-for-claude-code --marketplace marcmayol/drac-plugins
/plugin install context-bar --marketplace marcmayol/drac-plugins
/plugin install humanizar --marketplace marcmayol/drac-plugins
/plugin install creality-print --marketplace marcmayol/drac-plugins
/plugin install omoikane --marketplace marcmayol/drac-plugins
```

Desde una terminal:

```bash
claude plugin install meter-for-claude-code --marketplace marcmayol/drac-plugins
```

En la app de escritorio, donde `/plugin` no funciona: pulsa + junto al cuadro del prompt, luego Plugins, Add marketplace con `marcmayol/drac-plugins` y después Add plugin.

## Versiones antiguas de Claude Code

meter-for-claude-code, context-bar y humanizar son módulos de hooks (mods): corren dentro de Claude Code y no necesitan nada más instalado. Claude Code 2.1.310 los carga solo en los plugins instalados; las versiones anteriores (la 2.1.282, por ejemplo) se los saltan si no se pone `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` en el entorno. Si `/meter` sale como comando desconocido o el pie no muestra nada, haz `claude update` o pon esa variable.

## Añadir un plugin

Un plugin puede vivir aquí, en `plugins/<nombre>/` (`"source": "./plugins/<nombre>"`), o seguir en su propio repositorio y estar solo listado (`"source": { "source": "github", "repo": "<owner>/<repo>" }`). Añade su entrada a [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) y compruébalo con:

```bash
claude plugin validate .
claude plugin validate ./plugins/<nombre>
```

MIT © Marc Mayol
