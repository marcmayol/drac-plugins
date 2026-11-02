//! A small MCP server over stdio: JSON-RPC, one message per line. One tool needs no SDK.

use crate::motor::revisar;
use serde_json::{Value, json};
use std::io::{BufRead, Write};

const VERSION_POR_DEFECTO: &str = "2025-06-18";

// The same text the Claude Code plugin registers.
const DESCRIPCION: &str = "Limpia y puntúa cada texto (0-100, más alto = más humano) antes de publicarlo.
Arregla solo lo que no cambia el sentido (invisibles, letras Unicode de negrita,
«a día de hoy» → «hoy»…) y devuelve `texto` ya limpio; lo que haya en `avisos`
(relleno de IA, «no es solo X, es Y», rayas, muro de hashtags…) reescríbelo tú y
vuelve a pasarlo. Publica el `texto` devuelto, no el original.";

fn herramienta() -> Value {
    json!({
        "name": "humanizar",
        "description": DESCRIPCION,
        "inputSchema": {
            "type": "object",
            "properties": { "textos": { "type": "array", "items": { "type": "string" }, "title": "Textos" } },
            "required": ["textos"],
        },
    })
}

fn llamar(params: &Value) -> Result<Value, (i64, String)> {
    let nombre = params["name"].as_str().unwrap_or_default();
    if nombre != "humanizar" {
        return Err((-32602, format!("unknown tool: {nombre}")));
    }
    let textos: Option<Vec<&str>> = params["arguments"]["textos"].as_array().and_then(|l| l.iter().map(Value::as_str).collect());
    Ok(match textos {
        Some(t) => {
            let result: Vec<Value> = t.into_iter().map(revisar).collect();
            crate::log::anotar(&result);
            json!({ "content": [{ "type": "text", "text": json!({ "result": result }).to_string() }], "isError": false })
        }
        None => json!({ "content": [{ "type": "text", "text": "humanizar: `textos` tiene que ser una lista de textos." }], "isError": true }),
    })
}

/// The answer to one message, or `None` for a notification.
pub fn responder(m: &Value) -> Option<Value> {
    let id = m.get("id").filter(|i| !i.is_null())?.clone();
    let metodo = m["method"].as_str().unwrap_or_default();
    let resultado = match metodo {
        "initialize" => Ok(json!({
            "protocolVersion": m["params"]["protocolVersion"].as_str().unwrap_or(VERSION_POR_DEFECTO),
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "humanizar", "version": env!("CARGO_PKG_VERSION") },
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": [herramienta()] })),
        "tools/call" => llamar(&m["params"]),
        otro => Err((-32601, format!("method not found: {otro}"))),
    };
    Some(match resultado {
        Ok(r) => json!({ "jsonrpc": "2.0", "id": id, "result": r }),
        Err((code, message)) => json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } }),
    })
}

pub fn servir() -> std::io::Result<()> {
    let entrada = std::io::stdin();
    let mut salida = std::io::stdout().lock();
    let mut linea = Vec::new();
    let mut lector = entrada.lock();
    loop {
        linea.clear();
        if lector.read_until(b'\n', &mut linea)? == 0 {
            return Ok(());
        }
        let texto = String::from_utf8_lossy(&linea);
        let texto = texto.trim_start_matches('\u{feff}').trim();
        if texto.is_empty() {
            continue;
        }
        let respuesta = match serde_json::from_str::<Value>(texto) {
            // Batches existed in the 2025-03-26 protocol, and some clients may still send them.
            Ok(Value::Array(lote)) => {
                let r: Vec<Value> = lote.iter().filter_map(responder).collect();
                if r.is_empty() { None } else { Some(Value::Array(r)) }
            }
            Ok(m) => responder(&m),
            Err(e) => Some(json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": e.to_string() } })),
        };
        if let Some(r) = respuesta {
            writeln!(salida, "{r}")?;
            salida.flush()?;
        }
    }
}
