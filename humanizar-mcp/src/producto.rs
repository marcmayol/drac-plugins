//! What «product text» is and how to take it out of a document without touching the code: the
//! part of the plugin's `hooks/producto.ts` that `humanizar hook` needs. The golden test
//! (`tests/producto.json`, made by `generar_golden.mjs`) checks both give the same answers.
//!
//! Product text is what is handed over for other people to read: a document, a post, an email,
//! the texts of a page. Inside it, only the prose: code blocks, inline code, links, tags,
//! `<script>` and `<style>` and hard spaces stay as they are. And only Spanish: the engine only
//! knows Spanish.

use crate::motor;
use fancy_regex::Regex;
use serde_json::Value;
use std::sync::LazyLock;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Tipo {
    Md,
    Html,
    Texto,
}

pub struct Hallazgo {
    pub trozo: String,
    pub avisos: Vec<String>,
}

pub struct Informe {
    pub arreglos: Vec<String>,
    pub hallazgos: Vec<Hallazgo>,
    pub coherencia: Vec<String>,
    pub revisiones: Vec<Value>,
}

fn re(p: &str) -> Regex {
    Regex::new(p).expect("valid pattern")
}

struct Reglas {
    documento: Regex,
    de_agentes: Regex,
    html: Regex,
    texto: Regex,
    protegido: Regex,
    valla: Regex,
    sangrado_md: Regex,
    sangrado: Regex,
    bloques_html: Regex,
    etiqueta: Regex,
    etiqueta_grupo: Regex,
    entidad: Regex,
    atributo: Regex,
    espacios: Regex,
    letra: Regex,
    codigo_linea: Regex,
    enlace_md: Regex,
    url: Regex,
    suelto: Regex,
    marca_suelto: Regex,
    cita: Regex,
    es: Regex,
    en: Regex,
    nunca: Regex,
    no_en_interfaz: Regex,
    no_en_documento: Regex,
    valla_de_linea: Regex,
    numeros: Regex,
}

static R: LazyLock<Reglas> = LazyLock::new(|| Reglas {
    documento: re(r"(?i)\.(?:md|mdx|markdown|txt|html?|rst|adoc|eml)$"),
    // Instructions for agents and memories: not product, and rewriting them changes how agents work.
    de_agentes: re(r"(?i)(?:^|[\\/])(?:CLAUDE|AGENTS|GEMINI|SKILL|MEMORY)\.md$|(?:^|[\\/])\.(?:claude|codex|gemini|cursor|agents)[\\/]|[\\/]memory[\\/]|[\\/]node_modules[\\/]"),
    html: re(r"(?i)\.html?$"),
    texto: re(r"(?i)\.(?:txt|eml)$"),
    protegido: re("`[^`\\n]*`|\\]\\([^)\\s]*\\)|https?://\\S+|<[^>\\n]*>|&[a-z#0-9]+;|[\u{a0}\u{202f}]|(?:\\p{Extended_Pictographic}\u{fe0f}?\u{200d})+\\p{Extended_Pictographic}\u{fe0f}?"),
    valla: re(r"^\s*(?:```|~~~)"),
    sangrado_md: re(r"^(?: {4}|\t)(?!\s*(?:[-*+]|\d+\.)\s)"),
    sangrado: re(r"^(?: {4}|\t)"),
    bloques_html: re(r"(?i)<(script|style|code|pre|textarea)\b[^>]*>[\s\S]*?</\1\s*>|<!--[\s\S]*?-->"),
    etiqueta: re(r"<[^>]*>"),
    etiqueta_grupo: re(r"(<[^>]*>)"),
    entidad: re(r"(?i)&(#x?[0-9a-f]+|[a-z]+);"),
    atributo: re(r#"(?i)\b(?:alt|title|placeholder|aria-label)\s*=\s*"([^"]*)""#),
    espacios: re(r"\s+"),
    letra: re(r"\p{L}"),
    codigo_linea: re("`[^`\\n]*`"),
    enlace_md: re(r"!?\[([^\]]*)\]\([^)]*\)"),
    url: re(r"https?://\S+"),
    suelto: re(r"^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\|)"),
    marca_suelto: re(r"^(?:#{1,6}|[-*+]|\d+[.)])\s+"),
    cita: re(r"^>\s?"),
    es: re(r"(?iu)(?<![\p{L}])(?:de|la|que|el|en|y|los|se|del|las|un|por|con|una|su|para|es|al|lo|como|más|pero|sus|le|ya|o|este|sí|porque|esta|cuando|muy|sin|sobre|también|me|hasta|hay|donde|desde|todo|nos|durante|uno|ni|contra|ese|eso|mí|qué|otro|él|cual|poco|ella|estar|estas|algunas|algo|nosotros|tu|tus|te|tú|puedes|aquí)(?![\p{L}])"),
    en: re(r"(?iu)(?<![\p{L}])(?:the|and|of|to|is|in|that|it|for|with|as|was|on|are|be|this|by|you|or|from|at|have|an|not|your|can|will|but|we|they|which|their|has|if|its|would|what|all|when|there|been|more)(?![\p{L}])"),
    nunca: re(r"^(?:poco concreto|todas las frases miden parecido)"),
    no_en_interfaz: re(r"^(?:pregunta retórica|pregunta de cebo|\d+ emojis|empieza con emoji|markdown|\d+ hashtags)"),
    no_en_documento: re(r"^markdown"),
    valla_de_linea: re(r"(?m)^\s*(?:```|~~~)"),
    numeros: re(r" \([^)]*\)"),
});

fn hay(r: &Regex, s: &str) -> bool {
    r.is_match(s).unwrap_or(false)
}

fn cuantos(r: &Regex, s: &str) -> usize {
    r.find_iter(s).flatten().count()
}

fn cambiar(r: &Regex, s: &str, por: &str) -> String {
    r.replace_all(s, por).into_owned()
}

/// Splits `s` around every match of `r`, like JavaScript's `split` with a capture group: the
/// pieces between matches at even positions, the matches at odd ones.
fn partir(r: &Regex, s: &str) -> Vec<(bool, String)> {
    let mut v = Vec::new();
    let mut ultimo = 0;
    for m in r.find_iter(s).flatten() {
        v.push((false, s[ultimo..m.start()].to_string()));
        v.push((true, m.as_str().to_string()));
        ultimo = m.end();
    }
    v.push((false, s[ultimo..].to_string()));
    v
}

/// The type of a document file, or None if it isn't product text.
pub fn tipo_de_fichero(ruta: &str) -> Option<Tipo> {
    if !hay(&R.documento, ruta) || hay(&R.de_agentes, ruta) {
        return None;
    }
    if hay(&R.html, ruta) {
        Some(Tipo::Html)
    } else if hay(&R.texto, ruta) {
        Some(Tipo::Texto)
    } else {
        Some(Tipo::Md)
    }
}

fn anadir(hechos: &mut Vec<String>, nuevos: Vec<String>) {
    for a in nuevos {
        if !hechos.contains(&a) {
            hechos.push(a);
        }
    }
}

fn limpiar_linea(linea: &str, hechos: &mut Vec<String>) -> String {
    partir(&R.protegido, linea)
        .into_iter()
        .map(|(protegido, parte)| {
            if protegido {
                return parte;
            }
            let (limpio, arreglos) = motor::limpiar(&parte);
            anadir(hechos, arreglos);
            limpio
        })
        .collect()
}

/// The safe fixes, only on the prose of a markdown or a plain text.
pub fn arreglar_md(texto: &str) -> (String, Vec<String>) {
    let mut hechos = Vec::new();
    let mut en_codigo = false;
    let mut en_cabecera = texto.starts_with("---\n");
    let lineas: Vec<String> = texto
        .split('\n')
        .enumerate()
        .map(|(i, linea)| {
            if en_cabecera {
                if i > 0 && linea.trim() == "---" {
                    en_cabecera = false;
                }
                return linea.to_string();
            }
            if hay(&R.valla, linea) {
                en_codigo = !en_codigo;
                return linea.to_string();
            }
            // Code indented by four spaces or a tab, outside lists.
            if en_codigo || hay(&R.sangrado_md, linea) {
                return linea.to_string();
            }
            limpiar_linea(linea, &mut hechos)
        })
        .collect();
    (lineas.join("\n"), hechos)
}

fn arreglar_texto_html(trozo: &str, hechos: &mut Vec<String>) -> String {
    // The tags (with their attributes) stay as they are; the text in between is cleaned.
    partir(&R.etiqueta_grupo, trozo)
        .into_iter()
        .map(|(etiqueta, parte)| {
            if etiqueta {
                parte
            } else {
                parte.split('\n').map(|l| limpiar_linea(l, hechos)).collect::<Vec<_>>().join("\n")
            }
        })
        .collect()
}

/// The safe fixes, only on the text between the tags of an HTML.
pub fn arreglar_html(html: &str) -> (String, Vec<String>) {
    let mut hechos = Vec::new();
    let mut fuera = String::new();
    let mut ultimo = 0;
    for m in R.bloques_html.find_iter(html).flatten() {
        fuera += &arreglar_texto_html(&html[ultimo..m.start()], &mut hechos);
        fuera += m.as_str();
        ultimo = m.end();
    }
    fuera += &arreglar_texto_html(&html[ultimo..], &mut hechos);
    (fuera, hechos)
}

pub fn arreglar(texto: &str, tipo: Tipo) -> (String, Vec<String>) {
    if tipo == Tipo::Html { arreglar_html(texto) } else { arreglar_md(texto) }
}

fn sin_entidades(s: &str) -> String {
    let mut fuera = String::new();
    let mut ultimo = 0;
    for c in R.entidad.captures_iter(s).flatten() {
        let m = c.get(0).expect("whole match");
        let n = c.get(1).map(|x| x.as_str()).unwrap_or("");
        fuera += &s[ultimo..m.start()];
        let cambio = if let Some(num) = n.strip_prefix('#') {
            let (base, cifras) = match num.strip_prefix(['x', 'X']) {
                Some(h) => (16, h),
                None => (10, num),
            };
            // Like parseInt: the leading digits that are valid in the base.
            let validas: String = cifras.chars().take_while(|ch| ch.is_digit(base)).collect();
            u32::from_str_radix(&validas, base).ok().and_then(char::from_u32).map(String::from)
        } else {
            let nombre = n.to_lowercase();
            let c = match nombre.as_str() {
                "nbsp" => Some(" "),
                "amp" => Some("&"),
                "lt" => Some("<"),
                "gt" => Some(">"),
                "quot" => Some("\""),
                "apos" => Some("'"),
                "hellip" => Some("…"),
                "laquo" => Some("«"),
                "raquo" => Some("»"),
                "ndash" => Some("–"),
                "mdash" => Some("—"),
                "iexcl" => Some("¡"),
                "iquest" => Some("¿"),
                _ => None,
            };
            c.map(String::from)
        };
        fuera += &cambio.unwrap_or_else(|| m.as_str().to_string());
        ultimo = m.end();
    }
    fuera += &s[ultimo..];
    fuera
}

/// The texts people see in an HTML: each text node and the attributes that are read.
pub fn textos_html(html: &str) -> Vec<String> {
    let sin = cambiar(&R.bloques_html, html, " ");
    let mut textos = Vec::new();
    for c in R.atributo.captures_iter(&sin).flatten() {
        textos.push(sin_entidades(c.get(1).map(|x| x.as_str()).unwrap_or("")));
    }
    for (es_etiqueta, parte) in partir(&R.etiqueta, &sin) {
        if !es_etiqueta {
            textos.push(cambiar(&R.espacios, &sin_entidades(&parte), " ").trim().to_string());
        }
    }
    textos.into_iter().filter(|t| hay(&R.letra, t)).collect()
}

/// The paragraphs of a markdown, without code or the syntax nobody reads.
pub fn textos_md(md: &str) -> Vec<String> {
    let mut unidades: Vec<String> = Vec::new();
    let mut actual: Vec<String> = Vec::new();
    let cerrar = |actual: &mut Vec<String>, unidades: &mut Vec<String>| {
        if !actual.is_empty() {
            unidades.push(actual.join(" "));
            actual.clear();
        }
    };
    let mut en_codigo = false;
    let mut en_cabecera = md.starts_with("---\n");
    for (i, linea) in md.split('\n').enumerate() {
        if en_cabecera {
            if i > 0 && linea.trim() == "---" {
                en_cabecera = false;
            }
            continue;
        }
        if hay(&R.valla, linea) {
            en_codigo = !en_codigo;
            cerrar(&mut actual, &mut unidades);
            continue;
        }
        if en_codigo || hay(&R.sangrado, linea) || linea.trim().is_empty() {
            cerrar(&mut actual, &mut unidades);
            continue;
        }
        let limpia = cambiar(&R.codigo_linea, linea, "código");
        let limpia = cambiar(&R.enlace_md, &limpia, "$1");
        let limpia = cambiar(&R.url, &limpia, "enlace");
        let limpia = cambiar(&R.etiqueta, &limpia, "");
        let limpia = limpia.trim();
        // Headings, list items and table rows go on their own.
        if hay(&R.suelto, limpia) {
            cerrar(&mut actual, &mut unidades);
            unidades.push(cambiar(&R.marca_suelto, limpia, "").replace('|', " ").trim().to_string());
            continue;
        }
        actual.push(R.cita.replace(limpia, "").into_owned());
    }
    cerrar(&mut actual, &mut unidades);
    unidades.into_iter().filter(|u| hay(&R.letra, u)).collect()
}

pub fn textos(texto: &str, tipo: Tipo) -> Vec<String> {
    if tipo == Tipo::Html { textos_html(texto) } else { textos_md(texto) }
}

/// Whether the text looks Spanish: the engine can't judge another language.
pub fn es_espanol(texto: &str) -> bool {
    let es = cuantos(&R.es, texto) as f64;
    let en = cuantos(&R.en, texto) as f64;
    es >= 3.0 && es > en * 1.5
}

/// Checks the texts of a piece and returns what has to be told.
pub fn informar(textos: &[String], tipo: Tipo, arreglos: Vec<String>) -> Informe {
    let revisiones: Vec<Value> = textos.iter().map(|t| motor::revisar(t)).collect();
    let fuera = match tipo {
        Tipo::Html => Some(&R.no_en_interfaz),
        Tipo::Md => Some(&R.no_en_documento),
        Tipo::Texto => None,
    };
    let hallazgos = revisiones
        .iter()
        .zip(textos)
        .filter_map(|(r, t)| {
            let avisos: Vec<String> = r["avisos"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .filter(|a| !hay(&R.nunca, a) && !fuera.is_some_and(|f| hay(f, a)))
                .map(String::from)
                .collect();
            (!avisos.is_empty()).then(|| Hallazgo { trozo: t.clone(), avisos })
        })
        .collect();
    let coherencia = if tipo == Tipo::Html {
        motor::coherencia(&textos.iter().map(String::as_str).collect::<Vec<_>>())
    } else {
        Vec::new()
    };
    Informe { arreglos, hallazgos, coherencia, revisiones }
}

/// Like JavaScript's `s.length > n ? s.slice(0, n - 1) + '…' : s`, counted in UTF-16 units.
fn recortar(s: &str, n: usize) -> String {
    let unidades: Vec<u16> = s.encode_utf16().collect();
    if unidades.len() > n { String::from_utf16_lossy(&unidades[..n - 1]) + "…" } else { s.to_string() }
}

/// The text for the model: what was fixed and what it has to rewrite.
pub fn mensaje(donde: &str, inf: &Informe) -> Option<String> {
    if inf.arreglos.is_empty() && inf.hallazgos.is_empty() && inf.coherencia.is_empty() {
        return None;
    }
    let mut l = vec![format!("humanizar ({donde}):")];
    if !inf.arreglos.is_empty() {
        l.push(format!("- Arreglado solo: {}.", inf.arreglos.join("; ")));
    }
    if !inf.hallazgos.is_empty() || !inf.coherencia.is_empty() {
        l.push("- Reescribe esto sin cambiar el sentido ni inventar datos, con la edición mínima y respetando la voz del texto:".to_string());
        for h in inf.hallazgos.iter().take(12) {
            l.push(format!("  - «{}»: {}", recortar(&h.trozo, 90), h.avisos.join("; ")));
        }
        if inf.hallazgos.len() > 12 {
            l.push(format!("  - y {} trozos más", inf.hallazgos.len() - 12));
        }
        for c in &inf.coherencia {
            l.push(format!("  - {c}"));
        }
    }
    Some(l.join("\n"))
}

/// Whether `viejo` falls inside a code block, or a `<script>`/`<style>`/`<pre>`/`<code>`, of `fichero`.
pub fn dentro_de_codigo(fichero: &str, viejo: &str, tipo: Tipo) -> bool {
    let Some(i) = fichero.find(viejo) else { return false };
    let antes = &fichero[..i];
    if tipo == Tipo::Html {
        let abre = ["<script", "<style", "<pre", "<code"].iter().filter_map(|t| antes.rfind(t)).max();
        let cierra = ["</script", "</style", "</pre", "</code"].iter().filter_map(|t| antes.rfind(t)).max();
        return match (abre, cierra) {
            (Some(a), Some(c)) => a > c,
            (Some(_), None) => true,
            _ => false,
        };
    }
    cuantos(&R.valla_de_linea, antes) % 2 == 1
}

/// The coherence warnings an edit of an HTML brings: those in the file after the edit that
/// weren't there before (compared without the text numbers, which move).
pub fn coherencia_nueva(antes: &str, despues: &str) -> Vec<String> {
    let sin_numeros = |c: &str| cambiar(&R.numeros, c, "");
    let de = |t: &str| {
        let v = textos_html(t);
        motor::coherencia(&v.iter().map(String::as_str).collect::<Vec<_>>())
    };
    let habia: Vec<String> = de(antes).iter().map(|c| sin_numeros(c)).collect();
    de(despues).into_iter().filter(|c| !habia.contains(&sin_numeros(c))).collect()
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use serde_json::json;

    /// The same answers as the plugin's producto.ts for every document in `tests/producto_corpus.json`.
    #[test]
    fn igual_que_producto_ts() {
        let casos: Vec<Value> = serde_json::from_str(include_str!("../tests/producto.json")).expect("producto.json");
        assert!(casos.len() >= 10);
        for c in &casos {
            let ruta = c["ruta"].as_str().unwrap();
            let contenido = c["contenido"].as_str().unwrap();
            let tipo = tipo_de_fichero(ruta);
            let nombre = tipo.map(|t| match t {
                Tipo::Md => "md",
                Tipo::Html => "html",
                Tipo::Texto => "texto",
            });
            assert_eq!(json!(nombre), c["tipo"], "{ruta}: tipo");
            let Some(tipo) = tipo else { continue };
            let (arreglado, arreglos) = arreglar(contenido, tipo);
            assert_eq!(json!(arreglado), c["arreglado"], "{ruta}: arreglado");
            assert_eq!(json!(arreglos), c["arreglos"], "{ruta}: arreglos");
            let t = textos(&arreglado, tipo);
            assert_eq!(json!(t), c["textos"], "{ruta}: textos");
            let espanol = es_espanol(&t.join("\n"));
            assert_eq!(json!(espanol), c["espanol"], "{ruta}: español");
            let m = espanol.then(|| mensaje(ruta, &informar(&t, tipo, arreglos))).flatten();
            assert_eq!(json!(m), c["mensaje"], "{ruta}: mensaje");
        }
    }

    #[test]
    fn una_edicion_dentro_de_un_bloque_de_codigo_es_codigo() {
        let md = "Texto\n\n```\nconst a = 1\n```\n\nMás texto";
        assert!(dentro_de_codigo(md, "const a", Tipo::Md));
        assert!(!dentro_de_codigo(md, "Más texto", Tipo::Md));
        let html = "<p>Hola</p><script>var x</script><p>Adiós</p>";
        assert!(dentro_de_codigo(html, "var x", Tipo::Html));
        assert!(!dentro_de_codigo(html, "Adiós", Tipo::Html));
    }
}
