"""Limpia y puntúa un texto para que no suene a IA.

Idea sacada de `li-human` (github.com/Jakeschincariol/linkedin-agent-skill), pero en español
y sin su léxico inglés. Tres cosas:

1. Arregla solo lo que no cambia el sentido: caracteres invisibles, letras Unicode de
   «negrita» (𝗮𝗯𝗰) y unas pocas muletillas con sustituto exacto («a día de hoy» → «hoy»).
2. Avisa de lo que hay que reescribir a mano: «no es solo X, es Y», «¿El resultado?»,
   rayas, muro de hashtags, cebo de comentarios…
3. Puntúa de 0 a 100 (más alto = más humano) con cinco comprobaciones. Son heurísticas
   locales, no un detector de verdad.
"""
from __future__ import annotations

import re
import statistics
import unicodedata

# Invisibles que se cuelan al copiar de un chat: ancho cero, BOM, guion blando, etiquetas.
_INVISIBLES = re.compile("[​‌‍⁠﻿­\U000e0000-\U000e007f]")
_ESPACIOS_RAROS = re.compile("[     ]")
# Letras matemáticas (𝗮𝗯𝗰, 𝘢𝘣𝘤, 𝐀𝐁𝐂…): NFKC las devuelve a letras normales.
_MATEMATICAS = re.compile("[\U0001d400-\U0001d7ff]")

# Muletillas con un sustituto que no cambia el sentido: se arreglan solas.
CAMBIOS = {
    r"\ba día de hoy\b": "hoy",
    r"\ben el día de hoy\b": "hoy",
    r"\bsin lugar a dudas\b": "sin duda",
    r"\bcon el objetivo de\b": "para",
    r"\bcon el fin de\b": "para",
    r"\bde cara a\b": "para",
    r"\ben base a\b": "según",
    r"\butiliza\b": "usa",
    r"\butilizan\b": "usan",
    r"\butilizar\b": "usar",
    r"\butilizando\b": "usando",
    r"\butilizo\b": "uso",
}

# Muletillas sin sustituto exacto: se avisa y se reescribe la frase.
RELLENO = [
    "en el vertiginoso mundo", "en el mundo actual", "en la era digital", "en la era de la ia",
    "hoy más que nunca", "más que nunca", "cabe destacar", "es importante destacar",
    "es importante tener en cuenta", "es crucial", "es fundamental", "no es ningún secreto",
    "revoluciona", "revolucionar", "revolucionario", "revolucionaria", "game changer",
    "cambia las reglas del juego", "cambio de paradigma", "un antes y un después",
    "desbloquear", "desbloquea", "potenciar", "potencia tu", "sinergia", "de vanguardia",
    "vanguardista", "transformador", "transformadora", "llevar al siguiente nivel",
    "al siguiente nivel", "a otro nivel", "aprovechar al máximo", "sácale el máximo partido",
    "sumérgete", "sumergirnos", "adentrarnos", "adéntrate", "panorama actual", "navegar por",
    "en definitiva", "en conclusión", "en resumen", "la clave está en", "pieza clave",
    "el futuro ya está aquí", "el futuro es ahora", "no te lo puedes perder", "imprescindible",
    "fascinante", "apasionante", "me complace", "encantado de anunciar", "orgulloso de anunciar",
    "emocionado de anunciar", "os presento", "te presento", "déjame contarte", "te cuento un secreto",
    "aquí te dejo", "abróchate el cinturón", "spoiler:", "atención:", "ojo al dato",
    "un mundo de posibilidades", "infinitas posibilidades", "esto lo cambia todo",
]

ESTRUCTURAS = [
    (re.compile(r"\bno (?:es|se trata de) (?:solo|sólo|simplemente|únicamente)\b[^.\n]{1,80}?"
                r"[,;:.—–-]\s*(?:es|sino|se trata de)\b", re.I),
     "«no es solo X, es Y»: di Y directamente"),
    (re.compile(r"\bno es [^.\n]{1,50}\.\s+es\b", re.I), "«No es X. Es Y.»: di Y directamente"),
    (re.compile(r"(?:^|(?<=[.!?\n—–:]))\s*¿[^?\n]{1,25}\?(?=\s|$)"),
     "pregunta retórica corta («¿El resultado?»): cuéntalo sin preguntar"),
    (re.compile(r"\b(?:comenta|escribe|responde)\s+[«\"']?\w+[»\"']?\s+(?:y|para que)\s+te\b", re.I),
     "cebo de comentarios («comenta X y te lo envío»): pon el enlace"),
    (re.compile(r"¿(?:y tú|y vosotros|qué opinas|qué opináis|qué piensas|estás de acuerdo)\??", re.I),
     "pregunta de cebo al final: solo si de verdad quieres esa respuesta"),
    (re.compile(r"\b(?:dale (?:a )?like|comparte si|sígueme para más|guárdalo para)\b", re.I),
     "petición de interacción: quítala"),
    (re.compile(r"\*\*[^*\n]+\*\*"), "markdown (**…**): en las redes sale tal cual, quítalo"),
]

RAYA = re.compile(r"\s[—–]\s|[^\s\n][—][^\s\n]")
HASHTAG = re.compile(r"(?<!\w)#\w+")
EMOJI = re.compile("[\U0001f300-\U0001faff☀-➿\U0001f000-\U0001f2ff]")
URL = re.compile(r"https?://\S+", re.I)
PALABRA = re.compile(r"[\wáéíóúüñÁÉÍÓÚÜÑ]+")
NUMERO = re.compile(r"\d")
# Primera persona: lo que delata que habla alguien y no un folleto.
PRIMERA = re.compile(r"\b(?:yo|me|mi|mis|conmigo|he|hice|llevo|tengo|uso|hago|probé|monté|"
                     r"estoy|quiero|creo|pienso|nosotros|nos|nuestro|nuestra)\b", re.I)


def limpiar(texto: str) -> tuple[str, list[str]]:
    """Arreglos automáticos; devuelve el texto y qué se ha tocado."""
    hecho = []
    if _INVISIBLES.search(texto):
        texto = _INVISIBLES.sub("", texto)
        hecho.append("caracteres invisibles quitados")
    if _ESPACIOS_RAROS.search(texto):
        texto = _ESPACIOS_RAROS.sub(" ", texto)
        hecho.append("espacios raros normalizados")
    if _MATEMATICAS.search(texto):
        texto = _MATEMATICAS.sub(lambda m: unicodedata.normalize("NFKC", m.group()), texto)
        hecho.append("letras Unicode de negrita/cursiva pasadas a normales")
    for patron, nuevo in CAMBIOS.items():
        def _sustituir(m: re.Match, nuevo=nuevo) -> str:
            return nuevo.capitalize() if m.group()[0].isupper() else nuevo
        texto, n = re.subn(patron, _sustituir, texto, flags=re.I)
        if n:
            hecho.append(f"«{patron[2:-2]}» → «{nuevo}»")
    return texto, hecho


def _frases(texto: str) -> list[str]:
    sin_urls = URL.sub("enlace", texto)
    return [f for f in re.split(r"(?<=[.!?…])\s+|\n+", sin_urls) if PALABRA.search(f)]


def _escala(valor: float, cero: float, cien: float) -> int:
    """0 en `cero`, 100 en `cien`, lineal entre medias."""
    if cien == cero:
        return 100
    return round(max(0.0, min(1.0, (valor - cero) / (cien - cero))) * 100)


def revisar(texto: str) -> dict:
    limpio, arreglos = limpiar(texto)
    bajo = limpio.lower()
    palabras = PALABRA.findall(limpio)
    n = max(len(palabras), 1)
    avisos = []

    relleno = [r for r in RELLENO if re.search(rf"(?<!\w){re.escape(r)}(?!\w)", bajo)]
    if relleno:
        avisos.append("relleno de IA: " + ", ".join(f"«{r}»" for r in relleno))
    for patron, aviso in ESTRUCTURAS:
        if patron.search(limpio):
            avisos.append(aviso)
    rayas = len(RAYA.findall(limpio))
    if rayas:
        avisos.append(f"{rayas} raya(s) «—»: cámbialas por coma, punto o paréntesis")
    tags = HASHTAG.findall(limpio)
    if len(tags) > 3:
        avisos.append(f"{len(tags)} hashtags: deja 1-3")
    emojis = EMOJI.findall(limpio)
    if len(emojis) > 1:
        avisos.append(f"{len(emojis)} emojis: como mucho uno")
    if limpio.lstrip()[:1] and EMOJI.match(limpio.lstrip()):
        avisos.append("empieza con emoji: empieza con la idea")

    frases = _frases(HASHTAG.sub("", limpio))
    largos = [len(PALABRA.findall(f)) for f in frases]
    if len(largos) >= 3:
        variacion = statistics.pstdev(largos) / max(statistics.mean(largos), 1)
        ritmo = _escala(variacion, 0.15, 0.55)
        if ritmo < 50:
            avisos.append("todas las frases miden parecido: mezcla alguna corta con otra larga")
    else:
        ritmo = 100  # en un tuit de dos frases no hay ritmo que medir

    # Concreción: cifras, nombres propios (mayúscula fuera de inicio de frase), enlaces.
    nombres = sum(1 for f in frases for p in PALABRA.findall(f)[1:] if p[:1].isupper())
    concretos = len(NUMERO.findall(limpio)) // 2 + nombres + len(URL.findall(limpio))
    concrecion = _escala(concretos * 100 / n, 0, 4)
    if concrecion < 40:
        avisos.append("poco concreto: añade una cifra, un nombre o el enlace real (solo si están en la fuente)")

    densidad = _escala(len(relleno) * 100 / n, 3, 0)
    huella = _escala((rayas + len(emojis[1:])) * 1000 / max(len(limpio), 1), 6, 0)
    voz = 100 if PRIMERA.search(limpio) else 60
    voz -= 15 * sum(1 for p, _ in ESTRUCTURAS[:3] if p.search(limpio))

    pruebas = {"ritmo": ritmo, "concreción": concrecion, "relleno": densidad,
               "huella": huella, "voz": max(voz, 0)}
    nota = round(0.6 * statistics.mean(pruebas.values()) + 0.4 * min(pruebas.values()))
    return {
        "texto": limpio,
        "cambiado": limpio != texto,
        "arreglos": arreglos,
        "avisos": avisos,
        "puntos": nota,
        "pruebas": pruebas,
    }
