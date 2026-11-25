---
tags: [cpp, cheatsheet, security]
---
# Cheat Sheet - Sanitizers and Security

> [!abstract] Why this matters
> The security words you'll meet, what they mean, and which tool shows each one. Every row is a flashcard.

## Bug classes

| Bug | What it is | Shows up with |
|---|---|---|
| Buffer overflow | writing past the end of a buffer | ASan (stack- or heap-buffer-overflow) |
| Use after free | using memory after it was freed | ASan heap-use-after-free |
| Double free | freeing the same memory twice | ASan double-free |
| Integer overflow | arithmetic past a type's range | UBSan (signed); careful code (unsigned) |
| Format string | user text used as a printf format | -Wformat-security, the reference |
| Uninitialised read | using memory nobody set | Valgrind; MSan with clang |
| Data race | two threads, same memory, one writing, no lock | ThreadSanitizer (-fsanitize=thread) |

## Mitigations

| Mitigation | Stops | Flag |
|---|---|---|
| Stack canary | returning after a stack overflow | -fstack-protector-strong |
| NX | running injected data as code | on by default |
| PIE + ASLR | guessing where code lives | -fPIE -pie |
| Full RELRO | overwriting the library call table | -Wl,-z,relro,-z,now |
| FORTIFY_SOURCE | overflowing a buffer of known size in memcpy, strcpy... | -D_FORTIFY_SOURCE=3 -O2 |

In the workbench: Security → Hardening shows which of these a program has.
