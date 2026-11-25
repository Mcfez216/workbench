---
tags: [cpp, cheatsheet, tooling]
---
# Cheat Sheet - CMake, gdb and Tooling

> [!abstract] Why this matters
> These are the commands behind the workbench's keys. They're useful in a terminal, on another computer, or when you want to know what F9 really does.

## CMake

| Task | Command | Workbench key |
|---|---|---|
| Set up the project | `cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug` | Alt+F9 |
| Build | `cmake --build build -j` | F9 |
| Run the tests | `ctest --test-dir build --output-on-failure` | F7 |
| Start again from scratch | `cmake --fresh -S . -B build` | Build → fresh configure |
| Build just one part | `cmake --build build --target name` | Build → Build one target |

## gdb

| Task | Command |
|---|---|
| Start | `gdb --args ./build/prog arg1`. In the workbench, Ctrl+Shift+D starts it stopped at your line. |
| Stop at a line | `break file.cpp:42` |
| Run | `run` |
| Next line, or step into a function | `next` (n), or `step` (s) |
| Finish this function | `finish` |
| Show a value | `print x`, `print *p`, `print v` |
| How did I get here? | `backtrace` (bt) |
| Keep going | `continue` (c) |
| Stop when a variable changes | `watch x` |

## Sanitizers

| The report says | It means | Usual cause |
|---|---|---|
| heap-use-after-free | Memory was used after it was freed. | Keeping a pointer after delete, or after a vector moved its elements. |
| heap-buffer-overflow | Something read or wrote past a heap block. | Counting one too far, like `<=` instead of `<`. |
| stack-buffer-overflow | Something went past the end of a local array. | Copying into a local array with no size limit. |
| stack-use-after-return | A local variable was used after its function ended. | Returning a pointer or reference to a local. |
| detected memory leaks | Memory was never freed. | `new` without `delete`. Use `unique_ptr` instead. |
| signed integer overflow | An int went past its biggest value. | Maths on big values. Use a bigger type, or check first. |

## Code checkers

| Tool | Command | Workbench key |
|---|---|---|
| clang-tidy | `clang-tidy file.cpp -p build` | Ctrl+Shift+K |
| cppcheck | `cppcheck --enable=warning,style file.cpp` | Ctrl+Shift+U |
| Valgrind | `valgrind --leak-check=full ./prog`, built without the sanitizers | Build → Run under Valgrind |
