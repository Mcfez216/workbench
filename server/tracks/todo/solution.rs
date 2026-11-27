// todo: a to-do list kept in todo.txt. A finished version.
use std::process::ExitCode;

const FILE: &str = "todo.txt";
const USAGE: &str = "usage: todo add <title> | list | done <id> | rm <id>";

struct Task {
    id: u32,
    done: bool,
    title: String,
}

struct List {
    next: u32,
    tasks: Vec<Task>,
}

// a mistake: what to say, and the exit code
struct Mistake(String, u8);

fn parse_id(s: &str) -> Option<u32> {
    if s.is_empty() || s.len() > 9 || !s.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    s.parse().ok()
}

fn load() -> Result<List, Mistake> {
    let mut list = List { next: 1, tasks: Vec::new() };
    let Ok(text) = std::fs::read_to_string(FILE) else { return Ok(list) };
    let broken = |n: usize| Mistake(format!("todo: {FILE} line {n} is broken"), 1);
    let mut seen_next = false;
    for (i, line) in text.lines().enumerate() {
        let n = i + 1;
        if line.is_empty() {
            continue;
        }
        if !seen_next {
            list.next = line.strip_prefix("next ").and_then(parse_id).ok_or(broken(n))?;
            seen_next = true;
            continue;
        }
        let (id, rest) = line.split_once('\t').ok_or(broken(n))?;
        let id = parse_id(id).ok_or(broken(n))?;
        let (done, title) = if let Some(t) = rest.strip_prefix("[ ] ") {
            (false, t)
        } else if let Some(t) = rest.strip_prefix("[x] ") {
            (true, t)
        } else {
            return Err(broken(n));
        };
        if title.is_empty() {
            return Err(broken(n));
        }
        list.tasks.push(Task { id, done, title: title.to_string() });
    }
    if !text.trim().is_empty() && !seen_next {
        return Err(broken(1));
    }
    Ok(list)
}

fn save(list: &List) -> Result<(), Mistake> {
    let mut out = format!("next {}\n", list.next);
    for t in &list.tasks {
        out += &format!("{}\t[{}] {}\n", t.id, if t.done { 'x' } else { ' ' }, t.title);
    }
    std::fs::write(FILE, out).map_err(|e| Mistake(format!("todo: can't write {FILE}: {e}"), 1))
}

fn find(list: &List, arg: &str) -> Result<usize, Mistake> {
    let id = parse_id(arg).ok_or_else(|| Mistake(format!("todo: \"{arg}\" isn't a task number"), 1))?;
    list.tasks.iter().position(|t| t.id == id).ok_or_else(|| Mistake(format!("todo: no task {id}"), 1))
}

fn run(args: &[String]) -> Result<(), Mistake> {
    let usage = || Mistake(USAGE.to_string(), 2);
    let cmd = args.first().ok_or_else(usage)?;
    let mut list = load()?;
    match (cmd.as_str(), args.len()) {
        ("add", _) => {
            let title = args[1..].join(" ");
            if title.is_empty() {
                return Err(Mistake("todo: a task needs a title".into(), 1));
            }
            println!("Added {}: {title}", list.next);
            list.tasks.push(Task { id: list.next, done: false, title });
            list.next += 1;
            save(&list)?;
        }
        ("list", 1) | ("list", 2) => {
            let pending = args.len() == 2;
            if pending && args[1] != "--pending" {
                return Err(usage());
            }
            let mut shown = 0;
            for t in list.tasks.iter().filter(|t| !(pending && t.done)) {
                println!("{} [{}] {}", t.id, if t.done { 'x' } else { ' ' }, t.title);
                shown += 1;
            }
            if shown == 0 {
                println!("Nothing to do.");
            }
        }
        ("done", 2) => {
            let i = find(&list, &args[1])?;
            let t = &mut list.tasks[i];
            if t.done {
                return Err(Mistake(format!("todo: task {} is already done", t.id), 1));
            }
            t.done = true;
            println!("Done {}: {}", t.id, t.title);
            save(&list)?;
        }
        ("rm", 2) => {
            let i = find(&list, &args[1])?;
            let t = list.tasks.remove(i);
            println!("Removed {}: {}", t.id, t.title);
            save(&list)?;
        }
        _ => return Err(usage()),
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
