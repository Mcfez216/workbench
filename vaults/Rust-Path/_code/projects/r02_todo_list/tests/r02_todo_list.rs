//! R02's tests. Work through them from the top.

use r02_todo_list::{Status, TodoError, TodoList};

#[test]
fn add_gives_ids_from_one() {
    let mut l = TodoList::new();
    assert_eq!(l.add("buy milk"), Ok(1));
    assert_eq!(l.add("call Sam"), Ok(2));
    assert_eq!(l.len(), 2);
}

#[test]
fn titles_are_trimmed_and_cant_be_empty() {
    let mut l = TodoList::new();
    assert_eq!(l.add("   "), Err(TodoError::EmptyTitle));
    let id = l.add("  water plants  ").unwrap();
    assert_eq!(l.get(id).unwrap().title, "water plants");
    assert_eq!(l.get(id).unwrap().status, Status::Todo);
    assert!(l.get(99).is_none());
}

#[test]
fn complete_marks_a_task_done_once() {
    let mut l = TodoList::new();
    let id = l.add("a").unwrap();
    assert_eq!(l.complete(id), Ok(()));
    assert_eq!(l.get(id).unwrap().status, Status::Done);
    assert_eq!(l.complete(id), Err(TodoError::AlreadyDone(id)));
    assert_eq!(l.complete(42), Err(TodoError::NotFound(42)));
}

#[test]
fn pending_skips_done_tasks() {
    let mut l = TodoList::new();
    l.add("a").unwrap();
    let b = l.add("b").unwrap();
    l.add("c").unwrap();
    l.complete(b).unwrap();
    let titles: Vec<&str> = l.pending().iter().map(|t| t.title.as_str()).collect();
    assert_eq!(titles, ["a", "c"]);
}

#[test]
fn remove_gives_the_task_back() {
    let mut l = TodoList::new();
    let id = l.add("a").unwrap();
    let t = l.remove(id).unwrap();
    assert_eq!(t.title, "a");
    assert!(l.is_empty());
    assert_eq!(l.remove(id), Err(TodoError::NotFound(id)));
}

#[test]
fn errors_have_messages() {
    assert_eq!(TodoError::EmptyTitle.to_string(), "a task needs a title");
    assert_eq!(TodoError::NotFound(3).to_string(), "there's no task 3");
    assert_eq!(TodoError::AlreadyDone(4).to_string(), "task 4 is already done");
    assert_eq!(TodoError::Parse { line: 2 }.to_string(), "line 2 isn't a task");
}

#[test]
fn saves_as_text() {
    let mut l = TodoList::new();
    l.add("buy milk").unwrap();
    let b = l.add("call Sam").unwrap();
    l.complete(b).unwrap();
    assert_eq!(l.to_text(), "1\t[ ] buy milk\n2\t[x] call Sam\n");
}

#[test]
fn loads_what_it_saved() {
    let text = "1\t[ ] buy milk\n\n3\t[x] call Sam\n";
    let mut l = TodoList::from_text(text).unwrap();
    assert_eq!(l.len(), 2);
    assert_eq!(l.get(3).unwrap().status, Status::Done);
    assert_eq!(l.add("new"), Ok(4), "new ids carry on after the biggest one");
}

#[test]
fn boss_bad_files_and_reused_ids() {
    // a removed task's id is never handed out again
    let mut l = TodoList::new();
    l.add("a").unwrap();
    let b = l.add("b").unwrap();
    l.remove(b).unwrap();
    assert_eq!(l.add("c"), Ok(3));
    // a file that's been mangled says which line is wrong, and doesn't panic
    assert_eq!(TodoList::from_text("1\t[ ] ok\nrubbish").unwrap_err(), TodoError::Parse { line: 2 });
    assert_eq!(TodoList::from_text("x\t[ ] not a number").unwrap_err(), TodoError::Parse { line: 1 });
    assert_eq!(TodoList::from_text("1\t[?] what").unwrap_err(), TodoError::Parse { line: 1 });
    assert_eq!(TodoList::from_text("1\t[ ] a\n1\t[ ] same id").unwrap_err(), TodoError::Parse { line: 2 });
    assert_eq!(TodoList::from_text("99999999999\t[ ] too big").unwrap_err(), TodoError::Parse { line: 1 });
    // the biggest u32 would overflow the next id: that's an error too, not a panic
    assert_eq!(TodoList::from_text("4294967295\t[ ] last").unwrap_err(), TodoError::Parse { line: 1 });
    assert!(TodoList::from_text("").unwrap().is_empty());
}
