---
tags: [cpp, hub]
---
# CPP Code Index

> [!abstract] Why this matters
> Every runnable example in this vault, by topic, so you can find "that example with the dangling reference" in seconds.

Code blocks with a `main` have a **Try in sandbox** button in the workbench. Files under `_code/` are in your workspace copy (`~/cpp-path`) once you've copied the vault's code out.

| Topic | Note | What it shows |
|---|---|---|
| Hello and the build | [[1.01 Why CPP and the Compile-Link Model]] | one program, compiled and linked; a deliberate linker error |
| References and pointers | [[1.02 References and Pointers]] | changing a caller's variable both ways; nullptr |
| Initialisation | [[1.03 Types, Values and Initialisation]] | `{}` stops narrowing; uninitialised values |
| Overloading | [[1.04 Functions and Overloading]] | which overload wins; default arguments |
| RAII | [[1.05 RAII and Object Lifetime]] | a scope timer; destruction order |
| Invariants | [[1.06 Classes and Invariants]] | a `Temperature` that can't go below absolute zero |
| Headers | [[1.07 Headers, Namespaces and the ODR]] | splitting a program into .hpp and .cpp |
| Errors | [[1.08 Errors - Exceptions, Codes and Optional]] | the same parser three ways |

| Copying | [[2.01 Value Semantics and Copying]] | copies are independent; when copies cost |
| Rule of 0/3/5 | [[2.02 The Rule of Zero, Three and Five]] | a move-only Ship with a unique_ptr member |
| Moves | [[2.03 Move Semantics]] | std::move, moved-from state |
| Smart pointers | [[2.04 Smart Pointers]] | unique_ptr, shared_ptr counts, weak_ptr breaking a cycle |
| Compile time | [[2.05 const, constexpr and consteval]] | factorial at compile time; static_assert |
| Templates | [[2.06 Templates Basics]] | a function template, a concept, a class template |
| Lambdas | [[2.07 Lambdas]] | sort, count_if, captures by value and reference |
| Variants | [[2.08 enum class, variant and Strong Types]] | std::visit over Jedi, Sith and Droid; a Parsecs type |
| vector growth | [[3.01 Containers - vector, array, deque]] | capacity jumps; reserve |
| Maps and sets | [[3.02 Associative Containers]] | bounties, counting sightings, the [] trap |
| Algorithms | [[3.03 Algorithms and Iterators]] | sort, accumulate, find_if, erase-remove |
| Strings | [[3.04 Strings and string_view]] | find, substr, a dangling view |
| Ranges | [[3.05 Ranges]] | a filter-transform-take pipeline |
| Files | [[3.06 I-O Streams and Files]] | write, read and parse a file line by line |
| Time and random | [[3.07 Time and Random]] | steady_clock timing; dice with mt19937 |
| Queues | [[3.08 Choosing a Container]] | a priority_queue of repairs |

Later phases add their rows here as they arrive.
