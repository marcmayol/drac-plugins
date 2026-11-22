//! `humanizar setup <agent>`: registers the MCP server, a paragraph of instructions and a `/humanizar`
//! command, in the same 14 agents and the same files as `omoi setup` (see Omoikane's `src/agentes.rs`,
//! where each one's documentation is noted). Everything is worked out first, so `--dry-run` shows the
//! same plan; nothing is written twice, and each file touched gets a `.before-humanizar` copy once.

use serde_json::{Map, Value, json};
use std::path::{Path, PathBuf};

pub const AGENTES: &[&str] = &["codex", "gemini", "cursor", "opencode", "qwen", "kiro", "copilot", "windsurf", "antigravity", "kimi", "pi", "amp", "kilo", "grok"];

const INICIO: &str = "<!-- humanizar -->";
const FIN: &str = "<!-- /humanizar -->";
const INSTRUCCIONES: &str = "## Humanizar\n\nYou have the `humanizar` tool (MCP). Before delivering Spanish prose that other people will read (a post, an article, an email, a README), or when the user asks for it to stop sounding like AI, pass it through `humanizar`. Keep the `texto` it returns, rewrite only what `avisos` flags, and pass it again, two rounds at most. Deliver the last `texto` it returned. Don't invent figures or names to raise the score.\n\nReglas para el texto en español que se entrega a otra gente (documentos, posts, correos, textos de una interfaz o de un diseño), no para tus respuestas en el chat:\n- Al grano y concreto, sin inventar datos. Voz activa y con sujeto: «Tokimichi lo intentará otra vez», no «se volverá a intentar».\n- Una palabra para cada cosa: si un botón dice «Terminar», otro no dice «Finalizar».\n- Nada de «no es solo X, es Y», gerundios de relleno («…, destacando su compromiso»), importancia inflada («marca un hito»), fuentes vagas («los expertos coinciden»), preguntas retóricas, remates («Así de simple»), relleno («a día de hoy», «cabe destacar») ni rayas «—» como muletilla.\n- Si corriges un texto ajeno, haz la edición mínima y respeta su voz.";

const DESCRIPCION_ORDEN: &str = "Clean and score Spanish text so it doesn't read like AI";
const TEXTO_ORDEN: &str = "Pass the text the user wrote after this command, or the file they name, or the last text you wrote, through the `humanizar` tool (a list of texts; skip code, tables and front matter). Keep the `texto` it returns. If there are `avisos` or the score is under 80, rewrite only those sentences and pass it again, two rounds at most: say the idea directly instead of filler or «no es solo X, es Y», use a comma, full stop or brackets instead of em dashes, and add a figure, name or link only if the source has it. A `voz` of 60 means no first person: ignore it in impersonal text such as documentation. Deliver the last `texto` the tool returned and its score, and say which warning remains and why. Don't overwrite a file unless asked.";

pub struct Cambio {
    pub fichero: PathBuf,
    pub que: &'static str,
    pub contenido: String,
}

pub fn casa() -> Result<PathBuf, String> {
    if let Some(h) = std::env::var_os("HUMANIZAR_SETUP_HOME") {
        return Ok(PathBuf::from(h));
    }
    let v = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var_os(v).map(PathBuf::from).ok_or_else(|| format!("{v} isn't set: can't find the home folder"))
}

/// The running binary, with forward slashes: valid in every agent's config on every system.
fn binario() -> Result<String, String> {
    let b = std::env::current_exe().map_err(|e| e.to_string())?;
    Ok(b.to_string_lossy().replace('\\', "/"))
}

fn sin_probar() -> bool {
    std::env::var_os("HUMANIZAR_SETUP_HOME").is_none()
}

fn carpeta_opencode(h: &Path) -> PathBuf {
    match std::env::var_os("XDG_CONFIG_HOME") {
        Some(x) if sin_probar() => PathBuf::from(x).join("opencode"),
        _ => h.join(".config").join("opencode"),
    }
}

fn carpeta_grok(h: &Path) -> PathBuf {
    std::env::var_os("GROK_HOME").filter(|_| sin_probar()).map(PathBuf::from).unwrap_or_else(|| h.join(".grok"))
}

/// `%APPDATA%` on Windows, `~/.config` elsewhere.
fn config_sistema(h: &Path) -> PathBuf {
    if cfg!(windows) && sin_probar() {
        if let Some(a) = std::env::var_os("APPDATA") {
            return PathBuf::from(a);
        }
    }
    h.join(".config")
}

fn leer_json(f: &Path) -> Result<Value, String> {
    if !f.exists() {
        return Ok(json!({}));
    }
    let t = std::fs::read_to_string(f).map_err(|e| format!("{}: {e}", f.display()))?;
    let t = t.strip_prefix('\u{feff}').unwrap_or(&t);
    if t.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(t).map_err(|_| format!("{} isn't plain JSON (comments aren't supported): fix it or move it away first", f.display()))
}

fn objeto<'a>(v: &'a mut Value, clave: &str) -> &'a mut Map<String, Value> {
    if !v.get(clave).is_some_and(Value::is_object) {
        v[clave] = json!({});
    }
    v[clave].as_object_mut().expect("just made an object")
}

fn bonito(v: &Value) -> String {
    serde_json::to_string_pretty(v).expect("JSON") + "\n"
}

/// The JSON a file will hold: what an earlier change in this plan already left in it, or what is on disk.
/// That earlier change is taken out of the plan: the caller puts back the merged one.
fn base_json(v: &mut Vec<Cambio>, fichero: &Path) -> Result<(Value, &'static str), String> {
    if let Some(i) = v.iter().position(|c| c.fichero == fichero) {
        let c = v.remove(i);
        return Ok((serde_json::from_str(&c.contenido).map_err(|e| e.to_string())?, c.que));
    }
    Ok((leer_json(fichero)?, ""))
}

fn junto(antes: &'static str, ahora: &'static str) -> &'static str {
    match (antes, ahora) {
        ("", a) => a,
        ("MCP server", "hook") => "MCP server and hook",
        (a, _) => a,
    }
}

fn mcp_json(v: &mut Vec<Cambio>, fichero: PathBuf, raiz: &str, entrada: Value) -> Result<(), String> {
    let (mut j, antes) = base_json(v, &fichero)?;
    let servidores = objeto(&mut j, raiz);
    let nuevo = !servidores.contains_key("humanizar");
    if nuevo {
        servidores.insert("humanizar".into(), entrada);
    }
    if nuevo || !antes.is_empty() {
        v.push(Cambio { fichero, que: if nuevo { junto(antes, "MCP server") } else { antes }, contenido: bonito(&j) });
    }
    Ok(())
}

/// The command an agent runs for the hook.
fn orden_hook(bin: &str) -> String {
    format!("\"{bin}\" hook")
}

fn es_nuestro(h: &Value) -> bool {
    h.get("command").and_then(Value::as_str).is_some_and(|c| c.contains("humanizar") && c.trim_end().ends_with(" hook"))
}

/// A `PreToolUse`-style hook group in `settings.json`, as Qwen Code and Gemini CLI read it:
/// `hooks.<event>: [{ matcher, hooks: [{ type, command, … }] }]`.
fn hook_json(v: &mut Vec<Cambio>, fichero: PathBuf, eventos: &[&str], matcher: &str, extra: Value) -> Result<(), String> {
    let (mut j, antes) = base_json(v, &fichero)?;
    let bin = binario()?;
    let mut nuevo = false;
    for evento in eventos {
        let hooks = objeto(&mut j, "hooks");
        if !hooks.get(*evento).is_some_and(Value::is_array) {
            hooks.insert((*evento).into(), json!([]));
        }
        let grupos = hooks[*evento].as_array_mut().expect("just made a list");
        let ya = grupos.iter().any(|g| g.get("hooks").and_then(Value::as_array).is_some_and(|hs| hs.iter().any(es_nuestro)));
        if !ya {
            let mut h = json!({ "type": "command", "command": orden_hook(&bin), "name": "humanizar" });
            if let (Some(h), Some(e)) = (h.as_object_mut(), extra.as_object()) {
                h.extend(e.clone());
            }
            grupos.push(json!({ "matcher": matcher, "hooks": [h] }));
            nuevo = true;
        }
    }
    if nuevo || !antes.is_empty() {
        v.push(Cambio { fichero, que: if nuevo { junto(antes, "hook") } else { antes }, contenido: bonito(&j) });
    }
    Ok(())
}

/// Antigravity's `hooks.json`: hook names that map to their events.
fn hook_antigravity(v: &mut Vec<Cambio>, fichero: PathBuf) -> Result<(), String> {
    let (mut j, antes) = base_json(v, &fichero)?;
    let bin = binario()?;
    let o = j.as_object_mut().ok_or_else(|| format!("{} isn't a JSON object", fichero.display()))?;
    let nuevo = !o.contains_key("humanizar");
    if nuevo {
        o.insert(
            "humanizar".into(),
            json!({ "PreToolUse": [{ "matcher": "^(write_to_file|replace_file_content)$", "hooks": [{ "type": "command", "command": orden_hook(&bin), "timeout": 10 }] }] }),
        );
    }
    if nuevo || !antes.is_empty() {
        v.push(Cambio { fichero, que: if nuevo { junto(antes, "hook") } else { antes }, contenido: bonito(&j) });
    }
    Ok(())
}

fn toml_texto(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// `[mcp_servers.humanizar]` in Codex's or Grok's `config.toml`.
fn mcp_toml(v: &mut Vec<Cambio>, toml: PathBuf, bin: &str) -> Result<(), String> {
    let actual = if toml.exists() { std::fs::read_to_string(&toml).map_err(|e| format!("{}: {e}", toml.display()))? } else { String::new() };
    // Also when it's already an inline table: a second one would leave the file unreadable.
    let ya = actual.contains("[mcp_servers.humanizar]") || actual.lines().any(|l| l.trim_start().starts_with("humanizar") && l.contains('='));
    if !ya {
        let sep = if actual.is_empty() || actual.ends_with('\n') { "" } else { "\n" };
        let contenido = format!("{actual}{sep}\n[mcp_servers.humanizar]\ncommand = {}\nargs = [\"mcp\"]\n", toml_texto(bin));
        v.push(Cambio { fichero: toml, que: "MCP server", contenido });
    }
    Ok(())
}

fn instrucciones(v: &mut Vec<Cambio>, fichero: PathBuf) -> Result<(), String> {
    let actual = if fichero.exists() { std::fs::read_to_string(&fichero).map_err(|e| format!("{}: {e}", fichero.display()))? } else { String::new() };
    let bloque = format!("{INICIO}\n{INSTRUCCIONES}\n{FIN}");
    match (actual.find(INICIO), actual.find(FIN)) {
        // Already there: brought up to date if an older version wrote another text.
        (Some(i), Some(f)) if f > i => {
            let contenido = format!("{}{bloque}{}", &actual[..i], &actual[f + FIN.len()..]);
            if contenido != actual {
                v.push(Cambio { fichero, que: "instructions (updated)", contenido });
            }
        }
        (Some(_), _) => {}
        _ => {
            let sep = if actual.is_empty() || actual.ends_with("\n\n") { "" } else if actual.ends_with('\n') { "\n" } else { "\n\n" };
            v.push(Cambio { fichero, que: "instructions", contenido: format!("{actual}{sep}{bloque}\n") });
        }
    }
    Ok(())
}

enum Formato {
    /// Markdown, with a `description` on top if the agent takes one.
    Md(bool),
    /// Gemini CLI's TOML.
    Toml,
}

fn orden(v: &mut Vec<Cambio>, carpeta: PathBuf, formato: Formato) {
    let (ext, contenido) = match formato {
        Formato::Md(true) => ("md", format!("---\ndescription: {DESCRIPCION_ORDEN}\n---\n\n{TEXTO_ORDEN}\n")),
        Formato::Md(false) => ("md", format!("{TEXTO_ORDEN}\n")),
        Formato::Toml => ("toml", format!("description = {}\nprompt = {}\n", toml_texto(DESCRIPCION_ORDEN), toml_texto(TEXTO_ORDEN))),
    };
    let fichero = carpeta.join(format!("humanizar.{ext}"));
    if !fichero.exists() {
        v.push(Cambio { fichero, que: "/humanizar command", contenido });
    }
}

/// What would change for `agente`: empty if everything is already there.
pub fn plan(agente: &str) -> Result<Vec<Cambio>, String> {
    let h = casa()?;
    let bin = binario()?;
    let normal = json!({ "command": bin, "args": ["mcp"] });
    let local = json!({ "type": "local", "command": [bin, "mcp"], "enabled": true });
    let mut v = Vec::new();
    match agente {
        "codex" => {
            let d = h.join(".codex");
            mcp_toml(&mut v, d.join("config.toml"), &bin)?;
            instrucciones(&mut v, d.join("AGENTS.md"))?;
            orden(&mut v, d.join("prompts"), Formato::Md(true));
        }
        "gemini" => {
            let d = h.join(".gemini");
            mcp_json(&mut v, d.join("settings.json"), "mcpServers", normal)?;
            // BeforeTool fixes the arguments; AfterTool tells the model (BeforeTool can't). Timeout in ms.
            hook_json(&mut v, d.join("settings.json"), &["BeforeTool", "AfterTool"], "^(write_file|replace)$", json!({ "timeout": 10000 }))?;
            instrucciones(&mut v, d.join("GEMINI.md"))?;
            orden(&mut v, d.join("commands"), Formato::Toml);
        }
        "cursor" => {
            // Cursor has no global instructions file: the tool's description and the command do it.
            let d = h.join(".cursor");
            mcp_json(&mut v, d.join("mcp.json"), "mcpServers", json!({ "type": "stdio", "command": bin, "args": ["mcp"] }))?;
            orden(&mut v, d.join("commands"), Formato::Md(false));
        }
        "opencode" => {
            let d = carpeta_opencode(&h);
            mcp_json(&mut v, d.join("opencode.json"), "mcp", local)?;
            instrucciones(&mut v, d.join("AGENTS.md"))?;
            orden(&mut v, d.join("commands"), Formato::Md(true));
        }
        "qwen" => {
            let d = h.join(".qwen");
            mcp_json(&mut v, d.join("settings.json"), "mcpServers", normal)?;
            hook_json(&mut v, d.join("settings.json"), &["PreToolUse"], "^(write_file|edit)$", json!({ "timeout": 10 }))?;
            instrucciones(&mut v, d.join("QWEN.md"))?;
            orden(&mut v, d.join("commands"), Formato::Md(true));
        }
        "kiro" => {
            let d = h.join(".kiro");
            mcp_json(&mut v, d.join("settings").join("mcp.json"), "mcpServers", normal)?;
            instrucciones(&mut v, d.join("steering").join("humanizar.md"))?;
            orden(&mut v, d.join("prompts"), Formato::Md(false));
        }
        "copilot" => {
            let d = h.join(".copilot");
            mcp_json(&mut v, d.join("mcp-config.json"), "mcpServers", json!({ "type": "local", "command": bin, "args": ["mcp"], "tools": ["*"] }))?;
            instrucciones(&mut v, d.join("copilot-instructions.md"))?;
        }
        "windsurf" => {
            // The current docs (Devin Desktop) and Windsurf's usual path: both.
            let d = h.join(".codeium").join("windsurf");
            mcp_json(&mut v, config_sistema(&h).join("devin").join("mcp_config.json"), "mcpServers", normal.clone())?;
            mcp_json(&mut v, d.join("mcp_config.json"), "mcpServers", normal)?;
            instrucciones(&mut v, d.join("memories").join("global_rules.md"))?;
            // Devin (what Windsurf became) reads its global rules here.
            instrucciones(&mut v, h.join(".devin").join("global_rules.md"))?;
            orden(&mut v, d.join("global_workflows"), Formato::Md(true));
        }
        "antigravity" => {
            let d = h.join(".gemini").join("config");
            mcp_json(&mut v, d.join("mcp_config.json"), "mcpServers", normal)?;
            hook_antigravity(&mut v, d.join("hooks.json"))?;
            instrucciones(&mut v, d.join("AGENTS.md"))?;
        }
        "kimi" => {
            let d = h.join(".kimi-code");
            mcp_json(&mut v, d.join("mcp.json"), "mcpServers", normal)?;
            instrucciones(&mut v, d.join("AGENTS.md"))?;
        }
        "pi" => {
            let d = h.join(".pi").join("agent");
            mcp_json(&mut v, d.join("mcp.json"), "mcpServers", normal)?;
            instrucciones(&mut v, d.join("AGENTS.md"))?;
            orden(&mut v, d.join("prompts"), Formato::Md(true));
        }
        "amp" => {
            let d = h.join(".config").join("amp");
            mcp_json(&mut v, d.join("settings.json"), "amp.mcpServers", normal)?;
            instrucciones(&mut v, d.join("AGENTS.md"))?;
        }
        "kilo" => {
            // Kilo reads its rules from the files listed under `instructions`.
            let d = h.join(".config").join("kilo");
            let reglas = d.join("humanizar.md");
            let ruta = reglas.to_string_lossy().replace('\\', "/");
            let fichero = d.join("kilo.jsonc");
            let mut j = leer_json(&fichero)?;
            let servidores = objeto(&mut j, "mcp");
            let a = !servidores.contains_key("humanizar");
            if a {
                servidores.insert("humanizar".into(), local);
            }
            if !j.get("instructions").is_some_and(Value::is_array) {
                j["instructions"] = json!([]);
            }
            let lista = j["instructions"].as_array_mut().expect("just made a list");
            let b = !lista.iter().any(|x| x.as_str() == Some(ruta.as_str()));
            if b {
                lista.push(json!(ruta));
            }
            if a || b {
                v.push(Cambio { fichero, que: "MCP server and instructions", contenido: bonito(&j) });
            }
            instrucciones(&mut v, reglas)?;
            orden(&mut v, d.join("commands"), Formato::Md(true));
        }
        "grok" => {
            let d = carpeta_grok(&h);
            mcp_toml(&mut v, d.join("config.toml"), &bin)?;
            instrucciones(&mut v, d.join("rules").join("humanizar.md"))?;
            orden(&mut v, d.join("commands"), Formato::Md(true));
        }
        otro => return Err(format!("unknown agent «{otro}»: claude, {}", AGENTES.join(", "))),
    }
    Ok(v)
}

/// The agents that seem to be on this computer: their configuration folder exists.
pub fn presentes() -> Result<Vec<&'static str>, String> {
    let h = casa()?;
    let carpeta = |a: &str| match a {
        "codex" => h.join(".codex"),
        "gemini" => h.join(".gemini"),
        "cursor" => h.join(".cursor"),
        "opencode" => carpeta_opencode(&h),
        "qwen" => h.join(".qwen"),
        "kiro" => h.join(".kiro"),
        "copilot" => h.join(".copilot"),
        "windsurf" => h.join(".codeium").join("windsurf"),
        "antigravity" => h.join(".gemini").join("config"),
        "kimi" => h.join(".kimi-code"),
        "pi" => h.join(".pi"),
        "amp" => h.join(".config").join("amp"),
        "kilo" => h.join(".config").join("kilo"),
        _ => carpeta_grok(&h),
    };
    Ok(AGENTES.iter().copied().filter(|a| carpeta(a).is_dir()).collect())
}

pub fn aplicar(cambios: &[Cambio]) -> Result<(), String> {
    for c in cambios {
        let error = |e: std::io::Error| format!("{}: {e}", c.fichero.display());
        if let Some(d) = c.fichero.parent() {
            std::fs::create_dir_all(d).map_err(error)?;
        }
        if c.fichero.exists() {
            let nombre = c.fichero.file_name().unwrap_or_default().to_string_lossy();
            let copia = c.fichero.with_file_name(format!("{nombre}.before-humanizar"));
            if !copia.exists() {
                std::fs::copy(&c.fichero, &copia).map_err(error)?;
            }
        }
        std::fs::write(&c.fichero, &c.contenido).map_err(error)?;
    }
    Ok(())
}
