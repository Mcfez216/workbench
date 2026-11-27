---
phase: 4
tags: [rust, project]
time: 2 hours
---
# R02 To-do List

> [!abstract] Why this matters
> A to-do list is a small model of real data: structs with an id, an enum for state, operations that can fail, and saving to text and loading it back. You'll write your own error type and use `Result` and `?` everywhere.

## What you'll build

The types are written for you: `Task`, `Status` (`Todo` or `Done`), `TodoError` and `TodoList`. You write the methods:

| Method | Does |
|---|---|
| `add(title)` | adds a task, gives back its id. Ids start at 1 and are **never reused**. An empty title is `Err(EmptyTitle)` |
| `get(id)` | `Some(&Task)`, or `None` |
| `complete(id)` | marks it done: `Err(NotFound)` or `Err(AlreadyDone)` if it can't |
| `remove(id)` | takes it out and gives it back |
| `pending()` | the tasks not done yet |
| `to_text()` | `"1\t[ ] buy milk\n2\t[x] call Sam\n"` |
| `from_text(text)` | reads that back. A bad line is `Err(Parse { line })`, counting from 1 |

And `Display` for `TodoError`, so `err.to_string()` is a sentence.

## How to start

Tests sidebar → **R02 To-do List** → ▶. Code: `_code/projects/r02_todo_list/`. (Not copied the code yet? See [[R01 Word Frequency]], "How to start".)

## Hints

> [!tip]- Hint 1: finding a task
> `self.tasks.iter().find(|t| t.id == id)` gives an `Option<&Task>`. For changing it, `iter_mut()`. Turn `None` into an error with `.ok_or(TodoError::NotFound(id))?`. See [[3.03 Option]] and [[3.04 Result and Errors]].

> [!tip]- Hint 2: ids that are never reused
> Keep `next_id` in the list and only ever increase it. Don't use `tasks.len() + 1`: after a remove, that hands out an id someone already had.

> [!tip]- Hint 3: reading a line
> `line.split_once('\t')` gives `Some((id, rest))`. `rest.strip_prefix("[ ] ")` gives the title if the line starts that way. `id.parse::<u32>()` turns the id into a number, and fails on rubbish. `.map_err(|_| TodoError::Parse { line: i + 1 })?` turns any of those failures into your error.

> [!tip]- Hint 4: Display
> `match self { TodoError::NotFound(id) => write!(f, "there's no task {id}"), ... }`. The test has the exact sentences. See [[3.07 The Everyday Traits]].

> [!boss] Boss fight
> `boss_bad_files_and_reused_ids`: a mangled file must say which line is wrong, a repeated id is an error, and `4294967295` (the biggest `u32`) must be an error too, because the next id would overflow. `id.checked_add(1)` says whether it fits.

> [!sith] The dark side
> `.unwrap()` on a line you read from a file. Files get edited by hand, truncated, and corrupted. If a user's mistake can cause it, it's an `Err`, never a panic.

## Check yourself

> [!question]- Why does remove() return the Task instead of nothing?
> Because removing moves the task out of the list, and giving it back lets the caller use it (show it, undo, move it elsewhere) without cloning. Ownership passes from the list to the caller.

> [!question]- Why implement std::error::Error for TodoError?
> So it works with the rest of the ecosystem: it can be boxed as Box<dyn Error>, used with ? in functions returning other error types, and printed in a standard way.

Done? Write a line in [[Rust Done Log]]. Next: [[R03 Bank Ledger]]
