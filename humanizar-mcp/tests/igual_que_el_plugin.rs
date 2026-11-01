//! Runs the real binary: the same answers as the TypeScript engine, the MCP conversation an agent
//! has with it, and `setup` for every agent in a throwaway home folder.

use serde_json::{Value, json};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

const BIN: &str = env!("CARGO_BIN_EXE_humanizar");
const AGENTES: &[&str] = &["codex", "gemini", "cursor", "opencode", "qwen", "kiro", "copilot", "windsurf", "antigravity", "kimi", "pi", "amp", "kilo", "grok"];

fn conversacion(mensajes: &[Value]) -> Vec<Value> {
    let mut hijo = Command::new(BIN).arg("mcp").stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
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
