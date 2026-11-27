---
tags: [rust, projects]
---
# Projects: Start Here

> [!abstract] Why this matters
> A project makes you use many things together, the way real work does. Each one is a Cargo project with tests. F7 runs them, and the Tests sidebar shows how many pass.

| Project | What you'll use | When to do it |
|---|---|---|
| R01 Word Frequency | Strings, HashMap, iterators | After Phase 4 |
| R02 To-do List | Structs, enums, files, Result | After Phase 4 |
| R03 Bank Ledger | Ownership, traits, error types | After Phase 4 |
| R04 Route Planner | Graphs, BinaryHeap, Option | After Phase 5 |
| R05 Packet Parser | Reading bytes you can't trust, safely | After Phase 6 |

## How to start one

1. Choose File → New project, and pick **Rust** and **Library + tests**.
2. Name it after the project, like `word_frequency`.
3. Write one test for the simplest case first. Then make it pass.
4. Add a test for each edge case: empty input, one item, a huge value, bad input.

> [!boss] Boss fight
> Each project's last test is the case people forget. It might be empty input, the biggest possible value, or input that lies about its own size. Pass it before you move on.
