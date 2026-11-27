// caesar, in Rust: a port of the C version.
use std::io::{Read, Write};
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() != 1 {
        eprintln!("usage: caesar <shift>");
        return ExitCode::from(2);
    }
    let Ok(shift) = args[0].parse::<i64>() else {
        eprintln!("caesar: the shift must be a number");
        return ExitCode::from(2);
    };
    let shift = shift.rem_euclid(26) as u8; // 0..25, even for negative shifts
    let mut input = Vec::new();
    if std::io::stdin().read_to_end(&mut input).is_err() {
        return ExitCode::from(1);
    }
    let out: Vec<u8> = input
        .into_iter()
        .map(|b| match b {
            b'A'..=b'Z' => b'A' + (b - b'A' + shift) % 26,
            b'a'..=b'z' => b'a' + (b - b'a' + shift) % 26,
            _ => b,
        })
        .collect();
    let _ = std::io::stdout().write_all(&out);
    ExitCode::SUCCESS
}
