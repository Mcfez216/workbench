//! R02 To-do List: the finished version.

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
        match self {
            TodoError::EmptyTitle => write!(f, "a task needs a title"),
            TodoError::NotFound(id) => write!(f, "there's no task {id}"),
            TodoError::AlreadyDone(id) => write!(f, "task {id} is already done"),
            TodoError::Parse { line } => write!(f, "line {line} isn't a task"),
        }
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
        let title = title.trim();
        if title.is_empty() {
            return Err(TodoError::EmptyTitle);
        }
        let id = self.next_id.max(1);
        self.next_id = id + 1;
        self.tasks.push(Task { id, title: title.to_string(), status: Status::Todo });
        Ok(id)
    }

    pub fn get(&self, id: u32) -> Option<&Task> {
        self.tasks.iter().find(|t| t.id == id)
    }

    pub fn complete(&mut self, id: u32) -> Result<(), TodoError> {
        let task = self.tasks.iter_mut().find(|t| t.id == id).ok_or(TodoError::NotFound(id))?;
        if task.status == Status::Done {
            return Err(TodoError::AlreadyDone(id));
        }
        task.status = Status::Done;
        Ok(())
    }

    /// Takes the task out of the list and gives it back
    pub fn remove(&mut self, id: u32) -> Result<Task, TodoError> {
        let i = self.tasks.iter().position(|t| t.id == id).ok_or(TodoError::NotFound(id))?;
        Ok(self.tasks.remove(i))
    }

    /// The tasks not done yet, in the order they were added
    pub fn pending(&self) -> Vec<&Task> {
        self.tasks.iter().filter(|t| t.status == Status::Todo).collect()
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
        self.tasks
            .iter()
            .map(|t| {
                let mark = if t.status == Status::Done { 'x' } else { ' ' };
                format!("{}\t[{mark}] {}\n", t.id, t.title)
            })
            .collect()
    }

    /// The list `to_text` wrote. Blank lines are skipped. New ids carry on
    /// after the biggest one in the text.
    pub fn from_text(text: &str) -> Result<TodoList, TodoError> {
        let mut list = TodoList::new();
        for (i, line) in text.lines().enumerate() {
            if line.trim().is_empty() {
                continue;
            }
            let bad = TodoError::Parse { line: i + 1 };
            let (id, rest) = line.split_once('\t').ok_or(TodoError::Parse { line: i + 1 })?;
            let id: u32 = id.trim().parse().map_err(|_| TodoError::Parse { line: i + 1 })?;
            let status = if let Some(t) = rest.strip_prefix("[ ] ") {
                (Status::Todo, t)
            } else if let Some(t) = rest.strip_prefix("[x] ") {
                (Status::Done, t)
            } else {
                return Err(bad);
            };
            let title = status.1.trim();
            if id == 0 || title.is_empty() || list.get(id).is_some() {
                return Err(bad);
            }
            // the biggest id would leave no id for the next task
            let next = id.checked_add(1).ok_or(bad)?;
            list.tasks.push(Task { id, title: title.to_string(), status: status.0 });
            list.next_id = list.next_id.max(next);
        }
        Ok(list)
    }
}
