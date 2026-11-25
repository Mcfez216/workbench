---
tags: [c, cheatsheet, memory]
---
# Cheat Sheet - Memory and Sanitizers

> [!abstract] Why this matters
> What each memory error is called, what usually causes it, and which tool finds it. Every row is a flashcard.

## The allocation functions

| Call | Gives you | Remember |
|---|---|---|
| `malloc(n)` | n bytes, garbage inside | check NULL |
| `calloc(count, size)` | count * size bytes, all zero | checks the multiplication for you |
| `realloc(p, n)` | the block resized, maybe moved | use a temporary: `tmp = realloc(p, n)` |
| `free(p)` | gives it back | once; never use p afterwards |

## What the sanitizers say

| Report | Means | Usual cause |
|---|---|---|
| heap-buffer-overflow | past the end of a malloc'd block | off-by-one; forgot room for '\0' |
| stack-buffer-overflow | past the end of a local array | unbounded strcpy / scanf("%s") |
| heap-use-after-free | used a block after free | pointer kept after free; a list freed in the wrong order |
| double-free | freed the same block twice | two owners |
| stack-use-after-return | used a local after its function returned | returned a pointer to a local |
| detected memory leaks | never freed | a lost pointer, an early return |
| SEGV on unknown address 0x000... | NULL pointer used | unchecked malloc / fopen / strchr result |
| signed integer overflow | int arithmetic past INT_MAX | big inputs; check before you calculate |

## Valgrind says

| Message | Means |
|---|---|
| Invalid read / write of size N | outside a valid block |
| Conditional jump depends on uninitialised value | a decision made on garbage |
| definitely lost: N bytes | a leak |
