---
tags: [rust, projects]
---
# Projects: Start Here

> [!abstract] Why this matters
> A project makes you use many things together, the way real work does. Each one is a Cargo project with tests: ▶ in the Tests sidebar runs them and shows how many pass.

| Project | What you'll use | When to do it |
|---|---|---|
| [[R01 Word Frequency]] | Strings, HashMap, iterators, sorting | After Phase 4 |
| [[R02 To-do List]] | Structs, enums, your own error type, saving to text | After Phase 4 |
| [[R03 Bank Ledger]] | Checked arithmetic, all-or-nothing changes, borrowing | After Phase 4 |
| [[R04 Route Planner]] | Graphs, BinaryHeap, Dijkstra's algorithm | After Phase 5 |
| [[R05 Packet Parser]] | Reading bytes you can't trust, safely | After Phase 6 |

## How a project works

1. Copy the code out once: File → **Copy the vault's code to my workspace...**, pick **Rust-Path**. It goes to `~/rust-path`: a Cargo workspace with `projects/` (yours) and `solutions/`.
2. Read the project's note. In the **Tests** sidebar, click the project's name: your `src/lib.rs` opens. Every function is there with `todo!()` where your code goes.
3. Press **▶** next to the project. Each test that fails says why. The badge shows how many pass, like `3/10`.
4. Work through `tests/` from the top. **Shift+F7** with the cursor in a test runs only that one.
5. Stuck for 20 minutes? Take a break, then open one hint at a time. If you really need to, **☼** shows the solution.

From a terminal: `cargo test -p r01_word_frequency` runs your R01. Plain `cargo test` runs the solutions, which all pass.

> [!boss] Boss fight
> Each project's last test is the case people forget. It might be empty input, the biggest possible value, or input that lies about its own size. Pass it before you move on.
