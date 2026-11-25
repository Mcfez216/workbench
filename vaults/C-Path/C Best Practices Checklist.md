---
tags: [c, hub, checklist]
---
# C Best Practices Checklist

> [!abstract] Why this matters
> C has no safety net. Good habits are your safety net. Go through this list before you call something finished.

## Every file

- [ ] It compiles with `-Wall -Wextra -Wpedantic` and shows no warnings.
- [ ] It runs with no reports from the checkers, `-fsanitize=address,undefined`. The workbench turns these on for you.
- [ ] It's tidied with Ctrl+Shift+O.

## Input

- [ ] You check the result of every `scanf`, `fgets` and `strtol`.
- [ ] Every read into a buffer has a size limit. For example, `%63s`, or `fgets(buf, sizeof buf, stdin)`.
- [ ] Numbers that come from outside the program are checked before you use them as a size or an index.

## Memory

- [ ] You check every `malloc`, `calloc` and `realloc` result for NULL.
- [ ] Every block of memory has exactly one owner, and the owner frees it.
- [ ] After `free(p)`, you set `p` to NULL if `p` is still used later.
- [ ] Sizes are written as `n * sizeof *p`. If `n` comes from outside, you check it can't overflow.
- [ ] You don't use `gets`, `strcpy`, `strcat` or `sprintf`. The editor underlines them.

## Functions

- [ ] Every function says how it reports failure, such as a return code or NULL. The code that calls it checks.
- [ ] Pointer inputs that a function only reads are marked `const`.
- [ ] Functions only used in one file are marked `static`.

## Before you commit

- [ ] The tests pass (F7). They include empty input, the biggest value, and bad input.
- [ ] Valgrind reports nothing. Use Build → Run under Valgrind.
- [ ] You've made a checkpoint, or a commit that says why you made the change.
