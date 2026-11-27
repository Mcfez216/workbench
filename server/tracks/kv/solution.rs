// kv: a key-value store kept as an append-only log in kv.db. A finished version.
use std::collections::BTreeMap;
use std::io::Write;
use std::process::ExitCode;

const DB: &str = "kv.db";
const USAGE: &str = "usage: kv set <key> <value> | get <key> | del <key> | list | compact";

struct Mistake(String, u8);

fn good_key(k: &str) -> bool {
    !k.is_empty() && !k.contains(['=', '\t', ' ', '\n'])
}

// the log replayed: the keys there now, and how many lines it took
fn load() -> Result<(BTreeMap<String, String>, usize), Mistake> {
    let mut map = BTreeMap::new();
    let text = std::fs::read_to_string(DB).unwrap_or_default();
    let mut lines = 0;
    for line in text.lines() {
        lines += 1;
        let parts: Vec<&str> = line.split('\t').collect();
        match parts.as_slice() {
            ["set", k, v] if good_key(k) => {
                map.insert(k.to_string(), v.to_string());
            }
            ["del", k] if good_key(k) => {
                map.remove(*k);
            }
            _ => return Err(Mistake(format!("kv: {DB} line {lines} is broken"), 1)),
        }
    }
    Ok((map, lines))
}

fn append(line: &str) -> Result<(), Mistake> {
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(DB).map_err(|e| Mistake(format!("kv: can't write {DB}: {e}"), 1))?;
    writeln!(f, "{line}").map_err(|e| Mistake(format!("kv: can't write {DB}: {e}"), 1))
}

fn run(a: &[String]) -> Result<(), Mistake> {
    let cmd = a.first().map(String::as_str).unwrap_or("");
    let ok = match cmd {
        "set" => a.len() >= 3,
        "get" | "del" => a.len() == 2,
        "list" | "compact" => a.len() == 1,
        _ => false,
    };
    if !ok {
        return Err(Mistake(USAGE.into(), 2));
    }
    let (mut map, lines) = load()?;
    if a.len() >= 2 && !good_key(&a[1]) {
        return Err(Mistake("kv: bad key".into(), 1));
    }
    match cmd {
        "set" => {
            let value = a[2..].join(" ");
            if value.contains(['\t', '\n']) {
                return Err(Mistake("kv: bad value".into(), 1));
            }
            append(&format!("set\t{}\t{value}", a[1]))?;
        }
        "get" | "del" => {
            let Some(v) = map.remove(&a[1]) else {
                return Err(Mistake(format!("kv: no key \"{}\"", a[1]), 1));
            };
            if cmd == "get" {
                println!("{v}");
            } else {
                append(&format!("del\t{}", a[1]))?;
            }
        }
        "list" => {
            for (k, v) in &map {
                println!("{k}={v}");
            }
        }
        _ => {
            let tmp = format!("{DB}.tmp");
            let text: String = map.iter().map(|(k, v)| format!("set\t{k}\t{v}\n")).collect();
            std::fs::write(&tmp, text).map_err(|e| Mistake(format!("kv: can't write {tmp}: {e}"), 1))?;
            std::fs::rename(&tmp, DB).map_err(|e| Mistake(format!("kv: can't replace {DB}: {e}"), 1))?;
            println!("kept {}, dropped {}", map.len(), lines - map.len());
        }
    }
    Ok(())
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(Mistake(msg, code)) => {
            eprintln!("{msg}");
            ExitCode::from(code)
        }
    }
}
