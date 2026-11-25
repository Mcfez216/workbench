---
tags: [c, cheatsheet, memory]
---
# Cheat Sheet - Memory and Sanitizers

> [!abstract] Why this matters
> This lists each memory error by name, what usually causes it, and which tool finds it. Every row is also a flashcard.

## Getting and giving back memory

| Call | What you get | Remember |
|---|---|---|
| `malloc(n)` | n bytes, full of leftover values | Check for NULL. |
| `calloc(count, size)` | count × size bytes, all set to zero | It checks the multiplication for you. |
| `realloc(p, n)` | The same block, made bigger or smaller. It may move. | Put the result in a second variable first: `tmp = realloc(p, n)`. |
| `free(p)` | Gives the block back | Free it once. Never use `p` afterwards. |

## What the sanitizers report

| Report | What it means | Usual cause |
|---|---|---|
| heap-buffer-overflow | You went past the end of a malloc'd block. | Counting one too far, or no room for '\0'. |
| stack-buffer-overflow | You went past the end of a local array. | `strcpy` or `scanf("%s")` with no size limit. |
| heap-use-after-free | You used a block after freeing it. | Keeping a pointer after `free`. |
| double-free | You freed the same block twice. | Two parts of the code both think they own it. |
| stack-use-after-return | You used a local variable after its function ended. | Returning a pointer to a local variable. |
| detected memory leaks | Some memory was never freed. | A lost pointer, or returning early without freeing. |
| SEGV on unknown address 0x000... | You used a NULL pointer. | Not checking what malloc, fopen or strchr returned. |
| signed integer overflow | An int went past INT_MAX. | Large inputs. Check before you calculate. |

## What Valgrind reports

| Message | What it means |
|---|---|
| Invalid read / write of size N | You used memory outside a valid block. |
| Conditional jump depends on uninitialised value | An `if` or loop decided something using a variable that never got a value. |
| definitely lost: N bytes | A memory leak. |
