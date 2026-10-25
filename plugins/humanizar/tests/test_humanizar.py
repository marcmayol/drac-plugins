import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import humanizar

IA = """🚀 En el vertiginoso mundo de la IA, esto lo cambia todo.

No es solo una herramienta, es un cambio de paradigma. ¿El resultado? Un antes y un después.

A día de hoy es fundamental aprovechar al máximo cada oportunidad — y esta es la clave.

¿Qué opinas? 👇 #IA #AI #Innovación #Tech #Futuro"""

MARC = """Llevaba semanas difundiendo a mano cada post de LinkedIn en X y Threads. Unos 15 minutos por post.

Ayer monté un plugin para Claude Code que lo hace solo: lee mi actividad cada 2 horas y publica en las tres redes con mi propio Chrome. Sin APIs de pago.

Lo he subido aquí: https://github.com/marcmayol/claude-code-social-publish-plugin #ClaudeCode"""


def test_texto_de_ia_suspende_y_avisa():
    r = humanizar.revisar(IA)
    assert r["puntos"] < 50
    avisos = " ".join(r["avisos"])
    for esperado in ("vertiginoso", "no es solo", "¿El resultado?", "raya", "5 hashtags", "emoji"):
        assert esperado in avisos


def test_texto_con_su_voz_aprueba_sin_avisos():
    r = humanizar.revisar(MARC)
    assert r["avisos"] == []
    assert r["puntos"] >= 90
    assert not r["cambiado"]


def test_quita_invisibles_y_negrita_unicode():
    r = humanizar.revisar("𝗘𝘀𝘁𝗼 es​ así")
    assert r["texto"] == "Esto es así"


def test_muletilla_con_sustituto_respeta_mayuscula():
    assert humanizar.limpiar("A día de hoy lo utilizo")[0] == "Hoy lo uso"


def test_no_toca_enlaces_ni_comillas_espanolas():
    t = "Lo dice «el README»: https://github.com/a/b"
    assert humanizar.limpiar(t)[0] == t


def test_tuit_corto_no_se_castiga_por_ritmo():
    assert humanizar.revisar("Mi plugin ya publica en Bluesky. Gratis.")["pruebas"]["ritmo"] == 100


def test_pregunta_retorica_tras_raya():
    avisos = humanizar.revisar("Esto lo cambia todo — ¿El resultado? Nada.")["avisos"]
    assert any("retórica" in a for a in avisos)
