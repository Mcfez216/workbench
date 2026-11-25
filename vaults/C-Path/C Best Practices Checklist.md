---
tags: [c, hub, checklist]
---
# C Best Practices Checklist

> [!abstract] Why this matters
> C gives you no safety net, so the habits are the safety net. Tick through this before you call something finished.

## Every file
- [ ] Compiles with `-Wall -Wextra -Wpedantic` and no warnings
- [ ] Runs clean with `-fsanitize=address,undefined` (the workbench's default)
- [ ] Formatted (Ctrl+Shift+O)

## Input
- [ ] Every `scanf` / `fgets` / `strtol` result is checked
- [ ] Every read into a buffer has a size limit (`%63s`, `fgets(buf, sizeof buf, ...)`)
- [ ] Numbers from outside are range-checked before they're used as sizes or indexes

## Memory
- [ ] Every `malloc` / `calloc` / `realloc` result checked for NULL
- [ ] Every allocation has exactly one owner who frees it
- [ ] Pointers set to NULL after `free` when they live on
- [ ] Sizes written as `n * sizeof *p`, with an overflow check when n comes from outside
- [ ] No `gets`, `strcpy`, `strcat`, `sprintf` (the editor underlines them)

## Functions
- [ ] Every function says how it fails (a return code, NULL, errno) and callers check
- [ ] `const` on pointer parameters the function only reads
- [ ] `static` on functions that are only used in their own file

## Before you commit
- [ ] Tests pass (F7), including empty input, the biggest value and bad input
- [ ] Valgrind is quiet (Build → Run under Valgrind)
- [ ] A checkpoint, or a commit that says why
