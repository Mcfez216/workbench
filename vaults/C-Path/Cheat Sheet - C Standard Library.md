---
tags: [c, cheatsheet]
---
# Cheat Sheet - C Standard Library

> [!abstract] Why this matters
> These are the functions you'll use every day, with the safe way to use each one. Every row is also a flashcard in Revise.

## Input and output (`<stdio.h>`)

| Task | The safe way | Avoid |
|---|---|---|
| Print | `printf("%d\n", x)` | `printf(user_text)`, which lets the user control printf |
| Read a number | `if (scanf("%d", &x) != 1) { ... }` | Ignoring what scanf returns |
| Read a word | `scanf("%63s", buf)` for a `char buf[64]` | `scanf("%s", buf)`, which has no size limit |
| Read a line | `fgets(buf, sizeof buf, stdin)` | `gets`, which was removed from C because it's unsafe |
| Build a string | `snprintf(buf, sizeof buf, "%s-%d", s, n)` | `sprintf`, which has no size limit |
| Open a file | `FILE *f = fopen(path, "r"); if (!f) { ... }` | Using `f` without checking it |

## printf codes

| Type | Code |
|---|---|
| int | `%d` |
| long | `%ld` |
| long long | `%lld` |
| unsigned | `%u` |
| size_t | `%zu` |
| double | `%f`, `%.2f` for 2 decimal places, or `%g` |
| char | `%c` |
| char * (a string) | `%s` |
| pointer | `%p`, with the pointer cast to `void *` |

## Strings (`<string.h>`)

| Task | Call | Watch out |
|---|---|---|
| Length | `strlen(s)` | Needs the '\0' at the end. It reads the whole string each time. |
| Compare | `strcmp(a, b) == 0` | 0 means equal. `a == b` only compares the addresses. |
| Copy | `snprintf(dst, sizeof dst, "%s", src)` | `strcpy` can't know how big `dst` is. |
| Find a character | `strchr(s, c)` | Returns NULL when it doesn't find it. |
| Copy bytes | `memcpy(dst, src, n)` | n must fit in dst. If the two areas overlap, use `memmove`. |

## Numbers (`<stdlib.h>`, `<limits.h>`)

| Task | Call |
|---|---|
| Turn text into a number, safely | `strtol(s, &end, 10)`, then check `errno` and `end` |
| Absolute value | `abs`, `labs`, or `fabs` from math.h |
| Sort an array | `qsort(a, n, sizeof a[0], cmp)` |
| Biggest int | `INT_MAX`. For sizes, `SIZE_MAX` in stdint.h. |
