//! `humanizar hook` with the events each agent sends, as its documentation shows them.

use serde_json::{Value, json};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

const BIN: &str = env!("CARGO_BIN_EXE_humanizar");

const POST: &str = "A día de hoy utilizo esto para mi equipo, destacando su compromiso con el producto que hacemos.";
const LIMPIO: &str = "Hoy uso esto para mi equipo, destacando su compromiso con el producto que hacemos.";

/// Runs the hook with `entrada` on stdin: what it printed (None if nothing) and that it exited 0.
fn hook(entrada: &str) -> Option<Value> {
    hook_con(entrada, &[])
}

fn hook_con(entrada: &str, env: &[(&str, &str)]) -> Option<Value> {
    let mut c = Command::new(BIN);
    c.arg("hook").env("HUMANIZAR_NO_LOG", "1").env_remove("HUMANIZAR_AUTO");
    for (k, v) in env {
        c.env(k, v);
    }
    let mut hijo = c.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
    hijo.stdin.take().unwrap().write_all(entrada.as_bytes()).unwrap();
    let s = hijo.wait_with_output().unwrap();
    assert!(s.status.success(), "the hook must always exit 0");
    assert!(s.stderr.is_empty(), "nothing on stderr: {}", String::from_utf8_lossy(&s.stderr));
    let fuera = String::from_utf8(s.stdout).unwrap();
    (!fuera.trim().is_empty()).then(|| serde_json::from_str(&fuera).expect("one JSON object"))
}

fn fichero(nombre: &str, contenido: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("humanizar-hook-{}", std::process::id()));
    std::fs::create_dir_all(&d).unwrap();
    let f = d.join(nombre);
    std::fs::write(&f, contenido).unwrap();
    f
}

#[test]
fn qwen_write_file_arregla_y_avisa() {
    let e = json!({ "hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "write_file", "tool_input": { "file_path": "/tmp/post.md", "content": POST } });
    let s = hook(&e.to_string()).expect("an answer");
    let h = &s["hookSpecificOutput"];
    assert_eq!(h["hookEventName"], "PreToolUse");
    // The whole input, not just the field: Qwen replaces it.
    assert_eq!(h["updatedInput"], json!({ "file_path": "/tmp/post.md", "content": LIMPIO }));
    let nota = h["additionalContext"].as_str().unwrap();
    assert!(nota.contains("«a día de hoy» → «hoy»"), "{nota}");
    assert!(nota.contains("gerundio"), "{nota}");
}

#[test]
fn qwen_edit_solo_el_texto_nuevo() {
    let f = fichero("guia.md", "# Guía\n\nEsta es la guía de la casa para todos los que vienen a pasar el verano.\n\nTexto viejo.\n");
    let e = json!({ "hook_event_name": "PreToolUse", "tool_name": "edit", "tool_input": { "file_path": f, "old_string": "Texto viejo.", "new_string": "A día de hoy la casa tiene wifi.", "replace_all": false } });
    let s = hook(&e.to_string()).expect("an answer");
    let i = &s["hookSpecificOutput"]["updatedInput"];
    assert_eq!(i["new_string"], "Hoy la casa tiene wifi.");
    assert_eq!(i["old_string"], "Texto viejo.");
    assert_eq!(i["replace_all"], false);
}

#[test]
fn una_edicion_dentro_de_un_bloque_de_codigo_no_se_toca() {
    let f = fichero("codigo.md", "Así se usa la herramienta en la casa de la playa con los niños:\n\n```\nantes\n```\n");
    let e = json!({ "hook_event_name": "PreToolUse", "tool_name": "edit", "tool_input": { "file_path": f, "old_string": "antes", "new_string": "a día de hoy" } });
    assert_eq!(hook(&e.to_string()), None);
}

#[test]
fn gemini_antes_arregla_y_despues_avisa() {
    let entrada = json!({ "file_path": "/tmp/post.md", "content": POST });
    let antes = hook(&json!({ "hook_event_name": "BeforeTool", "tool_name": "write_file", "tool_input": entrada }).to_string()).expect("BeforeTool");
    assert_eq!(antes, json!({ "hookSpecificOutput": { "hookEventName": "BeforeTool", "tool_input": { "file_path": "/tmp/post.md", "content": LIMPIO } } }));
    let despues = hook(&json!({ "hook_event_name": "AfterTool", "tool_name": "write_file", "tool_input": entrada, "tool_response": {} }).to_string()).expect("AfterTool");
    assert_eq!(despues["hookSpecificOutput"]["hookEventName"], "AfterTool");
    assert!(despues["hookSpecificOutput"]["additionalContext"].as_str().unwrap().contains("gerundio"));
}

#[test]
fn gemini_replace() {
    let f = fichero("notas.txt", "Notas de la reunión de la semana para el equipo de la oficina.\nPendiente.\n");
    let e = json!({ "hook_event_name": "BeforeTool", "tool_name": "replace", "tool_input": { "file_path": f, "instruction": "x", "old_string": "Pendiente.", "new_string": "A día de hoy, pendiente." } });
    let s = hook(&e.to_string()).expect("an answer");
    assert_eq!(s["hookSpecificOutput"]["tool_input"]["new_string"], "Hoy, pendiente.");
    assert_eq!(s["hookSpecificOutput"]["tool_input"]["instruction"], "x");
}

#[test]
fn antigravity_write_to_file() {
    let e = json!({ "toolCall": { "name": "write_to_file", "args": { "TargetFile": "/w/post.md", "Overwrite": true, "CodeContent": POST, "Description": "d" } }, "stepIdx": 3, "conversationId": "c" });
    let s = hook(&e.to_string()).expect("an answer");
    assert_eq!(s["decision"], "allow");
    // Antigravity merges `overwrite`: only what changes.
    assert_eq!(s["overwrite"], json!({ "CodeContent": LIMPIO }));
    assert!(s["reason"].as_str().unwrap().contains("gerundio"));
}

#[test]
fn antigravity_replace_file_content() {
    let f = fichero("web.html", "<html><body><p>Esta es la página de la casa de la playa para los niños.</p><p>X</p></body></html>");
    let e = json!({ "toolCall": { "name": "replace_file_content", "args": { "TargetFile": f, "TargetContent": "<p>X</p>", "ReplacementContent": "<p>A día de hoy está cerrada.</p>", "AllowMultiple": false } } });
    let s = hook(&e.to_string()).expect("an answer");
    assert_eq!(s["overwrite"], json!({ "ReplacementContent": "<p>Hoy está cerrada.</p>" }));
}

#[test]
fn antigravity_cli_write_file_y_edit_file() {
    // As `agy` 1.5 sends them: `write_file` and `edit_file` with its own argument names.
    let e = json!({ "hookEventName": "PreToolUse", "stepIdx": 2, "toolCall": { "id": "i", "name": "write_file", "args": { "Path": "/w/post.md", "Content": POST } } });
    let s = hook(&e.to_string()).expect("an answer");
    assert_eq!(s["decision"], "allow");
    assert_eq!(s["overwrite"], json!({ "Content": LIMPIO }));
    let f = fichero("cli.md", "# Nota\n\nEsta es la página de la casa de la playa para los niños.\n\nTexto viejo.\n");
    let e = json!({ "hookEventName": "PreToolUse", "toolCall": { "name": "edit_file", "args": { "Path": f, "Target": "Texto viejo.", "Replacement": "A día de hoy está cerrada." } } });
    let s = hook(&e.to_string()).expect("an answer");
    assert_eq!(s["overwrite"], json!({ "Replacement": "Hoy está cerrada." }));
    // Qwen's and Gemini's argument names under Antigravity's `write_file` are not its own: nothing.
    let e = json!({ "toolCall": { "name": "write_file", "args": { "file_path": "/w/post.md", "content": POST } } });
    assert_eq!(hook(&e.to_string()), None);
    // After the tool has run, Antigravity ignores the answer: say nothing.
    let e = json!({ "hookEventName": "PostToolUse", "toolCall": { "name": "write_file", "args": { "Path": "/w/post.md", "Content": POST } } });
    assert_eq!(hook(&e.to_string()), None);
}

#[test]
fn antigravity_pasa_la_nota_en_el_siguiente_pre_invocation() {
    // Antigravity doesn't show `reason` on an allowed call: the next PreInvocation hands it over, once.
    let id = format!("prueba-{}", std::process::id());
    let e = json!({ "hookEventName": "PreToolUse", "conversationId": id, "toolCall": { "name": "write_file", "args": { "Path": "/w/post.md", "Content": POST } } });
    let s = hook(&e.to_string()).expect("an answer");
    let nota = s["reason"].as_str().unwrap().to_string();
    let antes = json!({ "hookEventName": "PreInvocation", "conversationId": id, "invocationNum": 1, "initialNumSteps": 3 });
    let s = hook(&antes.to_string()).expect("the note");
    assert_eq!(s["injectSteps"][0]["ephemeralMessage"], nota.as_str());
    assert_eq!(hook(&antes.to_string()), None, "only once");
    // Another conversation gets nothing.
    let otra = json!({ "hookEventName": "PreInvocation", "conversationId": "otra", "invocationNum": 0 });
    assert_eq!(hook(&otra.to_string()), None);
}

#[test]
fn grok_en_camel_case() {
    // Grok sends camelCase keys; with a write tool name the agents document, it works the same.
    let e = json!({ "hook_event_name": "PreToolUse", "toolName": "write_file", "toolInput": { "file_path": "/tmp/post.md", "content": POST } });
    let s = hook(&e.to_string()).expect("an answer");
    assert_eq!(s["hookSpecificOutput"]["updatedInput"]["content"], LIMPIO);
}

#[test]
fn lo_que_no_es_texto_de_producto_no_contesta_nada() {
    let casos = [
        // Code.
        json!({ "hook_event_name": "PreToolUse", "tool_name": "write_file", "tool_input": { "file_path": "/tmp/main.rs", "content": POST } }),
        // The agents' own instructions.
        json!({ "hook_event_name": "PreToolUse", "tool_name": "write_file", "tool_input": { "file_path": "/tmp/AGENTS.md", "content": POST } }),
        json!({ "hook_event_name": "PreToolUse", "tool_name": "write_file", "tool_input": { "file_path": "/home/x/.claude/notas.md", "content": POST } }),
        // The instruction files that `humanizar setup` writes for each agent.
        json!({ "hook_event_name": "PreToolUse", "tool_name": "write_file", "tool_input": { "file_path": "/home/x/.qwen/QWEN.md", "content": POST } }),
        json!({ "hook_event_name": "PreToolUse", "tool_name": "write_file", "tool_input": { "file_path": "/p/QWEN.md", "content": POST } }),
        json!({ "hook_event_name": "BeforeTool", "tool_name": "write_file", "tool_input": { "file_path": "/p/GEMINI.md", "content": POST } }),
        json!({ "toolCall": { "name": "write_to_file", "args": { "TargetFile": "/home/x/.gemini/config/AGENTS.md", "CodeContent": POST } } }),
        json!({ "hook_event_name": "PreToolUse", "tool_name": "write_file", "tool_input": { "file_path": "/home/x/.kiro/steering/humanizar.md", "content": POST } }),
        json!({ "hook_event_name": "PreToolUse", "tool_name": "write_file", "tool_input": { "file_path": "/home/x/.devin/global_rules.md", "content": POST } }),
        json!({ "hook_event_name": "PreToolUse", "tool_name": "write_file", "tool_input": { "file_path": "/home/x/.codeium/windsurf/memories/global_rules.md", "content": POST } }),
        json!({ "hook_event_name": "PreToolUse", "tool_name": "write_file", "tool_input": { "file_path": "/p/.github/copilot-instructions.md", "content": POST } }),
        json!({ "hook_event_name": "PreToolUse", "tool_name": "write_file", "tool_input": { "file_path": "/home/x/.config/kilo/humanizar.md", "content": POST } }),
        // Another language.
        json!({ "hook_event_name": "PreToolUse", "tool_name": "write_file", "tool_input": { "file_path": "/tmp/a.md", "content": "This is a document in English, and it is not for the Spanish engine." } }),
        // Another tool.
        json!({ "hook_event_name": "PreToolUse", "tool_name": "run_shell_command", "tool_input": { "command": "ls" } }),
        // A tool whose arguments no agent documents.
        json!({ "hook_event_name": "PreToolUse", "tool_name": "search_replace", "tool_input": { "file_path": "/tmp/a.md", "content": POST } }),
        // Another event.
        json!({ "hook_event_name": "Stop", "tool_name": "write_file", "tool_input": { "file_path": "/tmp/a.md", "content": POST } }),
        // Clean text: nothing to fix and nothing to say.
        json!({ "hook_event_name": "PreToolUse", "tool_name": "write_file", "tool_input": { "file_path": "/tmp/a.md", "content": "Mañana a las 10 nos vemos en la oficina de Marc en Palma para revisar el plan." } }),
    ];
    for c in casos {
        assert_eq!(hook(&c.to_string()), None, "{c}");
    }
}

#[test]
fn nunca_rompe_al_agente() {
    for entrada in ["", "no es JSON", "[]", "null", "{\"tool_name\": 3}", "{\"tool_name\": \"write_file\", \"tool_input\": \"x\"}", "{\"toolCall\": {}}"] {
        assert_eq!(hook(entrada), None, "{entrada}");
    }
}

#[test]
fn se_apaga_con_humanizar_auto() {
    let e = json!({ "hook_event_name": "PreToolUse", "tool_name": "write_file", "tool_input": { "file_path": "/tmp/post.md", "content": POST } });
    assert_eq!(hook_con(&e.to_string(), &[("HUMANIZAR_AUTO", "0")]), None);
}
