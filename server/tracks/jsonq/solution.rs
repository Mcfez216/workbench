// jsonq: parse JSON by hand, print the value a path picks. A finished version.
use std::io::Read;
use std::process::ExitCode;

const MAX_DEPTH: usize = 1000;

enum Value {
    Number(String),
    Str(String),
    Literal(&'static str),
    Array(Vec<Value>),
    Object(Vec<(String, Value)>),
}

struct Parser<'a> {
    s: &'a [u8],
    i: usize,
}

type Res<T> = Result<T, usize>; // Err(the byte where it went wrong)

impl Parser<'_> {
    fn peek(&self) -> Option<u8> {
        self.s.get(self.i).copied()
    }
    fn ws(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\t' | b'\n' | b'\r')) {
            self.i += 1;
        }
    }
    fn expect(&mut self, c: u8) -> Res<()> {
        if self.peek() != Some(c) {
            return Err(self.i);
        }
        self.i += 1;
        Ok(())
    }
    fn digits(&mut self) -> usize {
        let start = self.i;
        while matches!(self.peek(), Some(b'0'..=b'9')) {
            self.i += 1;
        }
        self.i - start
    }

    fn value(&mut self, depth: usize) -> Res<Value> {
        if depth > MAX_DEPTH {
            return Err(self.i);
        }
        self.ws();
        match self.peek() {
            None => Err(self.i),
            Some(b'"') => Ok(Value::Str(self.string()?)),
            Some(b'-' | b'0'..=b'9') => self.number(),
            Some(b'[') => {
                self.i += 1;
                let mut items = Vec::new();
                self.ws();
                if self.peek() == Some(b']') {
                    self.i += 1;
                    return Ok(Value::Array(items));
                }
                loop {
                    items.push(self.value(depth + 1)?);
                    self.ws();
                    if self.peek() == Some(b',') {
                        self.i += 1;
                        continue;
                    }
                    self.expect(b']')?;
                    return Ok(Value::Array(items));
                }
            }
            Some(b'{') => {
                self.i += 1;
                let mut fields = Vec::new();
                self.ws();
                if self.peek() == Some(b'}') {
                    self.i += 1;
                    return Ok(Value::Object(fields));
                }
                loop {
                    self.ws();
                    if self.peek() != Some(b'"') {
                        return Err(self.i);
                    }
                    let key = self.string()?;
                    self.ws();
                    self.expect(b':')?;
                    fields.push((key, self.value(depth + 1)?));
                    self.ws();
                    if self.peek() == Some(b',') {
                        self.i += 1;
                        continue;
                    }
                    self.expect(b'}')?;
                    return Ok(Value::Object(fields));
                }
            }
            _ => {
                for w in ["true", "false", "null"] {
                    if self.s[self.i..].starts_with(w.as_bytes()) {
                        self.i += w.len();
                        return Ok(Value::Literal(w));
                    }
                }
                Err(self.i)
            }
        }
    }

    fn number(&mut self) -> Res<Value> {
        let start = self.i;
        if self.peek() == Some(b'-') {
            self.i += 1;
        }
        match self.peek() {
            Some(b'0') => self.i += 1,
            Some(b'1'..=b'9') => {
                self.digits();
            }
            _ => return Err(self.i),
        }
        if self.peek() == Some(b'.') {
            self.i += 1;
            if self.digits() == 0 {
                return Err(self.i);
            }
        }
        if matches!(self.peek(), Some(b'e' | b'E')) {
            self.i += 1;
            if matches!(self.peek(), Some(b'+' | b'-')) {
                self.i += 1;
            }
            if self.digits() == 0 {
                return Err(self.i);
            }
        }
        Ok(Value::Number(String::from_utf8_lossy(&self.s[start..self.i]).into_owned()))
    }

    fn hex4(&mut self) -> Res<u32> {
        let h = self.s.get(self.i..self.i + 4).ok_or(self.i)?;
        let text = std::str::from_utf8(h).map_err(|_| self.i)?;
        let v = u32::from_str_radix(text, 16).map_err(|_| self.i)?;
        if !h.iter().all(u8::is_ascii_hexdigit) {
            return Err(self.i);
        }
        self.i += 4;
        Ok(v)
    }

    fn string(&mut self) -> Res<String> {
        self.expect(b'"')?;
        let mut out: Vec<u8> = Vec::new();
        loop {
            let c = self.peek().ok_or(self.i)?;
            self.i += 1;
            match c {
                b'"' => return String::from_utf8(out).map_err(|_| self.i),
                0..=0x1f => return Err(self.i - 1),
                b'\\' => {
                    let e = self.peek().ok_or(self.i)?;
                    self.i += 1;
                    match e {
                        b'"' => out.push(b'"'),
                        b'\\' => out.push(b'\\'),
                        b'/' => out.push(b'/'),
                        b'b' => out.push(8),
                        b'f' => out.push(12),
                        b'n' => out.push(b'\n'),
                        b'r' => out.push(b'\r'),
                        b't' => out.push(b'\t'),
                        b'u' => {
                            let mut cp = self.hex4()?;
                            if (0xD800..=0xDBFF).contains(&cp) {
                                if !self.s[self.i..].starts_with(b"\\u") {
                                    return Err(self.i);
                                }
                                self.i += 2;
                                let lo = self.hex4()?;
                                if !(0xDC00..=0xDFFF).contains(&lo) {
                                    return Err(self.i);
                                }
                                cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                            }
                            let ch = char::from_u32(cp).ok_or(self.i)?; // a lone surrogate isn't a character
                            let mut buf = [0u8; 4];
                            out.extend_from_slice(ch.encode_utf8(&mut buf).as_bytes());
                        }
                        _ => return Err(self.i - 1),
                    }
                }
                _ => out.push(c),
            }
        }
    }
}

fn print_str(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("\\t"),
            '\r' => out.push_str("\\r"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

fn print(out: &mut String, v: &Value) {
    match v {
        Value::Number(t) => out.push_str(t),
        Value::Literal(t) => out.push_str(t),
        Value::Str(s) => print_str(out, s),
        Value::Array(items) => {
            out.push('[');
            for (i, x) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                print(out, x);
            }
            out.push(']');
        }
        Value::Object(fields) => {
            out.push('{');
            for (i, (k, x)) in fields.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                print_str(out, k);
                out.push(':');
                print(out, x);
            }
            out.push('}');
        }
    }
}

fn walk<'a>(root: &'a Value, path: &str) -> Result<&'a Value, String> {
    if path == "." {
        return Ok(root);
    }
    if !path.starts_with(['.', '[']) {
        return Err("a path starts with . or [".into());
    }
    let mut at = root;
    let mut rest = path;
    while !rest.is_empty() {
        if let Some(r) = rest.strip_prefix('.') {
            let end = r.find(['.', '[']).unwrap_or(r.len());
            let key = &r[..end];
            if key.is_empty() {
                return Err("an empty key in the path".into());
            }
            let Value::Object(fields) = at else { return Err(format!("asked for .{key} of something that isn't an object")) };
            at = fields.iter().find(|(k, _)| k == key).map(|(_, v)| v).ok_or(format!("no key \"{key}\""))?;
            rest = &r[end..];
        } else if let Some(r) = rest.strip_prefix('[') {
            let close = r.find(']').ok_or("an index is a number: [0]")?;
            let n: usize = r[..close].parse().map_err(|_| "an index is a number: [0]".to_string())?;
            if !r[..close].bytes().all(|b| b.is_ascii_digit()) {
                return Err("an index is a number: [0]".into());
            }
            let Value::Array(items) = at else { return Err(format!("asked for [{n}] of something that isn't an array")) };
            at = items.get(n).ok_or(format!("index {n} is past the end ({} items)", items.len()))?;
            rest = &r[close + 1..];
        } else {
            return Err("a path is .key and [index] steps".into());
        }
    }
    Ok(at)
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() != 1 {
        eprintln!("usage: jsonq <path>   (for example: jsonq .users[0].name < data.json)");
        return ExitCode::from(2);
    }
    let mut input = Vec::new();
    if std::io::stdin().read_to_end(&mut input).is_err() {
        eprintln!("jsonq: can't read standard input");
        return ExitCode::from(1);
    }
    let mut p = Parser { s: &input, i: 0 };
    let root = match p.value(0).and_then(|v| {
        p.ws();
        if p.i == p.s.len() { Ok(v) } else { Err(p.i) }
    }) {
        Ok(v) => v,
        Err(at) => {
            eprintln!("jsonq: bad JSON at byte {at}");
            return ExitCode::from(2);
        }
    };
    match walk(&root, &args[0]) {
        Ok(v) => {
            let mut out = String::new();
            print(&mut out, v);
            println!("{out}");
            ExitCode::SUCCESS
        }
        Err(msg) => {
            eprintln!("jsonq: {msg}");
            ExitCode::from(1)
        }
    }
}
