mod log;
mod mcp;
mod motor;
mod setup;

use std::io::{ErrorKind, Read, Write};
use std::process::ExitCode;

const AYUDA: &str = "humanizar: clean and score Spanish text so it doesn't read like AI

Usage:
  humanizar setup <agent> [--dry-run]   Get an agent ready: MCP server, instructions, /humanizar
  humanizar setup --all [--dry-run]     The same, in every agent found on this computer
  humanizar mcp                         Run the MCP server over stdio (the agents start this)
  humanizar check [file]                Print the result for a file, or for stdin, as JSON
  humanizar log [--raw | --clear]       Which rules fire most, from what the agents sent to the tool
  humanizar --version

Agents: codex, gemini, cursor, opencode, qwen, kiro, copilot, windsurf, antigravity, kimi, pi, amp,
kilo, grok. In Claude Code use the plugin instead: /plugin install humanizar@drac
";

fn hacer_setup(args: &[String]) -> Result<(), String> {
    let simulacro = args.iter().any(|a| a == "--dry-run");
    let todos = args.iter().any(|a| a == "--all");
    let agentes: Vec<String> = if todos {
        setup::presentes()?.into_iter().map(String::from).collect()
    } else {
        args.iter().filter(|a| !a.starts_with("--")).cloned().collect()
    };
    if !todos && agentes.is_empty() {
        return Err(format!("which agent? {}, or --all", setup::AGENTES.join(", ")));
    }
    if todos && agentes.is_empty() {
        println!("No agent found on this computer. Name one: humanizar setup <agent>");
    }
    let mut fallos = 0;
    for agente in &agentes {
        if agente == "claude" {
            println!("claude: use the plugin: /plugin marketplace add marcmayol/drac-plugins, then /plugin install humanizar@drac");
            continue;
        }
        match setup::plan(agente) {
            Ok(cambios) if cambios.is_empty() => println!("{agente}: already set up"),
            Ok(cambios) => {
                println!("{agente}:");
                for c in &cambios {
                    println!("  {} ({})", c.fichero.display(), c.que);
                }
                if simulacro {
                    println!("  dry run: nothing written");
                } else if let Err(e) = setup::aplicar(&cambios) {
                    eprintln!("  {e}");
                    fallos += 1;
                } else {
                    println!("  done: start a new session of the agent");
                }
            }
            Err(e) => {
                eprintln!("{agente}: {e}");
                fallos += 1;
            }
        }
    }
    if fallos > 0 { Err(format!("{fallos} agent(s) failed")) } else { Ok(()) }
}

fn comprobar(args: &[String]) -> Result<(), String> {
    let bytes = match args.first() {
        Some(f) => std::fs::read(f).map_err(|e| format!("{f}: {e}"))?,
        None => {
            let mut b = Vec::new();
            std::io::stdin().read_to_end(&mut b).map_err(|e| e.to_string())?;
            b
        }
    };
    let texto = String::from_utf8(bytes).map_err(|_| "the text isn't UTF-8".to_string())?;
    imprimir(&serde_json::to_string_pretty(&motor::revisar(&texto)).map_err(|e| e.to_string())?)
}

// `println!` panics when the reader has gone, as with `humanizar check | grep -q x`.
fn imprimir(salida: &str) -> Result<(), String> {
    match writeln!(std::io::stdout(), "{salida}") {
        Err(e) if e.kind() != ErrorKind::BrokenPipe => Err(e.to_string()),
        _ => Ok(()),
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let resto = args.get(1..).unwrap_or_default();
    let r = match args.first().map(String::as_str) {
        Some("mcp") => mcp::servir().map_err(|e| e.to_string()),
        Some("setup") => hacer_setup(resto),
        Some("check") => comprobar(resto),
        Some("log") => log::mostrar(resto).and_then(|s| imprimir(&s)),
        Some("--version" | "-V") => {
            println!("humanizar {}", env!("CARGO_PKG_VERSION"));
            Ok(())
        }
        None | Some("--help" | "-h" | "help") => {
            print!("{AYUDA}");
            Ok(())
        }
        Some(otra) => Err(format!("unknown command «{otra}»\n\n{AYUDA}")),
    };
    match r {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("humanizar: {e}");
            ExitCode::FAILURE
        }
    }
}
