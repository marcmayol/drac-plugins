//! `humanizar hook`: the automatic mode for agents that run a command before writing a file.
//!
//! The agent sends its hook event as JSON on stdin. When the tool writes a document (.md, .txt,
//! .html…, never code or the agents' own instructions) and the text is Spanish, the hook
//! - fixes what doesn't change the meaning (invisible characters, Unicode bold, «a día de hoy»…)
//!   and gives the agent the arguments with the fix, and
//! - tells the model what to rewrite.
//!
//! Three dialects, all of them checked against each agent's documentation:
//! - Claude Code's, as Qwen Code speaks it: `tool_name` and `tool_input` in,
//!   `hookSpecificOutput.updatedInput` (the whole input) and `additionalContext` out.
//! - Gemini CLI's: `BeforeTool` returns `hookSpecificOutput.tool_input`; `AfterTool` returns the
//!   note for the model in `additionalContext` (BeforeTool can't send one).
//! - Antigravity's: `toolCall.name` and `toolCall.args` in; `decision`, `overwrite` (merged) and
//!   `reason` out. The model doesn't see `reason` on an allowed call, so the note also waits for the
//!   next `PreInvocation`, which hands it over as an `ephemeralMessage`.
//!
//! Anything else, or any error, ends with no output and exit 0: a hook must never stop the agent.

use crate::{log, producto};
use serde_json::{Map, Value, json};

/// A tool that writes a file: where its arguments are.
enum Herramienta {
    Escribir { ruta: &'static str, contenido: &'static str },
    Editar { ruta: &'static str, viejo: &'static str, nuevo: &'static str },
}

/// The write tools whose arguments the agents document. Antigravity reuses `write_file` with its
/// own argument names, so its calls are looked up apart.
fn herramienta(nombre: &str, antigravity: bool) -> Option<Herramienta> {
    use Herramienta::*;
    Some(match (antigravity, nombre) {
        // Qwen Code and Gemini CLI.
        (false, "write_file") => Escribir { ruta: "file_path", contenido: "content" },
        // Qwen Code (`edit`) and Gemini CLI (`replace`).
        (false, "edit" | "replace") => Editar { ruta: "file_path", viejo: "old_string", nuevo: "new_string" },
        // Antigravity's app and IDE.
        (true, "write_to_file") => Escribir { ruta: "TargetFile", contenido: "CodeContent" },
        (true, "replace_file_content") => Editar { ruta: "TargetFile", viejo: "TargetContent", nuevo: "ReplacementContent" },
        // Antigravity CLI (`agy`), as it sends them to the hook.
        (true, "write_file") => Escribir { ruta: "Path", contenido: "Content" },
        (true, "edit_file") => Editar { ruta: "Path", viejo: "Target", nuevo: "Replacement" },
        _ => return None,
    })
}

enum Dialecto {
    Claude,
    GeminiAntes,
    GeminiDespues,
    Antigravity,
}

/// What the hook found: the arguments with the fixes, if anything changed, and the note.
struct Resultado {
    cambios: Map<String, Value>,
    nota: Option<String>,
}

fn apagado() -> bool {
    matches!(std::env::var("HUMANIZAR_AUTO").as_deref(), Ok("0" | "off"))
}

fn texto<'a>(args: &'a Value, clave: &str) -> Option<&'a str> {
    args.get(clave).and_then(Value::as_str)
}

/// Works out the fixes and the note for a write tool call. `despues` is true when the tool has
/// already run (Gemini's AfterTool): the file then holds the new text, not the old one.
fn revisar(nombre: &str, args: &Value, despues: bool, antigravity: bool) -> Option<Resultado> {
    let h = herramienta(nombre, antigravity)?;
    match h {
        Herramienta::Escribir { ruta, contenido } => {
            let ruta_v = texto(args, ruta)?;
            let tipo = producto::tipo_de_fichero(ruta_v)?;
            let original = texto(args, contenido)?;
            let (arreglado, arreglos) = producto::arreglar(original, tipo);
            let textos = producto::textos(&arreglado, tipo);
            if !producto::es_espanol(&textos.join("\n")) {
                return None;
            }
            let inf = producto::informar(&textos, tipo, arreglos);
            log::anotar(&inf.revisiones);
            let mut cambios = Map::new();
            if arreglado != original {
                cambios.insert(contenido.into(), json!(arreglado));
            }
            Some(Resultado { cambios, nota: producto::mensaje(ruta_v, &inf) })
        }
        Herramienta::Editar { ruta, viejo, nuevo } => {
            let ruta_v = texto(args, ruta)?;
            let tipo = producto::tipo_de_fichero(ruta_v)?;
            let viejo_v = texto(args, viejo)?;
            let original = texto(args, nuevo)?;
            let fichero = std::fs::read_to_string(ruta_v).unwrap_or_default();
            // Before the edit the file holds the old text; after it, the new one.
            let buscado = if despues { original } else { viejo_v };
            if !buscado.is_empty() && producto::dentro_de_codigo(&fichero, buscado, tipo) {
                return None;
            }
            let (arreglado, arreglos) = producto::arreglar(original, tipo);
            let textos = producto::textos(&arreglado, tipo);
            let mut todo = producto::textos(&fichero, tipo);
            todo.extend(textos.iter().cloned());
            if !producto::es_espanol(&todo.join("\n")) {
                return None;
            }
            let mut inf = producto::informar(&textos, tipo, arreglos);
            // Coherence is looked at across the whole file, and only what this edit brings counts.
            if tipo == producto::Tipo::Html && !despues && !viejo_v.is_empty() && fichero.contains(viejo_v) {
                inf.coherencia = producto::coherencia_nueva(&fichero, &fichero.replacen(viejo_v, &arreglado, 1));
            }
            log::anotar(&inf.revisiones);
            let mut cambios = Map::new();
            if arreglado != original {
                cambios.insert(nuevo.into(), json!(arreglado));
            }
            Some(Resultado { cambios, nota: producto::mensaje(ruta_v, &inf) })
        }
    }
}

/// Antigravity doesn't show the model the `reason` of an allowed call, so the note waits here
/// until its next `PreInvocation`, which can add a message before the model is called.
fn pendiente(conversacion: &str) -> Option<std::path::PathBuf> {
    let limpio: String = conversacion.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').collect();
    (!limpio.is_empty()).then(|| std::env::temp_dir().join("humanizar-pendiente").join(format!("{limpio}.txt")))
}

fn guardar_nota(conversacion: &str, nota: &str) {
    use std::io::Write;
    let Some(f) = pendiente(conversacion) else { return };
    if let Some(d) = f.parent() {
        let _ = std::fs::create_dir_all(d);
    }
    if let Ok(mut h) = std::fs::OpenOptions::new().create(true).append(true).open(&f) {
        let _ = writeln!(h, "{nota}\n");
    }
}

/// The notes waiting for this conversation, handed over once.
fn sacar_notas(conversacion: &str) -> Option<String> {
    let f = pendiente(conversacion)?;
    let notas = std::fs::read_to_string(&f).ok()?;
    let _ = std::fs::remove_file(&f);
    let notas = notas.trim();
    (!notas.is_empty()).then(|| notas.to_string())
}

/// The hook's answer for one event, or None to say nothing.
pub fn responder(entrada: &Value) -> Option<Value> {
    if apagado() {
        return None;
    }
    let evento = entrada.get("hook_event_name").and_then(Value::as_str).unwrap_or("");
    let conversacion = entrada.get("conversationId").and_then(Value::as_str).unwrap_or("");
    if entrada.get("hookEventName").and_then(Value::as_str) == Some("PreInvocation") {
        let notas = sacar_notas(conversacion)?;
        return Some(json!({ "injectSteps": [{ "ephemeralMessage": notas }] }));
    }
    let (dialecto, nombre, args) = if let Some(llamada) = entrada.get("toolCall") {
        // Only before the tool runs: after it, Antigravity ignores the answer.
        if !matches!(entrada.get("hookEventName").and_then(Value::as_str), None | Some("PreToolUse")) {
            return None;
        }
        (Dialecto::Antigravity, llamada.get("name")?.as_str()?, llamada.get("args")?)
    } else {
        let nombre = entrada.get("tool_name").or_else(|| entrada.get("toolName"))?.as_str()?;
        let args = entrada.get("tool_input").or_else(|| entrada.get("toolInput"))?;
        let dialecto = match evento {
            "BeforeTool" => Dialecto::GeminiAntes,
            "AfterTool" => Dialecto::GeminiDespues,
            "PreToolUse" | "" => Dialecto::Claude,
            _ => return None,
        };
        (dialecto, nombre, args)
    };
    if !args.is_object() {
        return None;
    }
    let despues = matches!(dialecto, Dialecto::GeminiDespues);
    let r = revisar(nombre, args, despues, matches!(dialecto, Dialecto::Antigravity))?;
    let completo = || {
        let mut a = args.as_object().cloned().unwrap_or_default();
        a.extend(r.cambios.clone());
        Value::Object(a)
    };
    match dialecto {
        Dialecto::Claude => {
            let mut salida = Map::new();
            salida.insert("hookEventName".into(), json!("PreToolUse"));
            if !r.cambios.is_empty() {
                // The whole input: Qwen replaces it, it doesn't merge it.
                salida.insert("updatedInput".into(), completo());
            }
            if let Some(n) = &r.nota {
                salida.insert("additionalContext".into(), json!(n));
            }
            (salida.len() > 1).then(|| json!({ "hookSpecificOutput": salida }))
        }
        Dialecto::GeminiAntes => (!r.cambios.is_empty()).then(|| json!({ "hookSpecificOutput": { "hookEventName": "BeforeTool", "tool_input": completo() } })),
        Dialecto::GeminiDespues => r.nota.map(|n| json!({ "hookSpecificOutput": { "hookEventName": "AfterTool", "additionalContext": n } })),
        Dialecto::Antigravity => {
            if r.cambios.is_empty() && r.nota.is_none() {
                return None;
            }
            let mut salida = Map::new();
            salida.insert("decision".into(), json!("allow"));
            if !r.cambios.is_empty() {
                salida.insert("overwrite".into(), Value::Object(r.cambios));
            }
            if let Some(n) = r.nota {
                guardar_nota(conversacion, &n);
                salida.insert("reason".into(), json!(n));
            }
            Some(Value::Object(salida))
        }
    }
}

/// `humanizar hook`: reads the event from stdin and prints the answer, if there is one.
pub fn correr() {
    use std::io::{Read, Write};
    let mut b = Vec::new();
    if std::io::stdin().read_to_end(&mut b).is_err() {
        return;
    }
    let Ok(entrada) = serde_json::from_slice::<Value>(&b) else { return };
    if let Some(salida) = responder(&entrada) {
        let _ = writeln!(std::io::stdout(), "{salida}");
    }
}
