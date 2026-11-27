---
tags: [rust, hub]
---
# Rust Code Index

> [!abstract] Why this matters
> This is a list of every example you can run in this vault, sorted by topic. Use it to find an example again quickly.

In MHDE, every example with a `fn main` has a **Try in sandbox** button. A few examples don't compile, or panic, on purpose. Their first line says so.

| Topic | Note | What it shows |
|---|---|---|
| Your first program | [[1.01 Why Rust]] | println! and putting values into text |
| Variables | [[1.02 Variables and Mutability]] | let, mut, shadowing and const |
| Types | [[1.03 Types]] | Number types, as, tuples and arrays |
| Expressions | [[1.04 Functions and Expressions]] | A function's last line is its result |
| Loops | [[1.05 Control Flow]] | if, for over ranges and lists, while, loop with break |
| Input | [[1.06 Input and Output]] | Reading a line and handling text that isn't a number |
| Strings | [[1.07 String and str]] | String, &str and borrowing part of a string |
| Moves | [[2.01 Ownership and Moves]] | A String moving, a number copying, and E0382 |
| Borrowing | [[2.02 Borrowing]] | & to read and &mut to change |
| The borrowing rules | [[2.03 The Borrowing Rules]] | E0502: pushing while a borrow is alive, and the fix |
| Slices | [[2.04 Slices]] | &[T] and &str, and a checked range |
| Lifetimes | [[2.05 Lifetimes]] | E0106, and longest<'a> |
| C and C++ compared | [[2.06 Ownership Compared with C and C++]] | The C vault's Pilot, with no destroy function |
| Structs | [[3.01 Structs and Methods]] | A Ship with new, &self and &mut self |
| Enums | [[3.02 Enums and match]] | Commands with data, match and guards |
| Option | [[3.03 Option]] | Some and None, if let and unwrap_or |
| Result | [[3.04 Result and Errors]] | ? and map_err |
| Traits | [[3.05 Traits]] | A Ship trait, impl Trait and Box<dyn Trait> |
| Generics | [[3.06 Generics]] | largest<T> and a generic Pair |
| Derive | [[3.07 The Everyday Traits]] | Debug, Clone, Eq, Hash, Ord and a hand-written Display |
| Vec | [[4.01 Vec]] | push, get, retain, pop and capacity |
| Maps and sets | [[4.02 HashMap and HashSet]] | Counting with entry, HashSet and BTreeMap |
| Iterators | [[4.03 Iterators]] | filter, map, sum, collect, enumerate and zip |
| Closures | [[4.04 Closures]] | Fn, FnMut, move and returning a closure |
| Smart pointers | [[4.05 Box, Rc and RefCell]] | A recursive Route, and a shared log |
| Modules | [[4.06 Modules and Crates]] | mod, pub and use |
| Tests | [[4.07 Testing]] | #[test], assert_eq! and should_panic |
| clippy and docs | [[4.08 Clippy, rustfmt and Docs]] | Code clippy improves, and a doc comment that's also a test |
| Recursion | [[5.01 Recursion and Speed]] | Factorial, and Fibonacci slow and remembered |
| Sorting | [[5.02 Sorting and Searching]] | sort_by, sort_by_key and binary_search |
| Graphs | [[5.03 Graphs]] | Breadth-first search for the fewest hops |
| Contest template | [[5.04 Competitive Programming in Rust]] | Fast input and BufWriter output |
| Threads | [[6.01 Threads]] | Scoped threads and spawn with move |
| Channels | [[6.02 Channels]] | Many senders, one receiver |
| Mutex and Arc | [[6.03 Shared State - Mutex and Arc]] | A shared counter that's always right |
| unsafe | [[6.04 unsafe Rust]] | Splitting a slice in two, with a SAFETY comment |
| FFI | [[6.05 Calling C from Rust]] | abs and strlen from C, and a safe wrapper |
| Fuzzing | [[6.06 Fuzzing Rust]] | A tiny fuzzer that finds a panic |
| Overflow | [[6.07 What Rust Protects You From]] | checked, saturating, wrapping and overflowing maths |
