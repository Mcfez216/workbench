---
tags: [cpp, hub]
---
# CPP Code Index

> [!abstract] Why this matters
> This is a list of every example you can run in this vault, sorted by topic. Use it to find an example again quickly.

In the workbench, every example with a `main` has a **Try in sandbox** button. Files that start with `_code/` are in your workspace, `~/cpp-path`, once you've copied the vault's code out.

| Topic | Note | What it shows |
|---|---|---|
| Hello and the build | [[1.01 Why CPP and the Compile-Link Model]] | One program, compiled and linked, and a linker error on purpose |
| References and pointers | [[1.02 References and Pointers]] | Two ways to change a caller's variable, and nullptr |
| Starting values | [[1.03 Types, Values and Initialisation]] | How `{}` stops numbers being cut down, and unset values |
| Overloading | [[1.04 Functions and Overloading]] | Which version of a function gets called, and default values |
| RAII | [[1.05 RAII and Object Lifetime]] | A timer that stops itself, and the order objects are destroyed in |
| Invariants | [[1.06 Classes and Invariants]] | A `Temperature` that can't go below absolute zero |
| Headers | [[1.07 Headers, Namespaces and the ODR]] | Splitting a program into .hpp and .cpp files |
| Errors | [[1.08 Errors - Exceptions, Codes and Optional]] | The same task, with three ways to report failure |
| Copying | [[2.01 Value Semantics and Copying]] | Copies are separate, and when copying costs time |
| Rule of 0/3/5 | [[2.02 The Rule of Zero, Three and Five]] | A Ship that can be moved but not copied |
| Moves | [[2.03 Move Semantics]] | std::move, and what's left behind after a move |
| Smart pointers | [[2.04 Smart Pointers]] | unique_ptr, shared_ptr counts, and weak_ptr breaking a loop |
| Compile time | [[2.05 const, constexpr and consteval]] | A factorial worked out while compiling, and static_assert |
| Templates | [[2.06 Templates Basics]] | A function template, a concept, and a class template |
| Lambdas | [[2.07 Lambdas]] | sort and count_if with small functions, and captures |
| Variants | [[2.08 enum class, variant and Strong Types]] | std::visit over Jedi, Sith and Droid, and a Parsecs type |
| vector growth | [[3.01 Containers - vector, array, deque]] | When a vector grows, and reserve |
| Maps and sets | [[3.02 Associative Containers]] | Bounties, counting things, and the [] trap |
| Algorithms | [[3.03 Algorithms and Iterators]] | sort, accumulate, find_if, and erase with remove |
| Strings | [[3.04 Strings and string_view]] | find, substr, and a string_view that points at nothing |
| Ranges | [[3.05 Ranges]] | A filter, transform and take pipeline |
| Files | [[3.06 I-O Streams and Files]] | Writing a file, then reading it back line by line |
| Time and random | [[3.07 Time and Random]] | Timing with steady_clock, and dice with mt19937 |
| Queues | [[3.08 Choosing a Container]] | A priority_queue of repairs |

More rows are added as new phases are written.
