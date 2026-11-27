// rpn, in Rust: a port of the C version.
use std::io::BufRead;

#[derive(Debug)]
enum Error {
    Blank,
    UnknownWord,
    NotEnough,
    TooMany,
    DivByZero,
}

fn eval(line: &str) -> Result<i64, Error> {
    let mut stack: Vec<i64> = Vec::new();
    for tok in line.split_whitespace() {
        if let Ok(x) = tok.parse::<i64>() {
            stack.push(x);
            continue;
        }
        let op = match tok {
            "+" | "-" | "*" | "/" => tok,
            _ => return Err(Error::UnknownWord),
        };
        let (Some(b), Some(a)) = (stack.pop(), stack.pop()) else { return Err(Error::NotEnough) };
        stack.push(match op {
            "+" => a + b,
            "-" => a - b,
            "*" => a * b,
            _ => a.checked_div(b).ok_or(Error::DivByZero)?,
        });
    }
    match stack.as_slice() {
        [] => Err(Error::Blank),
        [x] => Ok(*x),
        _ => Err(Error::TooMany),
    }
}

fn main() {
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        match eval(&line) {
            Ok(v) => println!("{v}"),
            Err(Error::Blank) => {}
            Err(e) => println!(
                "error: {}",
                match e {
                    Error::UnknownWord => "unknown word",
                    Error::NotEnough => "not enough numbers",
                    Error::TooMany => "too many numbers",
                    Error::DivByZero => "division by zero",
                    Error::Blank => "",
                }
            ),
        }
    }
}
