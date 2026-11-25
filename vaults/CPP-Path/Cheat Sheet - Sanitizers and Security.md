---
tags: [cpp, cheatsheet, security]
---
# Cheat Sheet - Sanitizers and Security

> [!abstract] Why this matters
> These are the security words you'll meet, what they mean, and which tool shows each one. Every row is also a flashcard.

## Kinds of bug

| Bug | What it is | Which tool shows it |
|---|---|---|
| Buffer overflow | Writing past the end of an array. | AddressSanitizer: stack- or heap-buffer-overflow |
| Use after free | Using memory after it was freed. | AddressSanitizer: heap-use-after-free |
| Double free | Freeing the same memory twice. | AddressSanitizer: double-free |
| Integer overflow | Maths that goes past a type's biggest value. | UBSan for signed numbers. For unsigned ones, careful code. |
| Format string | Letting the user's text be printf's format. | The compiler warning -Wformat-security |
| Uninitialised read | Using memory that was never given a value. | Valgrind, or MSan with clang |
| Data race | Two threads use the same memory at once, one is writing, and there's no lock. | ThreadSanitizer: -fsanitize=thread |

## Protections

| Protection | What it stops | How to turn it on |
|---|---|---|
| Stack canary | Returning from a function after a stack overflow | -fstack-protector-strong |
| NX | Running data as if it were code | On by default |
| PIE and ASLR | Guessing where the code is in memory | -fPIE -pie |
| Full RELRO | Changing the table the program uses to find library functions | -Wl,-z,relro,-z,now |
| FORTIFY_SOURCE | Overflowing an array of known size in memcpy, strcpy and similar | -D_FORTIFY_SOURCE=3 -O2 |

In the workbench, Security → Hardening shows which of these a program has.
