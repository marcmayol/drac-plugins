//! The engine: a port of `plugins/humanizar/hooks/humanizar.ts`, and it has to give the same answers.
//! `tests/golden.json` holds what the TypeScript version returns; `tests/generar_golden.mjs` rebuilds
//! it. A rule changed in one place and not in the other fails the tests.
//!
//! Three JavaScript details kept on purpose: `\s` is spelled out (Rust's also has U+0085 and lacks
//! U+FEFF), `\d` is ASCII only, and `p[0]` looks at the first UTF-16 unit, so a letter outside the
//! BMP never counts as a capital.

use fancy_regex::{Regex, RegexBuilder, escape};
use serde_json::{Value, json};
use std::sync::LazyLock;
use unicode_normalization::UnicodeNormalization;

const W: &str = r"[\p{L}\p{N}_]";
/// JavaScript's `\s`, to go inside a character class.
const S: &str = r"\t\n\x0B\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}";

fn re(patron: &str) -> Regex {
    // The limit only matters on very long texts: past it a pattern reads as "no match".
    RegexBuilder::new(patron).backtrack_limit(50_000_000).build().expect("valid pattern")
}

/// `\s` and `\S` with JavaScript's meaning; `{W}`, `{B}` and `{E}` for the word limits.
fn plantilla(p: &str) -> String {
    p.replace("{B}", &format!("(?<!{W})"))
        .replace("{E}", &format!("(?!{W})"))
        .replace("{W}", W)
        .replace("{s}", &format!("[{S}]"))
        .replace("{S}", &format!("[^{S}]"))
}

const CAMBIOS: &[(&str, &str)] = &[
    ("a día de hoy", "hoy"),
    ("en el día de hoy", "hoy"),
    ("sin lugar a dudas", "sin duda"),
    ("con el objetivo de", "para"),
    ("con el fin de", "para"),
    ("de cara a", "para"),
    ("en base a", "según"),
    ("utiliza", "usa"),
    ("utilizan", "usan"),
    ("utilizar", "usar"),
    ("utilizando", "usando"),
    ("utilizo", "uso"),
];

const RELLENO: &[&str] = &[
    "en el vertiginoso mundo", "en el mundo actual", "en la era digital", "en la era de la ia",
    "hoy más que nunca", "más que nunca", "cabe destacar", "es importante destacar",
    "es importante tener en cuenta", "es crucial", "es fundamental", "no es ningún secreto",
    "revoluciona", "revolucionar", "revolucionario", "revolucionaria", "game changer",
    "cambia las reglas del juego", "cambio de paradigma", "un antes y un después",
    "desbloquear", "desbloquea", "potenciar", "potencia tu", "sinergia", "de vanguardia",
    "vanguardista", "transformador", "transformadora", "llevar al siguiente nivel",
    "al siguiente nivel", "a otro nivel", "aprovechar al máximo", "sácale el máximo partido",
    "sumérgete", "sumergirnos", "adentrarnos", "adéntrate", "panorama actual", "navegar por",
    "en definitiva", "en conclusión", "en resumen", "la clave está en", "pieza clave",
    "el futuro ya está aquí", "el futuro es ahora", "no te lo puedes perder", "imprescindible",
    "fascinante", "apasionante", "me complace", "encantado de anunciar", "orgulloso de anunciar",
    "emocionado de anunciar", "os presento", "te presento", "déjame contarte", "te cuento un secreto",
    "aquí te dejo", "abróchate el cinturón", "spoiler:", "atención:", "ojo al dato",
    "un mundo de posibilidades", "infinitas posibilidades", "esto lo cambia todo",
    "profundizar", "profundiza", "profundizamos", "profundizaremos", "optimizar", "dicho esto",
    "un abanico de", "un amplio abanico de", "un sinfín de",
];

struct Reglas {
    cambios: Vec<(Regex, &'static str, &'static str)>,
    relleno: Vec<(Regex, &'static str)>,
    estructuras: Vec<(Regex, &'static str)>,
    enfasis: Regex,
    trio: Regex,
    adjetivo: Regex,
    raya: Regex,
    hashtag: Regex,
    url: Regex,
    palabra: Regex,
    primera: Regex,
    frase: Regex,
}

static REGLAS: LazyLock<Reglas> = LazyLock::new(|| Reglas {
    cambios: CAMBIOS.iter().map(|(v, n)| (re(&plantilla(&format!("(?i){{B}}{}{{E}}", escape(v)))), *v, *n)).collect(),
    relleno: RELLENO.iter().map(|r| (re(&plantilla(&format!("{{B}}{}{{E}}", escape(r)))), *r)).collect(),
    estructuras: [
        (r"(?i){B}no (?:es|se trata de) (?:solo|sólo|simplemente|únicamente){E}[^.\n]{1,80}?[,;:.—–-]{s}*(?:es|sino|se trata de){E}", "«no es solo X, es Y»: di Y directamente"),
        (r"(?i){B}no es [^.\n]{1,50}\.{s}+es{E}", "«No es X. Es Y.»: di Y directamente"),
        (r"(?i){B}(?:no es (?!(?:solo|sólo|simplemente|únicamente){E})[^.,;:\n]{1,50}[,;:—–]{s}*es(?!{s}+decir)|no son (?!(?:solo|sólo|simplemente|únicamente){E})[^.,;:\n]{1,50}[,;:—–]{s}*son|no era (?!(?:solo|sólo|simplemente|únicamente){E})[^.,;:\n]{1,50}[,;:—–]{s}*era|no eran (?!(?:solo|sólo|simplemente|únicamente){E})[^.,;:\n]{1,50}[,;:—–]{s}*eran){E}", "«no es X, es Y»: di Y directamente"),
        (r"(?:^|(?<=[.!?\n—–:])){s}*¿[^?\n]{1,25}\?(?={s}|$)", "pregunta retórica corta («¿El resultado?»): cuéntalo sin preguntar"),
        (r#"(?i){B}(?:comenta|escribe|responde){s}+[«"']?{W}+[»"']?{s}+(?:y|para que){s}+te{E}"#, "cebo de comentarios («comenta X y te lo envío»): pon el enlace"),
        (r"(?i)¿(?:y tú|y vosotros|qué opinas|qué opináis|qué piensas|estás de acuerdo)\??", "pregunta de cebo al final: solo si de verdad quieres esa respuesta"),
        (r"(?i){B}(?:dale (?:a )?like|comparte si|sígueme para más|guárdalo para){E}", "petición de interacción: quítala"),
        (r"\*\*[^*\n]+\*\*", "markdown (**…**): en las redes sale tal cual, quítalo"),
    ]
    .iter()
    .map(|(p, a)| (re(&plantilla(p)), *a))
    .collect(),
    // A lone «clave» is normal; what gives it away is piling them up in one paragraph.
    enfasis: re(&plantilla("{B}(?:fundamental(?:es)?|crucial(?:es)?|claves?){E}")),
    // Without a dictionary, two of the three have to look like adjectives.
    trio: re(&plantilla(r"{B}(\p{L}{4,}), (\p{L}{4,}) (?:y|e) (\p{L}{4,}){E}")),
    adjetivo: re(r"^(?:r[aá]pid[oa]s?|sencill[oa]s?|f[aá]cil(?:es)?|simples?|eficaz|eficaces|eficientes?|potentes?|robust[oa]s?|[aá]gil(?:es)?|modern[oa]s?|limpi[oa]s?|clar[oa]s?|segur[oa]s?|barat[oa]s?|liger[oa]s?|precis[oa]s?|complet[oa]s?|elegantes?|inteligentes?|innovador(?:a|es|as)?|[uú]til(?:es)?|nuev[oa]s?|direct[oa]s?|\p{L}*(?:iv[oa]s?|bles?|os[oa]s?|ic[oa]s?))$"),
    raya: re(&plantilla("—|{s}–{s}")),
    hashtag: re(&plantilla("{B}#{W}+")),
    url: re(&plantilla("(?i)https?://{S}+")),
    palabra: re(&plantilla("{W}+")),
    primera: re(&plantilla("(?i){B}(?:yo|me|mi|mis|conmigo|he|hice|llevo|tengo|uso|hago|probé|monté|estoy|quiero|creo|pienso|nosotros|nos|nuestro|nuestra){E}")),
    frase: re(&plantilla(r"(?<=[.!?…]){s}+|\n+")),
});

fn invisible(c: char) -> bool {
    matches!(c, '\u{200b}' | '\u{200c}' | '\u{200d}' | '\u{2060}' | '\u{feff}' | '\u{ad}' | '\u{e0000}'..='\u{e007f}')
}
fn espacio_raro(c: char) -> bool {
    matches!(c, '\u{a0}' | '\u{202f}' | '\u{2007}' | '\u{2009}' | '\u{200a}')
}
fn matematica(c: char) -> bool {
    matches!(c, '\u{1d400}'..='\u{1d7ff}')
}
fn emoji(c: char) -> bool {
    matches!(c, '\u{1f300}'..='\u{1faff}' | '\u{2600}'..='\u{27bf}' | '\u{1f000}'..='\u{1f2ff}')
}
fn espacio_js(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn mayuscula(c: char) -> bool {
    let (uno, sup) = (c.to_string(), c as u32 > 0xffff);
    !sup && c.to_lowercase().collect::<String>() != uno && c.to_uppercase().collect::<String>() == uno
}

fn contar(r: &Regex, s: &str) -> usize {
    r.find_iter(s).filter(Result::is_ok).count()
}

fn coincide(r: &Regex, s: &str) -> bool {
    r.is_match(s).unwrap_or(false)
}

fn cambiar_todo(r: &Regex, s: &str, f: &mut dyn FnMut(&str) -> String) -> String {
    let mut fuera = String::with_capacity(s.len());
    let mut ultimo = 0;
    for m in r.find_iter(s).flatten() {
        fuera.push_str(&s[ultimo..m.start()]);
        fuera.push_str(&f(m.as_str()));
        ultimo = m.end();
    }
    fuera.push_str(&s[ultimo..]);
    fuera
}

/// Python's rounding (.5 goes to the even number), which the TypeScript version kept.
fn redondear(x: f64) -> f64 {
    let f = x.floor();
    if (x - f - 0.5).abs() < 1e-9 {
        if f % 2.0 == 0.0 { f } else { f + 1.0 }
    } else {
        x.round()
    }
}

fn media(xs: &[f64]) -> f64 {
    xs.iter().sum::<f64>() / xs.len() as f64
}

fn desviacion(xs: &[f64]) -> f64 {
    let m = media(xs);
    media(&xs.iter().map(|x| (x - m) * (x - m)).collect::<Vec<_>>()).sqrt()
}

fn escala(valor: f64, cero: f64, cien: f64) -> f64 {
    redondear(((valor - cero) / (cien - cero)).clamp(0.0, 1.0) * 100.0)
}

/// The automatic fixes: they don't change the meaning.
pub fn limpiar(entrada: &str) -> (String, Vec<String>) {
    let mut texto = entrada.to_string();
    let mut hecho = Vec::new();
    if texto.chars().any(invisible) {
        texto.retain(|c| !invisible(c));
        hecho.push("caracteres invisibles quitados".to_string());
    }
    if texto.chars().any(espacio_raro) {
        texto = texto.chars().map(|c| if espacio_raro(c) { ' ' } else { c }).collect();
        hecho.push("espacios raros normalizados".to_string());
    }
    if texto.chars().any(matematica) {
        texto = texto.chars().flat_map(|c| if matematica(c) { std::iter::once(c).nfkc().collect::<Vec<_>>() } else { vec![c] }).collect();
        hecho.push("letras Unicode de negrita/cursiva pasadas a normales".to_string());
    }
    for (patron, viejo, nuevo) in &REGLAS.cambios {
        let mut n = 0;
        texto = cambiar_todo(patron, &texto, &mut |m| {
            n += 1;
            if m.chars().next().is_some_and(mayuscula) {
                let mut c = nuevo.chars();
                let primera = c.next().map(|p| p.to_uppercase().collect::<String>()).unwrap_or_default();
                primera + c.as_str()
            } else {
                nuevo.to_string()
            }
        });
        if n > 0 {
            hecho.push(format!("«{viejo}» → «{nuevo}»"));
        }
    }
    (texto, hecho)
}

fn frases(texto: &str) -> Vec<String> {
    let sin_urls = cambiar_todo(&REGLAS.url, texto, &mut |_| "enlace".to_string());
    let mut trozos = Vec::new();
    let mut ultimo = 0;
    for m in REGLAS.frase.find_iter(&sin_urls).flatten() {
        trozos.push(sin_urls[ultimo..m.start()].to_string());
        ultimo = m.end();
    }
    trozos.push(sin_urls[ultimo..].to_string());
    trozos.retain(|f| contar(&REGLAS.palabra, f) > 0);
    trozos
}

/// Cleans and scores a text. Same keys, in the same order, as the plugin's tool.
pub fn revisar(entrada: &str) -> Value {
    let r = &*REGLAS;
    let (limpio, arreglos) = limpiar(entrada);
    let bajo = limpio.to_lowercase();
    let n = contar(&r.palabra, &limpio).max(1) as f64;
    let mut avisos: Vec<String> = Vec::new();

    let relleno: Vec<&str> = r.relleno.iter().filter(|(p, _)| coincide(p, &bajo)).map(|(_, t)| *t).collect();
    if !relleno.is_empty() {
        avisos.push(format!("relleno de IA: {}", relleno.iter().map(|t| format!("«{t}»")).collect::<Vec<_>>().join(", ")));
    }
    let estructuras: Vec<bool> = r.estructuras.iter().map(|(p, _)| coincide(p, &limpio)).collect();
    for (hay, (_, aviso)) in estructuras.iter().zip(&r.estructuras) {
        if *hay {
            avisos.push((*aviso).to_string());
        }
    }
    let enfasis = bajo.split('\n').any(|p| contar(&r.enfasis, p) >= 2);
    if enfasis {
        avisos.push("«fundamental», «crucial», «clave» juntas en un párrafo: deja una o di por qué importa".to_string());
    }
    let trio = r.trio.captures_iter(&bajo).flatten().any(|c| (1..=3).filter(|i| c.get(*i).is_some_and(|p| coincide(&r.adjetivo, p.as_str()))).count() >= 2);
    if trio {
        avisos.push("tres adjetivos seguidos: quédate con el que importa".to_string());
    }
    let rayas = contar(&r.raya, &limpio);
    if rayas > 0 {
        avisos.push(format!("{rayas} raya(s) «—»: cámbialas por coma, punto o paréntesis"));
    }
    let tags = contar(&r.hashtag, &limpio);
    if tags > 3 {
        avisos.push(format!("{tags} hashtags: deja 1-3"));
    }
    let emojis = limpio.chars().filter(|c| emoji(*c)).count();
    if emojis > 1 {
        avisos.push(format!("{emojis} emojis: como mucho uno"));
    }
    if limpio.chars().find(|c| !espacio_js(*c)).is_some_and(emoji) {
        avisos.push("empieza con emoji: empieza con la idea".to_string());
    }

    let fs = frases(&cambiar_todo(&r.hashtag, &limpio, &mut |_| String::new()));
    let largos: Vec<f64> = fs.iter().map(|f| contar(&r.palabra, f) as f64).collect();
    let mut ritmo = 100.0; // a two-sentence tweet has no rhythm to measure
    if largos.len() >= 3 {
        ritmo = escala(desviacion(&largos) / media(&largos).max(1.0), 0.15, 0.55);
        if ritmo < 50.0 {
            avisos.push("todas las frases miden parecido: mezcla alguna corta con otra larga".to_string());
        }
    }

    let nombres: usize = fs
        .iter()
        .map(|f| r.palabra.find_iter(f).flatten().skip(1).filter(|p| p.as_str().chars().next().is_some_and(mayuscula)).count())
        .sum();
    let cifras = limpio.chars().filter(char::is_ascii_digit).count();
    let concretos = (cifras / 2 + nombres + contar(&r.url, &limpio)) as f64;
    let concrecion = escala(concretos * 100.0 / n, 0.0, 4.0);
    if concrecion < 40.0 {
        avisos.push("poco concreto: añade una cifra, un nombre o el enlace real (solo si están en la fuente)".to_string());
    }

    let densidad = escala((relleno.len() + usize::from(enfasis) + usize::from(trio)) as f64 * 100.0 / n, 3.0, 0.0);
    let largo = limpio.chars().count().max(1) as f64;
    let huella = escala((rayas + emojis.saturating_sub(1)) as f64 * 1000.0 / largo, 6.0, 0.0);
    let mut voz = if coincide(&r.primera, &limpio) { 100.0 } else { 60.0 };
    voz -= 15.0 * estructuras[..4].iter().filter(|h| **h).count() as f64;
    let voz: f64 = voz.max(0.0);

    let valores = [ritmo, concrecion, densidad, huella, voz];
    let peor = valores.iter().copied().fold(f64::INFINITY, f64::min);
    let puntos = redondear(0.6 * media(&valores) + 0.4 * peor);
    let entero = |x: f64| x as i64;
    json!({
        "texto": limpio,
        "cambiado": limpio != entrada,
        "arreglos": arreglos,
        "avisos": avisos,
        "puntos": entero(puntos),
        "pruebas": {
            "ritmo": entero(ritmo),
            "concreción": entero(concrecion),
            "relleno": entero(densidad),
            "huella": entero(huella),
            "voz": entero(voz),
        },
    })
}
