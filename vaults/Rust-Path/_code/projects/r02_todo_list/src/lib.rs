//! R02 To-do List. The note "R02 To-do List" in the vault says what each
//! part must do; tests/r02_todo_list.rs checks it (▶ in the Tests sidebar).
//! The types are written for you. Replace each todo!() with your code.
//!
//! Delete this line once everything is written: it hides the warnings
//! about things you haven't used yet.
#![allow(unused_variables, dead_code)]

use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Todo,
    Done,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Task {
    pub id: u32,
    pub title: String,
    pub status: Status,
}

#[derive(Debug, PartialEq, Eq)]
pub enum TodoError {
    /// The title was empty, or only spaces
    EmptyTitle,
    /// No task has this id
    NotFound(u32),
    /// The task was already done
    AlreadyDone(u32),
    /// Line `line` (counting from 1) of a saved list didn't make sense
    Parse { line: usize },
}

impl fmt::Display for TodoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        todo!("a message for each kind of error: match self")
    }
}

impl std::error::Error for TodoError {}

#[derive(Debug, Default)]
pub struct TodoList {
    tasks: Vec<Task>,
    next_id: u32,
}

impl TodoList {
    pub fn new() -> Self {
        TodoList { tasks: Vec::new(), next_id: 1 }
    }

    /// Adds a task and returns its id. Ids start at 1 and are never reused,
    /// even after a task is removed. The title is trimmed.
    pub fn add(&mut self, title: &str) -> Result<u32, TodoError> {
        todo!()
    }

    pub fn get(&self, id: u32) -> Option<&Task> {
        todo!()
    }

    pub fn complete(&mut self, id: u32) -> Result<(), TodoError> {
        todo!()
    }

    /// Takes the task out of the list and gives it back
    pub fn remove(&mut self, id: u32) -> Result<Task, TodoError> {
        todo!()
    }

    /// The tasks not done yet, in the order they were added
    pub fn pending(&self) -> Vec<&Task> {
        todo!()
    }

    pub fn len(&self) -> usize {
        self.tasks.len()
    }

    pub fn is_empty(&self) -> bool {
        self.tasks.is_empty()
    }

    /// One line per task: id, a tab, [ ] or [x], a space, the title.
    /// "1\t[ ] buy milk\n2\t[x] call Sam\n"
    pub fn to_text(&self) -> String {
        todo!()
    }

    /// The list `to_text` wrote. Blank lines are skipped. New ids carry on
    /// after the biggest one in the text.
    pub fn from_text(text: &str) -> Result<TodoList, TodoError> {
        todo!()
    }
}
