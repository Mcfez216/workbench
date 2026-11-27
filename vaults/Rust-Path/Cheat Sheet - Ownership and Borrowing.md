---
tags: [rust, cheatsheet, ownership]
---
# Cheat Sheet - Ownership and Borrowing

> [!abstract] Why this matters
> Ownership is the idea that makes Rust different. These tables are the rules in short. Every row is also a flashcard.

## The rules

| Rule | What it means |
|---|---|
| Each value has one owner | One variable is responsible for it. |
| One owner at a time | Assigning a String to another variable moves it. The old name can't be used. |
| The owner going away drops the value | Memory is freed when the owner's scope ends. No `free`, no `delete`. |
| Many readers or one writer | You can have many `&T` borrows, or one `&mut T` borrow, but not both at once. |
| A borrow can't outlive its value | The compiler checks this. There are no dangling references. |

## Passing things to functions

| You want the function to | Write | The caller afterwards |
|---|---|---|
| Read it | `fn f(s: &String)`, or better `fn f(s: &str)` | Still owns it |
| Change it | `fn f(s: &mut String)` | Still owns it, now changed |
| Take it for good | `fn f(s: String)` | Can't use it any more |
| Have its own copy | `f(s.clone())` | Still owns the original |

## Copy or move?

| Type | Assigning it |
|---|---|
| Numbers, `bool`, `char`, and tuples of these | Copies. Both names can be used. |
| `String`, `Vec`, `Box` and most structs | Moves. Only the new name can be used. |
| A struct that derives `Copy` | Copies. |

## Common errors

| Error | What it means |
|---|---|
| E0382 borrow of moved value | You used a value after it moved. Borrow it instead, or clone it. |
| E0499 cannot borrow as mutable more than once | Two `&mut` borrows at the same time. |
| E0502 cannot borrow as mutable because it is also borrowed as immutable | A change while something is still reading. |
| E0597 does not live long enough | A reference would outlive its value. |
| E0106 missing lifetime specifier | Rust needs to know which input a returned reference comes from. |
