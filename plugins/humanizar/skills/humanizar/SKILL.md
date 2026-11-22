---
name: humanizar
description: Limpia, puntúa y edita un texto en español para que no suene a IA (relleno, «no es solo X, es Y», rayas, gerundios que fingen análisis, importancia inflada, fuentes vagas, pasivas sin sujeto, palabras distintas para lo mismo) respetando la voz de quien lo escribe. Úsala cuando Marc pida "humaniza esto", "pásalo por humanizar", "que no suene a IA", "¿esto suena a IA?", o antes de entregar un post, artículo, correo, README o los textos de un diseño, o cuando escriba /humanizar.
---

# Humanizar un texto

Herramienta `humanizar` del plugin (`mcp__humanizar__humanizar`): `humanizar(textos)`. Recibe una lista de textos y devuelve
por cada uno `texto` (ya limpio), `cambiado`, `arreglos`, `avisos`, `puntos` (0-100) y
`pruebas` (ritmo, concreción, relleno, huella, voz). Con dos textos o más de una misma pieza
(los de una interfaz), `coherencia` avisa de palabras distintas para lo mismo («Finalizar» y
«Terminar», «teléfono» y «móvil»).

## Dos modos

- **Editar** (lo normal): arreglas el texto y lo entregas con una sección **Qué ha cambiado**.
- **Solo detectar**: si preguntan «¿esto suena a IA?», «revísalo sin tocarlo» o «márcame lo
  que falla», no reescribas. Pasa el texto por `humanizar` y di cada problema citando la frase
  y el arreglo en pocas palabras. No des una nota de «parece IA»: los avisos son pruebas que se
  pueden comprobar, una sospecha no. Ofrece editarlo después.

## Criterio de editor

- **Respeta la voz.** Antes de tocar nada, fíjate en el vocabulario, el ritmo, la franqueza, el
  humor y las dudas de quien escribe. Se quedan. El texto tiene que seguir sonando a la misma
  persona.
- **Edición mínima.** Arregla los avisos, los errores y lo que no se entiende. Una frase buena
  se queda aunque no sea «perfecta».
- **No inventes.** Ni datos, ni ejemplos, ni cifras, ni opiniones. Si falta algo, pregúntalo.
- **Concreto.** Si una frase serviría igual para otra empresa, otro producto u otra persona,
  es relleno: quítala o cámbiala por un hecho, un ejemplo o una consecuencia de esto.
- **Enseña, no comentes.** Quita lo que le dice al lector qué pensar («lo importante es», «como
  ves»): el dato ya lo dice.
- **Voz activa con sujeto.** «Tokimichi lo intentará otra vez», no «se volverá a intentar».
- **Una palabra para cada cosa.** Si el botón dice «Terminar», no pongas «Finalizar» en otro.
- **Final.** Acaba en el último dato o en lo que hay que hacer; sin remate «profundo» ni resumen.

## Flujo

1. **Origen.** Si te dan una ruta, lee el archivo. Si es un texto largo con partes que no
   son prosa (código, tablas, front matter), pasa solo la prosa. Si son los textos de una
   interfaz, pásalos todos juntos para que salga la `coherencia`.
2. **Pasa** todos los textos de una vez por `humanizar` y quédate con el `texto` que
   devuelve: ya trae los arreglos automáticos (invisibles, negritas Unicode, «a día de hoy»
   → «hoy»…).
3. **Si hay `avisos` o baja de 80**, reescribe solo esas frases y vuelve a pasarlo. Máximo
   dos vueltas; si no llega, entrégalo y di qué aviso queda y por qué.
   - Relleno, «no es solo X, es Y», importancia inflada: di la idea directamente.
   - Gerundio que finge análisis («…, destacando…»): di la consecuencia concreta o quítalo.
   - Fuente vaga: nombra la fuente si está en el original; si no, quita la afirmación o pregunta.
   - Dos puntos de efecto («Lo mejor: …»): una frase normal.
   - Rayas «—»: coma, punto o paréntesis.
   - «poco concreto»: añade una cifra, un nombre o el enlace **solo si están en la fuente**.
     Si no los hay, déjalo así antes que inventar.
   - «voz» a 60: no hay primera persona. Si el texto es de alguien que habla («he montado»,
     «lo uso»), añádela; en un texto impersonal (documentación, README, interfaz) ignóralo.
4. **Entrega** el último `texto` que devolvió `humanizar`, no tu versión anterior. Si
   después lo recortas o lo cambias, vuelve a pasarlo. Debajo, **Qué ha cambiado**: dos a
   cinco líneas con lo que has tocado y por qué.
5. Si era un archivo, escribe el resultado en el mismo archivo solo si te lo han pedido;
   si no, enséñalo y di la nota.

## El modo automático

El plugin también revisa solo el texto de producto en español, sin que nadie lo pida: los
documentos que escribes con Write o Edit (.md, .html, .txt), lo que publicas con Artifact, y lo
que mandas a Claude Docs, Notion, Google Drive, Gmail, Canva y herramientas de publicar o
enviar. También el correo o mensaje que te piden en el chat («escríbeme un WhatsApp para…»).
Las respuestas normales del chat y el código no se tocan. Arregla solo lo seguro y te deja una
nota con lo que hay que reescribir: hazlo con este mismo criterio. Se apaga con
`/humanizar-auto off`.

## El log

Cada revisión apunta qué reglas han saltado, sin el texto. Si preguntan qué vicios se repiten, diles que
lo vean con `/humanizar-log` (en otros agentes, `humanizar log` en la terminal).

## Qué no hace

- No es un detector de IA: son heurísticas locales en español. Un 100 no garantiza nada,
  solo que no hay ninguno de los fallos que mira.
- No cambia el sentido. Los arreglos automáticos son sustituciones exactas; lo demás lo
  reescribes tú.
- En ficción, la raya de diálogo es ortografía correcta: no la quites aunque baje la nota.
- Si el texto tiene una guía de voz propia (por ejemplo `voz.md` del plugin social-publish),
  esa guía manda sobre estas indicaciones.
