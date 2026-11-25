---
tags: [c, cheatsheet]
---
# Cheat Sheet - C Standard Library

> [!abstract] Why this matters
> The functions you'll reach for daily, with the safe way to use each. Every row is a flashcard in Revise.

## Input and output (`<stdio.h>`)

| Task | Safe way | Avoid |
|---|---|---|
| Print | `printf("%d\n", x)` | `printf(user_text)` |
| Read a number | `if (scanf("%d", &x) != 1) { ... }` | ignoring the return value |
| Read a word | `scanf("%63s", buf)` for `char buf[64]` | `scanf("%s", buf)` |
| Read a line | `fgets(buf, sizeof buf, stdin)` | `gets` (removed from C) |
| Build a string | `snprintf(buf, sizeof buf, "%s-%d", s, n)` | `sprintf` |
| Open a file | `FILE *f = fopen(path, "r"); if (!f) { ... }` | using f unchecked |

## printf conversions

| Type | Conversion |
|---|---|
| int | `%d` |
| long | `%ld` |
| long long | `%lld` |
| unsigned | `%u` |
| size_t | `%zu` |
| double | `%f`, `%.2f`, `%g` |
| char | `%c` |
| char * (string) | `%s` |
| pointer | `%p` (cast to void *) |

## Strings (`<string.h>`)

| Task | Call | Watch out |
|---|---|---|
| Length | `strlen(s)` | needs the '\0'; walks the whole string |
| Compare | `strcmp(a, b) == 0` | 0 means equal; `a == b` compares addresses |
| Copy | `snprintf(dst, sizeof dst, "%s", src)` | strcpy can't know dst's size |
| Find a char | `strchr(s, c)` | NULL when not found |
| Copy bytes | `memcpy(dst, src, n)` | n must fit in dst; no overlap (memmove for that) |

## Numbers (`<stdlib.h>`, `<limits.h>`)

| Task | Call |
|---|---|
| Text to number, checked | `strtol(s, &end, 10)` with errno and end checks |
| Absolute value | `abs`, `labs`, `fabs` (math.h) |
| Sort | `qsort(a, n, sizeof a[0], cmp)` |
| Biggest int | `INT_MAX`; `SIZE_MAX` in stdint.h |
