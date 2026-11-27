---
tags: [rust, hub, gates]
---
# Rust Phase Gates

> [!abstract] Why this matters
> A gate is a short, honest check before you move on. Can you answer these without looking? If yes, take the rank. If not, the linked note has the answer. There are no marks and no timer.

## Gate 0

> [!question]- What do cargo build, cargo run and cargo test do?
> cargo build compiles the project. cargo run builds it, then runs it. cargo test builds and runs the tests. In MHDE these are F9, Ctrl+F9 and F7. See [[0.3 Cargo Basics]].

> [!rank] Recruit
> You can build and run Rust programs, and you know where the tools are.

## Gate 1

> [!question]- Why does Rust make variables unchangeable unless you write mut?
> So you can see what changes just by reading the declarations. Code that doesn't change is easier to understand, and the compiler stops you changing something by accident. See [[1.02 Variables and Mutability]].

> [!question]- What does a Rust function give back if its last line has no semicolon?
> The value of that last line. In Rust, a block's last expression is its value. Adding a semicolon turns it into a statement, and the function gives back nothing. See [[1.04 Functions and Expressions]].

> [!question]- What's the difference between String and &str?
> A String owns its text, and can grow. A &str only borrows some text that belongs to someone else. Functions that only read text usually take &str. See [[1.07 String and str]].

## Gate 2

> [!question]- What are Rust's three ownership rules?
> Each value has one owner. There's only one owner at a time. When the owner goes out of scope, the value is dropped. See [[2.01 Ownership and Moves]].

> [!question]- What are the borrowing rules?
> At any moment, you can have either many shared borrows (&T), or exactly one mutable borrow (&mut T), but not both. And a borrow must never outlive the value it borrows. See [[2.03 The Borrowing Rules]].

> [!question]- Which C and C++ bugs do ownership and borrowing stop?
> Using memory after it's freed, freeing memory twice, dangling pointers and references, and changing a container while you're still holding a reference into it. See [[2.06 Ownership Compared with C and C++]].

> [!rank] Pilot
> You understand ownership and borrowing, Rust's biggest idea.

## Gate 3

> [!question]- How does Rust say "maybe there's no value"?
> With Option. It's either Some(value) or None. The compiler makes you handle the None case, so there's no null pointer to forget about. See [[3.03 Option]].

> [!question]- What does the ? operator do?
> In a function that returns a Result, ? takes the value out of an Ok. If it's an Err, it returns that error to the caller straight away. See [[3.04 Result and Errors]].

> [!question]- What is a trait?
> A set of methods that a type promises to have. A generic function can then accept any type with that trait. See [[3.05 Traits]].

## Gate 4

> [!question]- Why are iterators as fast as hand-written loops?
> The compiler turns an iterator chain into the same machine code as a plain loop. You get the clearer code for free. See [[4.03 Iterators]].

> [!question]- When would you use Rc, and when RefCell?
> Rc when several parts of the program share ownership of one value. RefCell when you need to change something that's only borrowed immutably, with the borrowing rules checked while the program runs. See [[4.05 Box, Rc and RefCell]].

> [!rank] Commander
> You use Rust's collections and tools, and you write tests for your code.

## Gate 6

> [!question]- What does unsafe let you do, and what doesn't it turn off?
> It lets you follow raw pointers, call unsafe functions like C ones, and a few other things the compiler can't check. It doesn't turn off the borrow checker or type checks for normal references. You become responsible for the parts the compiler can't check. See [[6.04 unsafe Rust]].

> [!question]- Name two kinds of bug Rust does not prevent.
> Logic bugs, where the code does the wrong thing correctly. And panics, deadlocks and memory leaks are still possible. Integer overflow wraps silently in a release build. See [[6.07 What Rust Protects You From]].

> [!rank] General
> You know what Rust protects you from, what it doesn't, and how to work safely at the edges.
