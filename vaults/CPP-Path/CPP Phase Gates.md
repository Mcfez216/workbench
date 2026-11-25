---
tags: [cpp, hub, gates]
---
# CPP Phase Gates

> [!abstract] Why this matters
> A gate is a quick, honest check before you move on: can you explain these things without looking? If yes, take the rank. If not, the linked note is where the answer lives. No marks, no timer.

Answer each one out loud, or in a sentence on paper, then open the fold to compare.

## Gate 0

> [!question]- What do Alt+F9, F9, Ctrl+F9 and F7 do in the workbench?
> Alt+F9 configures the CMake project, F9 builds it, Ctrl+F9 builds and runs the program you're in, F7 runs the tests (or checks the exercise you're in). See [[0.2 The Workbench Tour]].

> [!question]- What are AddressSanitizer and UBSan, and why are they on in Debug builds?
> Tools built into the program that stop it the moment it touches memory it shouldn't (ASan) or does something undefined like signed overflow (UBSan), and say which line. Bugs that would otherwise corrupt memory silently become a clear report. See [[0.1 Installing the Toolchain]].

> [!rank] Youngling
> You can build, run and test a program, and you know what the tools are for.

## Gate 1

> [!question]- What happens between your .cpp file and a running program?
> The preprocessor pastes in headers, the compiler turns each .cpp into an object file, and the linker joins the object files and libraries into one executable. "Undefined reference" is a linker error: something was declared but never defined. See [[1.01 Why CPP and the Compile-Link Model]].

> [!question]- When do you pass by value, by const reference, or by pointer?
> By value for small, cheap things (int, double) or when you need your own copy. By `const T&` for bigger things you only read (strings, vectors). By `T&` to change the caller's object. By pointer when "nothing" (nullptr) is a valid answer. See [[1.02 References and Pointers]].

> [!question]- What does RAII mean?
> Resource Acquisition Is Initialisation: an object takes a resource (memory, a file, a lock) in its constructor and releases it in its destructor, so the resource is released however the scope ends: normal return, early return or exception. See [[1.05 RAII and Object Lifetime]].

> [!question]- What is a class invariant?
> A rule that's always true for a valid object (a balance is never negative, a date is a real date). Constructors establish it, member functions keep it, private data stops outsiders breaking it. See [[1.06 Classes and Invariants]].

> [!rank] Padawan
> You can write programs out of functions and small classes, and you know who owns what.

## Gate 2

> [!question]- What does std::move actually do?
> Nothing by itself: it casts an object to an rvalue reference, which lets a move constructor or move assignment steal its resources instead of copying them. The moved-from object is left valid but unspecified. See [[2.03 Move Semantics]].

> [!question]- unique_ptr or shared_ptr?
> unique_ptr by default: one owner, no overhead, can be moved. shared_ptr only when ownership is genuinely shared and nobody knows who finishes last. Plain pointers and references for "using, not owning". See [[2.04 Smart Pointers]].

> [!question]- What is the rule of zero?
> Write classes whose members already manage themselves (std::string, std::vector, unique_ptr), and write no destructor, copy or move operations at all: the defaults are correct. See [[2.02 The Rule of Zero, Three and Five]].

## Gate 3

> [!question]- Why is std::vector the default container?
> Its elements sit next to each other in memory, which makes walking through them very fast on real hardware, and it grows by itself. Reach for something else only for a reason: lookup by key, stable addresses, fast insertion in the middle. See [[3.08 Choosing a Container]].

> [!question]- What makes an iterator invalid?
> Anything that may move the elements: push_back or insert on a vector can reallocate and invalidate every iterator, pointer and reference into it; erase invalidates from the erased element on. See [[3.03 Algorithms and Iterators]].

> [!rank] Knight
> You use the standard library instead of writing it yourself, and you know its traps.

## Gate 4

> [!question]- What's the difference between a Debug and a Release build?
> Debug: no optimisation, debug information, sanitizers on: for finding bugs. Release: optimised, no sanitizers: for running fast. Test both: some bugs only appear when the optimiser takes undefined behaviour at its word. See [[4.01 CMake Properly]].

> [!question]- Why does LeakSanitizer have to be off under gdb?
> LeakSanitizer stops the world and inspects the process with ptrace at exit, and a process being debugged is already traced by gdb: the two can't both trace it. ASAN_OPTIONS=detect_leaks=0 keeps ASan itself working. See [[4.03 Debugging with gdb]].

> [!question]- What do clang-tidy and cppcheck do that the compiler doesn't?
> They read your code for patterns that compile but are wrong or risky: unchecked results, dangling references, a missing virtual destructor, modernisation (nullptr, override), and in clang-tidy's analyser, paths through the code where something goes wrong. See [[4.04 Static Analysis - clang-tidy and cppcheck]].

## Gate 5

> [!question]- What does O(n log n) tell you, and what doesn't it?
> How the work grows as the input grows: doubling n a bit more than doubles the work. It doesn't tell you the constant: an O(n) algorithm with a slow constant can lose to O(n log n) for real sizes. See [[5.01 Complexity]].

## Gate 6

> [!question]- What is undefined behaviour, and why is it a security problem?
> Code the C++ standard places no requirements on (signed overflow, out-of-bounds access, use after free, data races). The compiler may assume it never happens, so the program can do anything, including what an attacker steers it to. See [[6.01 Undefined Behaviour]].

> [!question]- Name three exploit mitigations and what each stops.
> Stack canaries (a stack overflow is detected before the function returns), NX (data can't be run as code), ASLR / PIE (code and data move every run, so addresses can't be guessed). RELRO and FORTIFY_SOURCE too. See [[6.06 Hardening and Exploit Mitigations]].

> [!rank] Master
> You can explain why C++ code is or isn't safe, and prove it with tools.
