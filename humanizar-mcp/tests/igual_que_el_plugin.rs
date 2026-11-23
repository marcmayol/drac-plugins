//! Runs the real binary: the same answers as the TypeScript engine, the MCP conversation an agent
//! has with it, and `setup` for every agent in a throwaway home folder.

use serde_json::{Value, json};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

const BIN: &str = env!("CARGO_BIN_EXE_humanizar");
const AGENTES: &[&str] = &["codex", "gemini", "cursor", "opencode", "qwen", "kiro", "copilot", "windsurf", "antigravity", "kimi", "pi", "amp", "kilo", "grok"];

fn conversacion(mensajes: &[Value]) -> Vec<Value> {
    conversacion_en(&std::env::temp_dir().join("humanizar-test-log"), mensajes)
}

fn conversacion_en(casa: &PathBuf, mensajes: &[Value]) -> Vec<Value> {
    let mut hijo = Command::new(BIN).arg("mcp").env("HUMANIZAR_SETUP_HOME", casa).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
    let mut entrada = hijo.stdin.take().unwrap();
    for m in mensajes {
        writeln!(entrada, "{m}").unwrap();
    }
    drop(entrada);
    let salida = hijo.wait_with_output().unwrap();
    assert!(salida.status.success());
    String::from_utf8(salida.stdout).unwrap().lines().map(|l| serde_json::from_str(l).unwrap()).collect()
}

fn casa(nombre: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("humanizar-test-{nombre}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn setup(casa: &PathBuf, agente: &str) -> String {
    let s = Command::new(BIN).args(["setup", agente]).env("HUMANIZAR_SETUP_HOME", casa).output().unwrap();
    assert!(s.status.success(), "{agente}: {}", String::from_utf8_lossy(&s.stderr));
    String::from_utf8(s.stdout).unwrap()
}

#[test]
fn responde_igual_que_el_motor_de_typescript() {
    let golden: Vec<Value> = serde_json::from_str(include_str!("golden.json")).unwrap();
    let textos: Vec<&str> = golden.iter().map(|g| g["entrada"].as_str().unwrap()).collect();
    let r = conversacion(&[json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": "humanizar", "arguments": { "textos": textos } } })]);
    let texto = r[0]["result"]["content"][0]["text"].as_str().unwrap();
    let salida: Value = serde_json::from_str(texto).unwrap();
    let salida = salida["result"].as_array().unwrap();
    assert_eq!(salida.len(), golden.len());
    for (g, s) in golden.iter().zip(salida) {
        assert_eq!(&g["salida"], s, "\ntext: {:?}", g["entrada"]);
    }
}

fn log(casa: &PathBuf, args: &[&str]) -> String {
    let s = Command::new(BIN).arg("log").args(args).env("HUMANIZAR_SETUP_HOME", casa).output().unwrap();
    assert!(s.status.success(), "{}", String::from_utf8_lossy(&s.stderr));
    String::from_utf8(s.stdout).unwrap()
}

fn llamada(textos: &[&str]) -> Value {
    json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": "humanizar", "arguments": { "textos": textos } } })
}

#[test]
fn el_log_anota_las_mismas_reglas_que_el_plugin_y_nunca_el_texto() {
    let h = casa("log");
    let golden: Vec<Value> = serde_json::from_str(include_str!("golden.json")).unwrap();
    let textos: Vec<&str> = golden.iter().map(|g| g["entrada"].as_str().unwrap()).collect();
    conversacion_en(&h, &[llamada(&textos)]);
    let crudo = log(&h, &["--raw"]);
    let lineas: Vec<Value> = crudo.lines().map(|l| serde_json::from_str(l).unwrap()).collect();
    assert_eq!(lineas.len(), golden.len());
    for (g, l) in golden.iter().zip(&lineas) {
        assert_eq!(g["reglas"], l["reglas"], "\ntext: {:?}", g["entrada"]);
        assert_eq!(g["salida"]["puntos"], l["puntos"]);
    }
    let secreto = "Esto es secreto: mi clave 12345 — ya sabes.";
    conversacion_en(&h, &[llamada(&[secreto])]);
    assert!(!log(&h, &["--raw"]).contains("secreto"));
    let _ = std::fs::remove_dir_all(&h);
}

#[test]
fn el_log_se_resume_se_borra_y_se_puede_apagar() {
    let h = casa("resumen");
    assert!(log(&h, &[]).contains("vacío"));
    conversacion_en(&h, &[llamada(&["Esto va bien — pero lleva una raya, y otra — aquí.", "Mi plugin ya publica en Bluesky. Gratis."])]);
    let resumen = log(&h, &[]);
    assert!(resumen.contains("2 textos revisados"), "{resumen}");
    assert!(resumen.contains("raya(s) «—»"), "{resumen}");
    assert!(resumen.contains("log.jsonl"), "{resumen}");
    log(&h, &["--clear"]);
    assert!(log(&h, &[]).contains("vacío"));

    conversacion_en(&h, &[llamada(&["Mi plugin ya publica en Bluesky. Gratis."])]);
    assert!(log(&h, &[]).contains("1 texto revisado desde"), "a single text reads in the singular");
    log(&h, &["--clear"]);

    let mut hijo = Command::new(BIN).arg("mcp").env("HUMANIZAR_SETUP_HOME", &h).env("HUMANIZAR_NO_LOG", "1").stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
    writeln!(hijo.stdin.take().unwrap(), "{}", llamada(&["Una raya — aquí."])).unwrap();
    assert!(hijo.wait_with_output().unwrap().status.success());
    assert!(log(&h, &[]).contains("vacío"));
    let _ = std::fs::remove_dir_all(&h);
}

#[test]
fn check_no_se_cae_si_el_lector_se_va() {
    let mut hijo = Command::new(BIN).arg("check").stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
    drop(hijo.stdout.take());
    hijo.stdin.take().unwrap().write_all("A día de hoy lo utilizo.".as_bytes()).unwrap();
    let salida = hijo.wait_with_output().unwrap();
    assert!(salida.status.success(), "{}", String::from_utf8_lossy(&salida.stderr));
}

#[test]
fn habla_mcp() {
    let r = conversacion(&[
        json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": { "name": "t", "version": "0" } } }),
        json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
        json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }),
        json!({ "jsonrpc": "2.0", "id": 3, "method": "ping" }),
        json!({ "jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": { "name": "humanizar", "arguments": { "textos": "no es una lista" } } }),
        json!({ "jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": { "name": "otra", "arguments": {} } }),
        json!({ "jsonrpc": "2.0", "id": 6, "method": "resources/list" }),
    ]);
    assert_eq!(r.len(), 6, "the notification gets no answer");
    assert_eq!(r[0]["result"]["protocolVersion"], "2025-03-26");
    assert_eq!(r[1]["result"]["tools"][0]["name"], "humanizar");
    assert_eq!(r[2]["result"], json!({}));
    assert_eq!(r[3]["result"]["isError"], true);
    assert_eq!(r[4]["error"]["code"], -32602);
    assert_eq!(r[5]["error"]["code"], -32601);
}

#[test]
fn setup_deja_cada_agente_listo_sin_repetir() {
    let h = casa("todos");
    for a in AGENTES {
        assert!(!setup(&h, a).contains("already"), "{a}");
        assert!(setup(&h, a).contains("already set up"), "{a}: the second run changes nothing");
    }
    // Every JSON still parses and names the server with its `mcp` argument.
    for (f, ruta) in [
        (".gemini/settings.json", "/mcpServers/humanizar/args/0"),
        (".cursor/mcp.json", "/mcpServers/humanizar/args/0"),
        (".config/opencode/opencode.json", "/mcp/humanizar/command/1"),
        (".qwen/settings.json", "/mcpServers/humanizar/args/0"),
        (".kiro/settings/mcp.json", "/mcpServers/humanizar/args/0"),
        (".copilot/mcp-config.json", "/mcpServers/humanizar/args/0"),
        (".codeium/windsurf/mcp_config.json", "/mcpServers/humanizar/args/0"),
        (".config/devin/mcp_config.json", "/mcpServers/humanizar/args/0"),
        (".gemini/config/mcp_config.json", "/mcpServers/humanizar/args/0"),
        (".kimi-code/mcp.json", "/mcpServers/humanizar/args/0"),
        (".pi/agent/mcp.json", "/mcpServers/humanizar/args/0"),
        (".config/amp/settings.json", "/amp.mcpServers/humanizar/args/0"),
        (".config/kilo/kilo.jsonc", "/mcp/humanizar/command/1"),
    ] {
        let j: Value = serde_json::from_str(&std::fs::read_to_string(h.join(f)).unwrap()).unwrap();
        assert_eq!(j.pointer(ruta), Some(&json!("mcp")), "{f}");
    }
    for f in [".codex/config.toml", ".grok/config.toml"] {
        assert!(std::fs::read_to_string(h.join(f)).unwrap().contains("[mcp_servers.humanizar]"), "{f}");
    }
    for f in [".codex/prompts/humanizar.md", ".gemini/commands/humanizar.toml", ".cursor/commands/humanizar.md", ".kiro/steering/humanizar.md", ".grok/rules/humanizar.md"] {
        assert!(h.join(f).exists(), "{f}");
    }
    let _ = std::fs::remove_dir_all(&h);
}

#[test]
fn setup_conecta_el_hook_donde_el_agente_lo_admite() {
    let h = casa("hooks");
    for a in AGENTES {
        setup(&h, a);
    }
    let leer = |f: &str| -> Value { serde_json::from_str(&std::fs::read_to_string(h.join(f)).unwrap()).unwrap() };
    let orden = |v: &Value| v.as_str().unwrap().to_string();
    let q = leer(".qwen/settings.json");
    assert_eq!(q["hooks"]["PreToolUse"][0]["matcher"], "^(write_file|edit)$");
    // `humanizar.exe` on Windows.
    let o = orden(&q["hooks"]["PreToolUse"][0]["hooks"][0]["command"]);
    assert!(o.ends_with("humanizar\" hook") || o.ends_with("humanizar.exe\" hook"), "{o}");
    assert!(q["mcpServers"]["humanizar"].is_object(), "the MCP server and the hook in the same file");
    let g = leer(".gemini/settings.json");
    for e in ["BeforeTool", "AfterTool"] {
        assert_eq!(g["hooks"][e][0]["matcher"], "^(write_file|replace)$", "{e}");
    }
    let ag = leer(".gemini/config/hooks.json");
    assert_eq!(ag["humanizar"]["PreToolUse"][0]["matcher"], "^(write_to_file|replace_file_content|write_file|edit_file)$");
    assert!(ag["humanizar"]["PreInvocation"][0]["command"].as_str().unwrap().ends_with(" hook"));
    // Devin (what Windsurf became) gets the rules too.
    assert!(std::fs::read_to_string(h.join(".devin/global_rules.md")).unwrap().contains("<!-- humanizar -->"));
    // The product rules go with the instructions.
    assert!(std::fs::read_to_string(h.join(".qwen/QWEN.md")).unwrap().contains("Una palabra para cada cosa"));
    // Never in Claude Code's settings: other agents read them too, in another format.
    assert!(!h.join(".claude").exists());
    let _ = std::fs::remove_dir_all(&h);
}

#[test]
fn setup_pone_al_dia_las_instrucciones_de_una_version_anterior() {
    let h = casa("al-dia");
    let d = h.join(".qwen");
    std::fs::create_dir_all(&d).unwrap();
    std::fs::write(d.join("QWEN.md"), "Mías\n\n<!-- humanizar -->\n## Humanizar\n\nTexto viejo.\n<!-- /humanizar -->\n\nMás mías\n").unwrap();
    setup(&h, "qwen");
    let md = std::fs::read_to_string(d.join("QWEN.md")).unwrap();
    assert!(md.starts_with("Mías\n\n<!-- humanizar -->\n## Humanizar"));
    assert!(md.ends_with("<!-- /humanizar -->\n\nMás mías\n"));
    assert!(!md.contains("Texto viejo") && md.contains("Una palabra para cada cosa"));
    assert_eq!(md.matches("<!-- humanizar -->").count(), 1);
    assert!(setup(&h, "qwen").contains("already set up"));
    let _ = std::fs::remove_dir_all(&h);
}

#[test]
fn respeta_lo_que_ya_habia_y_guarda_copia() {
    let h = casa("respeta");
    let d = h.join(".gemini");
    std::fs::create_dir_all(&d).unwrap();
    std::fs::write(d.join("settings.json"), "\u{feff}{\"theme\":\"x\",\"mcpServers\":{\"omoikane\":{\"command\":\"omoi\"}}}").unwrap();
    std::fs::write(d.join("GEMINI.md"), "Mis reglas\n").unwrap();
    setup(&h, "gemini");
    let j: Value = serde_json::from_str(&std::fs::read_to_string(d.join("settings.json")).unwrap()).unwrap();
    assert_eq!(j["theme"], "x");
    assert_eq!(j["mcpServers"]["omoikane"]["command"], "omoi");
    assert!(j["mcpServers"]["humanizar"].is_object());
    assert!(d.join("settings.json.before-humanizar").exists());
    let md = std::fs::read_to_string(d.join("GEMINI.md")).unwrap();
    assert!(md.starts_with("Mis reglas\n\n<!-- humanizar -->"));
    let _ = std::fs::remove_dir_all(&h);
}

#[test]
fn un_json_con_comentarios_no_se_pisa() {
    let h = casa("comentarios");
    let d = h.join(".cursor");
    std::fs::create_dir_all(&d).unwrap();
    let original = "// mío\n{}\n";
    std::fs::write(d.join("mcp.json"), original).unwrap();
    let s = Command::new(BIN).args(["setup", "cursor"]).env("HUMANIZAR_SETUP_HOME", &h).output().unwrap();
    assert!(!s.status.success());
    assert_eq!(std::fs::read_to_string(d.join("mcp.json")).unwrap(), original);
    let _ = std::fs::remove_dir_all(&h);
}

#[test]
fn dry_run_no_escribe() {
    let h = casa("simulacro");
    let s = Command::new(BIN).args(["setup", "codex", "--dry-run"]).env("HUMANIZAR_SETUP_HOME", &h).output().unwrap();
    assert!(s.status.success());
    assert!(String::from_utf8_lossy(&s.stdout).contains("dry run"));
    assert!(!h.join(".codex").exists());
    let _ = std::fs::remove_dir_all(&h);
}

#[test]
fn avisa_de_palabras_distintas_para_lo_mismo_entre_textos() {
    let r = conversacion(&[llamada(&["Finalizar día", "Día terminado", "Tu teléfono", "Subir del móvil"])]);
    let salida: Value = serde_json::from_str(r[0]["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(salida["coherencia"], json!([
        "mezcla «finalizar» (texto 1) y «terminar» (texto 2): usa una sola palabra para lo mismo",
        "mezcla «teléfono» (texto 3) y «móvil» (texto 4): usa una sola palabra para lo mismo",
    ]));
    let solo = conversacion(&[llamada(&["Finalizar día y terminar"])]);
    let salida: Value = serde_json::from_str(solo[0]["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert!(salida.get("coherencia").is_none(), "one text alone is never checked");
    let citas = conversacion(&[llamada(&["«Finalizar» en un botón y «Terminar» en otro: te avisa.", "Emails y WhatsApp"])]);
    let salida: Value = serde_json::from_str(citas[0]["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert!(salida.get("coherencia").is_none(), "words in quotes are examples, and both in one text is not a mix");
}
