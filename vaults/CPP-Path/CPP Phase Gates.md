---
tags: [cpp, hub, gates]
---
# CPP Phase Gates

> [!abstract] Why this matters
> A gate is a short, honest check before you move on. Can you answer these without looking? If yes, take the rank. If not, the linked note has the answer. There are no marks and no timer.

Answer each question out loud, or write one sentence. Then click it to compare.

## Gate 0

> [!question]- What do Alt+F9, F9, Ctrl+F9 and F7 do in the workbench?
> Alt+F9 sets up the CMake project. F9 builds it. Ctrl+F9 builds and runs the program you're in. F7 runs the tests, or checks the exercise you're doing. See [[0.2 The Workbench Tour]].

> [!question]- What are AddressSanitizer and UBSan, and why are they on in Debug builds?
> They're checkers built into your program. AddressSanitizer stops the program when it touches memory it shouldn't. UBSan stops it when it does something the language doesn't allow, like an int going past its biggest value. Both tell you the line. Without them, these bugs quietly damage memory. See [[0.1 Installing the Toolchain]].

> [!rank] Youngling
> You can build, run and test a program, and you know what the tools are for.

## Gate 1

> [!question]- What happens between your .cpp file and a running program?
> First the preprocessor pastes in the header files. Then the compiler turns each .cpp file into an object file. Last, the linker joins the object files and libraries into one program. "Undefined reference" is a linker error. It means something was declared but its code was never written. See [[1.01 Why CPP and the Compile-Link Model]].

> [!question]- When do you pass by value, by const reference, or by pointer?
> Pass small things, like an int or a double, by value. Pass bigger things you only read, like a string or a vector, by const reference: `const T&`. Use `T&` when the function should change the caller's object. Use a pointer when "nothing" is an allowed answer, written nullptr. See [[1.02 References and Pointers]].

> [!question]- What does RAII mean?
> It stands for Resource Acquisition Is Initialisation. An object gets a resource, like memory or a file, when it's created. It gives the resource back automatically when it's destroyed. So the resource is always given back, however the function ends. See [[1.05 RAII and Object Lifetime]].

> [!question]- What is a class invariant?
> It's a rule that's always true for a valid object. For example, a bank balance is never negative. The constructor makes the rule true, the member functions keep it true, and private data stops other code breaking it. See [[1.06 Classes and Invariants]].

> [!rank] Padawan
> You can build programs from functions and small classes, and you know who owns what.

## Gate 2

> [!question]- What does std::move actually do?
> On its own, nothing. It marks an object as "you may take my contents". Then a move constructor can take its memory instead of copying it. The object you moved from is still valid, but you shouldn't rely on what's in it. See [[2.03 Move Semantics]].

> [!question]- unique_ptr or shared_ptr?
> Use unique_ptr by default. It has one owner and costs nothing extra. Use shared_ptr only when several parts of the program really share an object, and none of them knows which will finish last. Use plain pointers and references when you only use something and don't own it. See [[2.04 Smart Pointers]].

> [!question]- What is the rule of zero?
> Build your classes from members that already clean up after themselves, like std::string, std::vector and unique_ptr. Then write no destructor, copy or move functions at all. The automatic ones are correct. See [[2.02 The Rule of Zero, Three and Five]].

## Gate 3

> [!question]- Why is std::vector the default container?
> Its elements sit next to each other in memory, which makes going through them very fast. It also grows by itself. Only pick something else for a reason, like looking things up by name. See [[3.08 Choosing a Container]].

> [!question]- What makes an iterator invalid?
> Anything that may move the elements. On a vector, push_back or insert can move everything to a new place. Then every iterator, pointer and reference into it is out of date. See [[3.03 Algorithms and Iterators]].

> [!rank] Knight
> You use the standard library instead of writing everything yourself, and you know its traps.

## Gate 4

> [!question]- What's the difference between a Debug and a Release build?
> A Debug build is for finding bugs. It has no speed-ups, it keeps debug information, and the checkers are on. A Release build is for speed. It's optimised and has no checkers. Test both, because some bugs only show up in an optimised build. See [[4.01 CMake Properly]].

> [!question]- Why does the leak checker have to be off when you use gdb?
> At the end of the program, the leak checker needs to take control of the program to look for leaks. But gdb already has control of it, and only one tool can at a time. Setting ASAN_OPTIONS=detect_leaks=0 turns just the leak check off, and the other checks keep working. See [[4.03 Debugging with gdb]].

> [!question]- What do clang-tidy and cppcheck do that the compiler doesn't?
> They read your code looking for things that compile but are wrong or risky. For example, results you didn't check, references to things that no longer exist, or old-style code with a modern replacement. See [[4.04 Static Analysis - clang-tidy and cppcheck]].

## Gate 5

> [!question]- What does O(n log n) tell you, and what doesn't it?
> It tells you how the work grows as the input grows. Doubling the input makes the work a bit more than double. It doesn't tell you how fast each step is. So a "slower" method can still win for the sizes you really use. See [[5.01 Complexity]].

## Gate 6

> [!question]- What is undefined behaviour, and why is it a security problem?
> It's code that the C++ rules say nothing about. Examples are an int going past its biggest value, reading past the end of an array, and using memory after freeing it. The compiler assumes it never happens. So the program can do anything, including what an attacker wants. See [[6.01 Undefined Behaviour]].

> [!question]- Name three protections against attacks, and what each one stops.
> Stack canaries notice when a stack overflow has happened, before it's used. NX stops data being run as code. ASLR moves the program's code and data to new addresses every run, so an attacker can't guess them. See [[6.06 Hardening and Exploit Mitigations]].

> [!rank] Master
> You can explain why C++ code is safe or unsafe, and show it with tools.
