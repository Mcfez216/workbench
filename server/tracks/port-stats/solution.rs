// stats, in Rust: a port of the C version.
use std::io::Read;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut input = String::new();
    if std::io::stdin().read_to_string(&mut input).is_err() {
        return ExitCode::from(1);
    }
    let mut v: Vec<i64> = Vec::new();
    for w in input.split_whitespace() {
        match w.parse() {
            Ok(x) => v.push(x),
            Err(_) => {
                eprintln!("stats: that isn't a whole number");
                return ExitCode::from(1);
            }
        }
    }
    if v.is_empty() {
        println!("count 0");
        return ExitCode::SUCCESS;
    }
    v.sort();
    let n = v.len();
    let sum: f64 = v.iter().map(|&x| x as f64).sum();
    let median = if n % 2 == 1 { v[n / 2] as f64 } else { (v[n / 2 - 1] as f64 + v[n / 2] as f64) / 2.0 };
    println!("count {n}\nmin {}\nmax {}\nmean {:.2}\nmedian {:.1}", v[0], v[n - 1], sum / n as f64, median);
    ExitCode::SUCCESS
}
