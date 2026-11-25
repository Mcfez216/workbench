---
tags: [c, hub, gates]
---
# C Phase Gates

> [!abstract] Why this matters
> A gate is an honest check before moving on: can you explain these without looking? If yes, take the rank. If not, the linked note has the answer. No marks, no timer.

## Gate 0

> [!question]- What does gcc -Wall -Wextra -g -fsanitize=address,undefined do, flag by flag?
> -Wall and -Wextra turn on warnings, -g adds debug information for gdb, and -fsanitize=address,undefined builds in AddressSanitizer and UBSan, which stop the program at the first memory error or undefined behaviour and name the line. See [[0.1 The C Toolchain]].

> [!rank] Mechanic
> You can build, run and debug a C program, with the tools that catch your mistakes.

## Gate 1

> [!question]- What are the stages that turn hello.c into a program?
> The preprocessor handles #include and #define, the compiler turns the code into an object file, and the linker joins object files and libraries (like libc, where printf lives) into an executable. See [[1.01 Why C and How It Compiles]].

> [!question]- Why must you check what scanf returns?
> It returns how many items it filled. If the input wasn't a number, the variable is left unset and using it is undefined behaviour; the return value is the only way to know. See [[1.06 printf and scanf Properly]].

> [!question]- What does a function get when you pass it an int?
> A copy. Changing the parameter doesn't change the caller's variable; to do that you pass a pointer (Phase 2). See [[1.05 Functions]].

> [!question]- What is integer division in C, and how do you avoid it?
> Dividing two integers throws away the fraction: 7 / 2 is 3. Make one operand a double (7.0 / 2, or (double)a / b) to get 3.5. See [[1.03 Operators and Expressions]].

## Gate 2

> [!question]- What is a pointer?
> A variable that holds a memory address. `&x` gives x's address, `*p` follows the address to the value there. See [[2.02 Pointers]].

> [!question]- Why can't a function find the length of an array you pass it?
> The array decays to a pointer to its first element; the size isn't passed along. Pass the length as a separate parameter. See [[2.01 Arrays]].

> [!question]- What ends every C string?
> A '\0' byte. Every string function walks until it finds it, so a string without one runs off into other memory. See [[2.04 Strings]].

> [!rank] Smuggler
> You can follow pointers through memory without getting lost.

## Gate 3

> [!question]- What are the three rules of malloc and free?
> Check malloc's result for NULL; free every block exactly once; never use a block after freeing it. See [[3.02 malloc and free]].

> [!question]- Why is p = realloc(p, n) a bug?
> If realloc fails it returns NULL and leaves the old block alone: assigning straight to p loses the only pointer to that block, which then leaks. Use a temporary. See [[3.03 realloc and Growing Arrays]].

## Gate 6

> [!question]- How does a stack buffer overflow become code execution?
> A local buffer sits near the function's saved return address. Writing past the buffer can overwrite that address, so when the function returns it jumps where the attacker chose. Canaries, NX and ASLR make it hard; bounded copies remove it. See [[6.03 Buffer Overflows and How They're Exploited]].

> [!rank] Ace
> You know why C code is or isn't safe, and how to prove it.
