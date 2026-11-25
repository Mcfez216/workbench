---
tags: [c, hub, gates]
---
# C Phase Gates

> [!abstract] Why this matters
> A gate is a short, honest check before you move on. Can you answer these without looking? If yes, take the rank. If not, the linked note has the answer. There are no marks and no timer.

## Gate 0

> [!question]- What does gcc -Wall -Wextra -g -fsanitize=address,undefined do, part by part?
> -Wall and -Wextra turn on warnings. -g adds debug information for gdb. -fsanitize=address,undefined adds two checkers, AddressSanitizer and UBSan. They stop the program at the first memory mistake and show you the line. See [[0.1 The C Toolchain]].

> [!rank] Mechanic
> You can build, run and debug a C program, with tools that catch your mistakes.

## Gate 1

> [!question]- What are the stages that turn hello.c into a program?
> First the preprocessor handles the #include and #define lines. Then the compiler turns your code into an object file. Last, the linker joins the object files and libraries into a program. The C library, where printf lives, is one of those libraries. See [[1.01 Why C and How It Compiles]].

> [!question]- Why must you check what scanf returns?
> scanf returns how many values it read. If the input wasn't a number, your variable doesn't get a value. Using it then is a bug. The return value is the only way to know. See [[1.06 printf and scanf Properly]].

> [!question]- What does a function get when you pass it an int?
> It gets a copy. Changing the copy doesn't change your variable. To change your variable, you pass a pointer, which you'll meet in Phase 2. See [[1.05 Functions]].

> [!question]- What is integer division in C, and how do you avoid it?
> When you divide two whole numbers, C throws away the part after the point. So 7 / 2 is 3. Make one of them a double to get 3.5. For example, write 7.0 / 2, or (double)a / b. See [[1.03 Operators and Expressions]].

## Gate 2

> [!question]- What is a pointer?
> A pointer is a variable that holds a memory address. `&x` gives you the address of x. `*p` goes to the address in p and uses the value there. See [[2.02 Pointers]].

> [!question]- Why can't a function find the length of an array you pass it?
> The function only gets a pointer to the first element. The size isn't passed along. So you pass the length as a separate input. See [[2.01 Arrays]].

> [!question]- What ends every C string?
> A zero byte, written '\0'. Every string function keeps reading until it finds it. A string without one makes the function read into other memory. See [[2.04 Strings]].

> [!rank] Smuggler
> You can follow pointers through memory without getting lost.

## Gate 3

> [!question]- What are the three rules of malloc and free?
> Check that malloc didn't return NULL. Free every block exactly once. Never use a block after you've freed it. See [[3.02 malloc and free]].

> [!question]- Why is p = realloc(p, n) a bug?
> If realloc fails, it returns NULL and leaves the old block where it was. Writing NULL straight into p loses your only pointer to the old block, so it can never be freed. Use a second variable for the result. See [[3.03 realloc and Growing Arrays]].

## Gate 6

> [!question]- How can a stack buffer overflow let an attacker run their own code?
> A function keeps its local arrays near its return address. The return address says where to go back to when the function ends. Writing past the end of the array can overwrite it. Then the function "returns" to wherever the attacker chose. Modern protections make this hard. Copying with a size limit stops it completely. See [[6.03 Buffer Overflows and How They're Exploited]].

> [!rank] Ace
> You know why C code is safe or unsafe, and how to show it.
