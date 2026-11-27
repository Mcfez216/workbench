---
tags: [rust, cheatsheet]
---
# Cheat Sheet - Rust Basics

> [!abstract] Why this matters
> These are the things you'll look up most in your first weeks of Rust. Every table row is also a flashcard in Revise.

## Variables and types

| You want | Write |
|---|---|
| A value that never changes | `let x = 5;` |
| A value that can change | `let mut x = 5;` |
| A whole number | `i32` (the default), `i64`, `u8`, `u32`, `usize` for sizes and positions |
| A number with decimals | `f64` |
| true or false | `bool` |
| One character | `char`, written `'a'` |
| Text you own | `String` |
| Text you borrow | `&str` |
| A fixed list | `[i32; 3]` |
| A list that grows | `Vec<i32>` |
| Several values together | a tuple `(i32, &str)` |

## Printing

| You want | Write |
|---|---|
| Print a line | `println!("Hello, {name}!");` |
| Print a value | `println!("{}", x);` |
| Print for debugging | `println!("{:?}", v);` or `dbg!(x);` |
| Two decimal places | `println!("{:.2}", f);` |
| Make a String | `format!("{a}-{b}")` |

## Control flow

| You want | Write |
|---|---|
| Choose | `if x > 0 { ... } else { ... }` |
| Choose a value | `let s = if ok { "yes" } else { "no" };` |
| Count | `for i in 0..10 { ... }` (0 to 9) |
| Count including the end | `for i in 0..=10 { ... }` (0 to 10) |
| Go through a list | `for x in &v { ... }` |
| Repeat while true | `while n > 0 { ... }` |
| Repeat forever | `loop { ... break; }` |
| Handle every case | `match x { 1 => ..., 2 | 3 => ..., _ => ... }` |

## Maybe and errors

| You want | Write |
|---|---|
| Maybe a value | `Option<T>`: `Some(x)` or `None` |
| Success or an error | `Result<T, E>`: `Ok(x)` or `Err(e)` |
| Pass an error up | `let n = text.parse::<i32>()?;` |
| A default when there's none | `opt.unwrap_or(0)` |
| Do something only if there's a value | `if let Some(x) = opt { ... }` |
