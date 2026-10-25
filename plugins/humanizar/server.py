# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "mcp>=1.27,<2",
# ]
# ///
"""MCP server: limpia y puntúa textos en español para que no suenen a IA.

Todo es local (heurísticas de `humanizar.py`): no llama a ningún modelo ni a ninguna API.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from mcp.server.fastmcp import FastMCP

import humanizar as hum

mcp = FastMCP("humanizar")


@mcp.tool()
def humanizar(textos: list[str]) -> list[dict]:
    """Limpia y puntúa cada texto (0-100, más alto = más humano) antes de publicarlo.
    Arregla solo lo que no cambia el sentido (invisibles, letras Unicode de negrita,
    «a día de hoy» → «hoy»…) y devuelve `texto` ya limpio; lo que haya en `avisos`
    (relleno de IA, «no es solo X, es Y», rayas, muro de hashtags…) reescríbelo tú y
    vuelve a pasarlo. Publica el `texto` devuelto, no el original."""
    return [hum.revisar(t) for t in textos]


if __name__ == "__main__":
    mcp.run()
