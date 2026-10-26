# context-bar

[English](README.md) · **Español**

Un mod de Claude Code que enseña cuánto llevas de la ventana de contexto de la sesión, como una barra en el pie, con una marca donde salta el auto-compact. Lo ves venir en vez de enterarte cuando ya ha pasado.

```text
⏵⏵ auto mode on          ctx ━━━━━━━───┃─ 58% · compact 84% · 5h 42% · 7d 20% · M 7%
```

- La barra es la ventana entera del modelo, de 0 a 100 %.
- `┃` es donde salta el auto-compact. Se lee del propio Claude Code (tu modelo, tu configuración) y `compact 84%` dice lo mismo en cifras. Con el auto-compact apagado no hay marca y los colores cuentan hasta el 100 %.
- **Verde** mientras hay sitio, **ámbar** a 25 puntos del compact y **rojo** a 10 puntos. Los dos se cambian en `/config` (`warnPoints`, `dangerPoints`).
- Antes de la primera respuesta de una ventana (sesión nueva, reanudada o recién compactada) Claude Code aún no tiene la cifra. La barra enseña una cuenta local con `~` hasta que la siguiente respuesta trae la real.

Va al lado de [meter-for-claude-code](../meter-for-claude-code/README.es.md), en la misma línea. Si falta sitio en el pie, primero quita `compact 84%`, luego la barra y al final desaparece.

## Instalación

```text
/plugin install context-bar --marketplace marcmayol/drac-plugins
```

## Cómo funciona

- `session.measure` da `context.percent` tras cada respuesta. Cada 3 segundos vuelve a leer `$.session.usage()` (no cuesta nada), porque reanudar, rebobinar o compactar cambia el contexto sin que llegue una medida.
- `$.session.usage({ breakdown: 'summary' })`, una estimación local, da `autoCompactThreshold` y si el auto-compact está activado. Se vuelve a leer cuando cambia la ventana del modelo.
- Un hook `ui.render` sobre `SessionMode` dibuja la barra delante de lo que haya en el pie.

## Desarrollo

```bash
claude plugin validate .
claude plugin test .
```

MIT © Marc Mayol
