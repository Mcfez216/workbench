---
tags: [c, hub]
---
# C Code Index

> [!abstract] Why this matters
> Every runnable example in this vault, by topic, so you can find it again in seconds.

| Topic | Note | What it shows |
|---|---|---|
| The build | [[1.01 Why C and How It Compiles]] | compiling and linking; a deliberate linker error |
| Types | [[1.02 Variables and Types]] | sizes, limits, sizeof |
| Expressions | [[1.03 Operators and Expressions]] | integer division, precedence, ++ |
| Control flow | [[1.04 Control Flow]] | if, switch, loops, a menu |
| Functions | [[1.05 Functions]] | pass by value, prototypes, static |
| Input and output | [[1.06 printf and scanf Properly]] | checked reads, bounded strings |

| Arrays | [[2.01 Arrays]] | addresses side by side; passing the length |
| Pointers | [[2.02 Pointers]] | & and *, changing a caller's variable, NULL |
| Pointer arithmetic | [[2.03 Pointer Arithmetic]] | p + 1, walking an array, subtracting pointers |
| Strings | [[2.04 Strings]] | snprintf truncation, strcmp |
| const | [[2.05 const and Pointers]] | read-only parameters; ctype casts |
| Grids | [[2.06 Multi-dimensional Arrays]] | a 2D map, row-major offsets |
| Stack and heap | [[3.01 Stack and Heap]] | a heap counter that outlives its function |
| malloc and free | [[3.02 malloc and free]] | checked allocations, calloc, freeing once |
| Growing arrays | [[3.03 realloc and Growing Arrays]] | a doubling IntList; safe realloc |
| Ownership | [[3.04 Ownership in C]] | create/destroy pairs; goto cleanup |
| Sanitizers | [[3.05 Memory Bugs and the Sanitizers]] | overflow, use-after-free and overflow on demand |
| Valgrind | [[3.06 Valgrind]] | an uninitialised read |

Later phases add their rows as they arrive.
