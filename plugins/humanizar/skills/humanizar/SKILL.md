---
name: humanizar
description: Limpia y puntúa un texto en español para que no suene a IA (relleno, «no es solo X, es Y», rayas, negritas Unicode, muro de hashtags) y reescribe lo que haga falta. Úsala cuando Marc pida "humaniza esto", "pásalo por humanizar", "que no suene a IA", o antes de entregar un post, artículo, correo o README que vaya a leer otra gente, o cuando escriba /humanizar.
---

# Humanizar un texto

Herramienta del MCP `humanizar`: `humanizar(textos)`. Recibe una lista de textos y devuelve
por cada uno `texto` (ya limpio), `cambiado`, `arreglos`, `avisos`, `puntos` (0-100) y
`pruebas` (ritmo, concreción, relleno, huella, voz).

## Flujo

1. **Origen.** Si te dan una ruta, lee el archivo. Si es un texto largo con partes que no
   son prosa (código, tablas, front matter), pasa solo la prosa.
2. **Pasa** todos los textos de una vez por `humanizar` y quédate con el `texto` que
   devuelve: ya trae los arreglos automáticos (invisibles, negritas Unicode, «a día de hoy»
   → «hoy»…).
3. **Si hay `avisos` o baja de 80**, reescribe solo esas frases y vuelve a pasarlo. Máximo
   dos vueltas; si no llega, entrégalo y di qué aviso queda y por qué.
   - Relleno o «no es solo X, es Y»: di la idea directamente.
   - Rayas «—»: coma, punto o paréntesis.
   - «poco concreto»: añade una cifra, un nombre o el enlace **solo si están en la fuente**.
     Si no los hay, déjalo así antes que inventar.
   - «voz» a 60: no hay primera persona. Si el texto es de alguien que habla («he montado»,
     «lo uso»), añádela; en un texto impersonal (documentación, README) ignóralo.
4. **Entrega** el último `texto` que devolvió `humanizar`, no tu versión anterior. Si
   después lo recortas o lo cambias, vuelve a pasarlo.
5. Si era un archivo, escribe el resultado en el mismo archivo solo si te lo han pedido;
   si no, enséñalo y di la nota.

## Qué no hace

- No es un detector de IA: son heurísticas locales en español. Un 100 no garantiza nada,
  solo que no hay ninguno de los fallos que mira.
- No cambia el sentido. Los arreglos automáticos son sustituciones exactas; lo demás lo
  reescribes tú.
- Si el texto tiene una guía de voz propia (por ejemplo `voz.md` del plugin social-publish),
  esa guía manda sobre estas indicaciones.
