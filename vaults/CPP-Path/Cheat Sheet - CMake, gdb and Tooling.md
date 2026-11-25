---
tags: [cpp, cheatsheet, tooling]
---
# Cheat Sheet - CMake, gdb and Tooling

> [!abstract] Why this matters
> The commands behind the workbench's keys, for when you're in a terminal, on another machine, or curious what F9 really does.

## CMake

| Task | Command | Workbench |
|---|---|---|
| Configure | `cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug` | Alt+F9 |
| Build | `cmake --build build -j` | F9 |
| Run the tests | `ctest --test-dir build --output-on-failure` | F7 |
| Start again | `cmake --fresh -S . -B build` | Build → fresh configure |
| One target | `cmake --build build --target name` | Build → Build one target |

## gdb

| Task | Command |
|---|---|
| Start | `gdb --args ./build/prog arg1` (workbench: Ctrl+Shift+D, stopped at your line) |
| Break at a line | `break file.cpp:42` |
| Run | `run` |
| Next line / into a call | `next` (n) / `step` (s) |
| Out of this function | `finish` |
| Print | `print x`, `print *p`, `print v` |
| Where am I? | `backtrace` (bt) |
| Keep going | `continue` (c) |
| Watch a variable change | `watch x` |

## Sanitizers

| Report says | Means | Usual cause |
|---|---|---|
| heap-use-after-free | used memory after it was freed | a pointer or reference kept after delete, or after a vector moved |
| heap-buffer-overflow | read or wrote past a heap block | off-by-one, `<=` instead of `<` |
| stack-buffer-overflow | past the end of a local array | an unbounded copy into a local buffer |
| stack-use-after-return | used a local after its function returned | returned a pointer or reference to a local |
| detected memory leaks | allocated, never freed | new without delete (use unique_ptr) |
| signed integer overflow | int went past its limits | arithmetic on big values: use a wider type or check first |

## Analysers

| Tool | Run | Workbench |
|---|---|---|
| clang-tidy | `clang-tidy file.cpp -p build` | Ctrl+Shift+K |
| cppcheck | `cppcheck --enable=warning,style file.cpp` | Ctrl+Shift+U |
| Valgrind | `valgrind --leak-check=full ./prog` (no sanitizers) | Build → Run under Valgrind |
