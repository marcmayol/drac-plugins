//! The log: which rules what the model writes keeps breaking, to see which ones repeat. Idea by
//! Edwin Jimenez. Keeps the date, the score and the rule names, never the text. One JSON per line
//! in ~/.humanizar/log.jsonl. The plugin does the same in plugins/humanizar/hooks/log.ts.

use crate::setup::casa;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const MAXIMO_LINEAS: usize = 5000;
const MAXIMO_BYTES: u64 = 2 * 1024 * 1024;

fn ruta() -> Result<PathBuf, String> {
    Ok(casa()?.join(".humanizar").join("log.jsonl"))
}

fn textos(v: &Value) -> impl Iterator<Item = &str> {
    v.as_array().into_iter().flatten().filter_map(Value::as_str)
}

/// The name of each rule that fired, without the figures or the advice in the warning.
fn reglas(r: &Value) -> Vec<String> {
    let mut salen: Vec<String> = textos(&r["arreglos"]).map(String::from).collect();
    for a in textos(&r["avisos"]) {
        if let Some(lista) = a.strip_prefix("relleno de IA: ") {
            for trozo in lista.split('«').skip(1) {
                if let Some((frase, _)) = trozo.split_once('»') {
                    salen.push(format!("relleno: «{frase}»"));
                }
            }
        } else {
            let sin_cifra = match a.split_once(' ') {
                Some((n, resto)) if !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()) => resto,
                _ => a,
            };
            salen.push(sin_cifra.split(':').next().unwrap_or(sin_cifra).to_string());
        }
    }
    salen
}

/// UTC, as `2026-11-02T01:40:00Z`. Days to date: Howard Hinnant's civil_from_days.
fn ahora() -> String {
    let s = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs()) as i64;
    let (dias, resto) = (s.div_euclid(86400), s.rem_euclid(86400));
    let z = dias + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", resto / 3600, resto / 60 % 60, resto % 60)
}

fn escribir(revisiones: &[Value]) -> Result<(), String> {
    let f = ruta()?;
    if let Some(d) = f.parent() {
        std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    let t = ahora();
    let mut lineas = String::new();
    for r in revisiones {
        lineas += &json!({ "t": t, "puntos": r["puntos"], "reglas": reglas(r) }).to_string();
        lineas.push('\n');
    }
    // One write in append mode, so two agents at once don't step on each other's lines.
    let mut fichero = std::fs::OpenOptions::new().create(true).append(true).open(&f).map_err(|e| e.to_string())?;
    fichero.write_all(lineas.as_bytes()).map_err(|e| e.to_string())?;
    if fichero.metadata().map_err(|e| e.to_string())?.len() > MAXIMO_BYTES {
        let todo = std::fs::read_to_string(&f).map_err(|e| e.to_string())?;
        let v: Vec<&str> = todo.lines().collect();
        let quedan = v[v.len().saturating_sub(MAXIMO_LINEAS)..].join("\n") + "\n";
        std::fs::write(&f, quedan).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Notes down what the tool has just answered. A log that fails must never break the tool.
pub fn anotar(revisiones: &[Value]) {
    if std::env::var_os("HUMANIZAR_NO_LOG").is_none() {
        let _ = escribir(revisiones);
    }
}

fn informe(entradas: &[Value]) -> String {
    if entradas.is_empty() {
        return "El log está vacío: se llena cada vez que la herramienta revisa un texto.".to_string();
    }
    let mut cuenta: HashMap<&str, usize> = HashMap::new();
    for e in entradas {
        for r in textos(&e["reglas"]) {
            *cuenta.entry(r).or_default() += 1;
        }
    }
    let mut orden: Vec<(&str, usize)> = cuenta.into_iter().collect();
    orden.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
    let tiene_algo = |e: &&Value| textos(&e["reglas"]).next().is_some();
    let fecha = |e: &Value| e["t"].as_str().unwrap_or_default().to_string();
    let primera = fecha(&entradas[0]);
    let cuantos = match entradas.len() {
        1 => "1 texto revisado".to_string(),
        n => format!("{n} textos revisados"),
    };
    let mut lineas = vec![format!(
        "{cuantos} desde {}; {} con algo que corregir.",
        primera.get(..10).unwrap_or(&primera),
        entradas.iter().filter(tiene_algo).count()
    )];
    if !orden.is_empty() {
        lineas.push(String::new());
        lineas.push("Reglas que más saltan:".to_string());
        lineas.extend(orden.iter().map(|(r, n)| format!("{n:>5}  {r}")));
    }
    lineas.push(String::new());
    lineas.push("Últimos:".to_string());
    for e in entradas.iter().rev().take(5) {
        let t = fecha(e);
        let cuando = format!("{} {}", t.get(..10).unwrap_or(&t), t.get(11..16).unwrap_or_default());
        let lista = textos(&e["reglas"]).collect::<Vec<_>>().join(", ");
        let lista = if lista.is_empty() { "sin avisos".to_string() } else { lista };
        lineas.push(format!("  {cuando}  nota {:>3}  {lista}", e["puntos"].as_i64().unwrap_or(0)));
    }
    lineas.join("\n")
}

/// `humanizar log`: the summary, the file as it is (`--raw`), or empty it (`--clear`).
pub fn mostrar(args: &[String]) -> Result<String, String> {
    let f = ruta()?;
    let leer = || match std::fs::read_to_string(&f) {
        Ok(t) => Ok(t),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(format!("{}: {e}", f.display())),
    };
    match args.first().map(String::as_str) {
        None => {
            let todo = leer()?;
            let entradas: Vec<Value> = todo.lines().filter_map(|l| serde_json::from_str(l).ok()).collect();
            Ok(format!("{}\n\nFichero: {}", informe(&entradas), f.display()))
        }
        Some("--raw") => Ok(leer()?.trim_end().to_string()),
        Some("--clear") => match std::fs::remove_file(&f) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(format!("{}: {e}", f.display())),
            _ => Ok("Log borrado.".to_string()),
        },
        Some(otra) => Err(format!("unknown option «{otra}»: humanizar log [--raw | --clear]")),
    }
}
