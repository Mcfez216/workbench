// count: lines, words and bytes, like wc. A finished version.
use std::io::Read;
use std::process::ExitCode;

#[derive(Default, Clone, Copy)]
struct Counts {
    lines: usize,
    words: usize,
    bytes: usize,
}

fn count(text: &[u8]) -> Counts {
    Counts {
        lines: text.iter().filter(|&&b| b == b'\n').count(),
        words: text.split(|b| b.is_ascii_whitespace()).filter(|w| !w.is_empty()).count(),
        bytes: text.len(),
    }
}

fn line(c: Counts, show: (bool, bool, bool), name: Option<&str>) -> String {
    let mut parts = Vec::new();
    if show.0 { parts.push(c.lines.to_string()); }
    if show.1 { parts.push(c.words.to_string()); }
    if show.2 { parts.push(c.bytes.to_string()); }
    if let Some(n) = name { parts.push(n.to_string()); }
    parts.join(" ")
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut show = (false, false, false);
    let mut i = 0;
    while i < args.len() && args[i].len() > 1 && args[i].starts_with('-') {
        for c in args[i].chars().skip(1) {
            match c {
                'l' => show.0 = true,
                'w' => show.1 = true,
                'c' => show.2 = true,
                _ => {
                    eprintln!("count: unknown option -{c}");
                    return ExitCode::from(2);
                }
            }
        }
        i += 1;
    }
    if show == (false, false, false) {
        show = (true, true, true);
    }
    if i == args.len() {
        let mut text = Vec::new();
        if std::io::stdin().read_to_end(&mut text).is_err() {
            eprintln!("count: can't read standard input");
            return ExitCode::from(1);
        }
        println!("{}", line(count(&text), show, None));
        return ExitCode::SUCCESS;
    }
    let mut total = Counts::default();
    let (mut status, mut read) = (0u8, 0);
    for name in &args[i..] {
        match std::fs::read(name) {
            Ok(bytes) => {
                let c = count(&bytes);
                println!("{}", line(c, show, Some(name)));
                total.lines += c.lines;
                total.words += c.words;
                total.bytes += c.bytes;
                read += 1;
            }
            Err(_) => {
                eprintln!("count: {name}: can't open");
                status = 1;
            }
        }
    }
    if read > 1 {
        println!("{}", line(total, show, Some("total")));
    }
    ExitCode::from(status)
}
